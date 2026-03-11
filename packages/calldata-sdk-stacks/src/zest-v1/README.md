# Zest V1 — Pool-Based Lending (Aave-like)

Deployer: `SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N`

All user-facing operations go through `borrow-helper-v2-1-7`, the **only** approved gateway contract. It forwards internally to `pool-borrow-v2-4`. Calling `pool-borrow` directly fails with `err u30000` (ERR_UNAUTHORIZED) because the `approved-contracts` map only whitelists the helper.

## Architecture

```
User  ──>  borrow-helper-v2-1-7  ──>  pool-borrow-v2-4  ──>  pool-0-reserve-v2-0
                │                                                    │
                ├── incentives-v2-2                                   ├── pool-reserve-data (maps)
                └── fees-calculator                                   └── z-token contracts (balances)
```

### Key Contracts

| Contract | Purpose |
|----------|---------|
| `borrow-helper-v2-1-7` | Approved gateway — all user calls go here |
| `pool-0-reserve-v2-0` | Reserve state, rate calculations, e-mode config |
| `pool-reserve-data` | On-chain storage maps for user/reserve data |
| `fees-calculator` | Fee computation for borrow operations |
| `incentives-v2-2` | Incentives/rewards tracking |

### Key Concepts

- **z-tokens** — receipt tokens minted on supply (e.g., `zwstx-v2-0` for wSTX). The z-token balance IS the deposit amount.
- **Asset list** — many operations require passing the user's full collateral set as `(list 10 (tuple (asset principal) (lp-token principal) (oracle principal)))` for health factor validation.
- **Oracles** — each asset has a dedicated on-chain oracle contract (e.g., `stx-btc-oracle-v1-4` for STX/sBTC/stSTX).
- **E-mode** — efficiency mode categories that adjust LTV/liquidation thresholds for correlated assets (0 = default, 1 = STX-correlated).

## Pyth Oracle Requirement

Operations that modify health factor **require** Pyth price feed data. The contract accepts `(optional (buff 2007))` — a single concatenated VAA buffer containing BTC + STX + USDC feeds from the Pyth Hermes API.

| Operation | Needs Pyth? | Why |
|-----------|-------------|-----|
| `supply` | **No** | Improves health (adds collateral) |
| `withdraw` | **Yes** | Reduces collateral, must verify health |
| `borrow` | **Yes** | Adds debt, must verify health |
| `repay` | **No** | Improves health (reduces debt) |
| `set-user-use-reserve-as-collateral` | **Yes** | Changes collateral composition |
| `set-e-mode` | **Yes** | Changes LTV parameters |
| `liquidation-call` | **Yes** | Needs accurate prices for liquidation math |

### Fetching price feeds

```typescript
import { ZestV1Lending } from '@delta-stacks/calldata-sdk-stacks'

// Fetch fresh Pyth VAA buffer (BTC + STX + USDC feeds, concatenated)
const priceFeedBytes = await ZestV1Lending.fetchPriceFeeds()

// Pass to any encoder that accepts priceFeedBytes
const call = ZestV1Lending.encodeWithdraw(
  poolReserve, asset, lpToken, oracle, assets, amount, owner, priceFeedBytes,
)
```

The high-level lending handlers (`borrow()`, `withdraw()`) fetch Pyth feeds automatically. You only need to call `fetchPriceFeeds()` directly when using the low-level `encode*` functions.

## Operations

### Supply (Deposit)

Deposit an underlying asset and receive z-tokens. No Pyth data needed.

**Clarity signature:**
```clarity
(define-public (supply
  (lp            <ft-mint-trait>)     ;; z-token contract (e.g. zwstx-v2-0)
  (pool-reserve  <pool-reserve-trait>) ;; pool-0-reserve-v2-0
  (asset         <ft-transfer-trait>) ;; underlying token (e.g. wstx)
  (amount        uint)               ;; amount in smallest units
  (owner         principal)          ;; depositor address
  (referral      (optional principal)) ;; always none
  (incentives    <incentives-trait>)  ;; incentives-v2-2
))
```

**SDK usage:**
```typescript
import { ZestV1Lending, ZEST_V1_CONTRACTS } from '@delta-stacks/calldata-sdk-stacks'

const call = ZestV1Lending.encodeSupply(
  'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.zwstx-v2-0',       // lpToken (z-token)
  'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.pool-0-reserve-v2-0', // poolReserve
  'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.wstx',              // asset
  1_000_000n,   // amount (6 decimals for STX)
  senderAddress, // owner
)
```

