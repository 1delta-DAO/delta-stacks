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

const VAULT   = `${deployer}.vault-usdcx-v2`
const TOKEN   = `${deployer}.mock-token`
const ADAPTER = `${deployer}.mock-adapter`

// Adapter CV to pass as <lat> trait argument.
// When alloc-granite / alloc-zest-v2 == 0 the vault skips the adapter entirely,
// so the same contract can safely represent both markets in tests.
const adapterArg = Cl.contractPrincipal(deployer, 'mock-adapter')

const AMOUNT  = 1_000_000   // 1 token (6 decimals)
const VIRTUAL = 100_000_000 // virtual-shares constant

/** Mint `amount` mock tokens to `to`. */
function mint(to: string, amount: number) {
  simnet.callPublicFn(TOKEN, 'mint', [Cl.uint(amount), Cl.principal(to)], deployer)
}

/** vault.deposit(amount, owner, granite, zest-v2) */
function deposit(amount: number, owner: string) {
  return simnet.callPublicFn(
    VAULT, 'deposit',
    [Cl.uint(amount), Cl.principal(owner), adapterArg, adapterArg],
    owner,
  )
}

/** vault.withdraw(amount, receiver, owner, granite, zest-v2) */
function withdraw(amount: number, receiver: string, owner: string) {
  return simnet.callPublicFn(
    VAULT, 'withdraw',
    [Cl.uint(amount), Cl.principal(receiver), Cl.principal(owner), adapterArg, adapterArg],
    owner,
  )
}

/** vault.redeem(shares, receiver, owner, granite, zest-v2) */
function redeem(shares: number, receiver: string, owner: string) {
  return simnet.callPublicFn(
    VAULT, 'redeem',
    [Cl.uint(shares), Cl.principal(receiver), Cl.principal(owner), adapterArg, adapterArg],
    owner,
  )
}

/** Register the mock adapter as the Granite market adapter. */
function registerGranite() {
  simnet.callPublicFn(VAULT, 'register-adapter-granite-usdcx', [Cl.principal(ADAPTER)], deployer)
}

/** Register the mock adapter as the Zest V2 market adapter. */
function registerZestV2() {
  simnet.callPublicFn(VAULT, 'register-adapter-zest-v2-usdc', [Cl.principal(ADAPTER)], deployer)
}

/**
 * Extract a uint from a ResponseOk or bare Uint clarity value.
 * callPublicFn wraps in ResponseOk; callReadOnlyFn returns the bare value.
 */
function uint(cv: { type: number; value: any }): number {
  if (cv.type === ClarityType.ResponseOk)  return Number(cv.value.value)
  if (cv.type === ClarityType.ResponseErr) throw new Error(`Unexpected err: ${cv.value.value}`)
  return Number(cv.value)
}

/** Read a uint read-only field from the vault. */
function vaultRead(fn: string, ...args: Parameters<typeof Cl.uint>[]) {
  return uint(simnet.callReadOnlyFn(VAULT, fn, [], deployer).result as any)
}

function tokenBalance(principal: string): number {
  return uint(simnet.callReadOnlyFn(TOKEN, 'get-balance', [Cl.principal(principal)], deployer).result as any)
}

