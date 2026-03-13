import { describe, it, expect } from 'vitest'
import { Cl, ClarityType } from '@stacks/transactions'
import type { Simnet } from '@stacks/clarinet-sdk'

declare global {
  const simnet: Simnet
}

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

const AMOUNT  = 1_000_000
const VIRTUAL = 1_000_000n  // 10^decimals symmetric offset

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

function vaultRead(fn: string): bigint {
  return uint(simnet.callReadOnlyFn(VAULT, fn, [], deployer).result as any)
}

function vaultShares(principal: string): bigint {
  return uint(simnet.callReadOnlyFn(VAULT, 'get-balance', [Cl.principal(principal)], deployer).result as any)
}

function tokenBalance(principal: string): bigint {
  return uint(simnet.callReadOnlyFn(TOKEN, 'get-balance', [Cl.principal(principal)], deployer).result as any)
}

/**
 * Share price as a rational number [numerator, denominator].
 * Symmetric formula: price = (total + V) / (supply + V)
 * Returns [total + V, supply + V] to preserve full precision.
 */
function sharePrice(): [bigint, bigint] {
  const total  = vaultRead('get-total-assets')
  const supply = uint(simnet.callReadOnlyFn(VAULT, 'get-total-supply', [], deployer).result as any)
  return [total + VIRTUAL, supply + VIRTUAL]
}

/** Compare two rational prices: returns (a/b) / (c/d) as a float. */
function priceRatio(
  [n1, d1]: [bigint, bigint],
  [n2, d2]: [bigint, bigint],
): number {
  // (n1/d1) / (n2/d2) = (n1*d2) / (n2*d1)
  return Number(n1 * d2) / Number(n2 * d1)
}

// ===========================================================================
// DIAGNOSTIC: trace share price through operations
// ===========================================================================

