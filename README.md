# Delta Stacks

DeFi infrastructure for Stacks lending protocols. Provides on-chain data aggregation, transaction encoding, and mainnet fork testing for **Zest V1**, **Zest V2**, and **Granite**.

## Project Structure

```
delta-stacks/
  contracts/           Clarity aggregator contracts (deployed on-chain)
  packages/
    data-provision/    Read-only data fetching & parsing for all protocols
    calldata-sdk-stacks/  Transaction calldata encoders for all protocols
    backend/           Cloudflare Workers backend (REST API + cron + auto-allocator)
    frontend/          React 19 + Tailwind 4 frontend
  tests/fork/          Mainnet fork integration tests
```

## Packages

### `contracts/`

A single Clarity contract (`zest-reader.clar`) that batches multiple cross-contract read-only calls into one RPC request. Covers Zest V1, Zest V2, and Granite reserve data. Deployed via Clarinet with `clarity_version = 3` on `epoch 3.0`.

### `@delta-stacks/data-provision`

Fetches and parses on-chain lending market data for all three protocols.

- **`stacks-call/`** - Generic Stacks RPC call executor with Clarity encoding/decoding
- **`public-data/zest-v1/`** - Zest V1 reserve data (6 pools, 6 calls per pool)
- **`public-data/zest-v2/`** - Zest V2 reserve data with e-mode support
- **`public-data/granite/`** - Granite isolated market data (aeUSDC + USDCx, 9 calls per market)
- **`token-list/`** - Stacks token list fetcher and address utilities

Each protocol module follows the same pattern:
1. `constants.ts` - Contract addresses and market definitions
2. `publicCallBuild.ts` - Builds read-only call descriptors
3. `publicCallParse.ts` - Parses raw Clarity responses into typed data
4. `aggregatorParse.ts` - Parses aggregated results from the on-chain reader contract

Usage:
```typescript
import { getStacksLenderPublicData } from '@delta-stacks/data-provision'

const zestV1 = await getStacksLenderPublicData('zest-v1')
const zestV2 = await getStacksLenderPublicData('zest-v2')
const granite = await getStacksLenderPublicData('granite')
```

### `@delta-stacks/calldata-sdk-stacks`

Encodes Stacks contract call transactions for all lending operations. Returns `StacksContractCall` objects (`{ contractAddress, contractName, functionName, functionArgs }`) ready for wallet signing or simnet execution.

**Zest V1** - `ZestV1Lending.encodeSupply()`, `encodeBorrow()`, `encodeRepay()`, `encodeWithdraw()`

**Zest V2** - `ZestV2Lending.encodeSupply()`, `encodeBorrow()`, `encodeRepay()`, `encodeWithdraw()`, `encodeSetEMode()`

**Granite** - `GraniteLending.encodeDeposit()`, `encodeWithdraw()`, `encodeRedeem()`, `encodeAddCollateral()`, `encodeRemoveCollateral()`, `encodeBorrow()`, `encodeRepay()`, `encodeLiquidate()`, `encodeFlashLoan()`

Usage:
```typescript
import { GraniteLending, GRANITE_AEUSDC_MARKET } from '@delta-stacks/calldata-sdk-stacks'

const call = GraniteLending.encodeDeposit(GRANITE_AEUSDC_MARKET, 100_000_000, senderAddress)
// -> { contractAddress, contractName, functionName, functionArgs }
```

## Mainnet Fork Tests

Tests in `tests/fork/` run against a Clarinet simnet forked from Stacks mainnet at block **6,972,000**. They validate both the on-chain reader contract and the calldata SDK encoders against real protocol state.

| Test file | What it covers |
|---|---|
| `zest-reader-mainnet.test.ts` | Zest V1/V2 aggregator contract reads |
| `zest-v1-deposit.test.ts` | Zest V1 supply via SDK encoder |
| `zest-v1-borrow.test.ts` | Zest V1 borrow via SDK encoder |
| `granite-mainnet.test.ts` | Granite aggregator contract reads |
| `granite-deposit.test.ts` | Granite LP + borrower ops via SDK encoder |

Run fork tests individually (parallel execution hits API rate limits):

```bash
npx vitest run tests/fork/granite-deposit.test.ts
```

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
```

## Supported Protocols

| Protocol | Type | Markets |
|---|---|---|
| **Zest V1** | Pool-based lending | STX, sBTC, USDA, xBTC, DIKO, Welsh |
| **Zest V2** | Pool-based lending with e-mode | Multiple pools with efficiency grouping |
| **Granite** | Isolated markets (Compound V3 style) | aeUSDC, USDCx |
