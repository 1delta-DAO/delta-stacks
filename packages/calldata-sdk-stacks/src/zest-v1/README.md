# Zest V1 — Pool-Based Lending (Aave-like)

Deployer: `SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N`

All operations target `pool-borrow-v2-0`. V1 uses a single pool with per-asset reserves. Oracles are on-chain contract principals (not Pyth).

## Key Concepts

- **z-tokens** — receipt tokens minted on supply (e.g., `zwstx-v2-0` for WSTX)
- **AssetOracleLp** — tuple of `{ asset, lpToken, oracle }` identifying a reserve. Many operations require passing the user's full position as a list of these for health factor checks.
- **Interest rate modes** — `1` = variable, `2` = stable
- **e-mode** — efficiency mode categories that allow higher LTV within correlated asset groups

## Pyth Oracle Requirement

**None.** Zest V1 uses on-chain oracle contract principals passed as function arguments.

## Operations

### Supply (Deposit)

Deposit an asset into the pool. Receive z-tokens.

```typescript
import { ZestV1Lending } from '@delta-stacks/calldata-sdk-stacks'

const call = ZestV1Lending.encodeSupply(
  'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.zwstx-v2-0',  // lpToken (z-token)
  'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.pool-0-reserve-v2-0', // poolReserve
  'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.wstx',         // asset
  1_000_000n,                                                 // amount (micro-STX)
  'SP1234...USER',                                            // owner (receives z-tokens)
)
```

| Param | Type | Description |
|-------|------|-------------|
| `lpToken` | string | z-token contract principal |
| `poolReserve` | string | Pool reserve contract |
| `asset` | string | Token to supply |
| `amount` | bigint | Amount in smallest units |
| `owner` | string | Address receiving z-tokens |

### Withdraw

Redeem z-tokens for underlying. Requires health factor check (full position).

```typescript
const call = ZestV1Lending.encodeWithdraw(
  'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.pool-0-reserve-v2-0',
  'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.wstx',
  'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.zwstx-v2-0',
  'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.stx-btc-oracle-v1-4',
  userAssets,   // AssetOracleLp[] — full user position
  500_000n,     // amount to withdraw
  'SP1234...USER',
)
```

| Param | Type | Description |
|-------|------|-------------|
| `poolReserve` | string | Pool reserve contract |
| `asset` | string | Token to withdraw |
| `lpToken` | string | z-token contract |
| `oracle` | string | Price oracle contract for this asset |
| `assets` | AssetOracleLp[] | Full user position (for health factor) |
| `amount` | bigint | Amount to withdraw |
| `owner` | string | Address that owns the z-tokens |

### Borrow

Borrow against collateral. Requires full position for health check.

```typescript
const call = ZestV1Lending.encodeBorrow(
  'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.pool-0-reserve-v2-0',
  'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.stx-btc-oracle-v1-4',
  'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.wstx',
  'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.zwstx-v2-0',
  userAssets,     // AssetOracleLp[]
  1_000_000n,     // amount to borrow
  'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.fees-calculator',
  1,              // interest rate mode: 1=variable, 2=stable
  'SP1234...USER',
)
```

| Param | Type | Description |
|-------|------|-------------|
| `poolReserve` | string | Pool reserve contract |
| `oracle` | string | Price oracle for the borrowed asset |
| `assetToBorrow` | string | Token to borrow |
| `lpToken` | string | z-token for the borrowed asset |
| `assets` | AssetOracleLp[] | Full user position |
| `amount` | bigint | Amount to borrow |
| `feeCalculator` | string | Fee calculator contract |
| `interestRateMode` | number | `1` = variable, `2` = stable |
| `owner` | string | Borrower address |

### Repay

Repay a borrowed asset. Simplest operation — no health check needed.

```typescript
const call = ZestV1Lending.encodeRepay(
  'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.wstx',
  500_000n,
  'SP1234...BORROWER',   // onBehalfOf
  'SP1234...PAYER',      // payer (can differ from borrower)
)
```

### Toggle Collateral

Enable or disable a supplied asset as collateral.

```typescript
const call = ZestV1Lending.encodeSetUserUseReserveAsCollateral(
  'SP1234...USER',
  'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.zwstx-v2-0',
  'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.wstx',
  true,  // enable as collateral
  'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.stx-btc-oracle-v1-4',
  userAssets,
)
```

### Set E-Mode

Set efficiency mode category for higher LTV on correlated assets.

```typescript
const call = ZestV1Lending.encodeSetEMode(
  'SP1234...USER',
  userAssets,
  0x01,   // e-mode category (0x00 = disabled)
)
```

### Flash Loan

```typescript
const call = ZestV1Lending.encodeFlashloan(
  'SP1234...RECEIVER',
  'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.wstx',
  10_000_000n,
  'SP1234...FLASHLOAN_CONTRACT',
)
```

### Liquidation

Liquidate an under-collateralized position.

```typescript
const call = ZestV1Lending.encodeLiquidationCall(
  userAssets,              // full position of the liquidated user
  collateralLpToken,       // collateral z-token
  collateralAsset,         // collateral token
  debtAsset,               // debt token
  collateralOracle,        // oracle for collateral
  debtOracle,              // oracle for debt
  'SP1234...LIQUIDATED',   // user being liquidated
  500_000n,                // debt amount to cover
  false,                   // receive z-tokens (true) or underlying (false)
)
```

## AssetOracleLp Structure

Many V1 operations need the user's full position as an array:

```typescript
const userAssets: AssetOracleLp[] = [
  {
    asset: 'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.wstx',
    lpToken: 'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.zwstx-v2-0',
    oracle: 'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.stx-btc-oracle-v1-4',
  },
  {
    asset: 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token',
    lpToken: 'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.zsbtc-v2-0',
    oracle: 'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.stx-btc-oracle-v1-4',
  },
]
```

This list is encoded as a Clarity list of tuples and passed to the contract for health factor calculation.
