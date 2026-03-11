# Zest V1 — Allocation Operations

Zest V1 is a pool-based lending protocol (Aave-style) deployed by
`SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N`.

## Architecture

```
borrow-helper (entry point)
    └── pool-borrow-v2-1 (core logic)
            └── pool-0-reserve-v2-0 (state / reserve data)
                pool-vault (token custody)
                z-tokens / lp-tokens (deposit receipts, one per asset)
```

Two call paths exist. **`borrow-helper`** is the production entry point — it
handles Pyth price-feed bytes, referrals, and reward incentives before
forwarding to **`pool-borrow-v2-1`**. For vault adapters that do not need
rewards or referrals, calling `pool-borrow-v2-1` directly is simpler and
avoids the extra parameters.

### Supported assets (USDCx-relevant subset)

| Asset | Token principal | z-token |
|---|---|---|
| aeUSDC | `SP3Y2ZSH8P7D50B0VBTSX11S7XSG24M1VB9YFQA4K.token-aeusdc` | `SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.zaeusdc-v2-0` |
| sUSDT | `SP2XD7417HGPRTREMKF748VNEQPDRR0RMANB7X1NK.token-susdt` | `SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.zsusdt-v2-0` |
| USDA | `SP2C2YFP12AJZB4MABJBAJ55XECVS7E4PMMZ89YZR.usda-token` | `SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.zusda-v2-0` |
| sBTC | `SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token` | `SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3F4N.zsbtc-v2-0` |
| stSTX | `SP4SZE494VC2YC5JYG7AYFQ44F5Q4PYV7DVMDPBG.ststx-token` | `SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.zststx-v2-0` |

Fixed protocol constant:

```
pool-reserve = SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.pool-0-reserve-v2-0
```

---

## Supply (deposit liquidity)

Supply tokens into the pool and receive z-tokens (interest-bearing receipt
tokens) in return. The z-token balance grows as interest accrues.

### Via `pool-borrow-v2-1` (adapter use)

```clarity
(contract-call?
  'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.pool-borrow-v2-1
  supply
  lp             ;; <redeemeable-trait> -- z-token contract, e.g. zaeusdc-v2-0
  pool-reserve   ;; principal           -- pool-0-reserve-v2-0
  asset          ;; <ft-trait>          -- underlying token, e.g. token-aeusdc
  amount         ;; uint                -- amount in base units
  owner          ;; principal           -- who receives z-tokens (tx-sender)
)
;; returns (response bool uint)
```

### Via `borrow-helper` (production, with incentives)

```clarity
(contract-call?
  'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.borrow-helper
  supply
  lp             ;; <redeemeable-token>
  pool-reserve   ;; principal
  asset          ;; <ft>
  amount         ;; uint
  owner          ;; principal
  referral       ;; (optional principal) -- none if no referral
  incentives     ;; <incentives-trait>
)
```

**Token flow:** `asset.transfer(amount, owner → pool-vault)` then
`lp.mint(shares, owner)`.

---

## Withdraw (remove supplied liquidity)

Burns z-tokens and returns the underlying asset. Requires the position's
health factor to remain above 1 after withdrawal (uses oracle pricing).

### Via `pool-borrow-v2-1`

```clarity
(contract-call?
  'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.pool-borrow-v2-1
  withdraw
  pool-reserve   ;; principal
  asset          ;; <ft-trait>
  lp             ;; <redeemeable-trait>
  oracle         ;; <oracle-trait>   -- e.g. pyth-oracle-v3
  assets         ;; (list 100 { asset: <ft>, lp-token: <ft>, oracle: <oracle-trait> })
                 ;;   full protocol asset list for health-factor calculation
  amount         ;; uint -- pass u340282366920938463463374607431768211455 for max
  owner          ;; principal
)
;; returns (response bool uint)
```

### Via `borrow-helper`

```clarity
(contract-call?
  'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.borrow-helper
  withdraw
  lp             ;; <redeemeable-token>
  pool-reserve   ;; principal
  asset          ;; <ft>
  oracle         ;; <oracle-trait>
  amount         ;; uint
  owner          ;; principal
  assets         ;; (list 100 { asset: <ft>, lp-token: <ft-mint-trait>, oracle: <oracle-trait> })
  incentives     ;; <incentives-trait>
  price-feed-bytes ;; (optional (buff 8192)) -- Pyth signed payload or none
)
```

