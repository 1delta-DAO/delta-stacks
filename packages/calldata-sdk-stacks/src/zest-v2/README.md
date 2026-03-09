# Zest V2 — Hub-Spoke Lending with Vaults

Deployer: `SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7`

All operations target `v0-4-market` (the market hub). V2 uses a hub-spoke architecture: the market contract orchestrates, individual vault contracts hold asset state.

## Key Concepts

- **Vaults** — each asset has its own vault contract (e.g., `v0-vault-stx`, `v0-vault-sbtc`)
- **ft parameter** — vault/token contract principal passed as a trait reference to identify the asset
- **Asset IDs** — numeric identifiers (0=STX, 2=sBTC, 4=stSTX, 6=USDC, 8=USDH, 10=stSTXBTC)
- **z-tokens** — receipt tokens minted on supply (held or posted as collateral)
- **Slippage protection** — `minShares`/`minUnderlying` params prevent sandwich attacks
- **Price feeds** — optional Pyth VAA buffers for oracle data

## Vault Mapping

| Asset ID | Asset | Vault Contract |
|----------|-------|----------------|
| 0 | STX | `v0-vault-stx` |
| 2 | sBTC | `v0-vault-sbtc` |
| 4 | stSTX | `v0-vault-ststx` |
| 6 | USDC | `v0-vault-usdc` |
| 8 | USDH | `v0-vault-usdh` |
| 10 | stSTXBTC | `v0-vault-ststxbtc` |

All vault principals: `SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.<vault-name>`

## Pyth Oracle Requirement

**Optional but recommended** for operations that check health factor. Pass `undefined` to skip (contract uses cached on-chain prices).

| Operation | Needs Pyth? |
|-----------|-------------|
| `supplyCollateralAdd` | Optional |
| `collateralAdd` | Optional |
| `collateralRemove` | Optional |
| `collateralRemoveRedeem` | Optional |
| `borrow` | Optional |
| `repay` | **No** |
| `liquidate` | Optional |
| `liquidateRedeem` | Optional |

### Fetching price feeds

```typescript
import { ZestV2Lending } from '@delta-stacks/calldata-sdk-stacks'

// Fetch fresh Pyth VAA buffers for the assets involved
const feeds = await ZestV2Lending.fetchPriceFeeds([
  ZestV2Lending.PRICE_FEEDS.STX,
  ZestV2Lending.PRICE_FEEDS.BTC,
])

// Pass to any encoder that accepts priceFeeds
const call = ZestV2Lending.encodeBorrow(vault, amount, undefined, feeds)
```

Feeds are encoded as `(optional (list N (buff ...)))` — a list of separate buffers.

## Operations

### Supply + Add Collateral (Primary Deposit)

Deposit underlying asset and post z-tokens as collateral in one step. This is the standard way to deposit in V2.

```typescript
const call = ZestV2Lending.encodeSupplyCollateralAdd(
  'SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.v0-vault-stx',  // ft (vault)
  1_000_000n,   // amount to supply
  900_000n,     // minShares (slippage protection)
  feeds,        // optional Pyth price feeds
)
```

| Param | Type | Description |
|-------|------|-------------|
| `ft` | string | Vault contract principal |
| `amount` | bigint | Amount of underlying to supply |
| `minShares` | bigint | Minimum z-tokens to receive |
| `priceFeeds` | Uint8Array[] | Optional Pyth VAA buffers |

### Add Collateral (z-tokens already held)

Post existing z-tokens as collateral without supplying new assets.

```typescript
const call = ZestV2Lending.encodeCollateralAdd(
  'SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.v0-vault-stx',
  500_000n,
  feeds,
)
```

### Remove Collateral (keep z-tokens)

Un-post z-tokens from collateral. Keeps them in wallet.

```typescript
const call = ZestV2Lending.encodeCollateralRemove(
  'SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.v0-vault-stx',
  500_000n,
  'SP1234...RECEIVER',  // optional, defaults to sender
  feeds,
)
```

### Remove Collateral + Redeem (Primary Withdraw)

Un-post collateral and redeem z-tokens back to underlying in one step. This is the standard way to withdraw in V2.

```typescript
const call = ZestV2Lending.encodeCollateralRemoveRedeem(
  'SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.v0-vault-stx',
  500_000n,       // z-token amount
  450_000n,       // minUnderlying (slippage protection)
  'SP1234...RECEIVER',
  feeds,
)
```

| Param | Type | Description |
|-------|------|-------------|
| `ft` | string | Vault contract principal |
| `amount` | bigint | z-token amount to redeem |
| `minUnderlying` | bigint | Minimum underlying to receive |
| `receiver` | string? | Optional recipient (defaults to sender) |
| `priceFeeds` | Uint8Array[]? | Optional Pyth VAA buffers |

### Borrow

```typescript
const call = ZestV2Lending.encodeBorrow(
  'SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.v0-vault-stx',
  1_000_000n,
  'SP1234...RECEIVER',  // optional
  feeds,
)
```

### Repay

No oracle data needed.

```typescript
const call = ZestV2Lending.encodeRepay(
  'SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.v0-vault-stx',
  500_000n,
  'SP1234...BORROWER',  // optional onBehalfOf
)
```

### Liquidate

```typescript
const call = ZestV2Lending.encodeLiquidate(
  'SP1234...BORROWER',
  'SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.v0-vault-stx',   // collateral vault
  'SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.v0-vault-usdc',  // debt vault
  500_000n,       // debt amount to repay
  400_000n,       // min collateral to receive
  'SP1234...RECEIVER',
  feeds,
)
```

### Liquidate + Redeem

Same as liquidate but also redeems seized z-tokens back to underlying.

```typescript
const call = ZestV2Lending.encodeLiquidateRedeem(
  'SP1234...BORROWER',
  collateralVault,
  debtVault,
  debtAmount,
  minCollateral,
  minUnderlying,   // additional slippage protection for redemption
  'SP1234...RECEIVER',
  feeds,
)
```

## E-Group Admin (ZestV2EGroup)

Efficiency group configuration — admin only.

```typescript
import { ZestV2EGroup } from '@delta-stacks/calldata-sdk-stacks'

const call = ZestV2EGroup.encodeInsert({
  mask: 0n,
  ltvBorrow: 80_000_000n,
  ltvLiqPartial: 85_000_000n,
  ltvLiqFull: 90_000_000n,
  liqPenaltyMin: 5_000_000n,
  liqPenaltyMax: 10_000_000n,
  liqCurveExp: 2n,
  borrowDisabledMask: 0n,
})

// Update existing group
const updateCall = ZestV2EGroup.encodeUpdate(1n, { ...params })
```
