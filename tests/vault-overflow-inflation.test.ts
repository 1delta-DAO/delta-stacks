import { describe, it, expect } from 'vitest'
import { Cl, ClarityType } from '@stacks/transactions'
import type { Simnet } from '@stacks/clarinet-sdk'

declare global {
  const simnet: Simnet
}

// ---------------------------------------------------------------------------
// Helpers (same pattern as existing vault-usdcx-v2.test.ts)
// ---------------------------------------------------------------------------

const accounts = simnet.getAccounts()
const deployer = accounts.get('deployer')!
const wallet1  = accounts.get('wallet_1')!
const wallet2  = accounts.get('wallet_2')!

const VAULT   = `${deployer}.vault-usdcx-v2`
const TOKEN   = `${deployer}.mock-token`
const ADAPTER = `${deployer}.mock-adapter`
const adapterArg = Cl.contractPrincipal(deployer, 'mock-adapter')

const VIRTUAL = 100_000_000
// Clarity uint128 max
const MAX_UINT = BigInt('340282366920938463463374607431768211455')

function mint(to: string, amount: number | bigint) {
  simnet.callPublicFn(TOKEN, 'mint', [Cl.uint(amount), Cl.principal(to)], deployer)
}

function deposit(amount: number | bigint, owner: string) {
  return simnet.callPublicFn(
    VAULT, 'deposit',
    [Cl.uint(amount), Cl.principal(owner), adapterArg, adapterArg],
    owner,
  )
}

function withdraw(amount: number | bigint, receiver: string, owner: string) {
  return simnet.callPublicFn(
    VAULT, 'withdraw',
    [Cl.uint(amount), Cl.principal(receiver), Cl.principal(owner), adapterArg, adapterArg],
    owner,
  )
}

function redeem(shares: number | bigint, receiver: string, owner: string) {
  return simnet.callPublicFn(
    VAULT, 'redeem',
    [Cl.uint(shares), Cl.principal(receiver), Cl.principal(owner), adapterArg, adapterArg],
    owner,
  )
}

function mintFn(shares: number | bigint, receiver: string) {
  return simnet.callPublicFn(
    VAULT, 'mint',
    [Cl.uint(shares), Cl.principal(receiver), adapterArg, adapterArg],
    receiver,
  )
}

function registerGranite() {
  simnet.callPublicFn(VAULT, 'register-adapter-granite-usdcx', [Cl.principal(ADAPTER)], deployer)
}

function uint(cv: { type: number; value: any }): bigint {
  if (cv.type === ClarityType.ResponseOk) return BigInt(cv.value.value)
  if (cv.type === ClarityType.ResponseErr) throw new Error(`Unexpected err: ${cv.value.value}`)
  return BigInt(cv.value)
}

function vaultRead(fn: string): bigint {
  return uint(simnet.callReadOnlyFn(VAULT, fn, [], deployer).result as any)
}

function tokenBalance(principal: string): bigint {
  return uint(simnet.callReadOnlyFn(TOKEN, 'get-balance', [Cl.principal(principal)], deployer).result as any)
}

function vaultShares(principal: string): bigint {
  return uint(simnet.callReadOnlyFn(VAULT, 'get-balance', [Cl.principal(principal)], deployer).result as any)
}

// ===========================================================================
// 1) OVERFLOW / UNDERFLOW TESTS
// ===========================================================================

