# vault-usdcx-v3 — ERC-4626 Yield Vault on Stacks

A portable, ERC-4626-style tokenized yield vault built in Clarity 3 on Stacks. Vault shares are SIP-010 fungible tokens representing a proportional claim on the underlying assets deployed across lending markets.

## Architecture

```
Depositor ──deposit()──> Vault ──deploy()──> Granite Adapter ──> Granite (lending)
                          │
                          │    ──deploy()──> Zest v2 Adapter ──> Zest v2 (lending)
                          │
                          ├── idle buffer (configurable %)
                          ├── bookkeeping total-assets
                          └── vault-shares (SIP-010 token)
```

### Core Components

| Component | Description |
|-----------|-------------|
| **Vault shares** | SIP-010 fungible token (`vault-shares`). Transferable, composable. |
| **Base asset** | Any SIP-010 token, configured via `initialize`. Default: USDCx (6 decimals). |
| **Lending adapters** | Trait-based (`lending-adapter-trait`) connectors to Granite and Zest v2 markets. |
| **Bookkeeping total** | `total-assets-bookkeeping` — internal accounting, not live balance queries. |
| **Virtual offset** | `10^decimals` symmetric offset on both total and supply for share pricing. |

## Features

### Auto-Allocation on Deposit
When lending adapters are registered and have existing allocations, new deposits are automatically split proportionally across markets (minus an idle buffer). No separate allocator step required for routine deposits.

### Proportional Withdrawal
Withdrawals pull proportionally from idle funds and each lending market based on current allocations. Users always receive the exact amount requested without needing to specify which markets to pull from.

### Performance Fees (MetaMorpho-style)
Fees are taken as share dilution on yield, not asset skimming. When yield is synced from a lending market:
1. Fee amount in assets = `yield * fee_bps / 10000`
2. Fee shares minted to fee-recipient = `fee_assets * (supply + V) / (total - fee_assets + V)`

This ensures existing shareholders pay the fee proportionally through dilution, and the fee-recipient holds a real claim on vault assets.

### Zero-Sum Rebalancing
The `reallocate` function enforces `from_granite + from_zest == to_granite + to_zest`, guaranteeing total assets are preserved. This allows the allocator to shift capital between markets without any value leakage.

### Portability
Call `initialize(asset, name, symbol, decimals)` once after deployment to configure:
- Base asset (any SIP-010 token)
- Share token metadata (name, symbol)
- Virtual offset (automatically computed as `10^decimals`)
- Supports 0–18 decimals

The vault works with defaults (mock-token, 6 decimals) without calling `initialize`.

### Auto-Sync Yield
Every deposit, withdraw, redeem, and mint call automatically syncs yield from lending markets before computing the share price. This prevents front-running — users cannot deposit just before a yield sync to capture yield they didn't earn.

## Security Model

### Three Layers of Share Price Protection

**1. Bookkeeping-Based Total Assets**

The vault tracks `total-assets-bookkeeping` as an internal counter, not a live balance query. Direct token transfers to the vault contract do NOT affect the share price. This makes classical donation/inflation attacks impossible — an attacker who sends tokens directly to the vault simply loses those tokens.

**2. Symmetric Virtual Offset**

Share price formula: `price = (total + V) / (supply + V)` where `V = 10^decimals`.

Both numerator and denominator include the same offset `V`. This means:
- First depositor gets shares at ~1:1 (not manipulable)
- Empty vault has a well-defined price (no division by zero)
- Manipulation requires mass on the order of `V` to move the price, which is `10^6` for a 6-decimal token

**3. Vault-Favorable Rounding**

All four ERC-4626 operations round in the vault's favor:

| Operation | Rounds | Effect |
|-----------|--------|--------|
| `deposit` | shares **down** (floor) | Depositor gets slightly fewer shares |
| `withdraw` | shares burned **up** (ceil) | Withdrawer burns slightly more shares |
| `mint` | assets required **up** (ceil) | Minter pays slightly more assets |
| `redeem` | assets returned **down** (floor) | Redeemer gets slightly fewer assets |

This means every operation loses dust to the vault, making extraction via repeated deposit/withdraw cycles unprofitable.

### Comparison to Morpho Vaults (MetaMorpho)

| Property | Morpho | vault-usdcx-v3 |
|----------|--------|-----------------|
| Virtual shares | Asymmetric: `VIRTUAL_SHARES=1e6`, `VIRTUAL_ASSETS=1` | Symmetric: `V=10^decimals` on both sides |
| Total assets | Bookkeeping (internal) | Bookkeeping (internal) |
| Fee model | Share dilution on yield | Share dilution on yield (same) |
| Rounding | Vault-favorable in all 4 directions | Vault-favorable in all 4 directions (same) |
| Rebalancing | Zero-sum enforced | Zero-sum enforced (same) |
| Donation resistance | Yes (bookkeeping) | Yes (bookkeeping) |

The symmetric virtual offset is a simpler design that provides equivalent protection. With `V=10^6` (USDCx), an attacker would need to donate ~$1 worth of tokens to move the share price by 1 unit — and the donation is lost since bookkeeping ignores it.

