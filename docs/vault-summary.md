# Delta Stacks Vault Summary

Three ERC-4626-style tokenized yield vaults on Stacks, aggregating lending protocols via trait-based adapters. Each vault issues transferable SIP-010 share tokens representing a proportional claim on deployed capital.

## Live Contracts

### USDCx Vault V3

| Component | Contract |
|-----------|----------|
| Vault | `SP2DRPT3AA170EK5DC4T22CMSXZ6HACATPXHPAT7H.vault-usdcx-v3` |
| Granite Adapter | `SP2DRPT3AA170EK5DC4T22CMSXZ6HACATPXHPAT7H.adapter-granite-usdcx-v3` |
| Zest V2 Adapter | `SP2DRPT3AA170EK5DC4T22CMSXZ6HACATPXHPAT7H.adapter-zest-v2-usdc-v3` |

- **Base asset**: USDCx (`SP120SBRBQJ00MCWS7TM5R8WJNTTKD5K0HFRC2CNE.usdcx`, 6 decimals)
- **Share token**: `1dUSDCx`
- **Markets**: Granite (isolated lending) + Zest V2 (ERC-4626 vault)
- **Withdrawal**: proportional pull from idle + Granite + Zest V2

### STX Vault V6

| Component | Contract |
|-----------|----------|
| Vault | `SP2DRPT3AA170EK5DC4T22CMSXZ6HACATPXHPAT7H.vault-stx-v6` |
| V1 Thin Adapter | `SP2DRPT3AA170EK5DC4T22CMSXZ6HACATPXHPAT7H.adapter-zest-v1-wstx-thin-v3` |
| V2 Adapter | `SP2DRPT3AA170EK5DC4T22CMSXZ6HACATPXHPAT7H.adapter-zest-v2-stx-v5` |
| V1 Manager | `SP2DRPT3AA170EK5DC4T22CMSXZ6HACATPXHPAT7H.zest-v1-manager-v3` |

- **Base asset**: wSTX (`SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.wstx`, 6 decimals)
- **Share token**: `1dSTX`
- **Markets**: Zest V1 (Aave-like pool) + Zest V2 (ERC-4626 vault)
- **Withdrawal**: proportional pull from idle + V1 + V2 (requires collateral-disable)

### sBTC Vault V6

| Component | Contract |
|-----------|----------|
| Vault | `SP2DRPT3AA170EK5DC4T22CMSXZ6HACATPXHPAT7H.vault-sbtc-v6` |
| V1 Thin Adapter | `SP2DRPT3AA170EK5DC4T22CMSXZ6HACATPXHPAT7H.adapter-zest-v1-sbtc-thin-v3` |
| V2 Adapter | `SP2DRPT3AA170EK5DC4T22CMSXZ6HACATPXHPAT7H.adapter-zest-v2-sbtc-v5` |
| V1 Manager | `SP2DRPT3AA170EK5DC4T22CMSXZ6HACATPXHPAT7H.zest-v1-sbtc-manager-v2` |

- **Base asset**: sBTC (`SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token`, 8 decimals)
- **Share token**: `1dsBTC`
- **Markets**: Zest V1 (Aave-like pool) + Zest V2 (ERC-4626 vault)
- **Withdrawal**: proportional pull from idle + V1 + V2 (requires collateral-disable)

---

## Shared Architecture

### Share Price

```
price = (totalAssets + virtualOffset) / (totalSupply + virtualOffset)
```

The symmetric virtual offset (10^decimals) prevents share price manipulation on empty/near-empty vaults. Rounding always favors the vault (dust accrues to existing holders).

### Bookkeeping Model

Total assets tracked via an internal counter (`total-assets-bookkeeping`), not live balance queries. This prevents donation attacks where an attacker sends tokens directly to inflate the share price. Yield is captured explicitly through `sync` functions that compare the adapter's live position against the bookkeeping value.

### Roles

| Role | Permissions |
|------|-------------|
| **User** | deposit, mint, withdraw, redeem, transfer shares |
| **Allocator** | deploy to markets, recall from markets, rebalance, sync |
| **Owner** | set allocator, set fees, set idle buffer, register adapters |

### Auto-Allocation on Deposit

