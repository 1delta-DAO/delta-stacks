# Backend — Allocator Worker

Auto-allocator bot for Delta Stacks vaults. Rebalances vault funds across lending markets to maximize yield. Runs as a separate Cloudflare Worker with its own private key, isolated from the public-facing data API.

Data provision (prices, lending data, vault snapshots) is handled by a separate worker — see [`backend`](../backend/README.md).

## Architecture

```
Cloudflare Worker (delta-stacks-allocator)
├── REST API (fetch handler)
│   ├── GET /allocator-address   Stacks address derived from ALLOCATOR_PRIVATE_KEY
│   └── POST /allocate           Manually trigger rebalance
│
└── Cron: 0 */4 * * * (every 4 hours)
    └── Auto-allocator: rebalance vaults to the higher-APR market
```

## REST API

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

1. Load latest lending data and vault snapshots from KV (written by the data worker)
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

## KV Schema (read by this worker)

This worker reads data written by the data worker. It does not write to KV.

| Key | Value |
|-----|-------|
| `lending:zest-v1` | JSON lending data for Zest V1 |
| `lending:zest-v2` | JSON lending data for Zest V2 |
| `lending:granite` | JSON lending data for Granite |
| `vault:latest` | JSON `VaultSnapshot` (USDCx) |
| `vault-stx:latest` | JSON `VaultSnapshot` (STX) |
| `vault-sbtc:latest` | JSON `VaultSnapshot` (sBTC) |

## Configuration

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ALLOCATOR_PRIVATE_KEY` | Yes | Hex-encoded Stacks private key (64 chars, no `0x` prefix). Must be the vault's configured allocator principal. |
| `ALLOCATOR_SECRET` | No | Bearer token for `POST /allocate`. If unset, the endpoint is unauthenticated. |

### KV Namespace

Bind `LENDING_KV` in `wrangler.toml` — must be the **same** KV namespace used by the data worker:

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
cd packages/backend-allocator
pnpm install
```

### Local Development

```bash
npm run dev          # Start local Workers dev server
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
  index.ts           Entry point — routes requests and registers cron handler
  env.ts             TypeScript env interface (KV namespace, secrets)
  constants.ts       KV keys for vault snapshots
  utils.ts           Address derivation, on-chain allocator verification
  handlers/
    allocation.ts    Loads KV data, runs allocation strategy, logs results
  allocator/
    index.ts         Main allocator orchestrator (runAllocation)
    config.ts        Vault configurations (market UIDs, encoders, dust thresholds)
    const.ts         API URL, deployer address, rebalance threshold
    strategy.ts      computeRebalance() — APR comparison logic
    tx.ts            Build and broadcast allocation transactions
    types.ts         VaultAllocConfig, VaultAllocationResult types
```
