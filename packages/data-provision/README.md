# Data Provision

On-chain data fetching, parsing, and oracle aggregation for Delta Stacks. Provides read-only access to lending market data, USD prices, vault snapshots, and token metadata. Used by both the backend and frontend.

## Installation

```bash
# From monorepo root
pnpm install
```

## Quick Start

```typescript
import {
  getStacksLenderPublicData,
  fetchAllPrices,
  fetchVaultSnapshot,
} from '@delta-stacks/data-provision'

// Fetch lending market data for a protocol
const zestV1  = await getStacksLenderPublicData('zest-v1')
const zestV2  = await getStacksLenderPublicData('zest-v2')
const granite = await getStacksLenderPublicData('granite')

// Fetch all lending data in one call
import { getAllLendingData } from '@delta-stacks/data-provision'
const { v1, v2, granite } = await getAllLendingData()

// Fetch USD prices (Pyth + on-chain oracle)
const prices = await fetchAllPrices()
// -> { stx: 0.42, sbtc: 95000, usdcx: 1.0, ... }

// Fetch vault state
const snapshot = await fetchVaultSnapshot({ vault: 'usdcx' })
// -> { totalAssets, totalSupply, sharePrice, allocation, ... }
```

## API Reference

### Lending Data

```typescript
getStacksLenderPublicData(
  lender: 'zest-v1' | 'zest-v2' | 'granite',
  prices?: USDPriceMap,
  options?: StacksLenderOptions
): Promise<LenderPublicData>

getAllLendingData(
  prices?: USDPriceMap,
  options?: StacksLenderOptions
): Promise<AllLendingData>
```

Returns reserve data for each market: supply APR, borrow APR, total liquidity, utilization, available liquidity, price, etc.

### User Data

```typescript
getStacksUserData(
  lender: 'zest-v1' | 'zest-v2' | 'granite',
  userAddress: string,
  prices?: USDPriceMap,
  options?: StacksLenderOptions
): Promise<UserData>

getAllUserData(
  userAddress: string,
  prices?: USDPriceMap
): Promise<AllUserData>
```

Returns per-user supply and borrow positions, health factor, and USD values.

### Prices

```typescript
fetchAllPrices(options?: FetchPricesOptions): Promise<USDPriceMap>
```

Aggregates USD prices from Pyth API and on-chain oracle reads. Returns a map keyed by lowercase symbol (e.g., `'stx'`, `'sbtc'`, `'usdcx'`) or market UID.

### Vault Snapshots

```typescript
fetchVaultSnapshot(options: { vault: 'usdcx' | 'stx' | 'sbtc' }): Promise<VaultSnapshot>
```

Reads the current on-chain vault state:

```typescript
interface VaultSnapshot {
  totalAssets: bigint        // Total assets under management
  totalSupply: bigint        // Total shares in circulation
  sharePrice: number         // (totalAssets + V) / (totalSupply + V)
  allocation: {
    market1: bigint          // Assets allocated to market 1
    market2: bigint          // Assets allocated to market 2
  }
  timestamp: number
}
```

### Token List

```typescript
fetchStacksTokenList(): Promise<StacksTokenList>
toTokenKey(principal: string): string
isValidStacksAddress(addr: string): boolean
```

Fetches SIP-010 token metadata (name, symbol, decimals, logo URI) from the on-chain registry.

### Low-Level Stacks RPC

```typescript
executeStacksReadCalls(
  calls: StacksCall[],
  options?: { rpcUrl?: string; concurrency?: number }
): Promise<ClarityValue[]>
```

Executes Clarity read-only function calls against the Stacks node. Used internally by all higher-level modules.

## Module Structure

```
src/
  index.ts                        Main package exports
  lending/
    public-data/
      zest-v1/                    Zest V1 data fetching + parsing
      zest-v2/                    Zest V2 data fetching + parsing
      granite/                    Granite data fetching + parsing
      fetchStacksLender.ts        Router — dispatches to the right protocol module
    user-data/
      fetchStacksUserData.ts      User position aggregation
      convertPublicToMeta.ts      Convert protocol data to user-friendly format
      utils/types.ts              Shared type definitions
  prices/
    pythFetch.ts                  Pyth API price fetching
    onChainCallBuild.ts           Build Clarity calls for on-chain oracle reads
    onChainCallParse.ts           Parse oracle Clarity responses
    selectAssetGroupPrices.ts     Filter prices by asset group
    index.ts                      Public price API
  token-list/
    fetchTokenList.ts             Fetch token metadata from on-chain registry
    lookup.ts                     Token lookup helpers
    address.ts                    Stacks address utilities
    writeTokenList.ts             CLI script to persist token list to disk
  vault/
    fetchVaultSnapshot.ts         Read vault contract state
    index.ts                      Public vault API
  stacks-call/
    executor.ts                   Clarity read-only call executor
    clarity-encode.ts             Clarity value encoder
    clarity-decode.ts             Clarity value decoder
    index.ts                      Public RPC API
  __tests__/                      Vitest unit + integration tests
```

Each protocol module under `lending/public-data/` follows the same pattern:

| File | Purpose |
|------|---------|
| `constants.ts` | Contract addresses and market definitions |
| `publicCallBuild.ts` | Build read-only call descriptors |
| `publicCallParse.ts` | Parse raw Clarity responses into typed data |
| `aggregatorParse.ts` | Parse batched results from the on-chain reader contract |

## Protocol-Specific Docs

| Protocol | README |
|----------|--------|
| Zest V1 | [src/lending/public-data/zest-v1/README.md](src/lending/public-data/zest-v1/README.md) |
| Zest V2 | [src/lending/public-data/zest-v2/README.md](src/lending/public-data/zest-v2/README.md) |
| Token list | [src/token-list/README.md](src/token-list/README.md) |

## Options

```typescript
interface StacksLenderOptions {
  rpcUrl?: string        // Custom Stacks node RPC (default: Hiro public node)
  concurrency?: number   // Max concurrent RPC requests (default: 2)
}

interface FetchPricesOptions {
  concurrency?: number
  preferredSources?: ('pyth' | 'on-chain')[]
}
```

## Testing

```bash
npm test             # Run Vitest (single pass)
npm run test:watch   # Run Vitest in watch mode
npm run typecheck    # TypeScript type-check only
npm run token-list   # CLI: write current token list to disk
```

Tests cover Clarity encoding/decoding, aggregator response parsing, user data aggregation, and vault snapshot reading.