| Arg # | Clarity Name | Clarity Type | Description |
|---|---|---|---|
| 0 | `lp` | `principal` (ft-mint-trait) | z-token contract that gets minted |
| 1 | `pool-reserve` | `principal` (pool-reserve-trait) | Always `pool-0-reserve-v2-0` |
| 2 | `asset` | `principal` (ft-transfer-trait) | Underlying token to deposit |
| 3 | `amount` | `uint` | Amount in smallest units (e.g. 1 STX = 1000000) |
| 4 | `owner` | `principal` | Depositor's address |
| 5 | `referral` | `(optional principal)` | SDK always passes `none` |
| 6 | `incentives` | `principal` (incentives-trait) | Always `incentives-v2-2` (SDK auto-fills) |

### Withdraw

Burns z-tokens and returns underlying. Requires Pyth price data.

**Clarity signature:**
```clarity
(define-public (withdraw
  (lp               <ft-burn-trait>)    ;; z-token to burn (e.g. zwstx-v2-0)
  (pool-reserve     <pool-reserve-trait>) ;; pool-0-reserve-v2-0
  (asset            <ft-transfer-trait>) ;; underlying token to receive
  (oracle           <oracle-trait>)     ;; asset's price oracle
  (amount           uint)              ;; amount to withdraw (u340282366920938463463374607431768211455 = MAX/all)
  (owner            principal)         ;; withdrawer address
  (assets           (list 10 (tuple
                      (asset    <ft-transfer-trait>)
                      (lp-token <ft-mint-trait>)
                      (oracle   <oracle-trait>))))  ;; ALL user collateral positions
  (incentives       <incentives-trait>) ;; incentives-v2-2
  (price-feed-bytes (optional (buff 2007))) ;; Pyth VAA: BTC+STX+USDC concatenated
))
```

**SDK usage:**
```typescript
const feeds = await ZestV1Lending.fetchPriceFeeds()
const call = ZestV1Lending.encodeWithdraw(
  ZEST_V1_CONTRACTS.poolReserve,
  'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.wstx',         // asset
  'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.zwstx-v2-0',   // lpToken
  'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.stx-btc-oracle-v1-4', // oracle
  userPositionAssets, // AssetOracleLp[] — all collateral positions
  1_000_000n,        // amount to withdraw
  senderAddress,     // owner
  feeds,             // priceFeedBytes
)
```

| Arg # | Clarity Name | Clarity Type | Description |
|---|---|---|---|
| 0 | `lp` | `principal` (ft-burn-trait) | z-token to burn |
| 1 | `pool-reserve` | `principal` (pool-reserve-trait) | Always `pool-0-reserve-v2-0` |
| 2 | `asset` | `principal` (ft-transfer-trait) | Underlying token to receive |
| 3 | `oracle` | `principal` (oracle-trait) | Price oracle for the withdrawn asset |
| 4 | `amount` | `uint` | Amount to withdraw. Use `u340282366920938463463374607431768211455` (uint128 MAX) to withdraw all |
| 5 | `owner` | `principal` | Withdrawer's address |
| 6 | `assets` | `(list 10 (tuple (asset principal) (lp-token principal) (oracle principal)))` | All user collateral positions for health factor check |
| 7 | `incentives` | `principal` (incentives-trait) | Always `incentives-v2-2` (SDK auto-fills) |
| 8 | `price-feed-bytes` | `(optional (buff 2007))` | Pyth VAA buffer with BTC+STX+USDC feeds. **Required** — passing `none` fails on-chain |

### Borrow

Take a loan against posted collateral. Requires Pyth price data.

**Clarity signature:**
```clarity
(define-public (borrow
  (pool-reserve     <pool-reserve-trait>) ;; pool-0-reserve-v2-0
  (oracle           <oracle-trait>)     ;; oracle for borrowed asset
  (asset            <ft-transfer-trait>) ;; asset to borrow
  (lp-token         <ft-mint-trait>)    ;; z-token for borrowed asset
  (assets           (list 10 (tuple
                      (asset    <ft-transfer-trait>)
                      (lp-token <ft-mint-trait>)
                      (oracle   <oracle-trait>))))  ;; ALL user collateral positions
  (amount           uint)              ;; amount to borrow
  (fee-calculator   <fee-calculator-trait>) ;; fees-calculator
  (interest-rate-mode uint)            ;; 1 = variable (only supported mode)
  (owner            principal)         ;; borrower address
  (price-feed-bytes (optional (buff 2007))) ;; Pyth VAA: BTC+STX+USDC concatenated
))
```

