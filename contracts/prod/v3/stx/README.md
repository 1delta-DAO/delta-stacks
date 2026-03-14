# vault-stx-v3 — ERC-4626 STX Yield Vault on Stacks

A portable, ERC-4626-style tokenized yield vault for STX built in Clarity 3 on Stacks. Vault shares are SIP-010 fungible tokens representing a proportional claim on STX deployed across Zest V1 and Zest V2 lending markets.

## Architecture

```
                    ┌─ deposit-stx() ─┐
Depositor ──────────┤                 ├──> Vault ──deploy()──> Zest V1 Adapter ──wSTX──> Zest V1 (Aave-like)
                    └─ deposit()   ───┘      │
                       (via wSTX)            │   ──deploy()──> Zest V2 Adapter ──wSTX──> Zest V2 (ERC-4626)
                                             │
                                             ├── idle buffer (configurable %)
                                             ├── bookkeeping total-assets
                                             └── vault-shares (SIP-010 token: 1dSTX)
```

### Core Components

| Component | Description |
|-----------|-------------|
| **Vault shares** | SIP-010 fungible token (`1dSTX`). Transferable, composable. |
| **Base asset** | wSTX (`SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.wstx`) — SIP-010 wrapper around native STX. |
| **Zest V1 adapter** | Bridges to Zest V1 pool via `borrow-helper.supply/withdraw`. Handles wSTX wrapping internally. |
| **Zest V2 adapter** | Bridges to Zest V2 ERC-4626 STX vault (`v0-vault-stx`). |
| **Bookkeeping total** | `total-assets-bookkeeping` — internal accounting, not live balance queries. |
| **Virtual offset** | `10^6` symmetric offset for share pricing (same as USDCx vault). |

### wSTX Wrapping

Both Zest V1 and Zest V2 use **wSTX** as their SIP-010 interface over native STX:

| Protocol | wSTX Contract | Role |
|----------|---------------|------|
| Zest V1 | `SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.wstx` | Pool asset for supply/withdraw |
| Zest V2 | `SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.wstx` | Vault underlying, canonical base-asset |

Both wSTX contracts are transparent wrappers: `wSTX.transfer() = stx-transfer?()`, `wSTX.get-balance() = stx-get-balance()`. There is no separate wrapping/unwrapping step — holding wSTX IS holding native STX.

The vault provides **two deposit/withdraw paths**:

| Path | Functions | Token arg | Transfer mechanism |
|------|-----------|-----------|-------------------|
| **Native STX** | `deposit-stx`, `withdraw-stx`, `redeem-for-stx` | None | `stx-transfer?` directly |
| **wSTX (SIP-010)** | `deposit`, `withdraw`, `redeem`, `mint` | wSTX contract | `wSTX.transfer()` (= `stx-transfer?`) |

Both paths are functionally equivalent but the native STX path is simpler for users who don't know about wSTX.

## Zest V1 Adapter Details

The Zest V1 adapter is more complex than typical adapters because Zest V1 uses an Aave-like architecture:

**Deposit flow:**
1. Pull STX from vault via wSTX transfer
2. Call `borrow-helper.supply(zwstx, pool-reserve, wstx, amount, adapter, none, incentives)`
3. Adapter receives z-tokens (`zwstx-v2-0`) representing the supplied position

**Withdraw flow:**
1. Call `borrow-helper.withdraw(zwstx, pool-reserve, wstx, oracle, amount, adapter, assets-list, incentives, none)`
2. Full 10-asset collateral list hardcoded (required by `validate-assets`)
3. `price-feed-bytes = none` — adapter has NO borrows, so health factor is infinite
4. Forward received STX from adapter to vault

**Position read:**
- z-token balance auto-increases with accrued interest (aToken model)
- `zwstx.get-balance(adapter)` returns the interest-adjusted position value

## Mainnet Addresses

| Contract | Address |
|----------|---------|
| Vault | `SP2DRPT3AA170EK5DC4T22CMSXZ6HACATPXHPAT7H.vault-stx-v3` |
| Zest V1 Adapter | `SP2DRPT3AA170EK5DC4T22CMSXZ6HACATPXHPAT7H.adapter-zest-v1-wstx-v3` |
| Zest V2 Adapter | `SP2DRPT3AA170EK5DC4T22CMSXZ6HACATPXHPAT7H.adapter-zest-v2-stx-v3` |
| Adapter Trait | `SP2DRPT3AA170EK5DC4T22CMSXZ6HACATPXHPAT7H.lending-adapter-trait` |

## API Reference

### User Operations — Native STX (no wSTX token arg)

```clarity
;; Deposit native STX, receive shares (auto-allocates)
(deposit-stx (amount uint) (owner principal) (zest-v1 <lat>) (zest-v2 <lat>))
;; Returns: (ok shares-minted)

;; Withdraw exact STX amount via stx-transfer?
(withdraw-stx (amount uint) (receiver principal) (owner principal) (zest-v1 <lat>) (zest-v2 <lat>))
;; Returns: (ok shares-burned)

;; Redeem exact shares for native STX
(redeem-for-stx (shares uint) (receiver principal) (owner principal) (zest-v1 <lat>) (zest-v2 <lat>))
;; Returns: (ok assets-returned)
```

