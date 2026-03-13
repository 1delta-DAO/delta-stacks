import { describe, it, expect } from 'vitest'
import { Cl, ClarityType } from '@stacks/transactions'
import type { Simnet } from '@stacks/clarinet-sdk'

declare global {
  const simnet: Simnet
}

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const accounts = simnet.getAccounts()
const deployer = accounts.get('deployer')!
const wallet1  = accounts.get('wallet_1')!
const wallet2  = accounts.get('wallet_2')!

const VAULT    = `${deployer}.vault-usdcx-v3`
const TOKEN    = `${deployer}.mock-token`
const ADAPTER1 = `${deployer}.mock-adapter`
const ADAPTER2 = `${deployer}.mock-adapter-2`

const graniteArg = Cl.contractPrincipal(deployer, 'mock-adapter')
const zestArg    = Cl.contractPrincipal(deployer, 'mock-adapter-2')
const tokenArg   = Cl.contractPrincipal(deployer, 'mock-token')

const VIRTUAL = 1_000_000n

function mint(to: string, amount: number | bigint) {
  simnet.callPublicFn(TOKEN, 'mint', [Cl.uint(amount), Cl.principal(to)], deployer)
}

function deposit(amount: number | bigint, owner: string) {
  return simnet.callPublicFn(
    VAULT, 'deposit',
    [Cl.uint(amount), Cl.principal(owner), tokenArg, graniteArg, zestArg],
    owner,
  )
}

function withdraw(amount: number | bigint, receiver: string, owner: string) {
  return simnet.callPublicFn(
    VAULT, 'withdraw',
    [Cl.uint(amount), Cl.principal(receiver), Cl.principal(owner), tokenArg, graniteArg, zestArg],
    owner,
  )
}

function redeem(shares: number | bigint, receiver: string, owner: string) {
  return simnet.callPublicFn(
    VAULT, 'redeem',
    [Cl.uint(shares), Cl.principal(receiver), Cl.principal(owner), tokenArg, graniteArg, zestArg],
    owner,
  )
}

function registerBoth() {
  simnet.callPublicFn(VAULT, 'register-adapter-granite-usdcx', [Cl.principal(ADAPTER1)], deployer)
  simnet.callPublicFn(VAULT, 'register-adapter-zest-v2-usdc', [Cl.principal(ADAPTER2)], deployer)
}

function uint(cv: { type: number; value: any }): bigint {
  if (cv.type === ClarityType.ResponseOk) return BigInt(cv.value.value)
  if (cv.type === ClarityType.ResponseErr) throw new Error(`Unexpected err: ${cv.value.value}`)
  return BigInt(cv.value)
}

function totalAssets(): bigint {
  return uint(simnet.callReadOnlyFn(VAULT, 'get-total-assets', [], deployer).result as any)
}

function totalSupply(): bigint {
  return uint(simnet.callReadOnlyFn(VAULT, 'get-total-supply', [], deployer).result as any)
}

function vaultShares(principal: string): bigint {
  return uint(simnet.callReadOnlyFn(VAULT, 'get-balance', [Cl.principal(principal)], deployer).result as any)
}

function tokenBalance(principal: string): bigint {
  return uint(simnet.callReadOnlyFn(TOKEN, 'get-balance', [Cl.principal(principal)], deployer).result as any)
}

/** Share price as [numerator, denominator] = [(total+V), (supply+V)] */
function sharePrice(): [bigint, bigint] {
  const total  = totalAssets()
  const supply = totalSupply()
  return [total + VIRTUAL, supply + VIRTUAL]
}

/** Ratio of two rational prices as a float */
function priceRatio(
  [n1, d1]: [bigint, bigint],
  [n2, d2]: [bigint, bigint],
): number {
  return Number(n1 * d2) / Number(n2 * d1)
}

// ===========================================================================
// 1. DONATION ATTACK RESISTANCE
// ===========================================================================

