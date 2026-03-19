# Delta Stacks

## The Yield Layer for Bitcoin DeFi

Delta Stacks is the first lending aggregator on Stacks, Bitcoin's smart contract layer. It finds the best yield across lending protocols, automatically allocates capital, and keeps users 100% liquid at all times.

---

## The Problem

Lending on Stacks today is fragmented. Capital sits in one protocol while better rates exist elsewhere. Users must manually monitor rates, move funds between protocols, and accept opportunity cost from idle capital.

- Multiple lending protocols (Zest V1, Zest V2, Granite) with different rates
- Rates change constantly based on utilization
- Manual rebalancing is slow, expensive, and error-prone
- Capital locked in one market misses yield in another

---

## The Solution

### 1. Lending Aggregation

Delta Stacks aggregates all lending markets on Stacks into a single view. Compare real-time supply APR, utilization, and available liquidity across every protocol -- then deposit into vaults that automatically optimize yield.

**Supported protocols:**
- **Zest V1** -- Aave-like pooled lending (STX, sBTC)
- **Zest V2** -- ERC-4626 isolated vaults (STX, sBTC, USDCx)
- **Granite** -- Isolated lending markets (USDCx)

**Three vaults, three assets:**

| Vault | Asset | Markets | Share Token |
|-------|-------|---------|-------------|
| USDCx Vault | USDCx (bridged USDC) | Granite + Zest V2 | 1dUSDCx |
| STX Vault | STX (native Stacks token) | Zest V1 + Zest V2 | 1dSTX |
| sBTC Vault | sBTC (Bitcoin on Stacks) | Zest V1 + Zest V2 | 1dsBTC |

### 2. Automated Allocation

Capital doesn't sit idle. The vault allocator continuously monitors rates and rebalances across markets to maximize yield.

#### 2a. Markets are always utilized

Every deposited token is put to work. The allocator deploys capital across all available markets weighted by yield opportunity. A configurable idle buffer (default 5%) is maintained for immediate liquidity, but even this is minimized -- capital efficiency comes first.

#### 2b. Deposits never imbalance the vault

When a user deposits, their capital is automatically split proportionally across all active markets. If the vault has 60% in Zest V1 and 40% in Zest V2, a new deposit flows 60/40 into those same markets. No single deposit can skew the allocation -- the vault stays balanced without any manual intervention.

#### 2c. Withdrawals are always 100% liquid

This is the key innovation. **Users never withdraw from just the idle buffer.** Every withdrawal pulls proportionally from all markets:

```
Vault allocation:  40% Zest V1  |  35% Zest V2  |  25% Idle
User withdraws 100 tokens:
  - 40 pulled from Zest V1
  - 35 pulled from Zest V2
  - 25 pulled from idle
```

This means:
- **No withdrawal queues** -- every user can exit at any time
- **No imbalanced allocations** -- the vault ratio stays constant after withdrawals
- **No idle drag** -- capital doesn't need to sit waiting for withdrawals
- **100% liquidity** -- the full vault TVL is always withdrawable, not just the idle portion

Traditional vaults only let users withdraw from an idle buffer. When the buffer runs dry, users must wait for the allocator to recall funds. Delta Stacks eliminates this bottleneck entirely.

---

## How It Works

### For Users

1. **Deposit** STX, sBTC, or USDCx into a vault
2. **Receive** liquid share tokens (1dSTX, 1dsBTC, 1dUSDCx)
3. **Earn** yield automatically -- no monitoring, no rebalancing
4. **Withdraw** anytime -- proportional pull guarantees 100% liquidity

Share tokens are standard SIP-010 fungible tokens. They are transferable, composable, and usable in other DeFi protocols.

### For the Allocator

The allocator is a privileged role that manages WHERE capital is deployed -- but **cannot withdraw or redirect funds to itself**. The allocator can only move capital between pre-registered lending markets and the vault's idle buffer. All funds always remain inside the vault system.

- **Deploy** to any registered market
- **Recall** from markets when rates shift
- **Rebalance** between markets (zero-sum, capital-preserving)
- **Sync** yield from markets to update the share price

The allocator has zero access to user funds. It cannot transfer tokens out of the vault or to any external address. It can only shuttle capital between the vault's idle balance and whitelisted lending adapters. This is enforced at the smart contract level -- there is no admin key that bypasses it.

---

## Security Model

- **Bookkeeping-based accounting** -- total assets tracked by internal counter, not live balance queries. Prevents donation attacks and share price manipulation.
- **Symmetric virtual offset** -- share price formula includes a virtual offset on both sides, making the first-depositor attack economically infeasible.
- **Vault-favorable rounding** -- all conversions round in favor of existing holders. Dust accrues to the vault, not to attackers.
- **Immutable contracts** -- all vault logic is deployed on-chain as Clarity smart contracts. No proxy patterns, no upgradability.
- **Non-custodial allocator** -- the allocator can only move funds between registered markets and idle. It cannot withdraw, redirect, or access user funds. There is no privileged path to extract capital.
- **Role separation** -- owner, allocator, and user permissions are strictly separated. Users can always withdraw regardless of allocator actions.

---

## Architecture

```
                 Deposit                      Lending Markets
                   |                               |
  User -----> [ Vault ] ----> [ Adapter ] ----> [ Zest V1 ]
    ^              |                |
    |              |     ----> [ Adapter ] ----> [ Zest V2 ]
    |              |                |
    |              |     ----> [ Adapter ] ----> [ Granite ]
    |              |
    |         [ Idle Buffer ]
    |              |
    +--- Withdraw (proportional from ALL sources)
```

Each lending market is abstracted behind an **adapter** -- a thin wrapper that normalizes deposit/withdraw/position-read across protocols. Adding a new market is as simple as deploying a new adapter contract.

---

## Built on Bitcoin

Delta Stacks runs on Stacks, a Bitcoin layer that settles to Bitcoin L1. Every vault transaction is anchored to Bitcoin's security:

- **Clarity smart contracts** -- decidable, no reentrancy, no hidden state
- **Bitcoin finality** -- transactions settle with Bitcoin's proof-of-work
- **Native BTC yield** -- sBTC vault earns yield on Bitcoin without bridging to another chain

---

## Summary

| Feature | Delta Stacks | Traditional Vaults |
|---------|-------------|-------------------|
| Withdrawal source | All markets proportionally | Idle buffer only |
| Liquidity | 100% of TVL always withdrawable | Limited by idle buffer |
| Deposit allocation | Auto-proportional | Manual or idle-only |
| Rate optimization | Multi-market aggregation | Single market |
| Share tokens | Transferable SIP-010 | Often non-transferable |
| Security | Bookkeeping + virtual offset | Varies |
| Allocator access to funds | None -- can only move between markets | Often has admin keys |

**Delta Stacks: the best yield on Bitcoin, always liquid.**
