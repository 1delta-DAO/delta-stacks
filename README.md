# Delta Stacks

DeFi yield-aggregation infrastructure for Stacks (Bitcoin L2). Automatically allocates deposited assets across the highest-yielding Stacks lending protocols — currently supporting **Zest V1**, **Zest V2**, and **Granite**.

## Overview

Delta Stacks is a monorepo implementing the full stack of a DeFi yield aggregator on Stacks:

| Layer | What it does |
|-------|-------------|
| **Clarity contracts** | ERC-4626-style vault contracts + read-only aggregator |
| **Calldata SDK** | TypeScript transaction encoders for every lending operation |
| **Data provision** | On-chain data fetching, price oracles, vault snapshots |
| **Backend** | Cloudflare Workers — REST API, cron polling, auto-allocator bot |
| **Frontend** | React 19 UI — view balances, lending markets, and interact with vaults |

## Vaults

Three ERC-4626 vaults are deployed on mainnet, each routing deposits to the highest-APR market:

| Vault | Token | Market 1 | Market 2 | Share token |
|-------|-------|----------|----------|-------------|
| USDCx Vault | USDCx (6 dec) | Granite | Zest V2 | 1dUSDCx |
| STX Vault | wSTX (6 dec) | Zest V1 | Zest V2 | 1dSTX |
| sBTC Vault | sBTC (8 dec) | Zest V1 | Zest V2 | 1dsBTC |

The vault share price follows `(totalAssets + V) / (totalSupply + V)` where `V = 10^decimals`, preventing price manipulation via direct deposits.

## Repository Structure

```
delta-stacks/
  contracts/
    prod/v2/                   Vault V2 production contracts (legacy)
    prod/v3/usdcx/             Vault V3 USDCx contract + README
    prod/v3/stx/               Vault V3 STX contract + README
    zest-reader.clar           Read-only aggregator (batch multi-protocol reads)
  packages/
    calldata-sdk-stacks/       Transaction calldata encoders for all protocols
      src/vault/v2/            Legacy vault SDK
      src/vault/v3/            Vault V3 SDK
      src/zest-v1/             Zest V1 encoders
      src/zest-v2/             Zest V2 encoders
      src/granite/             Granite encoders
      src/lending/             High-level lending API
    data-provision/            On-chain data fetching & parsing
      src/lending/public-data/ Protocol-specific data modules
      src/vault/               Vault snapshot fetcher
      src/prices/              Oracle price aggregation (Pyth + on-chain)
      src/token-list/          Stacks token list utilities
    backend/                   Cloudflare Workers (cron + REST API + allocator)
    frontend/                  React 19 + Tailwind 4 UI
  tests/fork/                  Mainnet fork integration tests
```

## Packages

### `contracts/`

Clarity smart contracts for vault logic and on-chain data aggregation.

- `zest-reader.clar` — Batches multiple cross-contract read-only calls into a single RPC request, covering Zest V1, Zest V2, and Granite reserve data. Deployed with `clarity_version = 3`, epoch 3.0.
- `prod/v3/` — Vault V3 contracts (USDCx and STX variants). ERC-4626-style portable vaults with fee accrual, bookkeeping offsets, and protocol adapter trait.

See [contracts/README.md](contracts/README.md) and [contracts/prod/v3/usdcx/README.md](contracts/prod/v3/usdcx/README.md).

### `@delta-stacks/calldata-sdk-stacks`

TypeScript SDK that encodes Stacks contract call transactions for all supported operations. Returns `StacksContractCall` objects ready for wallet signing or simnet execution — never broadcasts directly.

**Zest V1** — `ZestV1Lending.encodeSupply()`, `encodeBorrow()`, `encodeRepay()`, `encodeWithdraw()`

**Zest V2** — `ZestV2Lending.encodeSupply()`, `encodeBorrow()`, `encodeRepay()`, `encodeWithdraw()`, `encodeSetEMode()`

**Granite** — `GraniteLending.encodeDeposit()`, `encodeWithdraw()`, `encodeRedeem()`, `encodeAddCollateral()`, `encodeRemoveCollateral()`, `encodeBorrow()`, `encodeRepay()`, `encodeLiquidate()`, `encodeFlashLoan()`

**Vault V3** — `DeltaVaultV3.encodeDeposit()`, `encodeWithdraw()`, `encodeAllocate()`

All amounts are in on-chain micro-units (e.g., 1 USDCx = `1_000_000`).

```typescript
import { GraniteLending, GRANITE_AEUSDC_MARKET } from '@delta-stacks/calldata-sdk-stacks'

const call = GraniteLending.encodeDeposit(GRANITE_AEUSDC_MARKET, 100_000_000, senderAddress)
// -> { contractAddress, contractName, functionName, functionArgs }
```

