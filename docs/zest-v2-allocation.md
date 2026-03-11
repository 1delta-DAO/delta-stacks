# Zest V2 — Allocation Operations

Zest V2 is a hub-spoke lending protocol deployed by
`SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7`.

## Architecture

```
v0-4-market  (single entry point for all lending ops)
    ├── v0-vault-{asset}  (ERC-4626 vaults, one per asset; hold tokens + track shares)
    │       zShares are minted on deposit, burned on redeem
    ├── v0-market-vault   (collateral and scaled-debt ledger)
    ├── v0-assets         (asset enable/disable bitmap)
    └── v0-egroup         (exposure groups / LTV parameters)
```

Unlike V1, supply operations can go **directly to vault contracts** (for pure
yield without collateral) or through **`v0-4-market`** (to supply-and-collateralise
in one call). Borrow and repay always go through `v0-4-market`.

### Asset IDs (used for debt lookups)

| Asset | Token | Vault | Asset ID |
|---|---|---|---|
| STX | `.wstx` | `v0-vault-stx` | `u0` |
| sBTC | `SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token` | `v0-vault-sbtc` | `u2` |
| stSTX | stSTX | `v0-vault-ststx` | `u4` |
| USDCx | `SP120SBRBQJ00MCWS7TM5R8WJNTTKD5K0HFRC2CNE.usdcx` | `v0-vault-usdc` | `u6` |
| USDH | USDH | `v0-vault-usdh` | `u8` |
| stSTXBTC | stSTXBTC | `v0-vault-ststxbtc` | `u10` |

All contracts are deployed under `SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7`.

---

## Deposit (supply liquidity, yield only)

Deposits directly into a vault contract. The caller receives zShares
(ERC-4626-style) proportional to the deposit. These shares appreciate as
interest accrues. Does **not** register the deposit as collateral.

```clarity
(contract-call?
  'SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.v0-vault-usdc
  deposit
  amount     ;; uint      -- underlying tokens to deposit
  min-out    ;; uint      -- minimum zShares to receive (slippage guard; use u0 to skip)
  recipient  ;; principal -- who receives the zShares
)
;; returns (response uint uint) -- zShares minted
```

Vault pulls the underlying token from `contract-caller`. The caller must
hold sufficient balance.

---

## Redeem (remove liquidity)

Burns zShares and returns the underlying asset.

```clarity
(contract-call?
  'SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.v0-vault-usdc
  redeem
  amount     ;; uint      -- zShares to burn
  min-out    ;; uint      -- minimum underlying to receive (slippage guard)
  recipient  ;; principal -- who receives the underlying tokens
)
;; returns (response uint uint) -- underlying received
```

---

## Supply + Register as Collateral (one step)

Deposits into the vault **and** registers the resulting zShares as collateral
in a single atomic call. Requires a health-factor check via Pyth oracles.

```clarity
(contract-call?
  'SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.v0-4-market
  supply-collateral-add
  ft           ;; <ft-trait>                          -- underlying asset token
  amount       ;; uint                                -- amount to supply
  min-shares   ;; uint                                -- minimum zShares (slippage)
  price-feeds  ;; (optional (list 3 (buff 8192)))     -- Pyth signed payloads or none
)
;; returns (response uint uint)
```

---

## Add Existing zShares as Collateral

If zShares are already held (from a prior `deposit`), register them as
collateral without depositing new tokens.

```clarity
(contract-call?
  'SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.v0-4-market
  collateral-add
  ft           ;; <ft-trait>                          -- the zToken (e.g. zUSDC)
  amount       ;; uint                                -- zShare amount to collateralise
  price-feeds  ;; (optional (list 3 (buff 8192)))
)
;; returns (response uint uint)
```

---

## Remove Collateral and Redeem (one step)

Removes zShares from collateral and immediately redeems them for the
underlying asset. Health-factor check applies.

```clarity
(contract-call?
  'SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.v0-4-market
  collateral-remove-redeem
  ft               ;; <ft-trait>                      -- the zToken
  amount           ;; uint                            -- zShares to remove + redeem
  min-underlying   ;; uint                            -- minimum underlying (slippage)
  receiver         ;; (optional principal)            -- recipient; none = tx-sender
  price-feeds      ;; (optional (list 3 (buff 8192)))
)
;; returns (response uint uint)
```

---

## Remove Collateral (keep zShares)

Removes zShares from the collateral ledger but keeps them in the caller's
wallet. Useful when you want to redeem separately or transfer zShares.

```clarity
(contract-call?
  'SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.v0-4-market
  collateral-remove
  ft          ;; <ft-trait>
  amount      ;; uint
  receiver    ;; (optional principal)
  price-feeds ;; (optional (list 3 (buff 8192)))
)
;; returns (response uint uint)
```

---

## Borrow

Borrows an asset against registered collateral. Health-factor check runs
against all collateral positions via Pyth pricing.

```clarity
(contract-call?
  'SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.v0-4-market
  borrow
  ft           ;; <ft-trait>                          -- token to borrow
  amount       ;; uint                                -- amount to borrow
  receiver     ;; (optional principal)                -- where tokens go; none = tx-sender
  price-feeds  ;; (optional (list 3 (buff 8192)))     -- Pyth payloads or none
)
;; returns (response bool uint)
```

Internally: validates health factor, calls `system-borrow` on the appropriate
vault, writes scaled debt to `v0-market-vault`.

---

## Repay

Reduces a borrow position. Can repay on behalf of another account.

```clarity
(contract-call?
  'SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.v0-4-market
  repay
  ft             ;; <ft-trait>              -- debt token to repay
  amount         ;; uint                   -- amount (capped at actual debt internally)
  on-behalf-of   ;; (optional principal)   -- whose debt to reduce; none = tx-sender
)
;; returns (response uint uint)
```

Internally: calls `system-repay` on the appropriate vault, reduces scaled
debt in `v0-market-vault`.

---

## Reading user positions

```clarity
;; Balance of zShares in a vault (= supplied liquidity)
(contract-call? 'SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.v0-vault-usdc get-balance user)

;; Scaled debt for a specific asset (asset-id from table above)
(contract-call? 'SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.v0-market-vault
  get-account-scaled-debt user asset-id)

;; Collateral positions (bitmask + id)
(contract-call? 'SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.v0-market-vault
  resolve-safe user)
```

---

## Adapter pattern for this vault

For a vault adapter that supplies idle USDCx into Zest V2 for pure yield
(no collateral):

```clarity
;; In zest-v2-usdc-adapter.clar (implements lending-adapter-trait)
(define-public (adapter-deposit (amount uint))
  ;; tx-sender == calling vault
  (let ((vault tx-sender))
    (try! (contract-call? 'SP120SBRBQJ00MCWS7TM5R8WJNTTKD5K0HFRC2CNE.usdcx
             transfer amount vault (as-contract tx-sender) none))
    (as-contract
      (contract-call? 'SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.v0-vault-usdc
        deposit amount u0 (as-contract tx-sender)))))

(define-public (adapter-withdraw (amount uint) (recipient principal))
  ;; Convert asset amount to shares, then redeem
  (let ((shares (try! (as-contract
                  (contract-call? 'SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.v0-vault-usdc
                    convert-to-shares amount)))))
    (as-contract
      (contract-call? 'SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.v0-vault-usdc
        redeem shares u0 recipient))))
```