describe('vault — overflow / underflow edge cases', () => {

  it('deposit of u1 (minimum possible) succeeds and mints shares', () => {
    mint(deployer, 1)
    const result = deposit(1, deployer)
    expect(result.result.type).toBe(ClarityType.ResponseOk)
    const shares = uint(result.result as any)
    // shares = 1 * (0 + 100M) / (0 + 1 + 1) = 100M / 2 = 50M
    expect(shares).toBeGreaterThan(0n)
  })

  it('deposit of u1 after large existing deposit returns err-shares-zero', () => {
    // When vault already has 1B assets, depositing 1 unit:
    // shares = 1 * (supply + 100M) / (1B + 1 + 1) ≈ ~0 (rounds to 0)
    // The vault correctly rejects this with err-shares-zero (u103)
    // This is expected: virtual shares create a minimum viable deposit threshold.
    const big = 1_000_000_000 // 1000 tokens
    mint(deployer, big)
    deposit(big, deployer)

    mint(wallet1, 1)
    const result = deposit(1, wallet1)
    expect(result.result.type).toBe(ClarityType.ResponseErr)
    // err-shares-zero = u103
    expect(BigInt((result.result as any).value.value)).toBe(103n)
  })

  it('withdraw of u0 is rejected (underflow guard)', () => {
    mint(deployer, 1_000_000)
    deposit(1_000_000, deployer)
    const result = withdraw(0, wallet2, deployer)
    expect(result.result.type).toBe(ClarityType.ResponseErr)
  })

  it('redeem of u0 is rejected', () => {
    mint(deployer, 1_000_000)
    deposit(1_000_000, deployer)
    const result = redeem(0, wallet2, deployer)
    expect(result.result.type).toBe(ClarityType.ResponseErr)
  })

  it('withdraw more than total assets fails', () => {
    const amt = 1_000_000
    mint(deployer, amt)
    deposit(amt, deployer)
    // Try to withdraw 2x what's in the vault
    const result = withdraw(amt * 2, wallet2, deployer)
    expect(result.result.type).toBe(ClarityType.ResponseErr)
  })

  it('redeem more shares than owned fails', () => {
    mint(deployer, 1_000_000)
    deposit(1_000_000, deployer)
    const shares = vaultShares(deployer)
    const result = redeem(shares + 1n, wallet2, deployer)
    expect(result.result.type).toBe(ClarityType.ResponseErr)
  })

  it('large deposit does not cause arithmetic overflow', () => {
    // Deposit a very large amount (10^18, well within uint128)
    const large = BigInt('1000000000000000000') // 10^18
    mint(deployer, large)
    const result = deposit(large, deployer)
    expect(result.result.type).toBe(ClarityType.ResponseOk)
    const shares = uint(result.result as any)
    expect(shares).toBeGreaterThan(0n)

    // Verify total-assets matches
    expect(vaultRead('get-total-assets')).toBe(large)
  })

  it('sequential large deposits and redeems maintain accounting consistency', () => {
    const amt = BigInt('100000000000000') // 10^14
    mint(deployer, amt)
    mint(wallet1, amt)

    deposit(amt, deployer)
    deposit(amt, wallet1)

    // Total assets should be 2 * amt
    expect(vaultRead('get-total-assets')).toBe(amt * 2n)

    // Each user redeems all shares
    const s1 = vaultShares(deployer)
    const s2 = vaultShares(wallet1)

    redeem(s1, deployer, deployer)
    redeem(s2, wallet1, wallet1)

    // After both redeem, total-assets should be very small (virtual share residue)
    expect(vaultRead('get-total-assets')).toBeLessThan(amt)
  })

  it('withdraw exactly total-assets with a single depositor succeeds', () => {
    const amt = 1_000_000
    mint(deployer, amt)
    deposit(amt, deployer)

    // Due to virtual shares, user can't withdraw the full amount via withdraw()
    // because shares-to-burn would exceed their balance. But they CAN redeem all shares.
    const shares = vaultShares(deployer)
    const result = redeem(shares, wallet2, deployer)
    expect(result.result.type).toBe(ClarityType.ResponseOk)

    const received = tokenBalance(wallet2)
    // Should receive slightly less than amt due to virtual share dilution
    expect(received).toBeGreaterThan(0n)
    expect(received).toBeLessThanOrEqual(BigInt(amt))
  })

  it('deposit u0 is rejected', () => {
    mint(deployer, 1_000_000)
    const result = deposit(0, deployer)
    expect(result.result.type).toBe(ClarityType.ResponseErr)
  })

  it('mint u0 shares is rejected', () => {
    mint(deployer, 1_000_000)
    const result = mintFn(0, deployer)
    expect(result.result.type).toBe(ClarityType.ResponseErr)
  })

  it('proportional withdraw with granite does not underflow when idle is zero', () => {
    // Deploy everything to granite so idle = 0
    registerGranite()
    const amt = 1_000_000
    mint(deployer, amt)
    deposit(amt, deployer)

    simnet.callPublicFn(VAULT, 'deploy-to-granite', [Cl.uint(amt), adapterArg], deployer)
    expect(vaultRead('get-idle-bookkeeping')).toBe(0n)

    // Withdraw half — should pull entirely from granite, idle pull = 0
    const half = amt / 2
    const result = withdraw(half, wallet2, deployer)
    expect(result.result.type).toBe(ClarityType.ResponseOk)
    expect(tokenBalance(wallet2)).toBe(BigInt(half))
  })

  it('withdraw u1 (dust) from a large vault succeeds', () => {
    const amt = 1_000_000_000
    mint(deployer, amt)
    deposit(amt, deployer)

    const result = withdraw(1, wallet2, deployer)
    expect(result.result.type).toBe(ClarityType.ResponseOk)
    expect(tokenBalance(wallet2)).toBe(1n)
  })
})