describe('vault-v3 security — donation attack resistance', () => {

  it('direct token transfer does not change share price', () => {
    mint(deployer, 10_000_000)
    deposit(1_000_000, deployer)

    const priceBefore = sharePrice()
    const totalBefore = totalAssets()

    // Donate 5M tokens directly to the vault contract
    const vaultPrincipal = VAULT.split('.')[0] + '.' + VAULT.split('.')[1]
    simnet.callPublicFn(TOKEN, 'transfer', [
      Cl.uint(5_000_000),
      Cl.principal(deployer),
      Cl.principal(vaultPrincipal),
      Cl.none(),
    ], deployer)

    const priceAfter = sharePrice()
    const totalAfter = totalAssets()

    // Bookkeeping total must not change
    expect(totalAfter).toBe(totalBefore)
    // Share price must not change
    expect(priceRatio(priceAfter, priceBefore)).toBe(1.0)
  })

  it('donation before first deposit does not benefit attacker', () => {
    mint(deployer, 10_000_000)
    mint(wallet1, 10_000_000)

    // Attacker donates 5M directly to vault before anyone deposits
    const vaultPrincipal = VAULT.split('.')[0] + '.' + VAULT.split('.')[1]
    simnet.callPublicFn(TOKEN, 'transfer', [
      Cl.uint(5_000_000),
      Cl.principal(deployer),
      Cl.principal(vaultPrincipal),
      Cl.none(),
    ], deployer)

    // First depositor gets fair shares (bookkeeping total is still 0)
    deposit(1_000_000, wallet1)
    const shares = vaultShares(wallet1)

    // With total=0, supply=0: shares = amount * (0+V) / (0+V) = amount = 1_000_000
    expect(shares).toBe(1_000_000n)
  })

  it('attacker cannot inflate share price via donation then withdraw', () => {
    mint(deployer, 10_000_000)

    // Deposit 1M
    deposit(1_000_000, deployer)
    const sharesBefore = vaultShares(deployer)
    const tokensBefore = tokenBalance(deployer)

    // Donate 2M directly
    const vaultPrincipal = VAULT.split('.')[0] + '.' + VAULT.split('.')[1]
    simnet.callPublicFn(TOKEN, 'transfer', [
      Cl.uint(2_000_000),
      Cl.principal(deployer),
      Cl.principal(vaultPrincipal),
      Cl.none(),
    ], deployer)

    // Redeem all shares — should only get back the deposited amount, not donated
    redeem(sharesBefore, deployer, deployer)
    const tokensAfter = tokenBalance(deployer)

    // Net result: deployer lost the 2M donation + at most a few units of rounding
    // They should get back ~1M from redeem (what they deposited), not 3M
    const redeemed = tokensAfter - tokensBefore + 2_000_000n // add back the donation cost
    expect(redeemed).toBeLessThanOrEqual(1_000_000n)
  })
})

// ===========================================================================
// 2. ROUNDING EXTRACTION RESISTANCE
// ===========================================================================

