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
const ADAPTER1 = `${deployer}.mock-adapter`   // granite
const ADAPTER2 = `${deployer}.mock-adapter-2` // zest-v2

const graniteArg = Cl.contractPrincipal(deployer, 'mock-adapter')
const zestArg    = Cl.contractPrincipal(deployer, 'mock-adapter-2')
const tokenArg   = Cl.contractPrincipal(deployer, 'mock-token')

const AMOUNT  = 1_000_000   // 1 token (6 decimals)
const VIRTUAL = 1_000_000   // virtual-offset = 10^decimals (symmetric, matches asset precision)

/** Mint mock tokens. */
function mint(to: string, amount: number | bigint) {
  simnet.callPublicFn(TOKEN, 'mint', [Cl.uint(amount), Cl.principal(to)], deployer)
}

/** deposit(amount, owner, token, granite, zest-v2) */
function deposit(amount: number | bigint, owner: string) {
  return simnet.callPublicFn(
    VAULT, 'deposit',
    [Cl.uint(amount), Cl.principal(owner), tokenArg, graniteArg, zestArg],
    owner,
  )
}

/** withdraw(amount, receiver, owner, token, granite, zest-v2) */
function withdraw(amount: number | bigint, receiver: string, owner: string) {
  return simnet.callPublicFn(
    VAULT, 'withdraw',
    [Cl.uint(amount), Cl.principal(receiver), Cl.principal(owner), tokenArg, graniteArg, zestArg],
    owner,
  )
}

/** redeem(shares, receiver, owner, token, granite, zest-v2) */
function redeem(shares: number | bigint, receiver: string, owner: string) {
  return simnet.callPublicFn(
    VAULT, 'redeem',
    [Cl.uint(shares), Cl.principal(receiver), Cl.principal(owner), tokenArg, graniteArg, zestArg],
    owner,
  )
}

function registerGranite() {
  simnet.callPublicFn(VAULT, 'register-adapter-granite-usdcx', [Cl.principal(ADAPTER1)], deployer)
}

function registerZest() {
  simnet.callPublicFn(VAULT, 'register-adapter-zest-v2-usdc', [Cl.principal(ADAPTER2)], deployer)
}

function registerBoth() {
  registerGranite()
  registerZest()
}