### Attack Resistance Summary

| Attack | Mitigated By | Result |
|--------|-------------|--------|
| Donation/inflation attack | Bookkeeping total | Donated tokens are ignored; attacker loses funds |
| First-depositor manipulation | Virtual offset (`V=10^6`) | First deposit gets ~1:1 shares; no exploitable empty-vault state |
| Rounding extraction (deposit/redeem loops) | Vault-favorable rounding | Each cycle loses ≤1 unit to the vault; net negative for attacker |
| Sandwich on yield sync | Auto-sync before share price | Yield is priced in before any user operation |
| Unauthorized allocation | Owner/allocator access control | Only authorized principals can deploy/recall/rebalance |

## API Reference

### User Operations

```clarity
;; Deposit assets, receive shares (auto-allocates to markets)
(deposit (amount uint) (owner principal) (token <ft>) (granite <lat>) (zest-v2 <lat>))
;; Returns: (ok shares-minted)

;; Withdraw exact asset amount (proportional pull from all sources)
(withdraw (amount uint) (receiver principal) (owner principal) (token <ft>) (granite <lat>) (zest-v2 <lat>))
;; Returns: (ok shares-burned)

;; Redeem exact share amount for assets
(redeem (shares uint) (receiver principal) (owner principal) (token <ft>) (granite <lat>) (zest-v2 <lat>))
;; Returns: (ok assets-returned)

;; Mint exact share amount (pay required assets)
(mint (shares uint) (receiver principal) (token <ft>) (granite <lat>) (zest-v2 <lat>))
;; Returns: (ok assets-paid)
```

### Read-Only (ERC-4626 Standard)

```clarity
(get-total-assets)        ;; Total assets under management (bookkeeping)
(get-total-supply)        ;; Total vault shares outstanding
(convert-to-shares amt)   ;; Preview: assets -> shares
(convert-to-assets shares);; Preview: shares -> assets
(preview-deposit assets)  ;; Shares you'd receive for depositing
(preview-withdraw assets) ;; Shares that would be burned
(preview-mint shares)     ;; Assets required to mint shares
(preview-redeem shares)   ;; Assets you'd receive for redeeming
(max-deposit receiver)    ;; Max deposit (uint max)
(max-withdraw owner)      ;; Max withdrawable assets for owner
(max-redeem owner)        ;; Max redeemable shares for owner
```

### Owner/Allocator Operations

```clarity
;; One-time vault configuration
(initialize (asset <ft>) (name string-ascii) (symbol string-ascii) (decimals uint))

;; Deploy idle funds to markets
(deploy-to-granite (amount uint) (adapter <lat>))
(deploy-to-zest-v2 (amount uint) (adapter <lat>))

;; Recall funds from markets to idle
(recall-from-granite (amount uint) (adapter <lat>))
(recall-from-zest-v2 (amount uint) (adapter <lat>))

;; Zero-sum rebalancing between markets
(reallocate (from-granite uint) (from-zest uint) (to-granite uint) (to-zest uint) (granite <lat>) (zest-v2 <lat>))

;; Sync yield from markets (public, anyone can call)
(sync-granite (adapter <lat>))
(sync-zest-v2 (adapter <lat>))

;; Configuration
(set-vault-owner (new-owner principal))
(set-vault-allocator (new-allocator principal))
(set-idle-buffer (buffer uint))         ;; in bps (default 500 = 5%)
(set-fee-bps (new-fee uint))            ;; performance fee in bps
(set-fee-recipient (recipient principal))
(register-adapter-granite-usdcx (adapter principal))
(register-adapter-zest-v2-usdc (adapter principal))
```

### Error Codes

| Code | Constant | Meaning |
|------|----------|---------|
| u100 | `err-owner-only` | Caller is not the vault owner |
| u102 | `err-amount-zero` | Amount must be > 0 |
| u103 | `err-shares-zero` | Computed shares = 0 |
| u104 | `err-insufficient-balance` | Not enough assets in vault |
| u105 | `err-insufficient-shares` | Not enough shares to burn |
| u106 | `err-transfer-failed` | Token transfer failed |
| u108 | `err-deposit-owner-only` | Deposit owner mismatch |
| u109 | `err-not-allocator` | Caller is not the allocator |
| u111 | `err-invalid-adapter` | Adapter doesn't match registered adapter |
| u112 | `err-invalid-weights` | Weight/bps value out of range |
| u113 | `err-not-zero-sum` | Reallocate amounts don't sum to zero |
| u114 | `err-already-initialized` | Initialize called twice |
| u115 | `err-invalid-decimals` | Decimals > 18 |
| u116 | `err-invalid-asset` | Token doesn't match configured base asset |

## Test Coverage

- **88 tests** across two test files
- `vault-usdcx-v3.test.ts` — 82 tests covering deposits, withdrawals, redeem, mint, allocation, rebalancing, fees, access control, share transfers, initialize
- `vault-v3-share-price.test.ts` — 6 share price stability diagnostics
- `vault-v3-security.test.ts` — security property tests (donation resistance, rounding extraction, share price monotonicity)