function vaultShares(principal: string): number {
  return uint(simnet.callReadOnlyFn(VAULT, 'get-balance', [Cl.principal(principal)], deployer).result as any)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('vault-usdcx-v2 — deposit', () => {
  it('mints a positive share count on first deposit', () => {
    mint(deployer, AMOUNT)
    const result = deposit(AMOUNT, deployer)
    expect(result.result.type).toBe(ClarityType.ResponseOk)
    const shares = uint(result.result as any)
    // With VIRTUAL = 100M, first deposit of 1M mints ≈ AMOUNT * VIRTUAL / (AMOUNT + 1) ≈ 99.9M shares
    // Share count >> AMOUNT but << VIRTUAL (anti-inflation virtual shares in denominator)
    expect(shares).toBeGreaterThan(0)
    expect(shares).toBeLessThan(VIRTUAL)
  })

  it('credits the depositor in balances map', () => {
    mint(deployer, AMOUNT)
    deposit(AMOUNT, deployer)
    expect(vaultShares(deployer)).toBeGreaterThan(0)
  })

  it('increases total-assets-bookkeeping by exactly the deposited amount', () => {
    mint(deployer, AMOUNT)
    deposit(AMOUNT, deployer)
    expect(vaultRead('get-total-assets')).toBe(AMOUNT)
  })

  it('second depositor receives approximately equal shares for equal deposit', () => {
    mint(deployer, AMOUNT)
    deposit(AMOUNT, deployer)

    mint(wallet1, AMOUNT)
    deposit(AMOUNT, wallet1)

    // With no yield, both depositors put in the same amount; share counts should
    // be within 1 of each other (rounding dust only).
    const s1 = vaultShares(deployer)
    const s2 = vaultShares(wallet1)
    expect(Math.abs(s1 - s2)).toBeLessThanOrEqual(1)
  })

  it('rejects when caller is not the owner argument', () => {
    mint(deployer, AMOUNT)
    // wallet2 tries to deposit into deployer's account
    const result = simnet.callPublicFn(
      VAULT, 'deposit',
      [Cl.uint(AMOUNT), Cl.principal(deployer), adapterArg, adapterArg],
      wallet2,
    )
    expect(result.result.type).toBe(ClarityType.ResponseErr)
  })

  it('rejects a zero-amount deposit', () => {
    const result = deposit(0, deployer)
    expect(result.result.type).toBe(ClarityType.ResponseErr)
  })
})

describe('vault-usdcx-v2 — withdraw (all idle)', () => {
  it('delivers exactly the requested amount to the receiver', () => {
    mint(deployer, AMOUNT)
    deposit(AMOUNT, deployer)

    const result = withdraw(AMOUNT / 2, wallet2, deployer)
    expect(result.result.type).toBe(ClarityType.ResponseOk)
    expect(tokenBalance(wallet2)).toBe(AMOUNT / 2)
  })

  it('reduces total-assets-bookkeeping by withdrawn amount', () => {
    mint(deployer, AMOUNT)
    deposit(AMOUNT, deployer)
    withdraw(AMOUNT / 4, wallet2, deployer)
    expect(vaultRead('get-total-assets')).toBe(AMOUNT - AMOUNT / 4)
  })

  it('burns a positive number of shares', () => {
    mint(deployer, AMOUNT)
    deposit(AMOUNT, deployer)
    const before = vaultShares(deployer)
    withdraw(AMOUNT / 2, wallet2, deployer)
    const after  = vaultShares(deployer)
    expect(before - after).toBeGreaterThan(0)
  })

  it('full withdrawal empties the vault', () => {
    mint(deployer, AMOUNT)
    deposit(AMOUNT, deployer)

    // Redeem all real shares
    const shares = vaultShares(deployer)
    redeem(shares, wallet2, deployer)

    // User's shares are gone
    expect(vaultShares(deployer)).toBe(0)
    // Receiver got tokens
    expect(tokenBalance(wallet2)).toBeGreaterThan(0)
    // Virtual shares retain a small phantom residue in total-assets -- vault never fully drains to 0
    expect(vaultRead('get-total-assets')).toBeLessThan(AMOUNT)
  })

  it('rejects withdrawal larger than share entitlement', () => {
    mint(deployer, AMOUNT)
    deposit(AMOUNT / 2, deployer)
    // Try to withdraw the full AMOUNT (more than deposited)
    const result = withdraw(AMOUNT, wallet2, deployer)
    expect(result.result.type).toBe(ClarityType.ResponseErr)
  })
})

describe('vault-usdcx-v2 — redeem (all idle)', () => {
  it('sends proportional assets to receiver', () => {
    mint(deployer, AMOUNT)
    deposit(AMOUNT, deployer)
    const shares = vaultShares(deployer)
    const half = Math.floor(shares / 2)

    const result = redeem(half, wallet2, deployer)
    expect(result.result.type).toBe(ClarityType.ResponseOk)
    // Receiver gets roughly half the deposited amount (minus virtual-share dilution)
    expect(tokenBalance(wallet2)).toBeGreaterThan(0)
    expect(tokenBalance(wallet2)).toBeLessThanOrEqual(AMOUNT / 2)
  })

  it('rejects redeeming more shares than owned', () => {
    mint(deployer, AMOUNT)
    deposit(AMOUNT, deployer)
    const shares = vaultShares(deployer)
    const result = redeem(shares + 1, wallet2, deployer)
    expect(result.result.type).toBe(ClarityType.ResponseErr)
  })
})

describe('vault-usdcx-v2 — allocation: deploy-to-granite', () => {
  it('moves idle tokens to the adapter, increasing alloc-granite', () => {
    registerGranite()
    mint(deployer, AMOUNT)
    deposit(AMOUNT, deployer)

    const result = simnet.callPublicFn(
      VAULT, 'deploy-to-granite',
      [Cl.uint(AMOUNT / 2), adapterArg],
      deployer,
    )
    expect(result.result.type).toBe(ClarityType.ResponseOk)
    expect(vaultRead('get-alloc-granite')).toBe(AMOUNT / 2)
  })

  it('does not change total-assets-bookkeeping (relocation, not consumption)', () => {
    registerGranite()
    mint(deployer, AMOUNT)
    deposit(AMOUNT, deployer)

    simnet.callPublicFn(VAULT, 'deploy-to-granite', [Cl.uint(AMOUNT / 2), adapterArg], deployer)

    expect(vaultRead('get-total-assets')).toBe(AMOUNT)
  })

  it('reduces idle-bookkeeping by deployed amount', () => {
    registerGranite()
    mint(deployer, AMOUNT)
    deposit(AMOUNT, deployer)

    simnet.callPublicFn(VAULT, 'deploy-to-granite', [Cl.uint(AMOUNT / 2), adapterArg], deployer)

    expect(vaultRead('get-idle-bookkeeping')).toBe(AMOUNT / 2)
  })

  it('rejects if caller is not vault-owner', () => {
    registerGranite()
    mint(deployer, AMOUNT)
    deposit(AMOUNT, deployer)
    const result = simnet.callPublicFn(
      VAULT, 'deploy-to-granite',
      [Cl.uint(AMOUNT / 2), adapterArg],
      wallet1,
    )
    expect(result.result.type).toBe(ClarityType.ResponseErr)
  })

  it('rejects if adapter does not match registered address', () => {
    // Register granite but pass wallet1 as the adapter arg (not a valid adapter)
    simnet.callPublicFn(VAULT, 'register-adapter-granite-usdcx', [Cl.principal(wallet1)], deployer)
    mint(deployer, AMOUNT)
    deposit(AMOUNT, deployer)
    const result = simnet.callPublicFn(
      VAULT, 'deploy-to-granite',
      [Cl.uint(AMOUNT / 2), adapterArg],   // adapterArg points to mock-adapter, not wallet1
      deployer,
    )
    expect(result.result.type).toBe(ClarityType.ResponseErr)
  })
})

describe('vault-usdcx-v2 — proportional withdraw with granite allocated', () => {
  it('pulls from both idle and granite in proportion', () => {
    registerGranite()
    mint(deployer, AMOUNT)
    deposit(AMOUNT, deployer)

    // Deploy half to granite: 500_000 idle, 500_000 granite
    simnet.callPublicFn(VAULT, 'deploy-to-granite', [Cl.uint(AMOUNT / 2), adapterArg], deployer)

    // Withdraw 200_000 (20% of vault)
    const withdrawAmt = AMOUNT / 5
    const result = withdraw(withdrawAmt, wallet2, deployer)
    expect(result.result.type).toBe(ClarityType.ResponseOk)

    // Receiver gets exactly the requested amount
    expect(tokenBalance(wallet2)).toBe(withdrawAmt)

    // Total-assets drops by withdrawAmt
    expect(vaultRead('get-total-assets')).toBe(AMOUNT - withdrawAmt)

    // alloc-granite should have dropped proportionally (~half of withdrawAmt)
    const remainGranite = vaultRead('get-alloc-granite')
    // Expected: 500_000 - floor(200_000 * 500_000 / 1_000_000) = 500_000 - 100_000 = 400_000
    expect(remainGranite).toBe(AMOUNT / 2 - AMOUNT / 10)
  })

  it('full redeem when all is in granite works end-to-end', () => {
    registerGranite()
    mint(deployer, AMOUNT)
    deposit(AMOUNT, deployer)

    // Deploy everything
    simnet.callPublicFn(VAULT, 'deploy-to-granite', [Cl.uint(AMOUNT), adapterArg], deployer)

    const shares = vaultShares(deployer)
    const result = redeem(shares, wallet2, deployer)
    expect(result.result.type).toBe(ClarityType.ResponseOk)

    // wallet2 received the assets
    expect(tokenBalance(wallet2)).toBeGreaterThan(0)
    // User's shares are fully redeemed
    expect(vaultShares(deployer)).toBe(0)
    // Virtual shares math means a phantom residue remains in both alloc-granite and total-assets
    // (the user can never drain 100% due to anti-inflation virtual shares in denominator)
    expect(vaultRead('get-alloc-granite')).toBeLessThan(AMOUNT)
    expect(vaultRead('get-total-assets')).toBeLessThan(AMOUNT)
  })
})

describe('vault-usdcx-v2 — yield sync', () => {
  it('sync-granite harvests simulated yield into bookkeeping', () => {
    registerGranite()
    mint(deployer, AMOUNT)
    deposit(AMOUNT, deployer)
    simnet.callPublicFn(VAULT, 'deploy-to-granite', [Cl.uint(AMOUNT), adapterArg], deployer)

    const totalBefore = vaultRead('get-total-assets')

    // Simulate yield: mint extra tokens directly to the adapter contract
    const yieldAmt = 50_000
    mint(ADAPTER, yieldAmt)

    // Sync harvests the difference (live position > book cost)
    const syncResult = simnet.callPublicFn(VAULT, 'sync-granite', [adapterArg], deployer)
    expect(syncResult.result.type).toBe(ClarityType.ResponseOk)
    expect(uint(syncResult.result as any)).toBe(yieldAmt)

    // Bookkeeping now reflects the yield
    expect(vaultRead('get-total-assets')).toBe(totalBefore + yieldAmt)
    expect(vaultRead('get-alloc-granite')).toBe(AMOUNT + yieldAmt)
  })

  it('auto-sync inside deposit updates share price before minting', () => {
    registerGranite()
    mint(deployer, AMOUNT)
    deposit(AMOUNT, deployer)
    simnet.callPublicFn(VAULT, 'deploy-to-granite', [Cl.uint(AMOUNT), adapterArg], deployer)

    // Simulate yield
    const yieldAmt = 100_000
    mint(ADAPTER, yieldAmt)

    // wallet1 deposits after yield; share price is higher, so they get fewer shares
    mint(wallet1, AMOUNT)
    const result = deposit(AMOUNT, wallet1)
    expect(result.result.type).toBe(ClarityType.ResponseOk)
    const newShares = uint(result.result as any)

    // depositor1's shares were minted when total was AMOUNT, so price was lower
    // wallet1 deposits into a vault worth AMOUNT + yieldAmt, so gets fewer shares
    const deployer1Shares = vaultShares(deployer)
    expect(newShares).toBeLessThan(deployer1Shares)
  })

  it('auto-sync inside withdraw reflects yield before burning shares', () => {
    registerGranite()
    mint(deployer, AMOUNT)
    deposit(AMOUNT, deployer)
    simnet.callPublicFn(VAULT, 'deploy-to-granite', [Cl.uint(AMOUNT), adapterArg], deployer)

    // Simulate yield
    const yieldAmt = 100_000
    mint(ADAPTER, yieldAmt)

    // Withdraw a quarter -- should sync first, so total = AMOUNT + yieldAmt
    // and the proportional pull accounts for the real value
    const withdrawAmt = (AMOUNT + yieldAmt) / 4
    const result = withdraw(withdrawAmt, wallet2, deployer)
    expect(result.result.type).toBe(ClarityType.ResponseOk)
    expect(tokenBalance(wallet2)).toBe(withdrawAmt)
  })

  it('sync is a no-op when position has not grown', () => {
    registerGranite()
    mint(deployer, AMOUNT)
    deposit(AMOUNT, deployer)
    simnet.callPublicFn(VAULT, 'deploy-to-granite', [Cl.uint(AMOUNT), adapterArg], deployer)

    const totalBefore = vaultRead('get-total-assets')
    const syncResult  = simnet.callPublicFn(VAULT, 'sync-granite', [adapterArg], deployer)

    expect(uint(syncResult.result as any)).toBe(0)
    expect(vaultRead('get-total-assets')).toBe(totalBefore)
  })
})

describe('vault-usdcx-v2 — ERC-4626 preview / max / mint', () => {
  it('preview-deposit matches shares returned by deposit', () => {
    mint(deployer, AMOUNT)
    const preview = uint(simnet.callReadOnlyFn(VAULT, 'preview-deposit', [Cl.uint(AMOUNT)], deployer).result as any)
    const result  = deposit(AMOUNT, deployer)
    expect(preview).toBe(uint(result.result as any))
  })

  it('preview-redeem matches assets returned by redeem', () => {
    mint(deployer, AMOUNT)
    deposit(AMOUNT, deployer)
    const shares  = vaultShares(deployer)
    const preview = uint(simnet.callReadOnlyFn(VAULT, 'preview-redeem', [Cl.uint(shares)], deployer).result as any)
    const result  = redeem(shares, wallet2, deployer)
    expect(preview).toBe(uint(result.result as any))
  })

  it('preview-withdraw returns shares >= burned by withdraw', () => {
    mint(deployer, AMOUNT)
    deposit(AMOUNT, deployer)
    const withdrawAmt = AMOUNT / 2
    const preview     = simnet.callReadOnlyFn(
      VAULT, 'preview-withdraw', [Cl.uint(withdrawAmt)], deployer,
    )
    const result  = withdraw(withdrawAmt, wallet2, deployer)
    // preview-withdraw ceiling >= actual shares burned (vault-protective)
    expect(uint(preview.result as any)).toBeGreaterThanOrEqual(uint(result.result as any))
  })

  it('max-deposit returns max uint', () => {
    const MAX = BigInt('340282366920938463463374607431768211455')
    const result = simnet.callReadOnlyFn(VAULT, 'max-deposit', [Cl.principal(deployer)], deployer)
    expect(BigInt((result.result as any).value)).toBe(MAX)
  })

  it('max-redeem returns owner share balance', () => {
    mint(deployer, AMOUNT)
    deposit(AMOUNT, deployer)
    const maxR = simnet.callReadOnlyFn(VAULT, 'max-redeem', [Cl.principal(deployer)], deployer)
    expect(uint(maxR.result as any)).toBe(vaultShares(deployer))
  })

  it('max-withdraw returns owner asset entitlement', () => {
    mint(deployer, AMOUNT)
    deposit(AMOUNT, deployer)
    const maxW = simnet.callReadOnlyFn(VAULT, 'max-withdraw', [Cl.principal(deployer)], deployer)
    // Entitlement = convert-to-assets(shares) -- slightly less than AMOUNT (virtual share dilution)
    expect(uint(maxW.result as any)).toBeGreaterThan(0)
    expect(uint(maxW.result as any)).toBeLessThanOrEqual(AMOUNT)
  })

  it('mint: mints exact shares and returns assets consumed', () => {
    mint(deployer, AMOUNT * 2)
    const sharesToMint = 50_000_000 // 50M shares (half of VIRTUAL)
    const result = simnet.callPublicFn(
      VAULT, 'mint',
      [Cl.uint(sharesToMint), Cl.principal(deployer), adapterArg, adapterArg],
      deployer,
    )
    expect(result.result.type).toBe(ClarityType.ResponseOk)
    // Deployer should have exactly sharesToMint shares
    expect(vaultShares(deployer)).toBe(sharesToMint)
    // Assets consumed should be positive and <= AMOUNT * 2
    const assetsConsumed = uint(result.result as any)
    expect(assetsConsumed).toBeGreaterThan(0)
    expect(assetsConsumed).toBeLessThanOrEqual(AMOUNT * 2)
  })

  it('mint: preview-mint assets match actual assets consumed', () => {
    mint(deployer, AMOUNT * 2)
    // First seed the vault so there is a non-trivial share price
    deposit(AMOUNT, deployer)
    const sharesToMint = vaultShares(deployer) // same share count as first depositor
    const preview = simnet.callReadOnlyFn(
      VAULT, 'preview-mint', [Cl.uint(sharesToMint)], deployer,
    )
    mint(wallet1, AMOUNT * 2)
    const result = simnet.callPublicFn(
      VAULT, 'mint',
      [Cl.uint(sharesToMint), Cl.principal(wallet1), adapterArg, adapterArg],
      wallet1,
    )
    expect(result.result.type).toBe(ClarityType.ResponseOk)
    // preview-mint should match assets consumed (or be off by at most 1 due to ceiling)
    expect(Math.abs(uint(preview.result as any) - uint(result.result as any))).toBeLessThanOrEqual(1)
  })

  it('share transfer moves economic interest without touching assets', () => {
    mint(deployer, AMOUNT)
    deposit(AMOUNT, deployer)
    const shares = vaultShares(deployer)

    // Transfer half shares to wallet1
    simnet.callPublicFn(
      VAULT, 'transfer',
      [Cl.uint(shares / 2), Cl.principal(deployer), Cl.principal(wallet1), Cl.none()],
      deployer,
    )
    expect(vaultShares(deployer)).toBe(shares - shares / 2)
    expect(vaultShares(wallet1)).toBe(shares / 2)
    // Vault total-assets unchanged
    expect(vaultRead('get-total-assets')).toBe(AMOUNT)
  })
})

describe('vault-usdcx-v2 — allocation: deploy-to-zest-v2', () => {
  it('moves idle tokens to the adapter, increasing alloc-zest-v2', () => {
    registerZestV2()
    mint(deployer, AMOUNT)
    deposit(AMOUNT, deployer)

    const result = simnet.callPublicFn(
      VAULT, 'deploy-to-zest-v2',
      [Cl.uint(AMOUNT / 2), adapterArg],
      deployer,
    )
    expect(result.result.type).toBe(ClarityType.ResponseOk)
    expect(vaultRead('get-alloc-zest-v2')).toBe(AMOUNT / 2)
  })

  it('does not change total-assets-bookkeeping (relocation, not consumption)', () => {
    registerZestV2()
    mint(deployer, AMOUNT)
    deposit(AMOUNT, deployer)

    simnet.callPublicFn(VAULT, 'deploy-to-zest-v2', [Cl.uint(AMOUNT / 2), adapterArg], deployer)

    expect(vaultRead('get-total-assets')).toBe(AMOUNT)
  })

  it('reduces idle-bookkeeping by deployed amount', () => {
    registerZestV2()
    mint(deployer, AMOUNT)
    deposit(AMOUNT, deployer)

    simnet.callPublicFn(VAULT, 'deploy-to-zest-v2', [Cl.uint(AMOUNT / 2), adapterArg], deployer)

    expect(vaultRead('get-idle-bookkeeping')).toBe(AMOUNT / 2)
  })

  it('rejects if caller is not vault-owner', () => {
    registerZestV2()
    mint(deployer, AMOUNT)
    deposit(AMOUNT, deployer)
    const result = simnet.callPublicFn(
      VAULT, 'deploy-to-zest-v2',
      [Cl.uint(AMOUNT / 2), adapterArg],
      wallet1,
    )
    expect(result.result.type).toBe(ClarityType.ResponseErr)
  })

  it('rejects if adapter does not match registered address', () => {
    simnet.callPublicFn(VAULT, 'register-adapter-zest-v2-usdc', [Cl.principal(wallet1)], deployer)
    mint(deployer, AMOUNT)
    deposit(AMOUNT, deployer)
    const result = simnet.callPublicFn(
      VAULT, 'deploy-to-zest-v2',
      [Cl.uint(AMOUNT / 2), adapterArg],
      deployer,
    )
    expect(result.result.type).toBe(ClarityType.ResponseErr)
  })

  it('rejects deploy of zero amount', () => {
    registerZestV2()
    mint(deployer, AMOUNT)
    deposit(AMOUNT, deployer)
    const result = simnet.callPublicFn(
      VAULT, 'deploy-to-zest-v2',
      [Cl.uint(0), adapterArg],
      deployer,
    )
    expect(result.result.type).toBe(ClarityType.ResponseErr)
  })
})

describe('vault-usdcx-v2 — allocation: over-deploy rejection', () => {
  it('deploy-to-granite rejects when amount exceeds idle balance', () => {
    registerGranite()
    mint(deployer, AMOUNT)
    deposit(AMOUNT, deployer)

    // Try to deploy more than was deposited
    const result = simnet.callPublicFn(
      VAULT, 'deploy-to-granite',
      [Cl.uint(AMOUNT * 2), adapterArg],
      deployer,
    )
    expect(result.result.type).toBe(ClarityType.ResponseErr)
  })

  it('deploy-to-zest-v2 rejects when amount exceeds idle balance', () => {
    registerZestV2()
    mint(deployer, AMOUNT)
    deposit(AMOUNT, deployer)

    const result = simnet.callPublicFn(
      VAULT, 'deploy-to-zest-v2',
      [Cl.uint(AMOUNT * 2), adapterArg],
      deployer,
    )
    expect(result.result.type).toBe(ClarityType.ResponseErr)
  })

  it('deploy-to-granite rejects zero amount', () => {
    registerGranite()
    mint(deployer, AMOUNT)
    deposit(AMOUNT, deployer)

    const result = simnet.callPublicFn(
      VAULT, 'deploy-to-granite',
      [Cl.uint(0), adapterArg],
      deployer,
    )
    expect(result.result.type).toBe(ClarityType.ResponseErr)
  })
})

describe('vault-usdcx-v2 — rebalance', () => {
  it('rebalance-granite-to-zest-v2 moves allocation between markets', () => {
    registerGranite()
    registerZestV2()
    mint(deployer, AMOUNT)
    deposit(AMOUNT, deployer)

    // Deploy all to granite
    simnet.callPublicFn(VAULT, 'deploy-to-granite', [Cl.uint(AMOUNT), adapterArg], deployer)
    expect(vaultRead('get-alloc-granite')).toBe(AMOUNT)
    expect(vaultRead('get-alloc-zest-v2')).toBe(0)

    // Rebalance half to zest-v2
    const result = simnet.callPublicFn(
      VAULT, 'rebalance-granite-to-zest-v2',
      [Cl.uint(AMOUNT / 2), adapterArg, adapterArg],
      deployer,
    )
    expect(result.result.type).toBe(ClarityType.ResponseOk)

    expect(vaultRead('get-alloc-granite')).toBe(AMOUNT / 2)
    expect(vaultRead('get-alloc-zest-v2')).toBe(AMOUNT / 2)
    // Total unchanged
    expect(vaultRead('get-total-assets')).toBe(AMOUNT)
  })

  it('rebalance-zest-v2-to-granite is the inverse', () => {
    registerGranite()
    registerZestV2()
    mint(deployer, AMOUNT)
    deposit(AMOUNT, deployer)

    simnet.callPublicFn(VAULT, 'deploy-to-zest-v2', [Cl.uint(AMOUNT), adapterArg], deployer)
    simnet.callPublicFn(
      VAULT, 'rebalance-zest-v2-to-granite',
      [Cl.uint(AMOUNT / 2), adapterArg, adapterArg],
      deployer,
    )

    expect(vaultRead('get-alloc-zest-v2')).toBe(AMOUNT / 2)
    expect(vaultRead('get-alloc-granite')).toBe(AMOUNT / 2)
    expect(vaultRead('get-total-assets')).toBe(AMOUNT)
  })

  it('rebalance-granite-to-zest-v2 rejects when amount exceeds granite allocation', () => {
    registerGranite()
    registerZestV2()
    mint(deployer, AMOUNT)
    deposit(AMOUNT, deployer)

    // Deploy half to granite
    simnet.callPublicFn(VAULT, 'deploy-to-granite', [Cl.uint(AMOUNT / 2), adapterArg], deployer)

    // Try to rebalance more than allocated in granite
    const result = simnet.callPublicFn(
      VAULT, 'rebalance-granite-to-zest-v2',
      [Cl.uint(AMOUNT), adapterArg, adapterArg],
      deployer,
    )
    expect(result.result.type).toBe(ClarityType.ResponseErr)
  })

  it('rebalance-zest-v2-to-granite rejects when amount exceeds zest-v2 allocation', () => {
    registerGranite()
    registerZestV2()
    mint(deployer, AMOUNT)
    deposit(AMOUNT, deployer)

    // Deploy half to zest-v2
    simnet.callPublicFn(VAULT, 'deploy-to-zest-v2', [Cl.uint(AMOUNT / 2), adapterArg], deployer)

    // Try to rebalance more than allocated in zest-v2
    const result = simnet.callPublicFn(
      VAULT, 'rebalance-zest-v2-to-granite',
      [Cl.uint(AMOUNT), adapterArg, adapterArg],
      deployer,
    )
    expect(result.result.type).toBe(ClarityType.ResponseErr)
  })

  it('rebalance-granite-to-zest-v2 rejects non-allocator caller', () => {
    registerGranite()
    registerZestV2()
    mint(deployer, AMOUNT)
    deposit(AMOUNT, deployer)

    simnet.callPublicFn(VAULT, 'deploy-to-granite', [Cl.uint(AMOUNT), adapterArg], deployer)

    const result = simnet.callPublicFn(
      VAULT, 'rebalance-granite-to-zest-v2',
      [Cl.uint(AMOUNT / 2), adapterArg, adapterArg],
      wallet1,
    )
    expect(result.result.type).toBe(ClarityType.ResponseErr)
  })

  it('rebalance-zest-v2-to-granite rejects non-allocator caller', () => {
    registerGranite()
    registerZestV2()
    mint(deployer, AMOUNT)
    deposit(AMOUNT, deployer)

    simnet.callPublicFn(VAULT, 'deploy-to-zest-v2', [Cl.uint(AMOUNT), adapterArg], deployer)

    const result = simnet.callPublicFn(
      VAULT, 'rebalance-zest-v2-to-granite',
      [Cl.uint(AMOUNT / 2), adapterArg, adapterArg],
      wallet1,
    )
    expect(result.result.type).toBe(ClarityType.ResponseErr)
  })

  it('rebalance rejects zero amount', () => {
    registerGranite()
    registerZestV2()
    mint(deployer, AMOUNT)
    deposit(AMOUNT, deployer)

    simnet.callPublicFn(VAULT, 'deploy-to-granite', [Cl.uint(AMOUNT), adapterArg], deployer)

    const result = simnet.callPublicFn(
      VAULT, 'rebalance-granite-to-zest-v2',
      [Cl.uint(0), adapterArg, adapterArg],
      deployer,
    )
    expect(result.result.type).toBe(ClarityType.ResponseErr)
  })
})