New deposits split proportionally across registered markets based on current allocation weights. A configurable idle buffer (default 5%) is retained for immediate withdrawals.

### Performance Fees

MetaMorpho-style share dilution: when yield is captured during sync, fee shares are minted to the fee recipient. This dilutes existing shares proportionally rather than skimming assets.

---

## Zest V1 Stack Depth Fix (STX & sBTC V6)

### Problem

Zest V1's `borrow-helper.withdraw` uses ~60 of the Clarity VM's 64 maximum stack frames. The function iterates all 10 registered assets, calls oracles, and computes health factors. Only ~4 frames remain for any calling contract, making it impossible to call from a vault with any meaningful logic.

Vault versions v3 through v5-5 all failed with `MaxStackDepthReached`:

| Version | Approach | Stack at borrow-helper | Result |
|---------|----------|----------------------|--------|
| V3 | Nested lets + adapter call | ~18 frames | Failed |
| V4 | Calc-helper reduces nesting | ~12 frames | Failed |
| V5 | Data-var scratch space | ~10 frames | Failed |
| V5-1 | Thin adapter (split pull/forward) | ~10 frames | Failed |
| V5-5 | Exclude V1 from withdrawal | N/A (V1 never called) | Worked but limited |

### Solution: Disable Collateral

Zest V1's `check-balance-decrease-allowed` (called during every withdrawal) has an early return:

```clarity
(if (not (get use-as-collateral user-data))
  (ok true)   ;; skip entire health-factor computation
  ...deep asset iteration + oracle calls...)
```

When `use-as-collateral = false`, the function returns immediately without iterating assets or computing health factors. This saves ~40-50 stack frames.

**Why it's safe**: The adapter is a pure supplier with zero borrows. Collateral flags protect borrowers from liquidation; with no debt, disabling collateral has no risk.

### V6 Result

With collateral disabled, `withdraw-stx` succeeds:
- TX: `0xf529097eecc0dcad80a41cf2a47c4c6bc8bea732c1cc559ba68c71261d3557c2`
- Runtime: 24.8M, 627 reads (full proportional V1 withdrawal)

### Allocator Workflow

Zest V1's `supply` function automatically re-enables collateral on every deposit. The allocator must disable it after each deploy:

1. `vault.deploy-to-zest-v1(amount, adapter)` -- supply to V1
2. Send 0.01 STX to adapter (Pyth oracle fee)
3. `adapter.disable-collateral(price-feed-bytes)` -- disable with fresh Pyth data
4. User withdrawals now work at minimal stack depth

### External Manager

V1 recall operations (withdrawing from V1 back to vault idle) use a standalone manager contract at minimal call depth (~3-4 frames):

1. Allocator calls `manager.recall(amount)` -- calls thin adapter's `pull()` then `forward()`
2. Allocator calls `vault.complete-v1-recall(amount)` -- syncs bookkeeping

### Thin Adapter

The thin adapter splits the standard `adapter-withdraw` into two minimal-depth functions:

- **`pull(amount)`**: Single expression `(as-contract (contract-call? borrow-helper.withdraw ...))`. No `begin`, no `let`, no `try!` -- absolute minimum stack overhead.
- **`forward(amount, to)`**: Transfers assets from adapter to recipient.
- **`disable-collateral(price-feed-bytes)`**: Calls `borrow-helper.set-user-use-reserve-as-collateral` with `false`.

---

## Key Differences

| Feature | USDCx V3 | STX V6 | sBTC V6 |
|---------|----------|--------|---------|
| Markets | Granite + Zest V2 | Zest V1 + Zest V2 | Zest V1 + Zest V2 |
| Decimals | 6 | 6 | 8 |
| Virtual Offset | 10^6 | 10^6 | 10^8 |
| Dust Threshold | 100 | 100 | 10 |
| V1 Collateral Mgmt | N/A | Required after deploy | Required after deploy |
| External Manager | No | zest-v1-manager-v3 | zest-v1-sbtc-manager-v2 |
| Thin Adapter | No | adapter-zest-v1-wstx-thin-v3 | adapter-zest-v1-sbtc-thin-v3 |
| Sync on Withdraw | Yes | No | No |
| Native Asset Helpers | No | deposit-stx / withdraw-stx | No |
| Data-Var Scratch | No | Yes | Yes |
