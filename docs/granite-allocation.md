# Granite Protocol — Allocation Operations

Granite is an isolated lending market protocol (Compound V3-style). Each
market is a fully self-contained deployment: one borrow asset, multiple
accepted collateral types, its own interest-rate model and withdrawal caps.

The two live markets relevant to this vault:

| Market | Borrow asset | Deployer |
|---|---|---|
| Granite aeUSDC | aeUSDC (`SP3Y2ZSH8P7D50B0VBTSX11S7XSG24M1VB9YFQA4K.token-aeusdc`) | `SP35E2BBMDT2Y1HB0NTK139YBGYV3PAPK3WA8BRNA` |
| Granite USDCx | USDCx (`SP120SBRBQJ00MCWS7TM5R8WJNTTKD5K0HFRC2CNE.usdcx`) | `SP3M2BYF7RGF8WKW5FVDNJ6WR8D7AR9BHDXAKPXZE` |

All function signatures below are identical for both markets — substitute
the appropriate deployer prefix.

## Architecture

```
liquidity-provider-v1   deposit / withdraw / redeem
borrower-v1             borrow / repay / add-collateral / remove-collateral
liquidator-v1           liquidate-collateral / batch-liquidate
flash-loan-v1           flash-loan
state-v1                all protocol state + LP share token (SIP-010)
modules/
  linear-kinked-ir-v1   interest rate model (two-slope kinked)
  withdrawal-caps-v1    time-windowed rate limits on deposits/withdrawals/borrows
  pyth-adapter-v1       Pyth oracle integration
```

`state-v1` is both the state store **and** the LP share token. When you
deposit, Granite mints LP shares directly from `state-v1`. There are no
separate vault or receipt token contracts.

**Isolation:** each market has its own `liquidity-provider-v1`,
`borrower-v1`, `state-v1`, etc. all deployed under the same principal.
There is no cross-market risk.

---

## Deposit (supply liquidity)

Deposits the market asset and receives LP shares from `state-v1`.

```clarity
(contract-call?
  'SP3M2BYF7RGF8WKW5FVDNJ6WR8D7AR9BHDXAKPXZE.liquidity-provider-v1
  deposit
  assets     ;; uint      -- amount of market asset (e.g. USDCx) to deposit
  recipient  ;; principal -- who receives the LP shares
)
;; returns (response bool uint) -- LP shares minted to recipient
```

Pulls `assets` from `tx-sender`. The vault adapter should call this with
tx-sender set to the adapter (which already holds the tokens).

---

## Withdraw (by asset amount)

Returns the underlying asset by burning the equivalent LP shares. Specify
how many tokens you want back.

```clarity
(contract-call?
  'SP3M2BYF7RGF8WKW5FVDNJ6WR8D7AR9BHDXAKPXZE.liquidity-provider-v1
  withdraw
  assets     ;; uint      -- market asset amount to withdraw
  recipient  ;; principal -- who receives the tokens
)
;; returns (response bool uint)
```

---

## Redeem (by LP share amount)

Burns LP shares and returns the proportional underlying. Use when you want
to exit a specific share amount (e.g. redeem everything).

```clarity
(contract-call?
  'SP3M2BYF7RGF8WKW5FVDNJ6WR8D7AR9BHDXAKPXZE.liquidity-provider-v1
  redeem
  shares     ;; uint      -- LP shares to burn
  recipient  ;; principal -- who receives the underlying
)
;; returns (response bool uint)
```

---

## Borrow

Borrows the market asset against posted collateral. Optionally refreshes
Pyth oracle prices before computing health.

```clarity
(contract-call?
  'SP3M2BYF7RGF8WKW5FVDNJ6WR8D7AR9BHDXAKPXZE.borrower-v1
  borrow
  pyth-price-feed-data  ;; (optional (buff 8192)) -- Pyth signed payload; none if prices fresh
  amount                ;; uint                   -- amount of market asset to borrow
  maybe-user            ;; (optional principal)   -- borrower; must equal tx-sender if provided
)
;; returns (response bool uint)
```

The borrowed tokens go to `tx-sender` (or `contract-caller` if called from
another contract). Fails if health factor would drop below 1.

---

## Repay

Reduces a borrow position. Supports third-party repayment.

```clarity
(contract-call?
  'SP3M2BYF7RGF8WKW5FVDNJ6WR8D7AR9BHDXAKPXZE.borrower-v1
  repay
  amount        ;; uint                -- amount to repay (capped at full debt)
  on-behalf-of  ;; (optional principal) -- debtor; none defaults to contract-caller
)
;; returns (response bool uint)
```

