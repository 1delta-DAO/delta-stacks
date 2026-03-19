# Backend — Cloudflare Workers

REST API + scheduled cron jobs for Delta Stacks. Serves cached lending data and vault snapshots to the frontend, and runs an auto-allocator bot that rebalances vaults across lending markets.

## Architecture

```
Cloudflare Worker
├── REST API (fetch handler)
│   ├── GET /lending          All cached lending data
│   ├── GET /prices           Cached USD price map
│   ├── GET /:lender          Single-lender data
│   ├── GET /vault/history    USDCx vault share-price history
│   ├── GET /vault-stx/history
│   ├── GET /vault-sbtc/history
│   ├── GET /allocator-address
│   └── POST /allocate        Manually trigger rebalance
│
├── Cron: */2 * * * * (every 2 min)
│   ├── Refresh prices (Pyth + on-chain oracle)
│   ├── Rotate through one lender per invocation (~6-min refresh per lender)
│   └── Snapshot all three vaults (USDCx, STX, sBTC)
│
└── Cron: 0 */4 * * * (every 4 hours)
    └── Auto-allocator: rebalance vaults to the higher-APR market
```

## REST API

### `GET /` or `GET /lending`

Returns cached lending data for all three protocols.

```json
{
  "v1": { /* Zest V1 market data */ },
  "v2": { /* Zest V2 market data */ },
  "granite": { /* Granite market data */ }
}
```

### `GET /prices`

Returns the cached USD price map.

```json
{
  "stx": 0.42,
  "sbtc": 95000.0,
  "usdcx": 1.0
}
```

### `GET /:lender`

Returns data for a single lender. Valid values: `zest-v1`, `zest-v2`, `granite`.

### `GET /vault/history`
### `GET /vault-stx/history`
### `GET /vault-sbtc/history`

Returns the rolling share-price history for each vault. Supports optional `?from=<unix>&to=<unix>` query params to filter by timestamp. History is capped at 21,600 snapshots (~30 days at 2-minute intervals).

```json
[
  { "timestamp": 1700000000, "sharePrice": 1000012 },
  { "timestamp": 1700000120, "sharePrice": 1000013 }
]
```

### `GET /allocator-address`

Returns the Stacks address derived from `ALLOCATOR_PRIVATE_KEY`. Use this to configure the vault's allocator principal on-chain.

### `POST /allocate`

Manually triggers the allocation strategy for all vaults. Requires `Authorization: Bearer <ALLOCATOR_SECRET>` when `ALLOCATOR_SECRET` is set.

Body (optional):
```json
{ "force": true }
```

Set `force: true` to bypass the APR-delta threshold and rebalance regardless of current spread.

## Auto-Allocator

The allocator runs every 4 hours and compares the supply APR of both markets in each vault:

1. Load latest lending data and vault snapshots from KV
2. For each vault, compute the APR for both markets
3. If the APR difference exceeds **0.5%** (`REBALANCE_THRESHOLD`), move funds to the higher-yielding market
4. Apply a **5% safety buffer** to prevent LP token underflow on recall
5. Build and broadcast the allocation transaction using `ALLOCATOR_PRIVATE_KEY`

### Supported Vaults

| Vault | Asset | Market 1 | Market 2 |
|-------|-------|----------|----------|
| `usdcx` | USDCx (6 dec) | Granite | Zest V2 |
| `stx` | wSTX (6 dec) | Zest V1 | Zest V2 |
| `sbtc` | sBTC (8 dec) | Zest V1 | Zest V2 |

## KV Schema

| Key | Value |
|-----|-------|
| `prices` | JSON `USDPriceMap` |
| `lending:zest-v1` | JSON lending data for Zest V1 |
| `lending:zest-v2` | JSON lending data for Zest V2 |
| `lending:granite` | JSON lending data for Granite |
| `vault:share-price-history` | JSON array of `{timestamp, sharePrice}` (USDCx) |
| `vault-stx:share-price-history` | JSON array (STX) |
| `vault-sbtc:share-price-history` | JSON array (sBTC) |
| `vault:latest` | JSON `VaultSnapshot` (USDCx) |
| `vault-stx:latest` | JSON `VaultSnapshot` (STX) |
| `vault-sbtc:latest` | JSON `VaultSnapshot` (sBTC) |
| `cron:next-lender-index` | Integer rotation cursor (0, 1, or 2) |

## Configuration

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ALLOCATOR_PRIVATE_KEY` | Yes | Hex-encoded Stacks private key (64 chars, no `0x` prefix). Must be the vault's configured allocator principal. |
| `ALLOCATOR_SECRET` | No | Bearer token for `POST /allocate`. If unset, the endpoint is unauthenticated. |

### KV Namespace

Bind `LENDING_KV` in `wrangler.toml`:

```toml
[[kv_namespaces]]
binding = "LENDING_KV"
id = "<your-kv-namespace-id>"
```

## Development

### Prerequisites

- Node.js 18+
- [Wrangler](https://developers.cloudflare.com/workers/wrangler/) v3+

### Setup

```bash
cd packages/backend
npm install
```

### Local Development

```bash
npm run dev          # Start local Workers dev server (http://localhost:8787)
```

Set secrets locally via a `.dev.vars` file (never commit):

```
ALLOCATOR_PRIVATE_KEY=your64hexcharshere
ALLOCATOR_SECRET=your-bearer-token
```

### Deploy

```bash
npm run deploy:wrangler   # Deploy to Cloudflare
```

Set production secrets:

```bash
wrangler secret put ALLOCATOR_PRIVATE_KEY
wrangler secret put ALLOCATOR_SECRET
```

### Other Commands

```bash
npm run log          # Tail live worker logs
npm run typecheck    # TypeScript type-check only
```

## Module Structure

```
src/
  index.ts           Entry point — routes requests and registers cron handlers
  allocator/
    index.ts         Main allocator entry — loads KV data, executes rebalancing
    config.ts        Vault configurations (market UIDs, encoders, dust thresholds)
    const.ts         API URL, deployer address, rebalance threshold
    strategy.ts      computeRebalance() — APR comparison logic
    tx.ts            Build and broadcast allocation transactions
    types.ts         VaultAllocConfig, VaultAllocationResult types
```