**SDK usage:**
```typescript
const feeds = await ZestV1Lending.fetchPriceFeeds()
const call = ZestV1Lending.encodeBorrow(
  ZEST_V1_CONTRACTS.poolReserve,
  'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.stx-btc-oracle-v1-4', // oracle
  'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.wstx',         // assetToBorrow
  'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.zwstx-v2-0',   // lpToken
  userPositionAssets, // AssetOracleLp[]
  1_000_000n,        // amount to borrow
  ZEST_V1_CONTRACTS.feeCalculator,
  1,                 // interestRateMode (1 = variable)
  senderAddress,     // owner
  feeds,             // priceFeedBytes
)
```

| Arg # | Clarity Name | Clarity Type | Description |
|---|---|---|---|
| 0 | `pool-reserve` | `principal` (pool-reserve-trait) | Always `pool-0-reserve-v2-0` |
| 1 | `oracle` | `principal` (oracle-trait) | Price oracle for the borrowed asset |
| 2 | `asset` | `principal` (ft-transfer-trait) | Asset to borrow |
| 3 | `lp-token` | `principal` (ft-mint-trait) | z-token for borrowed asset |
| 4 | `assets` | `(list 10 (tuple (asset principal) (lp-token principal) (oracle principal)))` | All user collateral positions for health factor check |
| 5 | `amount` | `uint` | Amount to borrow |
| 6 | `fee-calculator` | `principal` (fee-calculator-trait) | Always `fees-calculator` (SDK auto-fills) |
| 7 | `interest-rate-mode` | `uint` | Always `u1` (variable rate, only supported mode) |
| 8 | `owner` | `principal` | Borrower's address |
| 9 | `price-feed-bytes` | `(optional (buff 2007))` | Pyth VAA buffer with BTC+STX+USDC feeds. **Required** — passing `none` fails on-chain |

### Repay

Repay a borrowed asset. No Pyth data needed.

**Clarity signature:**
```clarity
(define-public (repay
  (asset       <ft-transfer-trait>) ;; asset being repaid
  (amount      uint)               ;; amount to repay
  (on-behalf-of principal)         ;; borrower being repaid for
  (payer       principal)          ;; who sends the tokens
))
```

**SDK usage:**
```typescript
const call = ZestV1Lending.encodeRepay(
  'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.wstx', // asset
  500_000n,       // amount
  senderAddress,  // onBehalfOf
  senderAddress,  // payer
)
```