Excess repayment is silently capped at the actual debt balance — safe to
pass a large number to fully close a position.

---

## Add Collateral

Posts a collateral token to the borrower's position. Collateral is separate
from the borrow asset and can be any token whitelisted in `state-v1`.

```clarity
(contract-call?
  'SP3M2BYF7RGF8WKW5FVDNJ6WR8D7AR9BHDXAKPXZE.borrower-v1
  add-collateral
  collateral  ;; <token-trait>          -- SIP-010 collateral token contract
  amount      ;; uint                   -- amount of collateral to post
  maybe-user  ;; (optional principal)   -- user; must equal tx-sender if provided
)
;; returns (response bool uint)
```

Accepted collateral for **Granite USDCx**: sBTC
(`SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token`)

Accepted collateral for **Granite aeUSDC**: sBTC (same)

---

## Remove Collateral

Withdraws collateral from the position. Runs a health-factor check with
fresh Pyth prices after removal.

```clarity
(contract-call?
  'SP3M2BYF7RGF8WKW5FVDNJ6WR8D7AR9BHDXAKPXZE.borrower-v1
  remove-collateral
  pyth-price-feed-data  ;; (optional (buff 8192)) -- Pyth payload or none
  collateral            ;; <token-trait>          -- the collateral token
  amount                ;; uint                   -- amount to withdraw
  maybe-user            ;; (optional principal)   -- user; must equal tx-sender if provided
)
;; returns (response bool uint)
```

---

## Reading positions

```clarity
;; LP share balance (= your deposit position)
(contract-call? 'SP3M2BYF7RGF8WKW5FVDNJ6WR8D7AR9BHDXAKPXZE.state-v1
  get-balance user)

;; Full user borrow/collateral position
(contract-call? 'SP3M2BYF7RGF8WKW5FVDNJ6WR8D7AR9BHDXAKPXZE.state-v1
  get-user-position user)

;; Collateral amount for a specific token
(contract-call? 'SP3M2BYF7RGF8WKW5FVDNJ6WR8D7AR9BHDXAKPXZE.state-v1
  get-user-collateral user collateral-token)

;; Borrow/repay parameters (debt, health factor inputs)
(contract-call? 'SP3M2BYF7RGF8WKW5FVDNJ6WR8D7AR9BHDXAKPXZE.state-v1
  get-borrow-repay-params user)

;; Market-level stats
(contract-call? 'SP3M2BYF7RGF8WKW5FVDNJ6WR8D7AR9BHDXAKPXZE.state-v1
  get-lp-params)
(contract-call? 'SP3M2BYF7RGF8WKW5FVDNJ6WR8D7AR9BHDXAKPXZE.state-v1
  get-open-interest)
(contract-call? 'SP3M2BYF7RGF8WKW5FVDNJ6WR8D7AR9BHDXAKPXZE.state-v1
  get-reserve-balance)
```

---

## Adapter pattern for this vault

```clarity
;; In granite-usdcx-adapter.clar (implements lending-adapter-trait)

(define-constant granite 'SP3M2BYF7RGF8WKW5FVDNJ6WR8D7AR9BHDXAKPXZE)

(define-public (adapter-deposit (amount uint))
  ;; tx-sender == calling vault
  (let ((vault tx-sender))
    ;; 1. Pull USDCx from vault into this adapter
    (try! (contract-call? 'SP120SBRBQJ00MCWS7TM5R8WJNTTKD5K0HFRC2CNE.usdcx
             transfer amount vault (as-contract tx-sender) none))
    ;; 2. Deposit from adapter into Granite -- adapter receives LP shares
    (as-contract
      (contract-call? granite.liquidity-provider-v1
        deposit amount (as-contract tx-sender)))))

(define-public (adapter-withdraw (amount uint) (recipient principal))
  ;; Withdraw by asset amount; Granite sends USDCx to recipient
  (as-contract
    (contract-call? granite.liquidity-provider-v1
      withdraw amount recipient)))
```

**Yield note:** Granite LP shares (held by the adapter) appreciate over time.
When the adapter calls `withdraw` requesting the original deposit amount, it
burns fewer shares than it holds — the remainder is unrealised yield. To
fully harvest, call `redeem` with the adapter's full LP share balance instead
of `withdraw`.