describe('vault-v3 security — rounding extraction resistance', () => {

  it('repeated deposit/redeem cycle cannot extract value', () => {
    mint(deployer, 10_000_000)
    mint(wallet1, 10_000_000)

    // Seed the vault with deployer's deposit
    deposit(5_000_000, deployer)

    const startBalance = tokenBalance(wallet1)

    // Wallet1 does 20 deposit/redeem cycles trying to extract rounding profit
    for (let i = 0; i < 20; i++) {
      deposit(100_000, wallet1)
      const shares = vaultShares(wallet1)
      if (shares > 0n) {
        redeem(shares, wallet1, wallet1)
      }
    }

    const endBalance = tokenBalance(wallet1)

    // Attacker should not profit — they lose dust on each cycle
    expect(endBalance).toBeLessThanOrEqual(startBalance)
  })

  it('repeated deposit/withdraw cycle cannot extract value', () => {
    mint(deployer, 10_000_000)
    mint(wallet1, 10_000_000)

    deposit(5_000_000, deployer)

    const startBalance = tokenBalance(wallet1)

    for (let i = 0; i < 20; i++) {
      deposit(100_000, wallet1)
      // Withdraw same amount
      const result = withdraw(100_000, wallet1, wallet1)
      if (result.result.type === ClarityType.ResponseErr) {
        // If withdraw fails (rounding means not enough shares), redeem remaining
        const shares = vaultShares(wallet1)
        if (shares > 0n) {
          redeem(shares, wallet1, wallet1)
        }
      }
    }

    const endBalance = tokenBalance(wallet1)
    expect(endBalance).toBeLessThanOrEqual(startBalance)
  })

  it('small deposit into large vault loses rounding dust', () => {
    mint(deployer, 100_000_000)
    mint(wallet1, 100)

    // Large existing vault
    deposit(100_000_000, deployer)

    // Very small deposit
    deposit(1, wallet1)
    const shares = vaultShares(wallet1)

    // Redeem those shares
    if (shares > 0n) {
      const balBefore = tokenBalance(wallet1)
      redeem(shares, wallet1, wallet1)
      const balAfter = tokenBalance(wallet1)
      const received = balAfter - balBefore

      // Should receive at most what was deposited (1), likely 0 due to rounding
      expect(received).toBeLessThanOrEqual(1n)
    }
    // If shares == 0, the deposit itself was rounded to zero shares — vault kept the asset
  })

  it('vault dust accumulates over many operations (never leaks)', () => {
    mint(deployer, 50_000_000)
    mint(wallet1, 50_000_000)

    deposit(10_000_000, deployer)

    // Many small operations
    for (let i = 0; i < 10; i++) {
      deposit(100_001, wallet1)  // odd amounts to maximize rounding
      const shares = vaultShares(wallet1)
      if (shares > 0n) {
        redeem(shares, wallet1, wallet1)
      }
    }

    // Total assets should be >= original deposit (rounding dust stays in vault)
    const total = totalAssets()
    expect(total).toBeGreaterThanOrEqual(10_000_000n)
  })
})

// ===========================================================================
// 3. SHARE PRICE MONOTONICITY
// ===========================================================================