**The `assets` list** must contain every currently active protocol asset with
its corresponding lp-token and oracle. This is used to recompute the health
factor across all collateral and debt positions.

---

## Borrow

Takes out a loan against deposited collateral. The asset must have been
previously supplied to the pool by the user (used as collateral).

### Via `pool-borrow-v2-1`

```clarity
(contract-call?
  'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.pool-borrow-v2-1
  borrow
  pool-reserve         ;; principal
  oracle               ;; <oracle-trait>
  asset-to-borrow      ;; <ft-trait>   -- the token to borrow
  lp                   ;; <ft>         -- z-token for the borrowed asset
  assets               ;; (list 100 { asset: <ft>, lp-token: <ft>, oracle: <oracle-trait> })
  amount-to-be-borrowed ;; uint
  fee-calculator       ;; principal    -- fee-calculator contract
  interest-rate-mode   ;; uint         -- u1 = stable, u2 = variable
  owner                ;; principal    -- the borrower
)
;; returns (response bool uint)
```

### Via `borrow-helper`

Same parameters plus `price-feed-bytes (optional (buff 8192))` appended.

**Notes:**
- Interest rate mode `u2` (variable) is the most commonly used.
- Borrow fails if health factor would drop below 1 after the borrow.
- Debt is tracked in `pool-reserve-data` as a scaled balance that grows with the borrow index.

---

## Repay

Reduces a borrow position. Anyone can repay on behalf of a borrower.

```clarity
;; Identical signature on both pool-borrow-v2-1 and borrow-helper
(contract-call?
  'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.pool-borrow-v2-1
  repay
  asset            ;; <ft-trait>   -- the token being repaid
  amount-to-repay  ;; uint         -- pass max-uint to repay full debt
  on-behalf-of     ;; principal    -- whose debt is cleared
  payer            ;; principal    -- who sends the tokens (tx-sender)
)
;; returns (response bool uint)
```

**`payer` vs `on-behalf-of`:** payer is the source of tokens; on-behalf-of
is the borrower. Both can be the same (self-repay) or different
(third-party repay).

---

## Key constants for building the `assets` list

Current active assets in protocol order (from `pool-reserve-data.get-assets-read`):

```
0  stSTX      SP4SZE494VC2YC5JYG7AYFQ44F5Q4PYV7DVMDPBG.ststx-token
1  aeUSDC     SP3Y2ZSH8P7D50B0VBTSX11S7XSG24M1VB9YFQA4K.token-aeusdc
2  wSTX       SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.wstx
3  DIKO       SP2C2YFP12AJZB4MABJBAJ55XECVS7E4PMMZ89YZR.arkadiko-token
4  USDH       SPN5AKG35QZSK2M8GAMR4AFX45659RJHDW353HSG.usdh-token-v1
5  sUSDT      SP2XD7417HGPRTREMKF748VNEQPDRR0RMANB7X1NK.token-susdt
6  USDA       SP2C2YFP12AJZB4MABJBAJ55XECVS7E4PMMZ89YZR.usda-token
7  sBTC       SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token
8  ALEX       SP102V8P0F7JX67ARQ77WEA3D3CFB5XW39REDT0AM.token-alex
9  stSTXbtc   SP4SZE494VC2YC5JYG7AYFQ44F5Q4PYV7DVMDPBG.ststxbtc-token-v2
```

Oracle contract: `SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.pyth-oracle-v3`

---

## Adapter pattern for this vault

Since the vault (as-contract) calls the adapter with tx-sender == vault, the
adapter can supply/withdraw on behalf of the vault like so:

```clarity
;; In granite-adapter.clar (implements lending-adapter-trait)
(define-public (adapter-deposit (amount uint))
  ;; tx-sender == vault
  (let ((vault tx-sender))
    ;; pull tokens from vault into adapter
    (try! (contract-call? .usdcx transfer amount vault (as-contract tx-sender) none))
    ;; supply to Zest V1 pool as adapter (adapter holds tokens, adapter is owner)
    (as-contract
      (contract-call? 'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.pool-borrow-v2-1
        supply lp-contract pool-reserve asset-contract amount (as-contract tx-sender)))))
```