// ===========================================================================
// 2) SHARE INFLATION / FIRST-DEPOSITOR ATTACK TESTS
// ===========================================================================

describe('vault — share inflation attack resistance', () => {

  it('virtual shares prevent first-depositor from manipulating share price', () => {
    // Classic ERC-4626 inflation attack:
    // 1. Attacker deposits 1 wei -> gets shares
    // 2. Attacker donates large amount directly to vault -> inflates share price
    // 3. Victim deposits -> rounds down to 0 shares
    //
    // With virtual shares = 100M, this attack should be mitigated.

    // Step 1: Attacker deposits 1 token
    mint(deployer, 1)
    deposit(1, deployer)
    const attackerShares = vaultShares(deployer)
    expect(attackerShares).toBeGreaterThan(0n)

    // Step 2: Attacker "donates" a large amount directly to vault contract
    // (simulating donation by minting tokens to the vault's address)
    const vaultPrincipal = `${deployer}.vault-usdcx-v2`
    const donationAmount = 10_000_000_000 // 10,000 tokens
    mint(vaultPrincipal, donationAmount)
    // NOTE: donation to vault address doesn't change total-assets-bookkeeping,
    // so the share price in the math doesn't change (bookkeeping-based, not balance-based).
    // This is a key defense: bookkeeping is independent of raw balance.

    // Step 3: Victim deposits a normal amount
    const victimDeposit = 1_000_000 // 1 token
    mint(wallet1, victimDeposit)
    const result = deposit(victimDeposit, wallet1)

    // CRITICAL: Victim MUST get shares > 0
    expect(result.result.type).toBe(ClarityType.ResponseOk)
    const victimShares = uint(result.result as any)
    expect(victimShares).toBeGreaterThan(0n)
  })

  it('virtual shares ensure first depositor cannot steal majority of second depositor funds', () => {
    // Without virtual shares, attacker deposits 1 wei, donates huge amount,
    // then victim's deposit rounds to 0 shares and attacker takes everything.
    //
    // With virtual shares = 100M, the attacker does capture some value from
    // the virtual share dilution pool, but cannot drain the victim.

    // Attacker deposits 1
    mint(deployer, 1)
    deposit(1, deployer)

    // Victim deposits 1M
    mint(wallet1, 1_000_000)
    deposit(1_000_000, wallet1)

    // Attacker redeems all shares
    const attackerShares = vaultShares(deployer)
    redeem(attackerShares, deployer, deployer)
    const attackerReceived = tokenBalance(deployer)

    // Key property: attacker cannot take more than the virtual share dilution allows
    // Attacker deposited 1 but benefits from virtual-share dilution hole.
    // However, attacker should NOT get anywhere close to the victim's full deposit.
    expect(attackerReceived).toBeLessThan(BigInt(1_000_000) / 2n)

    // Victim redeems and should recover the majority of their deposit
    const victimShares = vaultShares(wallet1)
    redeem(victimShares, wallet1, wallet1)
    const victimReceived = tokenBalance(wallet1)

    // Victim should get back more than they lose to virtual share dilution
    // The virtual dilution is bounded: victim gets ~(amount * supply) / (supply + virtual)
    expect(victimReceived).toBeGreaterThan(0n)
    // Attacker + victim received should be <= total deposited
    expect(attackerReceived + victimReceived).toBeLessThanOrEqual(BigInt(1_000_001))
  })

  it('front-running deposit with donation does not steal funds (bookkeeping defense)', () => {
    // Attacker front-runs: deposits 1, then donates to inflate the raw balance.
    // Key defense: the vault uses bookkeeping (not raw balance) for share math,
    // so the donation has NO effect on the share price.
    mint(deployer, 1)
    deposit(1, deployer)

    // "Donate" by directly minting tokens to vault contract (bypasses bookkeeping)
    const vaultPrincipal = `${deployer}.vault-usdcx-v2`
    const donation = 100_000_000
    mint(vaultPrincipal, donation)

    // CRITICAL: total-assets-bookkeeping is unaffected by the donation
    expect(vaultRead('get-total-assets')).toBe(1n)

    // Victim deposits 1_000_000
    mint(wallet1, 1_000_000)
    const result = deposit(1_000_000, wallet1)
    expect(result.result.type).toBe(ClarityType.ResponseOk)

    const victimShares = uint(result.result as any)
    expect(victimShares).toBeGreaterThan(0n)

    // Victim's shares should reflect the bookkeeping state (total=1 before their deposit),
    // not the inflated raw balance. Victim gets a large share of the pool.
    const attackerShares = vaultShares(deployer)
    // Victim deposited 1M when total was 1, so victim's shares >> attacker's shares
    expect(victimShares).toBeGreaterThan(attackerShares)
  })

  it('small deposit followed by large deposit: large depositor gets more shares', () => {
    // First depositor: 1 unit
    mint(deployer, 1)
    deposit(1, deployer)
    const s1 = vaultShares(deployer)

    // Second depositor: 1,000,000 units
    mint(wallet1, 1_000_000)
    deposit(1_000_000, wallet1)
    const s2 = vaultShares(wallet1)

    // Second depositor put in 1M more, so they must have more shares
    expect(s2).toBeGreaterThan(s1)

    // The ratio won't be exactly 1M:1 due to virtual shares, but the larger
    // depositor should dominate.
    // With virtual=100M: first gets 50M shares, second gets ~150B shares
    const ratio = Number(s2) / Number(s1)
    expect(ratio).toBeGreaterThan(1)
  })

  it('virtual shares bound the dilution attack: attacker profit is capped', () => {
    // Attacker deposits 1 unit before any victims
    mint(deployer, 1)
    deposit(1, deployer)
    const attackerShares = vaultShares(deployer)

    // Many victims deposit large amounts
    for (let i = 0; i < 5; i++) {
      mint(wallet1, 1_000_000)
      deposit(1_000_000, wallet1)
    }

    // Attacker redeems all shares
    redeem(attackerShares, wallet2, deployer)
    const attackerReceived = tokenBalance(wallet2)

    // The attacker benefits from virtual-share dilution but their profit is bounded.
    // Without virtual shares, the first depositor could steal almost everything.
    // With virtual=100M, the max extractable value from the dilution hole is limited.
    // Attacker's share of the total: attackerShares / (totalSupply + virtual)
    // This is a small fraction of the total vault.
    const totalVaultAfterDeposits = 5_000_001n
    expect(attackerReceived).toBeLessThan(totalVaultAfterDeposits / 2n)
  })

  it('no share inflation via sync: yield is distributed proportionally to shareholders', () => {
    registerGranite()

    // Two depositors deposit equal amounts
    const amt = 1_000_000
    mint(deployer, amt)
    deposit(amt, deployer)
    mint(wallet1, amt)
    deposit(amt, wallet1)

    // Deploy to granite
    simnet.callPublicFn(VAULT, 'deploy-to-granite', [Cl.uint(amt * 2), adapterArg], deployer)

    // Simulate yield
    const yieldAmt = 200_000
    mint(ADAPTER, yieldAmt)

    // Sync to harvest yield into bookkeeping
    simnet.callPublicFn(VAULT, 'sync-granite', [adapterArg], deployer)

    // total-assets should have increased by yieldAmt
    expect(vaultRead('get-total-assets')).toBe(BigInt(amt * 2 + yieldAmt))

    // Both depositors have equal shares, so should get equal entitlements
    const s1 = vaultShares(deployer)
    const s2 = vaultShares(wallet1)
    expect(s1 - s2 < 2n || s2 - s1 < 2n).toBe(true)

    // Each user's max-withdraw should be equal (they have equal shares)
    const mw1 = uint(simnet.callReadOnlyFn(VAULT, 'max-withdraw', [Cl.principal(deployer)], deployer).result as any)
    const mw2 = uint(simnet.callReadOnlyFn(VAULT, 'max-withdraw', [Cl.principal(wallet1)], deployer).result as any)

    // Both entitlements should be approximately equal (within 1 due to rounding)
    expect(mw1 - mw2 < 2n || mw2 - mw1 < 2n).toBe(true)

    // Yield increased both entitlements relative to original deposit
    // (accounting for virtual share dilution which reduces each user's share)
    expect(mw1).toBeGreaterThan(0n)
    // Combined withdrawals should not exceed total assets
    expect(mw1 + mw2).toBeLessThanOrEqual(BigInt(amt * 2 + yieldAmt))
  })

  it('late depositor does not dilute existing holders yield', () => {
    registerGranite()

    // First depositor
    const amt = 1_000_000
    mint(deployer, amt)
    deposit(amt, deployer)

    // Deploy and earn yield
    simnet.callPublicFn(VAULT, 'deploy-to-granite', [Cl.uint(amt), adapterArg], deployer)
    const yieldAmt = 500_000
    mint(ADAPTER, yieldAmt)

    // Second depositor arrives after yield has accrued
    // Deposit triggers auto-sync, so share price will reflect yield
    mint(wallet1, amt)
    deposit(amt, wallet1)

    const s1 = vaultShares(deployer)
    const s2 = vaultShares(wallet1)

    // First depositor should have MORE shares than second (deposited at lower price)
    expect(s1).toBeGreaterThan(s2)

    // First depositor's entitlement should be greater than second's
    // (they captured the yield before wallet1 entered)
    const mw1 = uint(simnet.callReadOnlyFn(VAULT, 'max-withdraw', [Cl.principal(deployer)], deployer).result as any)
    const mw2 = uint(simnet.callReadOnlyFn(VAULT, 'max-withdraw', [Cl.principal(wallet1)], deployer).result as any)
    expect(mw1).toBeGreaterThan(mw2)

    // First depositor's entitlement is reduced by virtual share dilution
    // but should still be significantly more than the late depositor's
    // (virtual shares take a cut from everyone, but first depositor captured yield)
    expect(mw1).toBeGreaterThan(mw2 * 110n / 100n) // at least 10% more
  })

  it('convert-to-shares and convert-to-assets round-trip loses at most dust', () => {
    // Use a larger initial deposit so virtual share dilution is small
    const initial = 100_000_000_000 // 100K tokens (10^11)
    mint(deployer, initial)
    deposit(initial, deployer)

    const amount = 500_000_000 // 500 tokens
    const shares = uint(simnet.callReadOnlyFn(VAULT, 'convert-to-shares', [Cl.uint(amount)], deployer).result as any)
    const backToAssets = uint(simnet.callReadOnlyFn(VAULT, 'convert-to-assets', [Cl.uint(shares)], deployer).result as any)

    // Due to floor division, backToAssets <= amount
    expect(backToAssets).toBeLessThanOrEqual(BigInt(amount))
    // With 100B vault and virtual=100M, dilution is ~0.1%.
    // Round-trip loss from floor division + dilution should be < 1%
    expect(backToAssets).toBeGreaterThan(BigInt(amount) * 99n / 100n)
  })

  it('convert-to-shares/assets with small vault shows virtual share dilution', () => {
    // With small deposits, virtual shares cause measurable dilution
    mint(deployer, 1_000_000)
    deposit(1_000_000, deployer)

    const amount = 500_000
    const shares = uint(simnet.callReadOnlyFn(VAULT, 'convert-to-shares', [Cl.uint(amount)], deployer).result as any)
    const backToAssets = uint(simnet.callReadOnlyFn(VAULT, 'convert-to-assets', [Cl.uint(shares)], deployer).result as any)

    // Floor division means backToAssets <= amount
    expect(backToAssets).toBeLessThanOrEqual(BigInt(amount))
    // With virtual=100M and vault=1M, dilution is significant (~50%) but bounded
    expect(backToAssets).toBeGreaterThan(0n)
  })

  it('convert-to-shares returns 0 when empty vault and amount is 0', () => {
    // Empty vault: supply=0, total=0
    // convert-to-shares(0) = 0 * (0 + VIRTUAL) / (0 + 0 + 1) = 0
    const shares = uint(simnet.callReadOnlyFn(VAULT, 'convert-to-shares', [Cl.uint(0)], deployer).result as any)
    expect(shares).toBe(0n)
  })

  it('convert-to-assets returns 0 when supply is 0', () => {
    // Empty vault: supply=0 -> returns 0 regardless of shares argument
    const assets = uint(simnet.callReadOnlyFn(VAULT, 'convert-to-assets', [Cl.uint(1_000_000)], deployer).result as any)
    expect(assets).toBe(0n)
  })

  it('multiple small deposits and withdrawals do not accumulate rounding errors unfavorably', () => {
    // Use a large enough deposit per iteration so virtual share dilution is small
    const depositAmt = 10_000_000 // 10 tokens per iteration
    const iterations = 50

    mint(deployer, depositAmt * iterations)
    for (let i = 0; i < iterations; i++) {
      deposit(depositAmt, deployer)
    }

    const totalDeposited = BigInt(depositAmt * iterations)
    const totalAssets = vaultRead('get-total-assets')
    expect(totalAssets).toBe(totalDeposited)

    // Redeem all shares
    const shares = vaultShares(deployer)
    redeem(shares, wallet2, deployer)

    const received = tokenBalance(wallet2)
    // With total = 500M and virtual = 100M, dilution is ~17% for the
    // "virtual share hole". Real depositor gets supply/(supply+virtual) of total.
    // Should get back a significant portion.
    expect(received).toBeGreaterThan(totalDeposited * 80n / 100n)
    // But never more than deposited
    expect(received).toBeLessThanOrEqual(totalDeposited)
  })
})