describe('vault-v3 security — share price monotonicity', () => {

  it('share price never decreases through deposit/withdraw cycle', () => {
    registerBoth()
    mint(deployer, 50_000_000)
    mint(wallet1, 50_000_000)

    deposit(10_000_000, deployer)
    const p0 = sharePrice()

    // Deploy to markets
    simnet.callPublicFn(VAULT, 'deploy-to-granite', [Cl.uint(5_000_000), graniteArg], deployer)
    simnet.callPublicFn(VAULT, 'deploy-to-zest-v2', [Cl.uint(5_000_000), zestArg], deployer)
    const p1 = sharePrice()

    // Deploy is relocation — price should not change
    expect(priceRatio(p1, p0)).toBeCloseTo(1.0, 10)

    // Wallet1 deposits
    deposit(5_000_000, wallet1)
    const p2 = sharePrice()
    expect(priceRatio(p2, p1)).toBeGreaterThanOrEqual(0.9999)

    // Deployer partial withdraw
    withdraw(3_000_000, deployer, deployer)
    const p3 = sharePrice()
    expect(priceRatio(p3, p2)).toBeGreaterThanOrEqual(0.9999)

    // Wallet1 partial withdraw
    withdraw(2_000_000, wallet1, wallet1)
    const p4 = sharePrice()
    expect(priceRatio(p4, p3)).toBeGreaterThanOrEqual(0.9999)

    // Recall from market
    simnet.callPublicFn(VAULT, 'recall-from-granite', [Cl.uint(1_000_000), graniteArg], deployer)
    const p5 = sharePrice()
    expect(priceRatio(p5, p4)).toBeGreaterThanOrEqual(0.9999)
  })

  it('yield sync strictly increases share price', () => {
    registerBoth()
    mint(deployer, 10_000_000)

    deposit(5_000_000, deployer)
    simnet.callPublicFn(VAULT, 'deploy-to-granite', [Cl.uint(2_500_000), graniteArg], deployer)
    simnet.callPublicFn(VAULT, 'deploy-to-zest-v2', [Cl.uint(2_500_000), zestArg], deployer)

    const pBefore = sharePrice()

    // Simulate yield: mint tokens to adapter (increases its position)
    mint(ADAPTER1, 500_000)
    simnet.callPublicFn(VAULT, 'sync-granite', [graniteArg], deployer)

    const pAfter = sharePrice()

    // Price must strictly increase after yield
    expect(priceRatio(pAfter, pBefore)).toBeGreaterThan(1.0)
  })

  it('share price monotonic through full lifecycle with yield', () => {
    registerBoth()
    mint(deployer, 50_000_000)
    mint(wallet1, 50_000_000)

    const prices: [bigint, bigint][] = []

    // 1. Deposit
    deposit(10_000_000, deployer)
    prices.push(sharePrice())

    // 2. Deploy
    simnet.callPublicFn(VAULT, 'deploy-to-granite', [Cl.uint(5_000_000), graniteArg], deployer)
    simnet.callPublicFn(VAULT, 'deploy-to-zest-v2', [Cl.uint(5_000_000), zestArg], deployer)
    prices.push(sharePrice())

    // 3. Second deposit
    deposit(3_000_000, wallet1)
    prices.push(sharePrice())

    // 4. Yield on granite
    mint(ADAPTER1, 200_000)
    simnet.callPublicFn(VAULT, 'sync-granite', [graniteArg], deployer)
    prices.push(sharePrice())

    // 5. Withdraw
    withdraw(1_000_000, deployer, deployer)
    prices.push(sharePrice())

    // 6. More yield on zest
    mint(ADAPTER2, 150_000)
    simnet.callPublicFn(VAULT, 'sync-zest-v2', [zestArg], deployer)
    prices.push(sharePrice())

    // 7. Recall
    simnet.callPublicFn(VAULT, 'recall-from-granite', [Cl.uint(500_000), graniteArg], deployer)
    prices.push(sharePrice())

    // 8. Another withdraw
    withdraw(500_000, wallet1, wallet1)
    prices.push(sharePrice())

    // Verify monotonicity: each price >= previous (within rounding tolerance)
    for (let i = 1; i < prices.length; i++) {
      const ratio = priceRatio(prices[i], prices[i - 1])
      expect(ratio).toBeGreaterThanOrEqual(0.9999)
    }

    // Overall price should have increased due to yield events
    const overallRatio = priceRatio(prices[prices.length - 1], prices[0])
    expect(overallRatio).toBeGreaterThan(1.001)
  })
})

// ===========================================================================
// 4. VIRTUAL OFFSET PROTECTION
// ===========================================================================

describe('vault-v3 security — virtual offset protection', () => {

  it('first depositor gets ~1:1 shares (no inflation exploit on empty vault)', () => {
    mint(wallet1, 1_000_000)

    deposit(1_000_000, wallet1)
    const shares = vaultShares(wallet1)

    // With empty vault: shares = amount * (0+V) / (0+V) = amount
    expect(shares).toBe(1_000_000n)
  })

  it('first depositor cannot monopolize shares with tiny deposit', () => {
    mint(deployer, 1)
    mint(wallet1, 1_000_000)

    // Deployer deposits 1 unit
    deposit(1, deployer)
    const deployerShares = vaultShares(deployer)
    expect(deployerShares).toBe(1n)

    // Wallet1 deposits 1M — should get ~1M shares, not manipulated
    deposit(1_000_000, wallet1)
    const wallet1Shares = vaultShares(wallet1)

    // Ratio of shares should closely match ratio of deposits
    // wallet1 deposited 1M x more, so should have ~1M x more shares
    const ratio = Number(wallet1Shares) / Number(deployerShares)
    expect(ratio).toBeGreaterThan(999_000) // at least ~999K:1
    expect(ratio).toBeLessThanOrEqual(1_000_000)
  })

  it('virtual offset prevents share price manipulation with small supply', () => {
    mint(deployer, 100)

    // Deposit a tiny amount
    deposit(100, deployer)

    const [total, supply] = sharePrice()
    const price = Number(total) / Number(supply)

    // Price should be very close to 1.0 because V dominates
    // (100 + 1_000_000) / (100 + 1_000_000) = 1.0 exactly
    expect(price).toBeCloseTo(1.0, 5)
  })
})

