# STX & sBTC Vault V6 -- Zest V1 Collateral-Disable Fix

## The Problem

Zest V1's `borrow-helper.withdraw` uses ~60 of the Clarity VM's 64 maximum stack frames internally. The deep call chain comes from `check-balance-decrease-allowed`, which:

1. Calls `calculate-user-global-data` (iterates all 10 registered assets)
2. For each asset: reads balances, calls oracles, computes collateral values
3. Computes the health factor from the aggregated data
4. Validates the withdrawal doesn't break the health factor

This left only ~4 frames for the entire vault + adapter call chain -- impossible to fit even the most minimal vault logic.

### Versions v3 through v5 (all failed on mainnet)

| Version | Approach | Result |
|---------|----------|--------|
| v3 | 12 nested `let` around adapter call | MaxStackDepthReached |
| v4 | Calc helpers (unwind before adapter call) | MaxStackDepthReached (~12 frames overhead) |
| v5 | Data vars as scratch (unwind fully) | MaxStackDepthReached (~8 frames overhead) |
| v5-1 | Thin adapter (single-expression `pull`) | MaxStackDepthReached (~6 frames overhead) |
| v5-2..v5-5 | Exclude V1 from withdrawal pull | Works but V1 capital locked for withdrawals |

## The Solution: Disable Collateral Flag

### Discovery

Zest V1's `pool-0-reserve-v2-0.check-balance-decrease-allowed` (line 1001) has an early return:

```clarity
(if (not (get use-as-collateral user-data))
  (ok true)  ;; if reserve is not used as collateral, allow the transfer
  ...deep health factor computation...)
```

When `use-as-collateral = false`, the function returns `(ok true)` **immediately** -- skipping `calculate-user-global-data` entirely. No asset iteration, no oracle calls, no health factor computation. This saves ~40-50 stack frames.

### Why It's Safe

The adapter is a **pure supplier** with zero borrows. Collateral flags exist to protect borrowers from liquidation -- since the adapter has no debt, disabling collateral has zero risk. The protocol confirms this at line 1020:

```clarity
(if (is-eq (get total-borrow-balanceUSD user-global-data) u0)
  (ok true)  ;; not borrowing anything, no reason to block
```

Both conditions (no collateral flag, no borrows) independently short-circuit the expensive check.

### The Catch: Supply Re-enables Collateral

Zest V1's `borrow-helper.supply` automatically enables the collateral flag on every deposit. This means:

1. Allocator deploys capital to V1 -> collateral flag set to `true`
2. User tries to withdraw -> `check-balance-decrease-allowed` runs the full 60-frame computation -> MaxStackDepthReached

The allocator must **disable collateral after every deploy** to V1.

## V6 Architecture

```
Allocator workflow (after each V1 deploy):
  1. vault.deploy-to-zest-v1(amount, adapter)     -- supply to Zest V1
  2. Fund adapter with 0.01 STX                    -- for Pyth oracle fee
  3. adapter.disable-collateral(pyth-price-feed)   -- disable health check

User withdrawal (single atomic tx):
  vault.withdraw-stx(amount, receiver, owner, v1-adapter, v2-adapter)
    -> prepare-withdraw-by-amount (data vars, stack unwinds)
    -> adapter.adapter-withdraw (V1) -- borrow-helper.withdraw
       -> check-balance-decrease-allowed
          -> use-as-collateral = false -> (ok true) immediately
       -> proceeds with withdrawal (shallow stack)
    -> adapter.adapter-withdraw (V2) -- ERC-4626 redeem (always shallow)
    -> burn shares, transfer STX
```

### Pyth Oracle Fee

The `set-user-use-reserve-as-collateral` function calls `write-feed` which updates the Pyth oracle. This costs a small STX fee (~1 microSTX) paid by `tx-sender`. Since the adapter calls it via `as-contract`, the adapter's principal pays the fee. The adapter must have a small STX balance (0.01 STX is sufficient for many calls).

The frontend's "Disable V1 Collateral" allocator operation handles this automatically:
1. Sends 0.01 STX to the adapter (first wallet signature)
2. Calls `disable-collateral(pyth-price-feed)` with fresh Pyth data (second wallet signature)

### Stale Price Protection

The Zest V1 oracle (`stx-btc-oracle-v1-4`) has a staleness check that returns `err-stale-price (err u6001)` if the price data is too old. The `disable-collateral` function accepts `price-feed-bytes` to update the Pyth oracle in the same transaction, ensuring fresh prices.

## Mainnet Contracts (v6, current production)

### STX Vault

| Contract | Address |
|----------|---------|
| Vault | `SP2DRPT3AA170EK5DC4T22CMSXZ6HACATPXHPAT7H.vault-stx-v6` |
| V1 Adapter (thin-v3) | `SP2DRPT3AA170EK5DC4T22CMSXZ6HACATPXHPAT7H.adapter-zest-v1-wstx-thin-v3` |
| V2 Adapter | `SP2DRPT3AA170EK5DC4T22CMSXZ6HACATPXHPAT7H.adapter-zest-v2-stx-v5` |

### sBTC Vault

| Contract | Address |
|----------|---------|
| Vault | `SP2DRPT3AA170EK5DC4T22CMSXZ6HACATPXHPAT7H.vault-sbtc-v6` |
| V1 Adapter (thin-v3) | `SP2DRPT3AA170EK5DC4T22CMSXZ6HACATPXHPAT7H.adapter-zest-v1-sbtc-thin-v3` |
| V2 Adapter | `SP2DRPT3AA170EK5DC4T22CMSXZ6HACATPXHPAT7H.adapter-zest-v2-sbtc-v5` |

## Key Design Decisions

- **Data-var scratch space**: Withdrawal math writes to data vars, stack fully unwinds before adapter calls. This is retained from v5 even though v6 doesn't strictly need it (the collateral-disable reduces depth enough), as defense-in-depth.

- **No sync on withdraw**: Yield sync removed from withdraw path to save additional frames. Captured on deposit (auto-sync) and via explicit `sync-zest-v1`/`sync-zest-v2` calls.

- **Thin adapter**: The `pull` function is a single compound expression for use by the external manager. The `adapter-withdraw` function (used by the vault via trait) includes begin/try!/as-contract but stays within limits when collateral is disabled.

- **Allocator responsibility**: The allocator MUST call `disable-collateral` after every `deploy-to-zest-v1`. If forgotten, user withdrawals from V1 will revert with MaxStackDepthReached. The frontend allocator panel includes a dedicated "Disable V1 Collateral" button.

## Withdrawal Math

Full proportional split across idle + V1 + V2 (same as original v3 design):

```
pull-idle = amount * idle / total
remaining = amount - pull-idle
pull-v1   = remaining * alloc-v1 / (alloc-v1 + alloc-v2)
pull-v2   = remaining - pull-v1
```

V1 is fully included in share pricing, total-assets, and the proportional withdrawal calculation. There is no special-casing or exclusion of V1 from the math.

## Verified on Mainnet

STX v6 withdraw with V1 proportional pull:
- TX: `0xf529097eecc0dcad80a41cf2a47c4c6bc8bea732c1cc559ba68c71261d3557c2`
- Status: **success**
- Runtime: 24.8M (vs 21.5M MaxStackDepthReached on v3)
- Read count: 627 (full execution including V1 withdraw)