### User Operations — wSTX (SIP-010, same as USDCx vault pattern)

```clarity
;; Deposit wSTX, receive shares (auto-allocates)
(deposit (amount uint) (owner principal) (token <ft>) (zest-v1 <lat>) (zest-v2 <lat>))

;; Withdraw exact wSTX amount
(withdraw (amount uint) (receiver principal) (owner principal) (token <ft>) (zest-v1 <lat>) (zest-v2 <lat>))

;; Redeem exact shares for wSTX
(redeem (shares uint) (receiver principal) (owner principal) (token <ft>) (zest-v1 <lat>) (zest-v2 <lat>))

;; Mint exact shares (pay required wSTX)
(mint (shares uint) (receiver principal) (token <ft>) (zest-v1 <lat>) (zest-v2 <lat>))
```

### Read-Only (ERC-4626 Standard)

```clarity
(get-total-assets)         ;; Total STX under management (bookkeeping)
(get-total-supply)         ;; Total vault shares outstanding
(convert-to-shares amt)    ;; Preview: STX -> shares
(convert-to-assets shares) ;; Preview: shares -> STX
(get-idle-balance)         ;; Native STX held idle by vault
(get-zest-v1-wstx-position) ;; Live STX value in Zest V1
(get-zest-v2-stx-position)  ;; Live STX value in Zest V2
(get-live-total-assets)    ;; idle + v1 + v2 (for auditing)
```

### Owner/Allocator Operations

```clarity
;; One-time vault configuration
(initialize (asset <ft>) (name string-ascii) (symbol string-ascii) (decimals uint))

;; Deploy idle STX to markets
(deploy-to-zest-v1 (amount uint) (adapter <lat>))
(deploy-to-zest-v2 (amount uint) (adapter <lat>))

;; Recall STX from markets to idle
(recall-from-zest-v1 (amount uint) (adapter <lat>))
(recall-from-zest-v2 (amount uint) (adapter <lat>))

;; Zero-sum rebalancing between markets
(reallocate (from-v1 uint) (from-v2 uint) (to-v1 uint) (to-v2 uint) (zest-v1 <lat>) (zest-v2 <lat>))

;; Sync yield (public, anyone can call)
(sync-zest-v1 (adapter <lat>))
(sync-zest-v2 (adapter <lat>))

;; Configuration
(set-vault-owner (new-owner principal))
(set-vault-allocator (new-allocator principal))
(set-idle-buffer (buffer uint))         ;; in bps (default 500 = 5%)
(set-fee-bps (new-fee uint))            ;; performance fee in bps
(set-fee-recipient (recipient principal))
(register-adapter-zest-v1-wstx (adapter principal))
(register-adapter-zest-v2-stx (adapter principal))
```

### Error Codes

| Code | Constant | Meaning |
|------|----------|---------|
| u100 | `err-owner-only` | Caller is not the vault owner |
| u102 | `err-amount-zero` | Amount must be > 0 |
| u103 | `err-shares-zero` | Computed shares = 0 |
| u104 | `err-insufficient-balance` | Not enough STX in vault |
| u105 | `err-insufficient-shares` | Not enough shares to burn |
| u106 | `err-transfer-failed` | Token transfer failed |
| u109 | `err-not-allocator` | Caller is not the allocator |
| u111 | `err-invalid-adapter` | Adapter doesn't match registered adapter |
| u112 | `err-invalid-weights` | Weight/bps value out of range |
| u113 | `err-not-zero-sum` | Reallocate amounts don't sum to zero |
| u114 | `err-already-initialized` | Initialize called twice |
| u115 | `err-invalid-decimals` | Decimals > 18 |
| u116 | `err-invalid-asset` | Token doesn't match configured base asset |

## Deployment

```bash
clarinet deployments apply \
  --deployment-plan-path deployments/vault-v3-stx.mainnet-plan.yaml
```

See [deployments/vault-v3-stx.mainnet-plan.yaml](../../../deployments/vault-v3-stx.mainnet-plan.yaml) for the full deployment plan with pre-flight checklist and post-deployment verification steps.

## SDK

```typescript
import {
  DeltaVaultSTX,
  VAULT_STX_CONTRACTS,
  VAULT_STX_UNDERLYING,
} from '@delta-stacks/calldata-sdk-stacks'

// Native STX deposit (no wSTX reference needed)
const call = DeltaVaultSTX.encodeDepositStx(10_000_000n, senderAddress)

// wSTX deposit (same result, explicit token)
const call = DeltaVaultSTX.encodeDeposit(10_000_000n, senderAddress)

// Withdraw native STX
const call = DeltaVaultSTX.encodeWithdrawStx(5_000_000n, senderAddress, senderAddress)

// Redeem shares for native STX
const call = DeltaVaultSTX.encodeRedeemForStx(shares, senderAddress, senderAddress)
```