See [packages/calldata-sdk-stacks/README.md](packages/calldata-sdk-stacks/README.md).

### `@delta-stacks/data-provision`

Read-only on-chain data fetching, price oracle aggregation, and vault snapshot reading. Used by both the backend and frontend.

```typescript
import { getStacksLenderPublicData, fetchAllPrices, fetchVaultSnapshot } from '@delta-stacks/data-provision'

const zestV1 = await getStacksLenderPublicData('zest-v1')
const prices  = await fetchAllPrices()
const vault   = await fetchVaultSnapshot({ vault: 'usdcx' })
```

See [packages/data-provision/README.md](packages/data-provision/README.md).

### `packages/backend/`

Cloudflare Workers service exposing a REST API and running two scheduled cron jobs:

- **Every 2 min** — Refreshes prices, rotates through lenders, snapshots all three vaults
- **Every 4 hours** — Auto-allocator: rebalances vaults to the higher-APR market when the delta exceeds 0.5%

Key endpoints: `GET /lending`, `GET /prices`, `GET /vault/history`, `POST /allocate`

See [packages/backend/README.md](packages/backend/README.md).

### `packages/frontend/`

React 19 + Tailwind 4 single-page app providing:

- **Balances tab** — Token holdings
- **Lending tab** — Live APR and liquidity for all markets
- **Vault tab** — Deposit/withdraw/rebalance for V3 vaults with share-price chart
- **Legacy tab** — V2 vault support

See [packages/frontend/README.md](packages/frontend/README.md).

## Supported Protocols

| Protocol | Type | Markets |
|----------|------|---------|
| **Zest V1** | Pool-based lending (Aave-like) | STX, sBTC, USDA, xBTC, DIKO, Welsh |
| **Zest V2** | Hub-spoke with e-mode vaults | Multiple pools with efficiency grouping |
| **Granite** | Isolated markets (Compound V3 style) | aeUSDC, USDCx |

## Mainnet Fork Tests

Tests in `tests/fork/` run against a Clarinet simnet forked from Stacks mainnet. They validate the on-chain reader contract and calldata SDK encoders against real protocol state.

| Test file | What it covers |
|-----------|----------------|
| `zest-reader-mainnet.test.ts` | Zest V1/V2 aggregator contract reads |
| `zest-v1-deposit.test.ts` | Zest V1 supply via SDK encoder |
| `zest-v1-borrow.test.ts` | Zest V1 borrow via SDK encoder |
| `granite-mainnet.test.ts` | Granite aggregator contract reads |
| `granite-deposit.test.ts` | Granite LP + borrower ops via SDK encoder |

Run fork tests individually (parallel execution hits API rate limits):

```bash
npx vitest run tests/fork/granite-deposit.test.ts
```

See [tests/fork/README.md](tests/fork/README.md).

## Development

### Prerequisites

- Node.js 18+
- [pnpm](https://pnpm.io/)
- [Clarinet](https://github.com/hirosystems/clarinet) (for contract compilation and fork tests)

### Setup

```bash
pnpm install
```

### Commands

```bash
# Compile Clarity contracts
clarinet check

# Run all unit tests (excludes fork tests)
pnpm test

# Run a specific fork test
npx vitest run tests/fork/granite-deposit.test.ts

# Package-level tests
cd packages/calldata-sdk-stacks && pnpm test
cd packages/data-provision && pnpm test

# Type-check all packages
npx tsc --noEmit -p packages/backend/tsconfig.json
npx tsc --noEmit -p packages/frontend/tsconfig.app.json
```

## Key Contract Addresses (Mainnet)

| Contract | Principal |
|----------|-----------|
| Vault V3 deployer | `SP2DRPT3AA170EK5DC4T22CMSXZ6HACATPXHPAT7H` |
| Vault V3 (USDCx) | `SP2DRPT3AA170EK5DC4T22CMSXZ6HACATPXHPAT7H.vault-usdcx-v3` |
| Vault V3 (STX) | `SP2DRPT3AA170EK5DC4T22CMSXZ6HACATPXHPAT7H.vault-stx-v3-1` |
| USDCx | `SP120SBRBQJ00MCWS7TM5R8WJNTTKD5K0HFRC2CNE.usdcx` |
| Zest V2 deployer | `SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7` |

## Documentation Index

| Topic | Location |
|-------|----------|
| Agent quick-reference | [AGENT.md](AGENT.md) |
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
| Fork test guide | [tests/fork/README.md](tests/fork/README.md) |