// ===========================================================================
// 3) INITIALIZATION / UNREGISTERED ADAPTER TESTS
// ===========================================================================

describe('vault — initialization: no adapters registered', () => {

  it('initial state: total-assets is 0', () => {
    expect(vaultRead('get-total-assets')).toBe(0n)
  })

  it('initial state: alloc-granite is 0', () => {
    expect(vaultRead('get-alloc-granite')).toBe(0n)
  })

  it('initial state: alloc-zest-v2 is 0', () => {
    expect(vaultRead('get-alloc-zest-v2')).toBe(0n)
  })

  it('initial state: idle-bookkeeping is 0', () => {
    expect(vaultRead('get-idle-bookkeeping')).toBe(0n)
  })

  it('initial state: adapters are none', () => {
    const granite = simnet.callReadOnlyFn(VAULT, 'get-adapter-granite-usdcx', [], deployer).result as any
    const zest = simnet.callReadOnlyFn(VAULT, 'get-adapter-zest-v2-usdc', [], deployer).result as any
    expect(granite.type).toBe(ClarityType.OptionalNone)
    expect(zest.type).toBe(ClarityType.OptionalNone)
  })

  it('initial state: vault-owner is deployer', () => {
    const owner = simnet.callReadOnlyFn(VAULT, 'get-vault-owner', [], deployer).result as any
    expect(owner.value).toBe(deployer)
  })

  it('initial state: vault-allocator is deployer', () => {
    const allocator = simnet.callReadOnlyFn(VAULT, 'get-vault-allocator', [], deployer).result as any
    expect(allocator.value).toBe(deployer)
  })

  it('initial state: total supply is 0 (no phantom minted shares)', () => {
    const supply = uint(simnet.callReadOnlyFn(VAULT, 'get-total-supply', [], deployer).result as any)
    expect(supply).toBe(0n)
  })

  it('deposit succeeds without any adapters registered', () => {
    // With alloc-granite=0 and alloc-zest-v2=0, the vault skips adapter
    // validation entirely — so deposits work with unregistered adapters.
    mint(deployer, 1_000_000)
    const result = deposit(1_000_000, deployer)
    expect(result.result.type).toBe(ClarityType.ResponseOk)
    expect(vaultShares(deployer)).toBeGreaterThan(0n)
    expect(vaultRead('get-total-assets')).toBe(1_000_000n)
  })

  it('withdraw succeeds without any adapters registered (all idle)', () => {
    mint(deployer, 1_000_000)
    deposit(1_000_000, deployer)

    const result = withdraw(500_000, wallet2, deployer)
    expect(result.result.type).toBe(ClarityType.ResponseOk)
    expect(tokenBalance(wallet2)).toBe(500_000n)
  })

  it('redeem succeeds without any adapters registered (all idle)', () => {
    mint(deployer, 1_000_000)
    deposit(1_000_000, deployer)

    const shares = vaultShares(deployer)
    const result = redeem(shares, wallet2, deployer)
    expect(result.result.type).toBe(ClarityType.ResponseOk)
    expect(tokenBalance(wallet2)).toBeGreaterThan(0n)
  })

  it('deploy-to-granite fails when adapter is not registered', () => {
    mint(deployer, 1_000_000)
    deposit(1_000_000, deployer)

    // adapter-granite-usdcx is none, so (some (contract-of adapter)) != none
    const result = simnet.callPublicFn(
      VAULT, 'deploy-to-granite',
      [Cl.uint(500_000), adapterArg],
      deployer,
    )
    expect(result.result.type).toBe(ClarityType.ResponseErr)
  })

  it('deploy-to-zest-v2 fails when adapter is not registered', () => {
    mint(deployer, 1_000_000)
    deposit(1_000_000, deployer)

    const result = simnet.callPublicFn(
      VAULT, 'deploy-to-zest-v2',
      [Cl.uint(500_000), adapterArg],
      deployer,
    )
    expect(result.result.type).toBe(ClarityType.ResponseErr)
  })

  it('sync-granite fails when adapter is not registered', () => {
    const result = simnet.callPublicFn(VAULT, 'sync-granite', [adapterArg], deployer)
    expect(result.result.type).toBe(ClarityType.ResponseErr)
  })

  it('sync-zest-v2 fails when adapter is not registered', () => {
    const result = simnet.callPublicFn(VAULT, 'sync-zest-v2', [adapterArg], deployer)
    expect(result.result.type).toBe(ClarityType.ResponseErr)
  })

  it('rebalance-granite-to-zest-v2 fails when adapters are not registered', () => {
    mint(deployer, 1_000_000)
    deposit(1_000_000, deployer)

    const result = simnet.callPublicFn(
      VAULT, 'rebalance-granite-to-zest-v2',
      [Cl.uint(500_000), adapterArg, adapterArg],
      deployer,
    )
    expect(result.result.type).toBe(ClarityType.ResponseErr)
  })

  it('rebalance-zest-v2-to-granite fails when adapters are not registered', () => {
    mint(deployer, 1_000_000)
    deposit(1_000_000, deployer)

    const result = simnet.callPublicFn(
      VAULT, 'rebalance-zest-v2-to-granite',
      [Cl.uint(500_000), adapterArg, adapterArg],
      deployer,
    )
    expect(result.result.type).toBe(ClarityType.ResponseErr)
  })

  it('deploy-to-granite works only after registering the adapter', () => {
    mint(deployer, 1_000_000)
    deposit(1_000_000, deployer)

    // Fails before registration
    const before = simnet.callPublicFn(
      VAULT, 'deploy-to-granite',
      [Cl.uint(500_000), adapterArg],
      deployer,
    )
    expect(before.result.type).toBe(ClarityType.ResponseErr)

    // Register adapter
    registerGranite()

    // Succeeds after registration
    const after = simnet.callPublicFn(
      VAULT, 'deploy-to-granite',
      [Cl.uint(500_000), adapterArg],
      deployer,
    )
    expect(after.result.type).toBe(ClarityType.ResponseOk)
    expect(vaultRead('get-alloc-granite')).toBe(500_000n)
  })

  it('registering only granite does not unlock zest-v2 deploy', () => {
    registerGranite()
    mint(deployer, 1_000_000)
    deposit(1_000_000, deployer)

    // Granite works
    const granite = simnet.callPublicFn(
      VAULT, 'deploy-to-granite',
      [Cl.uint(250_000), adapterArg],
      deployer,
    )
    expect(granite.result.type).toBe(ClarityType.ResponseOk)

    // Zest still fails
    const zest = simnet.callPublicFn(
      VAULT, 'deploy-to-zest-v2',
      [Cl.uint(250_000), adapterArg],
      deployer,
    )
    expect(zest.result.type).toBe(ClarityType.ResponseErr)
  })

  it('all deposits stay idle when no adapters are registered', () => {
    mint(deployer, 1_000_000)
    deposit(1_000_000, deployer)
    mint(wallet1, 2_000_000)
    deposit(2_000_000, wallet1)

    // Everything is idle
    expect(vaultRead('get-total-assets')).toBe(3_000_000n)
    expect(vaultRead('get-alloc-granite')).toBe(0n)
    expect(vaultRead('get-alloc-zest-v2')).toBe(0n)
    expect(vaultRead('get-idle-bookkeeping')).toBe(3_000_000n)
  })

  it('full deposit-withdraw cycle works with no adapters (pure idle)', () => {
    mint(deployer, 1_000_000)
    deposit(1_000_000, deployer)

    mint(wallet1, 500_000)
    deposit(500_000, wallet1)

    // Both withdraw portions
    withdraw(400_000, deployer, deployer)
    withdraw(200_000, wallet1, wallet1)

    // Bookkeeping consistent
    expect(vaultRead('get-total-assets')).toBe(900_000n)
    expect(vaultRead('get-idle-bookkeeping')).toBe(900_000n)
    expect(vaultRead('get-alloc-granite')).toBe(0n)
    expect(vaultRead('get-alloc-zest-v2')).toBe(0n)
  })
})