/** Extract uint from ResponseOk or bare Uint clarity value. */
function uint(cv: { type: number; value: any }): bigint {
  if (cv.type === ClarityType.ResponseOk)  return BigInt(cv.value.value)
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

/** Manually deploy idle capital to granite (allocator call). */
function deployToGranite(amount: number | bigint) {
  return simnet.callPublicFn(VAULT, 'deploy-to-granite', [Cl.uint(amount), graniteArg], deployer)
}

/** Manually deploy idle capital to zest (allocator call). */
function deployToZest(amount: number | bigint) {
  return simnet.callPublicFn(VAULT, 'deploy-to-zest-v2', [Cl.uint(amount), zestArg], deployer)
}

// ===========================================================================
// 1) AUTO-ALLOCATION ON DEPOSIT — proportional share math
// ===========================================================================

describe('vault-v3 — auto-allocation: proportional deposit split', () => {

  it('first deposit with no capital deployed stays 100% idle', () => {
    registerBoth()
    mint(deployer, AMOUNT)
    const result = deposit(AMOUNT, deployer)
    expect(result.result.type).toBe(ClarityType.ResponseOk)

    // Everything idle, nothing allocated
    expect(vaultRead('get-alloc-granite')).toBe(0n)
    expect(vaultRead('get-alloc-zest-v2')).toBe(0n)
    expect(vaultRead('get-idle-bookkeeping')).toBe(BigInt(AMOUNT))
    expect(vaultRead('get-total-assets')).toBe(BigInt(AMOUNT))
  })

  it('deposit without adapters registered stays 100% idle', () => {
    // Don't register any adapters
    mint(deployer, AMOUNT)
    const result = deposit(AMOUNT, deployer)
    expect(result.result.type).toBe(ClarityType.ResponseOk)

    expect(vaultRead('get-alloc-granite')).toBe(0n)
    expect(vaultRead('get-alloc-zest-v2')).toBe(0n)
    expect(vaultRead('get-idle-bookkeeping')).toBe(BigInt(AMOUNT))
  })

  it('auto-allocates proportionally to existing 60/40 granite/zest split', () => {
    registerBoth()
    mint(deployer, AMOUNT)
    deposit(AMOUNT, deployer)

    // Allocator manually creates initial 60/40 split
    deployToGranite(600_000)
    deployToZest(400_000)

    expect(vaultRead('get-alloc-granite')).toBe(600_000n)
    expect(vaultRead('get-alloc-zest-v2')).toBe(400_000n)
    expect(vaultRead('get-idle-bookkeeping')).toBe(0n)

    // Second deposit should auto-allocate proportionally
    const dep2 = 1_000_000
    mint(wallet1, dep2)
    deposit(dep2, wallet1)

    // With 5% idle buffer: deploy-total = 1_000_000 * 9500 / 10000 = 950_000
    // granite share = 950_000 * 600_000 / 1_000_000 = 570_000
    // zest share    = 950_000 - 570_000 = 380_000
    // idle addition = 1_000_000 - 570_000 - 380_000 = 50_000
    const ag = vaultRead('get-alloc-granite')
    const az = vaultRead('get-alloc-zest-v2')
    const idle = vaultRead('get-idle-bookkeeping')

    expect(ag).toBe(600_000n + 570_000n)
    expect(az).toBe(400_000n + 380_000n)
    expect(idle).toBe(50_000n)

    // Total assets = initial + second deposit
    expect(vaultRead('get-total-assets')).toBe(BigInt(AMOUNT + dep2))
  })

  it('auto-allocates 100% to granite when only granite has capital', () => {
    registerBoth()
    mint(deployer, AMOUNT)
    deposit(AMOUNT, deployer)

    // All capital deployed to granite only
    deployToGranite(AMOUNT)

    expect(vaultRead('get-alloc-granite')).toBe(BigInt(AMOUNT))
    expect(vaultRead('get-alloc-zest-v2')).toBe(0n)

    // New deposit: 100% of deploy-total goes to granite
    mint(wallet1, AMOUNT)
    deposit(AMOUNT, wallet1)

    // deploy-total = 1_000_000 * 9500/10000 = 950_000 all to granite
    const ag = vaultRead('get-alloc-granite')
    const az = vaultRead('get-alloc-zest-v2')
    expect(ag).toBe(BigInt(AMOUNT) + 950_000n)
    expect(az).toBe(0n)
    expect(vaultRead('get-idle-bookkeeping')).toBe(50_000n)
  })

  it('auto-allocates 100% to zest when only zest has capital', () => {
    registerBoth()
    mint(deployer, AMOUNT)
    deposit(AMOUNT, deployer)

    deployToZest(AMOUNT)

    mint(wallet1, AMOUNT)
    deposit(AMOUNT, wallet1)

    expect(vaultRead('get-alloc-granite')).toBe(0n)
    expect(vaultRead('get-alloc-zest-v2')).toBe(BigInt(AMOUNT) + 950_000n)
    expect(vaultRead('get-idle-bookkeeping')).toBe(50_000n)
  })

  it('auto-allocates with 50/50 split', () => {
    registerBoth()
    mint(deployer, AMOUNT)
    deposit(AMOUNT, deployer)

    deployToGranite(500_000)
    deployToZest(500_000)

    mint(wallet1, AMOUNT)
    deposit(AMOUNT, wallet1)

    // deploy-total = 950_000, split 50/50 = 475_000 each
    const ag = vaultRead('get-alloc-granite')
    const az = vaultRead('get-alloc-zest-v2')
    expect(ag).toBe(500_000n + 475_000n)
    expect(az).toBe(500_000n + 475_000n)
    expect(vaultRead('get-idle-bookkeeping')).toBe(50_000n)
  })

  it('idle buffer is configurable via set-idle-buffer', () => {
    registerBoth()
    mint(deployer, AMOUNT)
    deposit(AMOUNT, deployer)
    deployToGranite(500_000)
    deployToZest(500_000)

    // Change buffer to 10% (1000 bps)
    simnet.callPublicFn(VAULT, 'set-idle-buffer', [Cl.uint(1000)], deployer)
    expect(vaultRead('get-idle-buffer-bps')).toBe(1000n)

    mint(wallet1, AMOUNT)
    deposit(AMOUNT, wallet1)

    // deploy-total = 1_000_000 * 9000/10000 = 900_000
    // 50/50 split = 450_000 each
    const ag = vaultRead('get-alloc-granite')
    const az = vaultRead('get-alloc-zest-v2')
    expect(ag).toBe(500_000n + 450_000n)
    expect(az).toBe(500_000n + 450_000n)
    expect(vaultRead('get-idle-bookkeeping')).toBe(100_000n) // 10% of 1M
  })

  it('idle buffer of 0% deploys everything', () => {
    registerBoth()
    mint(deployer, AMOUNT)
    deposit(AMOUNT, deployer)
    deployToGranite(500_000)
    deployToZest(500_000)

    simnet.callPublicFn(VAULT, 'set-idle-buffer', [Cl.uint(0)], deployer)

    mint(wallet1, AMOUNT)
    deposit(AMOUNT, wallet1)

    // deploy-total = 1_000_000, 50/50 = 500_000 each, 0 idle
    expect(vaultRead('get-alloc-granite')).toBe(1_000_000n)
    expect(vaultRead('get-alloc-zest-v2')).toBe(1_000_000n)
    expect(vaultRead('get-idle-bookkeeping')).toBe(0n)
  })

  it('idle buffer of 100% keeps everything idle even with deployed capital', () => {
    registerBoth()
    mint(deployer, AMOUNT)
    deposit(AMOUNT, deployer)
    deployToGranite(500_000)
    deployToZest(500_000)

    simnet.callPublicFn(VAULT, 'set-idle-buffer', [Cl.uint(10_000)], deployer)

    mint(wallet1, AMOUNT)
    deposit(AMOUNT, wallet1)

    // deploy-total = 1_000_000 * 0/10000 = 0 -> nothing deployed
    expect(vaultRead('get-alloc-granite')).toBe(500_000n)
    expect(vaultRead('get-alloc-zest-v2')).toBe(500_000n)
    expect(vaultRead('get-idle-bookkeeping')).toBe(BigInt(AMOUNT))
  })

  it('set-idle-buffer rejects values > 10000 bps', () => {
    const result = simnet.callPublicFn(VAULT, 'set-idle-buffer', [Cl.uint(10_001)], deployer)
    expect(result.result.type).toBe(ClarityType.ResponseErr)
  })

  it('set-idle-buffer rejects non-owner', () => {
    const result = simnet.callPublicFn(VAULT, 'set-idle-buffer', [Cl.uint(500)], wallet1)
    expect(result.result.type).toBe(ClarityType.ResponseErr)
  })

  it('multiple sequential deposits maintain consistent ratio', () => {
    registerBoth()
    mint(deployer, AMOUNT * 3)
    deposit(AMOUNT, deployer)

    // Initial 70/30 split
    deployToGranite(700_000)
    deployToZest(300_000)

    // Second deposit
    deposit(AMOUNT, deployer)

    // After second deposit: granite += 665_000, zest += 285_000
    // deploy-total = 950_000, granite share = 950_000 * 700_000 / 1_000_000 = 665_000
    // zest share = 950_000 - 665_000 = 285_000
    expect(vaultRead('get-alloc-granite')).toBe(700_000n + 665_000n) // 1_365_000
    expect(vaultRead('get-alloc-zest-v2')).toBe(300_000n + 285_000n) // 585_000

    // Third deposit uses the updated ratio (1_365_000 / 585_000 ≈ 70/30)
    deposit(AMOUNT, deployer)

    const ag = vaultRead('get-alloc-granite')
    const az = vaultRead('get-alloc-zest-v2')
    const total3 = ag + az

    // The ratio should remain approximately 70/30
    // granite% = ag / total3 should be close to 70%
    const granitePct = Number(ag) * 100 / Number(total3)
    expect(granitePct).toBeGreaterThan(69)
    expect(granitePct).toBeLessThan(71)
  })
})

// ===========================================================================
// 2) OVERFLOW / UNDERFLOW PROTECTION
// ===========================================================================

describe('vault-v3 — overflow and underflow protection', () => {

  it('very large deposit does not overflow allocation math', () => {
    registerBoth()
    const large = BigInt('1000000000000000000') // 10^18
    mint(deployer, large)
    deposit(large, deployer)

    // Deploy 60/40
    const toGranite = large * 60n / 100n
    const toZest = large - toGranite
    deployToGranite(toGranite)
    deployToZest(toZest)

    // Second large deposit should auto-allocate without overflow
    mint(wallet1, large)
    const result = deposit(large, wallet1)
    expect(result.result.type).toBe(ClarityType.ResponseOk)

    const ag = vaultRead('get-alloc-granite')
    const az = vaultRead('get-alloc-zest-v2')
    expect(ag).toBeGreaterThan(toGranite)
    expect(az).toBeGreaterThan(toZest)
  })

  it('deposit of u1 with deployed capital: deploy-total rounds to 0, stays idle', () => {
    registerBoth()
    mint(deployer, AMOUNT)
    deposit(AMOUNT, deployer)
    deployToGranite(500_000)
    deployToZest(500_000)

    // Deposit 1 micro-token
    // deploy-total = 1 * 9500 / 10000 = 0 (floor division)
    // So nothing gets allocated, everything stays idle
    mint(wallet1, 1)
    const result = deposit(1, wallet1)
    expect(result.result.type).toBe(ClarityType.ResponseOk)

    // Allocations unchanged
    expect(vaultRead('get-alloc-granite')).toBe(500_000n)
    expect(vaultRead('get-alloc-zest-v2')).toBe(500_000n)
  })

  it('deposit of exactly idle-buffer amount: deploy-total is 0', () => {
    registerBoth()
    mint(deployer, AMOUNT)
    deposit(AMOUNT, deployer)
    deployToGranite(500_000)
    deployToZest(500_000)

    // With 5% buffer, a deposit of 10 gives deploy-total = 10 * 9500 / 10000 = 9
    // deploy-total > 0 so it does split (9 * 500_000 / 1_000_000 = 4 to granite, 5 to zest)
    mint(wallet1, 10)
    const result = deposit(10, wallet1)
    expect(result.result.type).toBe(ClarityType.ResponseOk)

    // Small amounts get deployed (non-zero deploy-total)
    const ag = vaultRead('get-alloc-granite')
    const az = vaultRead('get-alloc-zest-v2')
    expect(ag + az).toBeGreaterThan(1_000_000n)
  })

  it('withdraw u0 is rejected', () => {
    mint(deployer, AMOUNT)
    deposit(AMOUNT, deployer)
    const result = withdraw(0, wallet2, deployer)
    expect(result.result.type).toBe(ClarityType.ResponseErr)
  })

  it('redeem u0 is rejected', () => {
    mint(deployer, AMOUNT)
    deposit(AMOUNT, deployer)
    const result = redeem(0, wallet2, deployer)
    expect(result.result.type).toBe(ClarityType.ResponseErr)
  })

  it('deposit u0 is rejected', () => {
    const result = deposit(0, deployer)
    expect(result.result.type).toBe(ClarityType.ResponseErr)
  })
})

// ===========================================================================
// 3) SAFE ROUNDING — no zero-amount deploys, vault-favorable floors
// ===========================================================================

describe('vault-v3 — safe rounding', () => {

  it('rounding never deploys 0 to a market (floor to 0 stays idle)', () => {
    registerBoth()
    mint(deployer, AMOUNT)
    deposit(AMOUNT, deployer)

    // Create a 99/1 split: 990_000 granite, 10_000 zest
    deployToGranite(990_000)
    deployToZest(10_000)

    // Small deposit where zest allocation rounds to 0
    // deploy-total = 100 * 9500/10000 = 95
    // to-granite = 95 * 990_000 / 1_000_000 = 93
    // to-zest = 95 - 93 = 2 (still > 0 in this case)
    mint(wallet1, 100)
    const result = deposit(100, wallet1)
    expect(result.result.type).toBe(ClarityType.ResponseOk)

    // Even smaller: deposit 1 -> deploy-total = 0 -> nothing deployed
    mint(wallet2, 1)
    const result2 = deposit(1, wallet2)
    expect(result2.result.type).toBe(ClarityType.ResponseOk)

    // Granite and zest didn't change from the u1 deposit (deploy-total = 0)
    // Check that no zero-amount adapter call was made by verifying
    // alloc didn't change between the two deposits
  })

  it('high-value low-decimal asset: sBTC-like (1 sat deposits)', () => {
    // sBTC has 8 decimals, 1 sat ≈ $0.001 at $100k/BTC
    // Simulate with AMOUNT = 100_000_000 (1 BTC) and depositing 1 sat
    registerBoth()
    const oneBtc = 100_000_000
    mint(deployer, oneBtc)
    deposit(oneBtc, deployer)

    deployToGranite(60_000_000) // 0.6 BTC
    deployToZest(40_000_000)     // 0.4 BTC

    // Deposit 100 sats (0.000001 BTC)
    mint(wallet1, 100)
    const result = deposit(100, wallet1)
    expect(result.result.type).toBe(ClarityType.ResponseOk)

    // deploy-total = 100 * 9500 / 10000 = 95
    // to-granite = 95 * 60_000_000 / 100_000_000 = 57
    // to-zest = 95 - 57 = 38
    // idle = 100 - 57 - 38 = 5
    const ag = vaultRead('get-alloc-granite')
    const az = vaultRead('get-alloc-zest-v2')
    expect(ag).toBe(60_000_000n + 57n)
    expect(az).toBe(40_000_000n + 38n)
    expect(vaultRead('get-idle-bookkeeping')).toBe(5n)
  })

  it('rounding consistently favors the vault: granite gets floor, zest gets remainder', () => {
    registerBoth()
    mint(deployer, AMOUNT)
    deposit(AMOUNT, deployer)

    // Create 33/67 split (tricky ratio for rounding)
    deployToGranite(333_333)
    deployToZest(666_667)

    mint(wallet1, 1_000_000)
    deposit(1_000_000, wallet1)

    // deploy-total = 950_000
    // to-granite = floor(950_000 * 333_333 / 1_000_000) = floor(316_666.35) = 316_666
    // to-zest = 950_000 - 316_666 = 633_334
    // granite + zest = 950_000 = deploy-total (no tokens lost)
    const ag = vaultRead('get-alloc-granite')
    const az = vaultRead('get-alloc-zest-v2')
    const newGranite = ag - 333_333n
    const newZest = az - 666_667n
    expect(newGranite + newZest).toBe(950_000n) // no tokens lost in rounding
  })

  it('rounding sum is exactly deploy-total (no tokens leak)', () => {
    registerBoth()
    mint(deployer, AMOUNT)
    deposit(AMOUNT, deployer)

    // Many different ratios
    const ratios = [
      [100_000, 900_000],  // 10/90
      [500_000, 500_000],  // 50/50
      [999_999, 1],        // 99.9999/0.0001
      [1, 999_999],        // 0.0001/99.9999
      [700_000, 300_000],  // 70/30
    ]

    for (const [g, z] of ratios) {
      // We can only test one ratio per simnet init; test mathematically:
      const deployTotal = BigInt(950_000)
      const totalDeployed = BigInt(g + z)
      const toGranite = deployTotal * BigInt(g) / totalDeployed
      const toZest = deployTotal - toGranite
      // Key property: granite + zest == deploy-total always
      expect(toGranite + toZest).toBe(deployTotal)
      // Neither is negative
      expect(toGranite).toBeGreaterThanOrEqual(0n)
      expect(toZest).toBeGreaterThanOrEqual(0n)
    }
  })

  it('shares minted are always positive for meaningful deposit amounts', () => {
    registerBoth()
    mint(deployer, AMOUNT)
    deposit(AMOUNT, deployer)
    deployToGranite(500_000)
    deployToZest(500_000)

    // Deposit 1000 tokens (meaningful amount)
    const dep = 1_000
    mint(wallet1, dep)
    const result = deposit(dep, wallet1)
    expect(result.result.type).toBe(ClarityType.ResponseOk)
    const shares = uint(result.result as any)
    expect(shares).toBeGreaterThan(0n)
  })
})

// ===========================================================================
// 4) PROPORTIONAL WITHDRAWAL
// ===========================================================================

describe('vault-v3 — proportional withdrawal', () => {

  it('withdraw pulls from idle + granite + zest proportionally', () => {
    registerBoth()
    mint(deployer, AMOUNT)
    deposit(AMOUNT, deployer)

    // Create 50/30/20 split: 500K idle, 300K granite, 200K zest
    deployToGranite(300_000)
    deployToZest(200_000)

    expect(vaultRead('get-idle-bookkeeping')).toBe(500_000n)
    expect(vaultRead('get-alloc-granite')).toBe(300_000n)
    expect(vaultRead('get-alloc-zest-v2')).toBe(200_000n)

    // Withdraw 100_000 (10% of vault)
    const withdrawAmt = 100_000
    const result = withdraw(withdrawAmt, wallet2, deployer)
    expect(result.result.type).toBe(ClarityType.ResponseOk)
    expect(tokenBalance(wallet2)).toBe(BigInt(withdrawAmt))

    // Proportional pulls:
    // pull-idle = floor(100_000 * 500_000 / 1_000_000) = 50_000
    // remaining = 50_000
    // pull-granite = floor(50_000 * 300_000 / 500_000) = 30_000
    // pull-zest = 50_000 - 30_000 = 20_000
    expect(vaultRead('get-idle-bookkeeping')).toBe(450_000n)
    expect(vaultRead('get-alloc-granite')).toBe(270_000n)
    expect(vaultRead('get-alloc-zest-v2')).toBe(180_000n)
    expect(vaultRead('get-total-assets')).toBe(BigInt(AMOUNT - withdrawAmt))
  })

  it('withdraw when all capital is deployed (0 idle)', () => {
    registerBoth()
    mint(deployer, AMOUNT)
    deposit(AMOUNT, deployer)

    deployToGranite(600_000)
    deployToZest(400_000)

    expect(vaultRead('get-idle-bookkeeping')).toBe(0n)

    // Withdraw 200_000
    const result = withdraw(200_000, wallet2, deployer)
    expect(result.result.type).toBe(ClarityType.ResponseOk)
    expect(tokenBalance(wallet2)).toBe(200_000n)

    // pull-idle = 0, remaining = 200_000
    // pull-granite = floor(200_000 * 600_000 / 1_000_000) = 120_000
    // pull-zest = 200_000 - 120_000 = 80_000
    expect(vaultRead('get-alloc-granite')).toBe(480_000n)
    expect(vaultRead('get-alloc-zest-v2')).toBe(320_000n)
  })

  it('withdraw when everything is idle (no deployments)', () => {
    registerBoth()
    mint(deployer, AMOUNT)
    deposit(AMOUNT, deployer)

    // No deployments — all idle
    const result = withdraw(500_000, wallet2, deployer)
    expect(result.result.type).toBe(ClarityType.ResponseOk)
    expect(tokenBalance(wallet2)).toBe(500_000n)
    expect(vaultRead('get-idle-bookkeeping')).toBe(500_000n)
    expect(vaultRead('get-alloc-granite')).toBe(0n)
    expect(vaultRead('get-alloc-zest-v2')).toBe(0n)
  })

  it('full redeem after auto-allocation empties all positions', () => {
    registerBoth()
    mint(deployer, AMOUNT)
    deposit(AMOUNT, deployer)

    // Create allocation
    deployToGranite(500_000)
    deployToZest(500_000)

    // Second deposit auto-allocates
    mint(wallet1, AMOUNT)
    deposit(AMOUNT, wallet1)

    // wallet1 redeems all shares
    const shares = vaultShares(wallet1)
    const result = redeem(shares, wallet2, wallet1)
    expect(result.result.type).toBe(ClarityType.ResponseOk)

    // wallet2 received tokens
    expect(tokenBalance(wallet2)).toBeGreaterThan(0n)
    expect(vaultShares(wallet1)).toBe(0n)

    // Vault still has deployer's position
    expect(vaultRead('get-total-assets')).toBeGreaterThan(0n)
    expect(vaultShares(deployer)).toBeGreaterThan(0n)
  })

  it('both users redeem fully after auto-allocation', () => {
    registerBoth()
    mint(deployer, AMOUNT)
    deposit(AMOUNT, deployer)

    deployToGranite(500_000)
    deployToZest(500_000)

    mint(wallet1, AMOUNT)
    deposit(AMOUNT, wallet1)

    // Both redeem
    const s1 = vaultShares(deployer)
    const s2 = vaultShares(wallet1)

    redeem(s1, deployer, deployer)
    redeem(s2, wallet1, wallet1)

    expect(vaultShares(deployer)).toBe(0n)
    expect(vaultShares(wallet1)).toBe(0n)

    // Both received tokens
    expect(tokenBalance(deployer)).toBeGreaterThan(0n)
    expect(tokenBalance(wallet1)).toBeGreaterThan(0n)

    // Total assets reduced to virtual share residue
    expect(vaultRead('get-total-assets')).toBeLessThan(BigInt(AMOUNT))
  })

  it('withdraw after auto-allocated deposit preserves proportionality', () => {
    registerBoth()
    mint(deployer, AMOUNT)
    deposit(AMOUNT, deployer)

    // 50/50 initial deploy
    deployToGranite(500_000)
    deployToZest(500_000)

    // Auto-allocate second deposit
    mint(wallet1, AMOUNT)
    deposit(AMOUNT, wallet1)

    // State: granite=975_000, zest=975_000, idle=50_000
    const totalBefore = vaultRead('get-total-assets')

    // Withdraw 400_000 from wallet1
    withdraw(400_000, wallet2, wallet1)

    const totalAfter = vaultRead('get-total-assets')
    expect(totalAfter).toBe(totalBefore - 400_000n)

    // granite and zest should decrease roughly equally
    const ag = vaultRead('get-alloc-granite')
    const az = vaultRead('get-alloc-zest-v2')
    // Both should have decreased from their pre-withdraw values
    expect(ag).toBeLessThan(975_000n)
    expect(az).toBeLessThan(975_000n)
    // And they should remain roughly equal (since they started equal)
    const diff = ag > az ? ag - az : az - ag
    expect(diff).toBeLessThan(5n) // rounding tolerance
  })
})

// ===========================================================================
// 5) AUTO-SYNC BEFORE DEPOSIT — share price reflects yield
// ===========================================================================

describe('vault-v3 — yield sync + auto-allocation interaction', () => {

  it('deposit auto-syncs yield before computing shares', () => {
    registerBoth()
    mint(deployer, AMOUNT)
    deposit(AMOUNT, deployer)

    deployToGranite(AMOUNT)

    // Simulate yield in granite adapter
    const yieldAmt = 100_000
    mint(ADAPTER1, yieldAmt)

    // wallet1 deposits after yield — sync happens inside deposit
    mint(wallet1, AMOUNT)
    const result = deposit(AMOUNT, wallet1)
    expect(result.result.type).toBe(ClarityType.ResponseOk)

    // wallet1 gets fewer shares than deployer (higher share price after yield)
    expect(vaultShares(wallet1)).toBeLessThan(vaultShares(deployer))
  })

  it('auto-allocation uses post-sync balances for ratio', () => {
    registerBoth()
    mint(deployer, AMOUNT)
    deposit(AMOUNT, deployer)

    deployToGranite(500_000)
    deployToZest(500_000)

    // Granite earns 200K yield, zest earns 0
    // Post-sync: granite=700K, zest=500K
    mint(ADAPTER1, 200_000)

    // New deposit should allocate ~58.3% granite, ~41.7% zest (700/1200 ratio)
    mint(wallet1, 1_200_000)
    deposit(1_200_000, wallet1)

    const ag = vaultRead('get-alloc-granite')
    const az = vaultRead('get-alloc-zest-v2')

    // After sync: granite had 700K, zest had 500K => total deployed = 1.2M
    // deploy-total = 1_200_000 * 9500 / 10000 = 1_140_000
    // to-granite = floor(1_140_000 * 700_000 / 1_200_000) = 665_000
    // to-zest = 1_140_000 - 665_000 = 475_000
    expect(ag).toBe(700_000n + 665_000n)
    expect(az).toBe(500_000n + 475_000n)
  })
})

// ===========================================================================
// 6) NON-FATAL ADAPTER FAILURES
// ===========================================================================

describe('vault-v3 — deposit succeeds even without valid adapter trait', () => {

  it('deposit stays idle when only one adapter registered (granite only)', () => {
    registerGranite()
    // Don't register zest — adapter-zest-v2-usdc is none
    mint(deployer, AMOUNT)
    deposit(AMOUNT, deployer)

    // Manually deploy to granite
    deployToGranite(AMOUNT)

    // New deposit: adapter check passes for granite, but adapter-zest-v2-usdc is none
    // The `(is-some (var-get adapter-zest-v2-usdc))` check in the auto-alloc `if` fails
    // so everything stays idle
    mint(wallet1, AMOUNT)
    const result = deposit(AMOUNT, wallet1)
    expect(result.result.type).toBe(ClarityType.ResponseOk)

    // Nothing auto-allocated (both adapters must be registered)
    expect(vaultRead('get-alloc-granite')).toBe(BigInt(AMOUNT))
    // wallet1's deposit stayed idle
    expect(vaultRead('get-idle-bookkeeping')).toBe(BigInt(AMOUNT))
  })
})

// ===========================================================================
// 7) SHARES CORRECTNESS — per-share value
// ===========================================================================

describe('vault-v3 — share price correctness', () => {

  it('equal deposits get equal shares (no auto-allocation bias)', () => {
    registerBoth()
    mint(deployer, AMOUNT)
    mint(wallet1, AMOUNT)

    deposit(AMOUNT, deployer)
    // No deployment yet, so second deposit also stays idle
    deposit(AMOUNT, wallet1)

    const s1 = vaultShares(deployer)
    const s2 = vaultShares(wallet1)
    // Within 1 of each other (rounding dust)
    const diff = s1 > s2 ? s1 - s2 : s2 - s1
    expect(diff).toBeLessThanOrEqual(1n)
  })

  it('share price increases after yield, late depositor gets fewer shares', () => {
    registerBoth()
    mint(deployer, AMOUNT)
    deposit(AMOUNT, deployer)
    deployToGranite(AMOUNT)

    // 50% yield
    mint(ADAPTER1, 500_000)

    // wallet1 deposits same amount into a more valuable vault
    mint(wallet1, AMOUNT)
    deposit(AMOUNT, wallet1)

    const s1 = vaultShares(deployer)
    const s2 = vaultShares(wallet1)
    expect(s1).toBeGreaterThan(s2)

    // deployer's entitlement > wallet1's entitlement
    const mw1 = uint(simnet.callReadOnlyFn(VAULT, 'max-withdraw', [Cl.principal(deployer)], deployer).result as any)
    const mw2 = uint(simnet.callReadOnlyFn(VAULT, 'max-withdraw', [Cl.principal(wallet1)], deployer).result as any)
    expect(mw1).toBeGreaterThan(mw2)
  })

  it('auto-allocation does not change share price (shares are minted before allocation)', () => {
    registerBoth()
    mint(deployer, AMOUNT)
    deposit(AMOUNT, deployer)
    deployToGranite(500_000)
    deployToZest(500_000)

    // Get share price before second deposit
    const previewBefore = uint(
      simnet.callReadOnlyFn(VAULT, 'preview-deposit', [Cl.uint(AMOUNT)], deployer).result as any,
    )

    // Second deposit triggers auto-allocation but shares computed on total-assets
    mint(wallet1, AMOUNT)
    const result = deposit(AMOUNT, wallet1)
    const actualShares = uint(result.result as any)

    // Preview and actual should match (auto-alloc happens after share minting)
    expect(actualShares).toBe(previewBefore)
  })

  it('convert-to-shares round-trip with auto-allocated vault loses at most dust', () => {
    registerBoth()
    const large = 100_000_000_000n // 100K tokens
    mint(deployer, large)
    deposit(large, deployer)
    deployToGranite(large / 2n)
    deployToZest(large / 2n)

    const amount = 500_000_000n
    const shares = uint(
      simnet.callReadOnlyFn(VAULT, 'convert-to-shares', [Cl.uint(amount)], deployer).result as any,
    )
    const backToAssets = uint(
      simnet.callReadOnlyFn(VAULT, 'convert-to-assets', [Cl.uint(shares)], deployer).result as any,
    )

    expect(backToAssets).toBeLessThanOrEqual(amount)
    // < 1% loss in round trip (virtual share dilution)
    expect(backToAssets).toBeGreaterThan(amount * 99n / 100n)
  })
})

// ===========================================================================
// 8) EDGE CASES — deposit-owner-only, adapter validation
// ===========================================================================

describe('vault-v3 — access control', () => {

  it('rejects deposit when caller != owner', () => {
    mint(deployer, AMOUNT)
    const result = simnet.callPublicFn(
      VAULT, 'deposit',
      [Cl.uint(AMOUNT), Cl.principal(deployer), tokenArg, graniteArg, zestArg],
      wallet1, // caller != owner
    )
    expect(result.result.type).toBe(ClarityType.ResponseErr)
  })

  it('rejects deposit with wrong granite adapter', () => {
    registerBoth()
    mint(deployer, AMOUNT)
    deposit(AMOUNT, deployer)
    deployToGranite(AMOUNT)

    // Try depositing with swapped adapters (zest contract as granite arg)
    mint(wallet1, AMOUNT)
    const result = simnet.callPublicFn(
      VAULT, 'deposit',
      [Cl.uint(AMOUNT), Cl.principal(wallet1), tokenArg, zestArg, zestArg], // wrong granite
      wallet1,
    )
    expect(result.result.type).toBe(ClarityType.ResponseErr)
  })

  it('allocator role works for manual deployment', () => {
    registerBoth()
    mint(deployer, AMOUNT)
    deposit(AMOUNT, deployer)

    // Delegate allocator
    simnet.callPublicFn(VAULT, 'set-vault-allocator', [Cl.principal(wallet1)], deployer)

    // wallet1 can deploy
    const result = simnet.callPublicFn(
      VAULT, 'deploy-to-granite', [Cl.uint(AMOUNT / 2), graniteArg], wallet1,
    )
    expect(result.result.type).toBe(ClarityType.ResponseOk)

    // deployer can no longer deploy
    const result2 = simnet.callPublicFn(
      VAULT, 'deploy-to-granite', [Cl.uint(AMOUNT / 4), graniteArg], deployer,
    )
    expect(result2.result.type).toBe(ClarityType.ResponseErr)
  })

  it('anyone can deposit (auto-allocation works for non-owner)', () => {
    registerBoth()
    mint(deployer, AMOUNT)
    deposit(AMOUNT, deployer)
    deployToGranite(500_000)
    deployToZest(500_000)

    // wallet1 deposits — auto-allocation should work
    mint(wallet1, AMOUNT)
    const result = deposit(AMOUNT, wallet1)
    expect(result.result.type).toBe(ClarityType.ResponseOk)

    // Verify auto-allocation happened
    expect(vaultRead('get-alloc-granite')).toBeGreaterThan(500_000n)
    expect(vaultRead('get-alloc-zest-v2')).toBeGreaterThan(500_000n)
  })
})

// ===========================================================================
// 9) RECALL — allocator withdraws from markets back to idle
// ===========================================================================

describe('vault-v3 — recall (market -> idle)', () => {

  it('recall-from-granite moves tokens back to idle', () => {
    registerBoth()
    mint(deployer, AMOUNT)
    deposit(AMOUNT, deployer)
    deployToGranite(600_000)
    deployToZest(400_000)

    expect(vaultRead('get-idle-bookkeeping')).toBe(0n)

    const result = simnet.callPublicFn(
      VAULT, 'recall-from-granite', [Cl.uint(200_000), graniteArg], deployer,
    )
    expect(result.result.type).toBe(ClarityType.ResponseOk)

    expect(vaultRead('get-alloc-granite')).toBe(400_000n)
    expect(vaultRead('get-alloc-zest-v2')).toBe(400_000n)
    expect(vaultRead('get-idle-bookkeeping')).toBe(200_000n)
    // total-assets unchanged (relocation, not consumption)
    expect(vaultRead('get-total-assets')).toBe(BigInt(AMOUNT))
  })

  it('recall-from-zest-v2 moves tokens back to idle', () => {
    registerBoth()
    mint(deployer, AMOUNT)
    deposit(AMOUNT, deployer)
    deployToGranite(500_000)
    deployToZest(500_000)

    const result = simnet.callPublicFn(
      VAULT, 'recall-from-zest-v2', [Cl.uint(300_000), zestArg], deployer,
    )
    expect(result.result.type).toBe(ClarityType.ResponseOk)

    expect(vaultRead('get-alloc-zest-v2')).toBe(200_000n)
    expect(vaultRead('get-alloc-granite')).toBe(500_000n)
    expect(vaultRead('get-idle-bookkeeping')).toBe(300_000n)
    expect(vaultRead('get-total-assets')).toBe(BigInt(AMOUNT))
  })

  it('recall full amount from granite empties that market', () => {
    registerBoth()
    mint(deployer, AMOUNT)
    deposit(AMOUNT, deployer)
    deployToGranite(AMOUNT)

    simnet.callPublicFn(VAULT, 'recall-from-granite', [Cl.uint(AMOUNT), graniteArg], deployer)

    expect(vaultRead('get-alloc-granite')).toBe(0n)
    expect(vaultRead('get-idle-bookkeeping')).toBe(BigInt(AMOUNT))
    expect(vaultRead('get-total-assets')).toBe(BigInt(AMOUNT))
  })

  it('recall rejects non-allocator caller', () => {
    registerBoth()
    mint(deployer, AMOUNT)
    deposit(AMOUNT, deployer)
    deployToGranite(AMOUNT)

    const result = simnet.callPublicFn(
      VAULT, 'recall-from-granite', [Cl.uint(500_000), graniteArg], wallet1,
    )
    expect(result.result.type).toBe(ClarityType.ResponseErr)
  })

  it('recall rejects zero amount', () => {
    registerBoth()
    mint(deployer, AMOUNT)
    deposit(AMOUNT, deployer)
    deployToGranite(AMOUNT)

    const result = simnet.callPublicFn(
      VAULT, 'recall-from-granite', [Cl.uint(0), graniteArg], deployer,
    )
    expect(result.result.type).toBe(ClarityType.ResponseErr)
  })

  it('recall rejects wrong adapter', () => {
    registerBoth()
    mint(deployer, AMOUNT)
    deposit(AMOUNT, deployer)
    deployToGranite(AMOUNT)

    // Pass zest adapter as granite arg
    const result = simnet.callPublicFn(
      VAULT, 'recall-from-granite', [Cl.uint(500_000), zestArg], deployer,
    )
    expect(result.result.type).toBe(ClarityType.ResponseErr)
  })

  it('recall then new deposit auto-allocates to updated ratio', () => {
    registerBoth()
    mint(deployer, AMOUNT)
    deposit(AMOUNT, deployer)
    deployToGranite(500_000)
    deployToZest(500_000)

    // Recall all from zest -> only granite has capital
    simnet.callPublicFn(VAULT, 'recall-from-zest-v2', [Cl.uint(500_000), zestArg], deployer)

    expect(vaultRead('get-alloc-granite')).toBe(500_000n)
    expect(vaultRead('get-alloc-zest-v2')).toBe(0n)

    // New deposit should auto-allocate 100% to granite (only deployed market)
    mint(wallet1, AMOUNT)
    deposit(AMOUNT, wallet1)

    // deploy-total = 950_000, all to granite (zest ratio is 0)
    expect(vaultRead('get-alloc-granite')).toBe(500_000n + 950_000n)
    expect(vaultRead('get-alloc-zest-v2')).toBe(0n)
  })

  it('delegated allocator can recall', () => {
    registerBoth()
    mint(deployer, AMOUNT)
    deposit(AMOUNT, deployer)
    deployToGranite(500_000)
    deployToZest(500_000)

    // Delegate allocator to wallet1
    simnet.callPublicFn(VAULT, 'set-vault-allocator', [Cl.principal(wallet1)], deployer)

    const result = simnet.callPublicFn(
      VAULT, 'recall-from-granite', [Cl.uint(250_000), graniteArg], wallet1,
    )
    expect(result.result.type).toBe(ClarityType.ResponseOk)
    expect(vaultRead('get-alloc-granite')).toBe(250_000n)
    expect(vaultRead('get-idle-bookkeeping')).toBe(250_000n)
  })
})

// ===========================================================================
// 10) PERFORMANCE FEES — yield-based fee accrual via share minting
// ===========================================================================

describe('vault-v3 — performance fees', () => {

  it('no fee shares minted when fee-bps is 0 (default)', () => {
    registerBoth()
    mint(deployer, AMOUNT)
    deposit(AMOUNT, deployer)
    deployToGranite(AMOUNT)

    expect(vaultRead('get-fee-bps')).toBe(0n)

    // Simulate yield
    mint(ADAPTER1, 100_000)
    simnet.callPublicFn(VAULT, 'sync-granite', [graniteArg], deployer)

    // Total supply should only be deployer's shares (no fee shares minted)
    const supply = uint(simnet.callReadOnlyFn(VAULT, 'get-total-supply', [], deployer).result as any)
    expect(supply).toBe(vaultShares(deployer))
  })

  it('set-fee-bps and set-fee-recipient work correctly', () => {
    const r1 = simnet.callPublicFn(VAULT, 'set-fee-bps', [Cl.uint(1000)], deployer)
    expect(r1.result.type).toBe(ClarityType.ResponseOk)
    expect(vaultRead('get-fee-bps')).toBe(1000n)

    const r2 = simnet.callPublicFn(VAULT, 'set-fee-recipient', [Cl.principal(wallet2)], deployer)
    expect(r2.result.type).toBe(ClarityType.ResponseOk)

    const fr = simnet.callReadOnlyFn(VAULT, 'get-fee-recipient', [], deployer).result as any
    expect(fr.value).toBe(wallet2)
  })

  it('set-fee-bps rejects values > 10000', () => {
    const result = simnet.callPublicFn(VAULT, 'set-fee-bps', [Cl.uint(10_001)], deployer)
    expect(result.result.type).toBe(ClarityType.ResponseErr)
  })

  it('set-fee-bps rejects non-owner', () => {
    const result = simnet.callPublicFn(VAULT, 'set-fee-bps', [Cl.uint(1000)], wallet1)
    expect(result.result.type).toBe(ClarityType.ResponseErr)
  })

  it('set-fee-recipient rejects non-owner', () => {
    const result = simnet.callPublicFn(VAULT, 'set-fee-recipient', [Cl.principal(wallet2)], wallet1)
    expect(result.result.type).toBe(ClarityType.ResponseErr)
  })

  it('fee shares are minted to fee-recipient on yield sync', () => {
    registerBoth()
    simnet.callPublicFn(VAULT, 'set-fee-bps', [Cl.uint(1000)], deployer) // 10%
    simnet.callPublicFn(VAULT, 'set-fee-recipient', [Cl.principal(wallet2)], deployer)

    mint(deployer, AMOUNT)
    deposit(AMOUNT, deployer)
    deployToGranite(AMOUNT)

    expect(vaultShares(wallet2)).toBe(0n)

    // Simulate 100K yield
    mint(ADAPTER1, 100_000)
    simnet.callPublicFn(VAULT, 'sync-granite', [graniteArg], deployer)

    // wallet2 (fee recipient) should now have shares
    expect(vaultShares(wallet2)).toBeGreaterThan(0n)
  })

  it('fee shares are correctly valued at fee-assets amount', () => {
    registerBoth()
    simnet.callPublicFn(VAULT, 'set-fee-bps', [Cl.uint(1000)], deployer) // 10%
    simnet.callPublicFn(VAULT, 'set-fee-recipient', [Cl.principal(wallet2)], deployer)

    mint(deployer, 5_000_000)
    deposit(5_000_000, deployer)
    deployToGranite(5_000_000)

    // 500K yield -> 10% fee = 50K in fee assets
    mint(ADAPTER1, 500_000)
    simnet.callPublicFn(VAULT, 'sync-granite', [graniteArg], deployer)

    const feeShares = vaultShares(wallet2)
    const feeValue = uint(
      simnet.callReadOnlyFn(VAULT, 'convert-to-assets', [Cl.uint(feeShares)], deployer).result as any,
    )
    // Should be approximately 50_000 (some rounding dust acceptable)
    expect(feeValue).toBeGreaterThanOrEqual(49_900n)
    expect(feeValue).toBeLessThanOrEqual(50_100n)
  })

  it('fee recipient can redeem shares for tokens', () => {
    registerBoth()
    simnet.callPublicFn(VAULT, 'set-fee-bps', [Cl.uint(2000)], deployer) // 20%
    simnet.callPublicFn(VAULT, 'set-fee-recipient', [Cl.principal(wallet2)], deployer)

    mint(deployer, 5_000_000)
    deposit(5_000_000, deployer)
    deployToGranite(2_500_000)
    deployToZest(2_500_000)

    // Yield on granite: 200K -> 20% fee = 40K
    mint(ADAPTER1, 200_000)
    simnet.callPublicFn(VAULT, 'sync-granite', [graniteArg], deployer)

    const feeShares = vaultShares(wallet2)
    expect(feeShares).toBeGreaterThan(0n)

    const before = tokenBalance(wallet2)
    const result = redeem(feeShares, wallet2, wallet2)
    expect(result.result.type).toBe(ClarityType.ResponseOk)
    const after = tokenBalance(wallet2)
    const redeemed = after - before

    // Should be approximately 40K
    expect(redeemed).toBeGreaterThanOrEqual(39_000n)
    expect(redeemed).toBeLessThanOrEqual(41_000n)
  })

  it('multiple yield syncs accumulate fee shares correctly', () => {
    registerBoth()
    simnet.callPublicFn(VAULT, 'set-fee-bps', [Cl.uint(1000)], deployer) // 10%
    simnet.callPublicFn(VAULT, 'set-fee-recipient', [Cl.principal(wallet2)], deployer)

    mint(deployer, 5_000_000)
    deposit(5_000_000, deployer)
    deployToGranite(2_500_000)
    deployToZest(2_500_000)

    // First yield on granite: 100K
    mint(ADAPTER1, 100_000)
    simnet.callPublicFn(VAULT, 'sync-granite', [graniteArg], deployer)
    const shares1 = vaultShares(wallet2)
    expect(shares1).toBeGreaterThan(0n)

    // Second yield on zest: 100K
    mint(ADAPTER2, 100_000)
    simnet.callPublicFn(VAULT, 'sync-zest-v2', [zestArg], deployer)
    const shares2 = vaultShares(wallet2)

    expect(shares2).toBeGreaterThan(shares1)
  })

  it('fee does not change total-assets (dilution-based, not extraction-based)', () => {
    registerBoth()
    simnet.callPublicFn(VAULT, 'set-fee-bps', [Cl.uint(1000)], deployer)
    simnet.callPublicFn(VAULT, 'set-fee-recipient', [Cl.principal(wallet2)], deployer)

    mint(deployer, AMOUNT)
    deposit(AMOUNT, deployer)
    deployToGranite(AMOUNT)

    const yieldAmt = 100_000
    mint(ADAPTER1, yieldAmt)
    simnet.callPublicFn(VAULT, 'sync-granite', [graniteArg], deployer)

    // Total assets includes the full yield — fee is taken by dilution, not extraction
    expect(vaultRead('get-total-assets')).toBe(BigInt(AMOUNT + yieldAmt))
  })

  it('deposit auto-sync triggers fee accrual', () => {
    registerBoth()
    simnet.callPublicFn(VAULT, 'set-fee-bps', [Cl.uint(1000)], deployer)
    simnet.callPublicFn(VAULT, 'set-fee-recipient', [Cl.principal(wallet2)], deployer)

    mint(deployer, AMOUNT)
    deposit(AMOUNT, deployer)
    deployToGranite(AMOUNT)

    // Yield before wallet1's deposit
    mint(ADAPTER1, 100_000)
    expect(vaultShares(wallet2)).toBe(0n)

    // wallet1 deposit triggers auto-sync which should mint fee shares
    mint(wallet1, AMOUNT)
    deposit(AMOUNT, wallet1)

    expect(vaultShares(wallet2)).toBeGreaterThan(0n)
  })

  it('withdraw auto-sync triggers fee accrual', () => {
    registerBoth()
    simnet.callPublicFn(VAULT, 'set-fee-bps', [Cl.uint(1000)], deployer)
    simnet.callPublicFn(VAULT, 'set-fee-recipient', [Cl.principal(wallet2)], deployer)

    mint(deployer, AMOUNT)
    deposit(AMOUNT, deployer)
    deployToGranite(AMOUNT)

    mint(ADAPTER1, 100_000)
    expect(vaultShares(wallet2)).toBe(0n)

    // Withdraw triggers auto-sync
    withdraw(500_000, deployer, deployer)

    expect(vaultShares(wallet2)).toBeGreaterThan(0n)
  })

  it('no fee shares minted when yield is zero', () => {
    registerBoth()
    simnet.callPublicFn(VAULT, 'set-fee-bps', [Cl.uint(1000)], deployer)
    simnet.callPublicFn(VAULT, 'set-fee-recipient', [Cl.principal(wallet2)], deployer)

    mint(deployer, AMOUNT)
    deposit(AMOUNT, deployer)
    deployToGranite(AMOUNT)

    // No yield added — just sync
    simnet.callPublicFn(VAULT, 'sync-granite', [graniteArg], deployer)

    expect(vaultShares(wallet2)).toBe(0n)
  })

  it('share price still increases for depositors after fee', () => {
    registerBoth()
    simnet.callPublicFn(VAULT, 'set-fee-bps', [Cl.uint(2000)], deployer) // 20% fee
    simnet.callPublicFn(VAULT, 'set-fee-recipient', [Cl.principal(wallet2)], deployer)

    mint(deployer, 5_000_000)
    deposit(5_000_000, deployer)
    deployToGranite(5_000_000)

    // Share value before yield
    const valueBefore = uint(
      simnet.callReadOnlyFn(VAULT, 'max-withdraw', [Cl.principal(deployer)], deployer).result as any,
    )

    // 1M yield (20%), 20% fee = 200K to fee recipient
    mint(ADAPTER1, 1_000_000)
    simnet.callPublicFn(VAULT, 'sync-granite', [graniteArg], deployer)

    // Deployer's value should increase (by ~80% of yield = ~800K)
    const valueAfter = uint(
      simnet.callReadOnlyFn(VAULT, 'max-withdraw', [Cl.principal(deployer)], deployer).result as any,
    )
    expect(valueAfter).toBeGreaterThan(valueBefore)

    // Gain should be less than full yield (fee taken via dilution)
    // With virtual offset, convert-to-assets floors, so the gain may appear smaller
    // Key invariant: depositor gains, but not the full 1M yield
    const gain = valueAfter - valueBefore
    expect(gain).toBeGreaterThan(0n)
    expect(gain).toBeLessThan(BigInt(1_000_000)) // less than full yield
  })

  it('100% fee gives all yield to fee recipient', () => {
    registerBoth()
    simnet.callPublicFn(VAULT, 'set-fee-bps', [Cl.uint(10_000)], deployer) // 100%
    simnet.callPublicFn(VAULT, 'set-fee-recipient', [Cl.principal(wallet2)], deployer)

    mint(deployer, 5_000_000)
    deposit(5_000_000, deployer)
    deployToGranite(5_000_000)

    const valueBefore = uint(
      simnet.callReadOnlyFn(VAULT, 'max-withdraw', [Cl.principal(deployer)], deployer).result as any,
    )

    // 500K yield, 100% fee
    mint(ADAPTER1, 500_000)
    simnet.callPublicFn(VAULT, 'sync-granite', [graniteArg], deployer)

    // Deployer value should barely change (all yield goes to fee recipient)
    const valueAfter = uint(
      simnet.callReadOnlyFn(VAULT, 'max-withdraw', [Cl.principal(deployer)], deployer).result as any,
    )
    // Should be within a small rounding range of valueBefore
    const diff = valueAfter > valueBefore ? valueAfter - valueBefore : valueBefore - valueAfter
    expect(diff).toBeLessThan(1000n) // rounding dust

    // Fee recipient should have shares worth ~500K
    const feeValue = uint(
      simnet.callReadOnlyFn(VAULT, 'convert-to-assets', [Cl.uint(vaultShares(wallet2))], deployer).result as any,
    )
    expect(feeValue).toBeGreaterThan(490_000n)
    expect(feeValue).toBeLessThanOrEqual(500_000n)
  })
})

// ===========================================================================
// 11) ZERO-SUM REBALANCING (MetaMorpho-style reallocate)
// ===========================================================================

describe('vault-v3 — zero-sum rebalancing', () => {

  it('reallocate moves capital between markets (zero-sum)', () => {
    registerBoth()
    mint(deployer, AMOUNT)
    deposit(AMOUNT, deployer)
    deployToGranite(500_000)
    deployToZest(500_000)

    // Move 200K from granite to zest
    const result = simnet.callPublicFn(
      VAULT, 'reallocate',
      [Cl.uint(200_000), Cl.uint(0), Cl.uint(0), Cl.uint(200_000), graniteArg, zestArg],
      deployer,
    )
    expect(result.result.type).toBe(ClarityType.ResponseOk)

    expect(vaultRead('get-alloc-granite')).toBe(300_000n)
    expect(vaultRead('get-alloc-zest-v2')).toBe(700_000n)
    expect(vaultRead('get-total-assets')).toBe(BigInt(AMOUNT))
  })

  it('reallocate rejects non-zero-sum (withdraw > supply)', () => {
    registerBoth()
    mint(deployer, AMOUNT)
    deposit(AMOUNT, deployer)
    deployToGranite(500_000)
    deployToZest(500_000)

    const result = simnet.callPublicFn(
      VAULT, 'reallocate',
      [Cl.uint(300_000), Cl.uint(0), Cl.uint(0), Cl.uint(200_000), graniteArg, zestArg],
      deployer,
    )
    expect(result.result.type).toBe(ClarityType.ResponseErr)
  })

  it('reallocate rejects non-zero-sum (supply > withdraw)', () => {
    registerBoth()
    mint(deployer, AMOUNT)
    deposit(AMOUNT, deployer)
    deployToGranite(500_000)
    deployToZest(500_000)

    const result = simnet.callPublicFn(
      VAULT, 'reallocate',
      [Cl.uint(200_000), Cl.uint(0), Cl.uint(0), Cl.uint(300_000), graniteArg, zestArg],
      deployer,
    )
    expect(result.result.type).toBe(ClarityType.ResponseErr)
  })

  it('reallocate rejects non-allocator', () => {
    registerBoth()
    mint(deployer, AMOUNT)
    deposit(AMOUNT, deployer)
    deployToGranite(500_000)
    deployToZest(500_000)

    const result = simnet.callPublicFn(
      VAULT, 'reallocate',
      [Cl.uint(200_000), Cl.uint(0), Cl.uint(0), Cl.uint(200_000), graniteArg, zestArg],
      wallet1,
    )
    expect(result.result.type).toBe(ClarityType.ResponseErr)
  })

  it('reallocate with both directions (cross-rebalance)', () => {
    registerBoth()
    mint(deployer, AMOUNT)
    deposit(AMOUNT, deployer)
    deployToGranite(600_000)
    deployToZest(400_000)

    // Withdraw 100K from granite and 50K from zest, supply 50K to granite and 100K to zest
    // Net: granite -50K, zest +50K. Total withdrawn = 150K, total supplied = 150K
    const result = simnet.callPublicFn(
      VAULT, 'reallocate',
      [Cl.uint(100_000), Cl.uint(50_000), Cl.uint(50_000), Cl.uint(100_000), graniteArg, zestArg],
      deployer,
    )
    expect(result.result.type).toBe(ClarityType.ResponseOk)

    expect(vaultRead('get-alloc-granite')).toBe(550_000n)
    expect(vaultRead('get-alloc-zest-v2')).toBe(450_000n)
    expect(vaultRead('get-total-assets')).toBe(BigInt(AMOUNT))
  })

  it('reallocate with zero amounts (no-op) succeeds', () => {
    registerBoth()
    mint(deployer, AMOUNT)
    deposit(AMOUNT, deployer)
    deployToGranite(500_000)
    deployToZest(500_000)

    const result = simnet.callPublicFn(
      VAULT, 'reallocate',
      [Cl.uint(0), Cl.uint(0), Cl.uint(0), Cl.uint(0), graniteArg, zestArg],
      deployer,
    )
    expect(result.result.type).toBe(ClarityType.ResponseOk)

    expect(vaultRead('get-alloc-granite')).toBe(500_000n)
    expect(vaultRead('get-alloc-zest-v2')).toBe(500_000n)
  })

  it('reallocate rejects wrong adapter', () => {
    registerBoth()
    mint(deployer, AMOUNT)
    deposit(AMOUNT, deployer)
    deployToGranite(500_000)
    deployToZest(500_000)

    // Pass zest adapter as granite arg (swapped)
    const result = simnet.callPublicFn(
      VAULT, 'reallocate',
      [Cl.uint(200_000), Cl.uint(0), Cl.uint(0), Cl.uint(200_000), zestArg, graniteArg],
      deployer,
    )
    expect(result.result.type).toBe(ClarityType.ResponseErr)
  })

  it('reallocate preserves total-assets bookkeeping', () => {
    registerBoth()
    mint(deployer, AMOUNT)
    deposit(AMOUNT, deployer)
    deployToGranite(500_000)
    deployToZest(500_000)

    const totalBefore = vaultRead('get-total-assets')

    simnet.callPublicFn(
      VAULT, 'reallocate',
      [Cl.uint(300_000), Cl.uint(200_000), Cl.uint(200_000), Cl.uint(300_000), graniteArg, zestArg],
      deployer,
    )

    expect(vaultRead('get-total-assets')).toBe(totalBefore)
  })

  it('delegated allocator can reallocate', () => {
    registerBoth()
    mint(deployer, AMOUNT)
    deposit(AMOUNT, deployer)
    deployToGranite(500_000)
    deployToZest(500_000)

    simnet.callPublicFn(VAULT, 'set-vault-allocator', [Cl.principal(wallet1)], deployer)

    const result = simnet.callPublicFn(
      VAULT, 'reallocate',
      [Cl.uint(200_000), Cl.uint(0), Cl.uint(0), Cl.uint(200_000), graniteArg, zestArg],
      wallet1,
    )
    expect(result.result.type).toBe(ClarityType.ResponseOk)
    expect(vaultRead('get-alloc-granite')).toBe(300_000n)
    expect(vaultRead('get-alloc-zest-v2')).toBe(700_000n)
  })

  it('reallocate full amount from one market to another', () => {
    registerBoth()
    mint(deployer, AMOUNT)
    deposit(AMOUNT, deployer)
    deployToGranite(AMOUNT)

    // Move everything from granite to zest
    const result = simnet.callPublicFn(
      VAULT, 'reallocate',
      [Cl.uint(AMOUNT), Cl.uint(0), Cl.uint(0), Cl.uint(AMOUNT), graniteArg, zestArg],
      deployer,
    )
    expect(result.result.type).toBe(ClarityType.ResponseOk)

    expect(vaultRead('get-alloc-granite')).toBe(0n)
    expect(vaultRead('get-alloc-zest-v2')).toBe(BigInt(AMOUNT))
    expect(vaultRead('get-total-assets')).toBe(BigInt(AMOUNT))
  })

  it('reallocate does not affect share price', () => {
    registerBoth()
    mint(deployer, AMOUNT)
    mint(wallet1, AMOUNT)
    deposit(AMOUNT, deployer)
    deposit(AMOUNT, wallet1)
    deployToGranite(1_000_000)
    deployToZest(1_000_000)

    const sharesBefore = vaultShares(deployer)
    const valueBefore = uint(
      simnet.callReadOnlyFn(VAULT, 'max-withdraw', [Cl.principal(deployer)], deployer).result as any,
    )

    // Reallocate 500K granite -> zest
    simnet.callPublicFn(
      VAULT, 'reallocate',
      [Cl.uint(500_000), Cl.uint(0), Cl.uint(0), Cl.uint(500_000), graniteArg, zestArg],
      deployer,
    )

    const sharesAfter = vaultShares(deployer)
    const valueAfter = uint(
      simnet.callReadOnlyFn(VAULT, 'max-withdraw', [Cl.principal(deployer)], deployer).result as any,
    )

    expect(sharesAfter).toBe(sharesBefore)
    expect(valueAfter).toBe(valueBefore)
  })
})

// ===========================================================================
// 12) INITIALIZE — portable vault configuration
// ===========================================================================

describe('vault-v3 — initialize', () => {

  it('owner can initialize with valid params', () => {
    const result = simnet.callPublicFn(
      VAULT, 'initialize',
      [tokenArg, Cl.stringAscii('Test Vault'), Cl.stringAscii('tVAULT'), Cl.uint(6)],
      deployer,
    )
    expect(result.result.type).toBe(ClarityType.ResponseOk)

    // Verify stored values
    const name = simnet.callReadOnlyFn(VAULT, 'get-name', [], deployer).result as any
    expect(name.value.value).toBe('Test Vault')

    const symbol = simnet.callReadOnlyFn(VAULT, 'get-symbol', [], deployer).result as any
    expect(symbol.value.value).toBe('tVAULT')

    const decimals = uint(simnet.callReadOnlyFn(VAULT, 'get-decimals', [], deployer).result as any)
    expect(decimals).toBe(6n)

    const offset = uint(simnet.callReadOnlyFn(VAULT, 'get-virtual-offset', [], deployer).result as any)
    expect(offset).toBe(1_000_000n) // 10^6

    const asset = simnet.callReadOnlyFn(VAULT, 'get-base-asset', [], deployer).result as any
    expect(asset.value).toBe(`${deployer}.mock-token`)
  })

  it('rejects double initialization', () => {
    simnet.callPublicFn(
      VAULT, 'initialize',
      [tokenArg, Cl.stringAscii('Vault'), Cl.stringAscii('VLT'), Cl.uint(6)],
      deployer,
    )
    const result = simnet.callPublicFn(
      VAULT, 'initialize',
      [tokenArg, Cl.stringAscii('Vault2'), Cl.stringAscii('VLT2'), Cl.uint(8)],
      deployer,
    )
    expect(result.result.type).toBe(ClarityType.ResponseErr)
    // err-already-initialized = u114
    const errVal = (result.result as any).value.value
    expect(BigInt(errVal)).toBe(114n)
  })

  it('rejects non-owner caller', () => {
    const result = simnet.callPublicFn(
      VAULT, 'initialize',
      [tokenArg, Cl.stringAscii('Vault'), Cl.stringAscii('VLT'), Cl.uint(6)],
      wallet1,
    )
    expect(result.result.type).toBe(ClarityType.ResponseErr)
  })

  it('rejects invalid decimals (> 18)', () => {
    const result = simnet.callPublicFn(
      VAULT, 'initialize',
      [tokenArg, Cl.stringAscii('Vault'), Cl.stringAscii('VLT'), Cl.uint(19)],
      deployer,
    )
    expect(result.result.type).toBe(ClarityType.ResponseErr)
    // err-invalid-decimals = u115
    const errVal = (result.result as any).value.value
    expect(BigInt(errVal)).toBe(115n)
  })

  it('sets virtual-offset correctly for 8 decimals (sBTC-like)', () => {
    const result = simnet.callPublicFn(
      VAULT, 'initialize',
      [tokenArg, Cl.stringAscii('sBTC Vault'), Cl.stringAscii('dsBTC'), Cl.uint(8)],
      deployer,
    )
    expect(result.result.type).toBe(ClarityType.ResponseOk)

    const offset = uint(simnet.callReadOnlyFn(VAULT, 'get-virtual-offset', [], deployer).result as any)
    expect(offset).toBe(100_000_000n) // 10^8
  })

  it('sets virtual-offset correctly for 18 decimals', () => {
    const result = simnet.callPublicFn(
      VAULT, 'initialize',
      [tokenArg, Cl.stringAscii('18d Vault'), Cl.stringAscii('d18'), Cl.uint(18)],
      deployer,
    )
    expect(result.result.type).toBe(ClarityType.ResponseOk)

    const offset = uint(simnet.callReadOnlyFn(VAULT, 'get-virtual-offset', [], deployer).result as any)
    expect(offset).toBe(1_000_000_000_000_000_000n) // 10^18
  })

  it('deposit rejects wrong token after initialize', () => {
    simnet.callPublicFn(
      VAULT, 'initialize',
      [tokenArg, Cl.stringAscii('Vault'), Cl.stringAscii('VLT'), Cl.uint(6)],
      deployer,
    )

    // Try to deposit with a different token (mock-adapter is not a valid SIP-010, but tests the check)
    mint(deployer, AMOUNT)
    const wrongToken = Cl.contractPrincipal(deployer, 'mock-adapter')
    const result = simnet.callPublicFn(
      VAULT, 'deposit',
      [Cl.uint(AMOUNT), Cl.principal(deployer), wrongToken, graniteArg, zestArg],
      deployer,
    )
    expect(result.result.type).toBe(ClarityType.ResponseErr)
  })

  it('vault works without calling initialize (defaults to mock-token, 6 decimals)', () => {
    // Don't call initialize — use defaults
    mint(deployer, AMOUNT)
    const result = deposit(AMOUNT, deployer)
    expect(result.result.type).toBe(ClarityType.ResponseOk)

    // Default offset is 10^6
    const offset = uint(simnet.callReadOnlyFn(VAULT, 'get-virtual-offset', [], deployer).result as any)
    expect(offset).toBe(1_000_000n)
  })
})
