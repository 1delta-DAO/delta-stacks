# Backend — Data Provision Worker

Read-only REST API + scheduled cron jobs for Delta Stacks. Serves cached lending data, prices, and vault snapshots to the frontend.

Allocation operations (vault rebalancing) are handled by a separate worker — see [`backend-allocator`](../backend-allocator/README.md).

## Architecture

```
Cloudflare Worker (delta-stacks-data)
├── REST API (fetch handler)
│   ├── GET /lending          All cached lending data
│   ├── GET /prices           Cached USD price map
│   ├── GET /:lender          Single-lender data
│   ├── GET /vault/history    USDCx vault share-price history
│   ├── GET /vault-stx/history
│   └── GET /vault-sbtc/history
│
└── Cron: */2 * * * * (every 2 min)
    ├── Refresh prices (Pyth + on-chain oracle)
    ├── Rotate through one lender per invocation (~6-min refresh per lender)
    └── Snapshot all three vaults (USDCx, STX, sBTC)
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

## KV Schema (written by this worker)

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

### KV Namespace

Bind `LENDING_KV` in `wrangler.toml`:

```toml
[[kv_namespaces]]
binding = "LENDING_KV"
id = "<your-kv-namespace-id>"
```

This worker has no secrets — it is purely read/write against public on-chain data.

## Development

### Prerequisites

- Node.js 18+
- [Wrangler](https://developers.cloudflare.com/workers/wrangler/) v3+

### Setup

```bash
cd packages/backend
pnpm install
```

### Local Development

```bash
npm run dev          # Start local Workers dev server (http://localhost:8787)
```

### Deploy

```bash
npm run deploy:wrangler   # Deploy to Cloudflare
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
  env.ts             TypeScript env interface (KV namespace binding)
  constants.ts       KV keys, lender list, vault constants
  utils.ts           Helper utilities
  handlers/
    request.ts       HTTP request router (all GET endpoints)
    scheduled.ts     Cron job: price refresh + lender rotation + vault snapshots
```