// ===========================================================================
// 5. ACCESS CONTROL
// ===========================================================================

describe('vault-v3 security — access control', () => {

  it('non-owner cannot withdraw on behalf of another user', () => {
    mint(deployer, 1_000_000)
    deposit(1_000_000, deployer)

    // wallet1 tries to withdraw deployer's funds
    const result = simnet.callPublicFn(
      VAULT, 'withdraw',
      [Cl.uint(500_000), Cl.principal(wallet1), Cl.principal(deployer), tokenArg, graniteArg, zestArg],
      wallet1,  // caller is wallet1, but owner is deployer
    )
    expect(result.result.type).toBe(ClarityType.ResponseErr)
  })

  it('non-owner cannot redeem on behalf of another user', () => {
    mint(deployer, 1_000_000)
    deposit(1_000_000, deployer)

    const result = simnet.callPublicFn(
      VAULT, 'redeem',
      [Cl.uint(500_000), Cl.principal(wallet1), Cl.principal(deployer), tokenArg, graniteArg, zestArg],
      wallet1,
    )
    expect(result.result.type).toBe(ClarityType.ResponseErr)
  })

  it('non-allocator cannot deploy to markets', () => {
    registerBoth()
    mint(deployer, 5_000_000)
    deposit(5_000_000, deployer)

    const result = simnet.callPublicFn(
      VAULT, 'deploy-to-granite',
      [Cl.uint(1_000_000), graniteArg],
      wallet1,  // not the allocator
    )
    expect(result.result.type).toBe(ClarityType.ResponseErr)
  })

  it('non-allocator cannot recall from markets', () => {
    registerBoth()
    mint(deployer, 5_000_000)
    deposit(5_000_000, deployer)
    simnet.callPublicFn(VAULT, 'deploy-to-granite', [Cl.uint(2_000_000), graniteArg], deployer)

    const result = simnet.callPublicFn(
      VAULT, 'recall-from-granite',
      [Cl.uint(1_000_000), graniteArg],
      wallet1,
    )
    expect(result.result.type).toBe(ClarityType.ResponseErr)
  })

  it('non-allocator cannot reallocate', () => {
    registerBoth()
    mint(deployer, 5_000_000)
    deposit(5_000_000, deployer)
    simnet.callPublicFn(VAULT, 'deploy-to-granite', [Cl.uint(2_000_000), graniteArg], deployer)

    const result = simnet.callPublicFn(
      VAULT, 'reallocate',
      [Cl.uint(1_000_000), Cl.uint(0), Cl.uint(0), Cl.uint(1_000_000), graniteArg, zestArg],
      wallet1,
    )
    expect(result.result.type).toBe(ClarityType.ResponseErr)
  })

  it('non-owner cannot change vault owner', () => {
    const result = simnet.callPublicFn(
      VAULT, 'set-vault-owner',
      [Cl.principal(wallet1)],
      wallet1,
    )
    expect(result.result.type).toBe(ClarityType.ResponseErr)
  })

  it('non-owner cannot set fees', () => {
    const result = simnet.callPublicFn(
      VAULT, 'set-fee-bps',
      [Cl.uint(500)],
      wallet1,
    )
    expect(result.result.type).toBe(ClarityType.ResponseErr)
  })
})
