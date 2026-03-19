# Delta Stacks — Agent Guide

Quick-reference for AI agents working in this repository. For full Stacks development guidelines, see [CLAUDE.md](CLAUDE.md).

## Repository Overview

DeFi infrastructure for Stacks (Bitcoin L2) lending protocols. Monorepo with Clarity smart contracts, TypeScript SDKs, a Cloudflare Workers backend, and a React frontend.

## Package Map

| Package | Path | Purpose |
|---------|------|---------|
| **Contracts** | `contracts/` | Clarity aggregator + vault contracts |
| **Calldata SDK** | `packages/calldata-sdk-stacks/` | Transaction calldata encoders for all protocols |
| **Data Provision** | `packages/data-provision/` | On-chain data fetching, parsing, prices |
| **Backend** | `packages/backend/` | Cloudflare Workers — cron polling + REST API |
| **Frontend** | `packages/frontend/` | React + Tailwind UI for lending + vault |

## Key Documentation

| Topic | Location |
|-------|----------|
| Project README | [README.md](README.md) |
| Stacks dev guidelines | [CLAUDE.md](CLAUDE.md) |
| Vault V3 contract spec (USDCx) | [contracts/prod/v3/usdcx/README.md](contracts/prod/v3/usdcx/README.md) |
| Vault V3 contract spec (STX) | [contracts/prod/v3/stx/README.md](contracts/prod/v3/stx/README.md) |
| Vault V3 SDK | [packages/calldata-sdk-stacks/src/vault/v3/README.md](packages/calldata-sdk-stacks/src/vault/v3/README.md) |
| Calldata SDK overview | [packages/calldata-sdk-stacks/README.md](packages/calldata-sdk-stacks/README.md) |
| Data provision overview | [packages/data-provision/README.md](packages/data-provision/README.md) |
| Backend (Workers) | [packages/backend/README.md](packages/backend/README.md) |
| Frontend | [packages/frontend/README.md](packages/frontend/README.md) |
| Zest V1 protocol | [packages/calldata-sdk-stacks/src/zest-v1/README.md](packages/calldata-sdk-stacks/src/zest-v1/README.md) |
| Zest V2 protocol | [packages/calldata-sdk-stacks/src/zest-v2/README.md](packages/calldata-sdk-stacks/src/zest-v2/README.md) |
| Granite protocol | [packages/calldata-sdk-stacks/src/granite/README.md](packages/calldata-sdk-stacks/src/granite/README.md) |
| On-chain reader contract | [contracts/README.md](contracts/README.md) |
| Zest V1 data provision | [packages/data-provision/src/lending/public-data/zest-v1/README.md](packages/data-provision/src/lending/public-data/zest-v1/README.md) |
| Zest V2 data provision | [packages/data-provision/src/lending/public-data/zest-v2/README.md](packages/data-provision/src/lending/public-data/zest-v2/README.md) |
| Token list utils | [packages/data-provision/src/token-list/README.md](packages/data-provision/src/token-list/README.md) |
| Fork test guide | [tests/fork/README.md](tests/fork/README.md) |

## Architecture

```
                    Frontend (React)
                        │
                  ┌─────┴──────┐
                  │  Backend    │  Cloudflare Workers
                  │  (cron+API) │  KV: lending data, prices, vault history
                  └─────┬──────┘
                        │
              ┌─────────┼─────────┐
              │         │         │
        data-provision  │   calldata-sdk
        (read-only)     │   (tx encoding)
              │         │         │
              └─────────┼─────────┘
                        │
            ┌───────────┼───────────┐
            │           │           │
        Zest V1     Zest V2     Granite      (lending protocols)
                        │
                   Delta Vault V3            (yield aggregator)
                   ├── adapter-granite
                   └── adapter-zest-v2
```

## Supported Protocols

