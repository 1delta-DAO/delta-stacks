# @delta-stacks/calldata-sdk-stacks

Calldata encoding SDK for Stacks lending protocol transactions. Generates `StacksContractCall` objects ready for `makeContractCall()` from `@stacks/transactions`.

This SDK does **not** broadcast transactions. It builds the calldata (contract address, function name, encoded Clarity arguments) that a client passes to a wallet or signing layer.

## Supported Protocols

| Protocol | Architecture | Contract | Docs |
|----------|-------------|----------|------|
| **Zest V1** | Pool-based (Aave-like) | `pool-borrow-v2-0` | [zest-v1/](src/zest-v1/) |
| **Zest V2** | Hub-spoke with vaults | `v0-4-market` | [zest-v2/](src/zest-v2/) |
| **Granite** | Isolated markets (Compound V3-like) | per-market contracts | [granite/](src/granite/) |

## Quick Start

```typescript
import {
  ZestV1Lending,
  ZestV2Lending,
  GraniteLending,
  GRANITE_AEUSDC_MARKET,
  serializeContractCall,
} from '@delta-stacks/calldata-sdk-stacks'

// Build calldata
const call = ZestV2Lending.encodeBorrow(
  'SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.v0-vault-stx',
  1_000_000n,
)

// Serialize for JSON transport
const serialized = serializeContractCall(call)

// Or use directly with @stacks/transactions
import { makeContractCall } from '@stacks/transactions'
const tx = await makeContractCall({
  ...call,
  senderKey: '...',
})
```

## Pyth Oracle Data

Some operations require fresh price data from Pyth Network. The SDK includes helpers to fetch this data from Hermes.

### Which operations need Pyth data?

| Protocol | Operation | Pyth Required? |
|----------|-----------|---------------|
| **Zest V1** | All operations | No (uses on-chain oracle contracts) |
| **Zest V2** | `supplyCollateralAdd`, `collateralAdd`, `collateralRemove`, `collateralRemoveRedeem`, `borrow`, `liquidate`, `liquidateRedeem` | Optional but recommended |
| **Zest V2** | `repay` | No |
| **Granite** | `borrow`, `removeCollateral`, `liquidate` | Optional but recommended |
| **Granite** | `deposit`, `withdraw`, `redeem`, `addCollateral`, `repay`, `flashLoan` | No |

### Fetching Pyth data

```typescript
// For Zest V2 (returns Uint8Array[] - list of buffers)
const feeds = await ZestV2Lending.fetchPriceFeeds([
  ZestV2Lending.PRICE_FEEDS.STX,
  ZestV2Lending.PRICE_FEEDS.BTC,
])
const call = ZestV2Lending.encodeBorrow(vault, amount, undefined, feeds)

// For Granite (returns single Uint8Array - concatenated buffer)
const feedData = await GraniteLending.fetchPriceFeedData('aeusdc')
const call = GraniteLending.encodeBorrow(GRANITE_AEUSDC_MARKET, amount, undefined, feedData)
```

### Available Pyth Feed IDs

| Asset | Feed ID |
|-------|---------|
| BTC | `0xe62df6c8...415b43` |
| STX | `0xec7a775f...335c17` |
| USDC | `0xeaa020c6...9c94a` |
| ETH | `0xff61491a...fd0ace` |

Source: https://pyth.network/developers/price-feed-ids#stacks

## Project Structure

```
src/
  index.ts              Main exports
  types/
    index.ts            StacksContractCall interface
    clarity-args.ts     Clarity value encoding helpers
    serialize.ts        JSON serialization/deserialization
  pyth/
    feed-ids.ts         Pyth price feed ID constants
    fetch.ts            Hermes API client (fetchPythPriceUpdate/Updates)
  zest-v1/              See src/zest-v1/README.md
  zest-v2/              See src/zest-v2/README.md
  granite/              See src/granite/README.md
  __tests__/            Vitest unit tests
```

## Types

```typescript
interface StacksContractCall {
  contractAddress: string       // Deployer SP address
  contractName: string          // Contract name
  functionName: string          // Public function name
  functionArgs: ClarityValue[]  // Encoded Clarity arguments
  stxAmount?: bigint            // Optional STX micro-amount (for STX transfers)
}
```

`serializeContractCall()` converts `ClarityValue[]` args to `0x`-prefixed hex strings for JSON transport. `deserializeContractCall()` reverses it.
