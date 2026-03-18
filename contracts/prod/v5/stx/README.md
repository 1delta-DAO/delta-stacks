# vault-stx-v5 -- ERC-4626 STX Yield Vault (Zest V1 Stack Depth Fix)

## Problem

The Zest V1 `borrow-helper.withdraw` function uses ~60 of the Clarity VM's 64 maximum stack frames internally. Any vault/adapter overhead on top of that exceeds the limit, causing `MaxStackDepthReached` on all withdrawal paths.

This affected v3 and v4 of the STX vault -- all user withdrawals and allocator recalls from Zest V1 reverted on mainnet.

## Solution (v5)

The vault never calls `borrow-helper.withdraw` during user transactions. Instead:

1. **User withdrawals** pull proportionally from **idle + Zest V2 only**. Zest V1 capital is included in share pricing and total-assets math, but the actual STX comes from idle and V2.

2. **Zest V1 recall** is handled by a standalone `zest-v1-manager` contract that calls the thin adapter at minimal stack depth in its own transaction. The allocator calls `manager.recall()` then `vault.complete-v1-recall()` for bookkeeping.

3. **Zest V1 deploy** goes through the vault normally (`vault.deploy-to-zest-v1`). `borrow-helper.supply` does not have a stack depth issue -- only `withdraw` does.

## Architecture

```
User tx (single):
  deposit-stx / withdraw-stx / redeem-for-stx
    |
    +-- idle buffer (native STX held by vault)
    +-- Zest V2 adapter (ERC-4626, shallow call stack)
    +-- Zest V1 allocation (in bookkeeping only, not pulled during withdraw)

Allocator tx 1 -- V1 recall (separate tx):
  zest-v1-manager.recall(amount)
    +-- adapter-zest-v1-wstx-thin.pull(amount)   [borrow-helper.withdraw at depth ~4]
    +-- adapter-zest-v1-wstx-thin.forward(amount) [wSTX transfer to vault]

Allocator tx 2 -- V1 bookkeeping:
  vault.complete-v1-recall(amount)                [updates alloc-zest-v1]
```

## Mainnet Contracts (v5-5, current production)

| Contract | Address | Purpose |
|----------|---------|---------|
| Vault | `SP2DRPT3AA170EK5DC4T22CMSXZ6HACATPXHPAT7H.vault-stx-v5-5` | Main vault |
| Zest V1 Adapter (thin) | `SP2DRPT3AA170EK5DC4T22CMSXZ6HACATPXHPAT7H.adapter-zest-v1-wstx-thin` | Minimal V1 adapter with `pull`/`forward` |
| Zest V2 Adapter | `SP2DRPT3AA170EK5DC4T22CMSXZ6HACATPXHPAT7H.adapter-zest-v2-stx-v5` | Standard V2 adapter |
| V1 Manager | `SP2DRPT3AA170EK5DC4T22CMSXZ6HACATPXHPAT7H.zest-v1-manager-v2` | External V1 recall/deploy |

## Withdrawal Math

Shares-to-burn is computed against full `total-assets` (includes V1). The actual STX pull is split proportionally between idle and V2 only:

```
available = idle + alloc-zest-v2
pull-v2   = amount * alloc-zest-v2 / available
pull-idle = amount - pull-v2
```

If `amount > available`, the transaction fails with `err-insufficient-balance`. The allocator must recall V1 capital to idle first via the manager.

## Version History

| Version | Status | Issue |
|---------|--------|-------|
| v3 | Broken | `MaxStackDepthReached` -- 12+ nested lets around `borrow-helper.withdraw` |
| v4 | Broken | Same -- calc helpers reduced nesting but not enough (~12 frames overhead) |
| v5 | Broken | Same -- data-var scratch space still left ~8 frames overhead |
| v5-1 | Broken | Same -- thin adapter saved adapter frames but vault `begin`/`if`/`try!` still too deep |
| v5-2 | Broken | V1 excluded from pull, but V1's share redirected to V2 which may have 0 balance |
| v5-3 | Broken | Added `deploy-to-zest-v1` back (supply works), but V1 redirect-to-V2 still fails |
| v5-4 | Broken | Redirected V1's share to idle, but idle may not have enough to cover |
| **v5-5** | **Live** | Proportional split between idle + V2 only -- always works if `amount <= idle + V2` |

## Key Design Decisions

- **No sync on withdraw**: Yield sync is removed from the withdraw path to save stack frames. Yield is captured on deposit (auto-sync) and via explicit `sync-zest-v1`/`sync-zest-v2` calls.

- **V1 deploy through vault**: `borrow-helper.supply` does not have the stack depth issue, so `deploy-to-zest-v1` remains a vault function (single tx).

- **V1 recall through manager**: `borrow-helper.withdraw` requires its own transaction via the external manager to stay within the 64-frame limit.

- **Thin adapter**: `adapter-zest-v1-wstx-thin` has a `pull` function that is a single compound expression (`as-contract (contract-call? borrow-helper.withdraw ...)`) with no `begin`, `try!`, or `let` wrappers, minimizing stack overhead.