| Protocol | Type | SDK Namespace | Data Provision |
|----------|------|--------------|----------------|
| Zest V1 | Pool-based lending (Aave-like) | `ZestV1Lending` | `getStacksLenderPublicData('zest-v1')` |
| Zest V2 | Hub-spoke with vaults | `ZestV2Lending` | `getStacksLenderPublicData('zest-v2')` |
| Granite | Isolated markets (Compound V3) | `GraniteLending` | `getStacksLenderPublicData('granite')` |
| Vault V2 | ERC-4626 yield vault (legacy) | `DeltaVault` | — |
| Vault V3 | ERC-4626 portable vault + fees | `DeltaVaultV3` | `fetchVaultSnapshot()` |

## Key Contract Addresses

| Contract | Principal |
|----------|-----------|
| Vault V3 deployer | `SP2DRPT3AA170EK5DC4T22CMSXZ6HACATPXHPAT7H` |
| Vault V3 | `SP2DRPT3AA170EK5DC4T22CMSXZ6HACATPXHPAT7H.vault-usdcx-v3` |
| USDCx | `SP120SBRBQJ00MCWS7TM5R8WJNTTKD5K0HFRC2CNE.usdcx` |
| Zest V2 deployer | `SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7` |
| Granite deployer | Various per-market (see granite constants) |

## Common Tasks

### Run tests
```bash
pnpm test                                          # all unit tests
npx vitest run tests/fork/granite-deposit.test.ts   # single fork test
cd packages/calldata-sdk-stacks && pnpm test        # SDK tests only
```

### Type-check
```bash
npx tsc --noEmit -p packages/backend/tsconfig.json
npx tsc --noEmit -p packages/frontend/tsconfig.app.json
```

### Compile contracts
```bash
clarinet check
```

### Backend
- **Cron `*/2 * * * *`**: refreshes prices, rotates through lenders (one per invocation), snapshots all three vaults (USDCx, STX, sBTC)
- **Cron `0 */4 * * *`**: auto-allocator — rebalances each vault to the higher-APR market when delta > 0.5%
- **Endpoints**:
  - `GET /` or `/lending` — all cached lending data
  - `GET /prices` — cached USD price map
  - `GET /:lender` — data for a specific lender (`zest-v1`, `zest-v2`, `granite`)
  - `GET /vault/history`, `/vault-stx/history`, `/vault-sbtc/history` — vault share-price history (supports `?from=<unix>&to=<unix>`)
  - `GET /allocator-address` — Stacks address derived from `ALLOCATOR_PRIVATE_KEY` (set this as the vault allocator on-chain)
  - `POST /allocate` — manually trigger the allocation strategy; body `{ force: true }` bypasses the APR-delta threshold; requires `Authorization: Bearer <ALLOCATOR_SECRET>` header when secret is configured
- **KV keys**: `prices`, `lending:{lender}`, `vault:share-price-history`, `vault-stx:share-price-history`, `vault-sbtc:share-price-history`, `vault:latest`, `vault-stx:latest`, `vault-sbtc:latest`, `cron:next-lender-index`
- **Env vars**: `ALLOCATOR_PRIVATE_KEY` (hex, 64 chars, no 0x prefix), `ALLOCATOR_SECRET` (Bearer token for POST /allocate)

### Frontend
- React 19 + Tailwind 4 + TanStack Query
- Tabs: Balances, Lending, Vault (V3), Vault (Legacy/V2)
- Env: `VITE_DATA_API_URL` points to backend worker

## Conventions

- SDK encoders return `StacksContractCall` objects — never broadcast directly
- All amounts use on-chain micro-units (USDCx: 6 decimals, so 1 USDCx = 1_000_000)
- Protocol modules follow: `constants.ts` -> `publicCallBuild.ts` -> `publicCallParse.ts`
- Vault share price: `(totalAssets + V) / (totalSupply + V)` where `V = 10^decimals`
- Price map keys: lowercase symbol (`'usdcx'`, `'sbtc'`) or marketUid