| Arg # | Clarity Name | Clarity Type | Description |
|---|---|---|---|
| 0 | `asset` | `principal` (ft-transfer-trait) | Asset being repaid |
| 1 | `amount` | `uint` | Amount to repay |
| 2 | `on-behalf-of` | `principal` | Borrower address (can repay someone else's debt) |
| 3 | `payer` | `principal` | Who sends the tokens (usually same as `on-behalf-of`) |

### Toggle Collateral

Enable or disable a supplied asset as collateral. Requires Pyth data.

**Clarity signature:**
```clarity
(define-public (set-user-use-reserve-as-collateral
  (who                 principal)       ;; user address
  (lp-token            <ft-mint-trait>) ;; z-token for the reserve
  (asset               <ft-transfer-trait>) ;; underlying asset
  (enable-as-collateral bool)           ;; true = enable, false = disable
  (oracle              <oracle-trait>)  ;; asset's price oracle
  (assets-to-calculate (list 10 (tuple
                         (asset    <ft-transfer-trait>)
                         (lp-token <ft-mint-trait>)
                         (oracle   <oracle-trait>)))) ;; ALL user positions
  (price-feed-bytes    (optional (buff 2007)))        ;; Pyth VAA
))
```

**SDK usage:**
```typescript
const feeds = await ZestV1Lending.fetchPriceFeeds()
const call = ZestV1Lending.encodeSetUserUseReserveAsCollateral(
  senderAddress,
  'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.zwstx-v2-0',
  'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.wstx',
  true,  // enable as collateral
  'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.stx-btc-oracle-v1-4',
  userAssets,
  feeds,
)
```

| Arg # | Clarity Name | Clarity Type | Description |
|---|---|---|---|
| 0 | `who` | `principal` | User whose collateral setting is being changed |
| 1 | `lp-token` | `principal` (ft-mint-trait) | z-token for the reserve being toggled |
| 2 | `asset` | `principal` (ft-transfer-trait) | Underlying asset |
| 3 | `enable-as-collateral` | `bool` | `true` to enable, `false` to disable |
| 4 | `oracle` | `principal` (oracle-trait) | Price oracle for this asset |
| 5 | `assets-to-calculate` | `(list 10 (tuple ...))` | All user positions for health check |
| 6 | `price-feed-bytes` | `(optional (buff 2007))` | Pyth VAA buffer. **Required** when disabling collateral |

### Set E-Mode

Set efficiency mode category for higher LTV on correlated assets. Requires Pyth data.

**Clarity signature:**
```clarity
(define-public (set-e-mode
  (user             principal)         ;; user address
  (assets           (list 10 (tuple
                      (asset    <ft-transfer-trait>)
                      (lp-token <ft-mint-trait>)
                      (oracle   <oracle-trait>)))) ;; ALL user positions
  (e-mode-type      (buff 1))         ;; 0x00 = disabled, 0x01 = STX-correlated
  (price-feed-bytes (optional (buff 2007)))        ;; Pyth VAA
))
```

**SDK usage:**
```typescript
const feeds = await ZestV1Lending.fetchPriceFeeds()
const call = ZestV1Lending.encodeSetEMode(
  senderAddress,
  userAssets,
  0x01,   // e-mode category (0x00 = disabled, 0x01 = STX-correlated)
  feeds,
)
```

| Arg # | Clarity Name | Clarity Type | Description |
|---|---|---|---|
| 0 | `user` | `principal` | User address |
| 1 | `assets` | `(list 10 (tuple ...))` | All user positions for health check |
| 2 | `e-mode-type` | `(buff 1)` | Single byte: `0x00` = disabled, `0x01` = STX-correlated |
| 3 | `price-feed-bytes` | `(optional (buff 2007))` | Pyth VAA buffer. **Required** |

### Liquidation

Liquidate an under-collateralized position. Requires Pyth data.

**Clarity signature:**
```clarity
(define-public (liquidation-call
  (assets                (list 10 (tuple
                           (asset    <ft-transfer-trait>)
                           (lp-token <ft-mint-trait>)
                           (oracle   <oracle-trait>)))) ;; liquidated user's positions
  (collateral-lp         <ft-burn-trait>)  ;; collateral z-token to seize
  (collateral-to-liquidate <ft-transfer-trait>) ;; collateral underlying
  (debt-asset            <ft-transfer-trait>) ;; debt token being repaid
  (collateral-oracle     <oracle-trait>)   ;; oracle for collateral asset
  (debt-oracle           <oracle-trait>)   ;; oracle for debt asset
  (liquidated-user       principal)        ;; user being liquidated
  (debt-amount           uint)             ;; amount of debt to cover
  (to-receive-a-token    bool)             ;; true = receive z-tokens, false = underlying
  (price-feed-bytes      (optional (buff 2007))) ;; Pyth VAA
))
```

**SDK usage:**
```typescript
const feeds = await ZestV1Lending.fetchPriceFeeds()
const call = ZestV1Lending.encodeLiquidationCall(
  userAssets,              // full position of the liquidated user
  collateralLpToken,       // collateral z-token
  collateralAsset,         // collateral token
  debtAsset,               // debt token
  collateralOracle,        // oracle for collateral
  debtOracle,              // oracle for debt
  liquidatedUserAddress,
  500_000n,                // debt amount to cover
  false,                   // receive z-tokens (true) or underlying (false)
  feeds,
)
```

| Arg # | Clarity Name | Clarity Type | Description |
|---|---|---|---|
| 0 | `assets` | `(list 10 (tuple ...))` | Liquidated user's full collateral positions |
| 1 | `collateral-lp` | `principal` (ft-burn-trait) | z-token for collateral being seized |
| 2 | `collateral-to-liquidate` | `principal` (ft-transfer-trait) | Underlying collateral token |
| 3 | `debt-asset` | `principal` (ft-transfer-trait) | Debt token being repaid by liquidator |
| 4 | `collateral-oracle` | `principal` (oracle-trait) | Price oracle for collateral |
| 5 | `debt-oracle` | `principal` (oracle-trait) | Price oracle for debt |
| 6 | `liquidated-user` | `principal` | User being liquidated |
| 7 | `debt-amount` | `uint` | Amount of debt to cover |
| 8 | `to-receive-a-token` | `bool` | `true` = receive z-tokens, `false` = receive underlying |
| 9 | `price-feed-bytes` | `(optional (buff 2007))` | Pyth VAA buffer. **Required** |

## Using the High-Level Lending API

The `borrow()` and `withdraw()` functions handle Pyth fetching automatically:

```typescript
import { borrow, withdraw, deposit, repay, Lender, ZEST_V1_CONTRACTS } from '@delta-stacks/calldata-sdk-stacks'

// Supply — no Pyth needed
const supplyCall = await deposit({
  lender: Lender.ZestV1,
  amount: 1_000_000n,
  lpToken: 'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.zwstx-v2-0',
  poolReserve: ZEST_V1_CONTRACTS.poolReserve,
  asset: 'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.wstx',
  owner: senderAddress,
})

// Borrow — Pyth fetched automatically
const borrowCall = await borrow({
  lender: Lender.ZestV1,
  amount: 500_000n,
  poolReserve: ZEST_V1_CONTRACTS.poolReserve,
  oracle: 'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.stx-btc-oracle-v1-4',
  assetToBorrow: 'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.wstx',
  lpToken: 'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.zwstx-v2-0',
  assets: collateralPositions,
  feeCalculator: ZEST_V1_CONTRACTS.feeCalculator,
  interestRateMode: 1,
  owner: senderAddress,
})

// Withdraw — Pyth fetched automatically
const withdrawCall = await withdraw({
  lender: Lender.ZestV1,
  amount: 1_000_000n,
  poolReserve: ZEST_V1_CONTRACTS.poolReserve,
  asset: 'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.wstx',
  lpToken: 'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.zwstx-v2-0',
  oracle: 'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.stx-btc-oracle-v1-4',
  assets: collateralPositions,
  owner: senderAddress,
})

// Repay — no Pyth needed
const repayCall = await repay({
  lender: Lender.ZestV1,
  amount: 500_000n,
  asset: 'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.wstx',
  onBehalfOf: senderAddress,
  payer: senderAddress,
})
```

## Supported Assets (On-Chain Order)

The `assets` list passed to the contract MUST contain ALL 10 assets in the **exact on-chain order** from `pool-reserve-data.get-assets-read`. The contract's `validate-assets` checks by index position — wrong order or missing assets triggers `ERR_INVALID_ASSETS (u30024)`.

| # | Asset | Principal | z-Token | Oracle |
|---|-------|-----------|---------|--------|
| 0 | stSTX | `SP4SZ…PYV7.ststx-token` | `zststx-v2-0` | `stx-btc-oracle-v1-4` |
| 1 | aeUSDC | `SP3Y2…FQA4K.token-aeusdc` | `zaeusdc-v2-0` | `aeusdc-oracle-v1-0` |
| 2 | wSTX | `SP2VC…QF4N.wstx` | `zwstx-v2-0` | `stx-btc-oracle-v1-4` |
| 3 | DIKO | `SP2C2…PMMZ.arkadiko-token` | `zdiko-v2-0` | `diko-oracle-v1-1` |
| 4 | USDH | `SPN5A…353H.usdh-token-v1` | `zusdh-v2-0` | `usdh-oracle-v1-0` |
| 5 | sUSDT | `SP2XD…DT0AM.token-susdt` | `zsusdt-v2-0` | `susdt-oracle-v1-0` |
| 6 | USDA | `SP2C2…PMMZ.usda-token` | `zusda-v2-0` | `usda-oracle-v1-1` |
| 7 | sBTC | `SM3VD…JFQ4.sbtc-token` | `zsbtc-v2-0` | `stx-btc-oracle-v1-4` |
| 8 | ALEX | `SP102…T0AM.token-alex` | `zalex-v2-0` | `alex-oracle-v1-1` |
| 9 | stSTXbtc | `SP4SZ…PYV7.ststxbtc-token-v2` | `zststxbtc-v2_v2-0` | `stx-btc-oracle-v1-4` |

All z-tokens and oracles are deployed under the Zest deployer (`SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N`).

## AssetOracleLp Structure

The `assets` list must include ALL 10 pool assets in on-chain order (not just the user's positions). Assets without user balance contribute 0 collateral — the contract still requires them for validation.

```typescript
import { AssetOracleLp } from '@delta-stacks/calldata-sdk-stacks'

// Must be ALL 10 assets in on-chain order
const allPoolAssets: AssetOracleLp[] = [
  { asset: 'SP4SZE494VC2YC5JYG7AYFQ44F5Q4PYV7DVMDPBG.ststx-token',
    lpToken: 'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.zststx-v2-0',
    oracle: 'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.stx-btc-oracle-v1-4' },
  { asset: 'SP3Y2ZSH8P7D50B0VBTSX11S7XSG24M1VB9YFQA4K.token-aeusdc',
    lpToken: 'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.zaeusdc-v2-0',
    oracle: 'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.aeusdc-oracle-v1-0' },
  { asset: 'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.wstx',
    lpToken: 'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.zwstx-v2-0',
    oracle: 'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.stx-btc-oracle-v1-4' },
  { asset: 'SP2C2YFP12AJZB4MABJBAJ55XECVS7E4PMMZ89YZR.arkadiko-token',
    lpToken: 'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.zdiko-v2-0',
    oracle: 'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.diko-oracle-v1-1' },
  { asset: 'SPN5AKG35QZSK2M8GAMR4AFX45659RJHDW353HSG.usdh-token-v1',
    lpToken: 'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.zusdh-v2-0',
    oracle: 'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.usdh-oracle-v1-0' },
  { asset: 'SP2XD7417HGPRTREMKF748VNEQPDRR0RMANB7X1NK.token-susdt',
    lpToken: 'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.zsusdt-v2-0',
    oracle: 'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.susdt-oracle-v1-0' },
  { asset: 'SP2C2YFP12AJZB4MABJBAJ55XECVS7E4PMMZ89YZR.usda-token',
    lpToken: 'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.zusda-v2-0',
    oracle: 'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.usda-oracle-v1-1' },
  { asset: 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token',
    lpToken: 'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.zsbtc-v2-0',
    oracle: 'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.stx-btc-oracle-v1-4' },
  { asset: 'SP102V8P0F7JX67ARQ77WEA3D3CFB5XW39REDT0AM.token-alex',
    lpToken: 'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.zalex-v2-0',
    oracle: 'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.alex-oracle-v1-1' },
  { asset: 'SP4SZE494VC2YC5JYG7AYFQ44F5Q4PYV7DVMDPBG.ststxbtc-token-v2',
    lpToken: 'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.zststxbtc-v2_v2-0',
    oracle: 'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.stx-btc-oracle-v1-4' },
]
```

This list is encoded as `(list 10 (tuple (asset principal) (lp-token principal) (oracle principal)))`.

## Common Pitfalls

1. **ERR_UNAUTHORIZED (u30000)** — Calling `pool-borrow` directly instead of through `borrow-helper-v2-1-7`. Only the helper is in the `approved-contracts` map.

2. **Missing Pyth price data** — Passing `none` for `price-feed-bytes` on withdraw/borrow. The contract needs Pyth VAA data to verify health factor after the operation. Use `ZestV1Lending.fetchPriceFeeds()` or the high-level `borrow()`/`withdraw()` handlers which fetch automatically.

3. **Missing incentives param** — The `supply` and `withdraw` functions require the `incentives-v2-2` contract principal. The SDK adds this automatically.

4. **ERR_INVALID_ASSETS (u30024)** — The `assets` list must contain ALL 10 pool assets in the exact on-chain order from `pool-reserve-data.get-assets-read`. The contract validates by index position — wrong count, wrong order, or mismatched oracle/lp-token causes this error. Previously we passed only 9 assets (missing USDA) and used arbitrary order.

5. **Wrong helper version** — Older helpers (`borrow-helper-v2-1`, `borrow-helper-v2-2`) are not approved. Only `borrow-helper-v2-1-7` works. This version added `referral`, `incentives`, and `price-feed-bytes` params compared to earlier versions.
