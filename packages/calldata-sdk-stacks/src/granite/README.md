# Granite — Isolated Market Lending (Compound V3-like)

Granite uses **isolated markets** — each market has its own set of contracts for borrowing, lending, and liquidation. Currently two markets exist:

| Market | Debt Asset | Collateral | Deployer |
|--------|-----------|------------|----------|
| **aeUSDC** | aeUSDC | sBTC | `SP35E2BBMDT2Y1HB0NTK139YBGYV3PAPK3WA8BRNA` |
| **USDCx** | USDCx | sBTC | `SP3M2BYF7RGF8WKW5FVDNJ6WR8D7AR9BHDXAKPXZE` |

Core contracts deployer: `SP26NGV9AFZBX7XBDBS2C7EC7FCPSAV9PKREQNMVS`

## Key Concepts

- **Market object** — every encoder takes a `GraniteMarketContracts` param to target the right contracts. Use `GRANITE_AEUSDC_MARKET` or `GRANITE_USDCX_MARKET`.
- **LP operations** — deposit/withdraw/redeem target the `liquidity-provider-v1` contract
- **Borrower operations** — add/remove collateral, borrow, repay target the `borrower-v1` contract
- **Liquidation** — targets the `liquidator-v1` contract
- **Separate deployers** — aeUSDC uses the core deployer's contracts; USDCx has its own borrower/LP/liquidator

## Contract Layout

```
aeUSDC market:
  borrower:    SP26NGV9AFZBX7XBDBS2C7EC7FCPSAV9PKREQNMVS.borrower-v1
  lpProvider:  SP26NGV9AFZBX7XBDBS2C7EC7FCPSAV9PKREQNMVS.liquidity-provider-v1
  liquidator:  SP26NGV9AFZBX7XBDBS2C7EC7FCPSAV9PKREQNMVS.liquidator-v1
  flashLoan:   SP26NGV9AFZBX7XBDBS2C7EC7FCPSAV9PKREQNMVS.flash-loan-v1

USDCx market:
  borrower:    SP3M2BYF7RGF8WKW5FVDNJ6WR8D7AR9BHDXAKPXZE.borrower-v1
  lpProvider:  SP3M2BYF7RGF8WKW5FVDNJ6WR8D7AR9BHDXAKPXZE.liquidity-provider-v1
  liquidator:  SP3M2BYF7RGF8WKW5FVDNJ6WR8D7AR9BHDXAKPXZE.liquidator-v1
  flashLoan:   SP26NGV9AFZBX7XBDBS2C7EC7FCPSAV9PKREQNMVS.flash-loan-v1 (shared)
```

## Pyth Oracle Requirement

**Required for health-factor-dependent operations.** Granite uses a single concatenated VAA buffer encoded as `(optional (buff 8192))`.

| Operation | Needs Pyth? | Contract |
|-----------|-------------|----------|
| `deposit` | No | liquidity-provider-v1 |
| `withdraw` | No | liquidity-provider-v1 |
| `redeem` | No | liquidity-provider-v1 |
| `addCollateral` | No | borrower-v1 |
| `removeCollateral` | **Yes** | borrower-v1 |
| `borrow` | **Yes** | borrower-v1 |
| `repay` | No | borrower-v1 |
| `liquidate` | **Yes** | liquidator-v1 |
| `flashLoan` | No | flash-loan-v1 |

### Fetching price feeds

Both markets use USDC + BTC feeds (collateral is always sBTC):

```typescript
import { GraniteLending, GRANITE_AEUSDC_MARKET } from '@delta-stacks/calldata-sdk-stacks'

// Fetch combined Pyth VAA buffer for a market
const feedData = await GraniteLending.fetchPriceFeedData('aeusdc')

// Pass to any encoder that needs price data
const call = GraniteLending.encodeBorrow(
  GRANITE_AEUSDC_MARKET,
  1_000_000n,
  undefined,
  feedData,
)
```

Feed data is encoded as `(optional (buff 8192))` — a single concatenated buffer.

## Operations

### Deposit (Liquidity Provider)

Deposit underlying assets, receive LP shares.

```typescript
import { GraniteLending, GRANITE_AEUSDC_MARKET } from '@delta-stacks/calldata-sdk-stacks'

const call = GraniteLending.encodeDeposit(
  GRANITE_AEUSDC_MARKET,
  1_000_000n,          // amount of aeUSDC to deposit
  'SP1234...USER',     // recipient of LP shares
)
```

### Withdraw (by asset amount)

```typescript
const call = GraniteLending.encodeWithdraw(
  GRANITE_AEUSDC_MARKET,
  500_000n,            // amount of underlying to withdraw
  'SP1234...USER',
)
```

### Redeem (by share amount)

```typescript
const call = GraniteLending.encodeRedeem(
  GRANITE_AEUSDC_MARKET,
  500_000n,            // LP shares to redeem
  'SP1234...USER',
)
```

### Add Collateral

Post collateral (sBTC) to a borrowing position.

```typescript
const call = GraniteLending.encodeAddCollateral(
  GRANITE_AEUSDC_MARKET,
  'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token',  // collateral token
  100_000n,                // amount of sBTC sats
  'SP1234...BORROWER',    // optional onBehalfOf
)
```

### Remove Collateral (needs Pyth)

Remove collateral — position must remain healthy.

```typescript
const feedData = await GraniteLending.fetchPriceFeedData('aeusdc')

const call = GraniteLending.encodeRemoveCollateral(
  GRANITE_AEUSDC_MARKET,
  'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token',
  50_000n,
  'SP1234...BORROWER',
  feedData,                // Pyth price data
)
```

### Borrow (needs Pyth)

```typescript
const feedData = await GraniteLending.fetchPriceFeedData('aeusdc')

const call = GraniteLending.encodeBorrow(
  GRANITE_AEUSDC_MARKET,
  500_000n,               // amount to borrow
  'SP1234...BORROWER',    // optional onBehalfOf
  feedData,
)
```

### Repay

No oracle data needed.

```typescript
const call = GraniteLending.encodeRepay(
  GRANITE_AEUSDC_MARKET,
  500_000n,
  'SP1234...BORROWER',    // optional onBehalfOf
)
```

### Liquidate (needs Pyth)

```typescript
const feedData = await GraniteLending.fetchPriceFeedData('aeusdc')

const call = GraniteLending.encodeLiquidate(
  GRANITE_AEUSDC_MARKET,
  'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token',  // collateral to seize
  'SP1234...UNDERWATER_USER',
  500_000n,         // debt to repay
  40_000n,          // min collateral expected (slippage)
  feedData,
)
```

### Flash Loan

```typescript
const call = GraniteLending.encodeFlashLoan(
  GRANITE_AEUSDC_MARKET,
  10_000_000n,                          // amount
  'SP1234...CALLBACK_CONTRACT',         // must implement flash-loan-callback trait
  new Uint8Array([0x01, 0x02, 0x03]),   // optional callback data
)
```