describe('vault-v3 — share price stability diagnostic', () => {

  it('share price trace: deposit -> deploy -> deposit -> withdraw -> withdraw', () => {
    registerBoth()

    // --- Deposit 1M ---
    mint(deployer, 10_000_000)
    deposit(AMOUNT, deployer)
    const p1 = sharePrice()

    // --- Deploy 50/50 ---
    simnet.callPublicFn(VAULT, 'deploy-to-granite', [Cl.uint(500_000), graniteArg], deployer)
    simnet.callPublicFn(VAULT, 'deploy-to-zest-v2', [Cl.uint(500_000), zestArg], deployer)
    const p2 = sharePrice()

    // Deploy is relocation — price must not change
    expect(priceRatio(p2, p1)).toBeCloseTo(1.0, 10)

    // --- Second deposit (wallet1) with auto-allocation ---
    mint(wallet1, AMOUNT)
    deposit(AMOUNT, wallet1)
    const p3 = sharePrice()

    // Deposit should not change share price (shares dilute proportionally)
    expect(priceRatio(p3, p1)).toBeCloseTo(1.0, 5)

    // --- Withdraw 200K from deployer ---
    withdraw(200_000, wallet2, deployer)
    const p4 = sharePrice()

    // Withdraw should not change share price
    const ratio4 = priceRatio(p4, p1)
    console.log(`Price after withdraw 200K: ratio to initial = ${ratio4}`)
    expect(ratio4).toBeCloseTo(1.0, 3)

    // --- Withdraw another 300K from deployer ---
    withdraw(300_000, wallet2, deployer)
    const p5 = sharePrice()

    const ratio5 = priceRatio(p5, p1)
    console.log(`Price after withdraw 500K total: ratio to initial = ${ratio5}`)
    expect(ratio5).toBeCloseTo(1.0, 3)
  })

  it('share price trace: many small withdrawals', () => {
    registerBoth()
    mint(deployer, 10_000_000)
    deposit(5_000_000, deployer)

    simnet.callPublicFn(VAULT, 'deploy-to-granite', [Cl.uint(2_500_000), graniteArg], deployer)
    simnet.callPublicFn(VAULT, 'deploy-to-zest-v2', [Cl.uint(2_500_000), zestArg], deployer)

    const pInitial = sharePrice()

    // 10 small withdrawals
    for (let i = 0; i < 10; i++) {
      withdraw(100_000, wallet2, deployer)
    }

    const pAfter = sharePrice()
    const ratio = priceRatio(pAfter, pInitial)
    console.log(`Price after 10x100K withdrawals: ratio = ${ratio}`)
    expect(ratio).toBeCloseTo(1.0, 3)
  })

  it('share price trace: withdraw when all idle', () => {
    mint(deployer, 5_000_000)
    deposit(5_000_000, deployer)

    const p1 = sharePrice()

    withdraw(1_000_000, wallet2, deployer)
    const p2 = sharePrice()

    withdraw(2_000_000, wallet2, deployer)
    const p3 = sharePrice()

    console.log(`All-idle withdraw 1: ratio = ${priceRatio(p2, p1)}`)
    console.log(`All-idle withdraw 2: ratio = ${priceRatio(p3, p1)}`)

    expect(priceRatio(p2, p1)).toBeCloseTo(1.0, 5)
    expect(priceRatio(p3, p1)).toBeCloseTo(1.0, 5)
  })

  it('share price trace: recall then withdraw', () => {
    registerBoth()
    mint(deployer, 5_000_000)
    deposit(5_000_000, deployer)

    simnet.callPublicFn(VAULT, 'deploy-to-granite', [Cl.uint(2_500_000), graniteArg], deployer)
    simnet.callPublicFn(VAULT, 'deploy-to-zest-v2', [Cl.uint(2_500_000), zestArg], deployer)

    const p1 = sharePrice()

    // Recall from granite
    simnet.callPublicFn(VAULT, 'recall-from-granite', [Cl.uint(1_000_000), graniteArg], deployer)
    const p2 = sharePrice()

    console.log(`After recall: ratio = ${priceRatio(p2, p1)}`)
    expect(priceRatio(p2, p1)).toBeCloseTo(1.0, 10)

    // Then withdraw
    withdraw(500_000, wallet2, deployer)
    const p3 = sharePrice()

    console.log(`After recall + withdraw: ratio = ${priceRatio(p3, p1)}`)
    expect(priceRatio(p3, p1)).toBeCloseTo(1.0, 3)
  })

  it('share price only increases with yield, never from operations', () => {
    registerBoth()
    mint(deployer, 10_000_000)
    mint(wallet1, 10_000_000)

    deposit(5_000_000, deployer)
    const p0 = sharePrice()

    simnet.callPublicFn(VAULT, 'deploy-to-granite', [Cl.uint(2_500_000), graniteArg], deployer)
    simnet.callPublicFn(VAULT, 'deploy-to-zest-v2', [Cl.uint(2_500_000), zestArg], deployer)

    // Second deposit
    deposit(3_000_000, wallet1)
    const p1 = sharePrice()

    // Withdraw from deployer
    withdraw(1_000_000, wallet2, deployer)
    const p2 = sharePrice()

    // Recall
    simnet.callPublicFn(VAULT, 'recall-from-zest-v2', [Cl.uint(500_000), zestArg], deployer)
    const p3 = sharePrice()

    // Yield on granite
    mint(ADAPTER1, 200_000)
    simnet.callPublicFn(VAULT, 'sync-granite', [graniteArg], deployer)
    const p4 = sharePrice()

    // Another withdraw
    withdraw(500_000, wallet2, wallet1)
    const p5 = sharePrice()

    console.log(`p0 -> p1 (deposit2):   ${priceRatio(p1, p0)}`)
    console.log(`p1 -> p2 (withdraw):   ${priceRatio(p2, p1)}`)
    console.log(`p2 -> p3 (recall):     ${priceRatio(p3, p2)}`)
    console.log(`p3 -> p4 (yield sync): ${priceRatio(p4, p3)}`)
    console.log(`p4 -> p5 (withdraw2):  ${priceRatio(p5, p4)}`)

    // Operations should not decrease price (>= 1.0, or very close to 1.0 with rounding)
    expect(priceRatio(p1, p0)).toBeGreaterThanOrEqual(0.9999)
    expect(priceRatio(p2, p1)).toBeGreaterThanOrEqual(0.9999)
    expect(priceRatio(p3, p2)).toBeGreaterThanOrEqual(0.9999)
    // Yield sync should INCREASE price
    expect(priceRatio(p4, p3)).toBeGreaterThan(1.001)
    // Withdraw after yield should not decrease price
    expect(priceRatio(p5, p4)).toBeGreaterThanOrEqual(0.9999)
  })

  it('absolute share price values through lifecycle', () => {
    registerBoth()
    const initial = 10_000_000 // 10 tokens

    mint(deployer, initial)
    deposit(initial, deployer)

    const [t1, d1] = sharePrice()
    const price1 = Number(t1) / Number(d1)
    console.log(`\n--- Share price lifecycle ---`)
    console.log(`After deposit 10M:     total=${t1} supply+virt=${d1} price=${price1.toFixed(8)}`)

    // Deploy
    simnet.callPublicFn(VAULT, 'deploy-to-granite', [Cl.uint(5_000_000), graniteArg], deployer)
    simnet.callPublicFn(VAULT, 'deploy-to-zest-v2', [Cl.uint(5_000_000), zestArg], deployer)

    const [t2, d2] = sharePrice()
    const price2 = Number(t2) / Number(d2)
    console.log(`After deploy 50/50:    total=${t2} supply+virt=${d2} price=${price2.toFixed(8)}`)

    // Withdraw 5M
    withdraw(5_000_000, wallet2, deployer)

    const [t3, d3] = sharePrice()
    const price3 = Number(t3) / Number(d3)
    console.log(`After withdraw 5M:     total=${t3} supply+virt=${d3} price=${price3.toFixed(8)}`)

    // Withdraw 3M more
    withdraw(3_000_000, wallet2, deployer)

    const [t4, d4] = sharePrice()
    const price4 = Number(t4) / Number(d4)
    console.log(`After withdraw 3M:     total=${t4} supply+virt=${d4} price=${price4.toFixed(8)}`)

    console.log(`\nPrice changes: ${price1.toFixed(8)} -> ${price2.toFixed(8)} -> ${price3.toFixed(8)} -> ${price4.toFixed(8)}`)
    console.log(`Ratios: deploy=${(price2/price1).toFixed(6)} w1=${(price3/price1).toFixed(6)} w2=${(price4/price1).toFixed(6)}`)
  })
})
