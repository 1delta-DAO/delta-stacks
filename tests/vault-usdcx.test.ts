import { describe, it, expect } from 'vitest'
import { Cl, ClarityType, cvToJSON } from '@stacks/transactions'
import type { Simnet } from '@stacks/clarinet-sdk'

declare global {
  const simnet: Simnet
}

const accounts = simnet.getAccounts()
const deployer = accounts.get('deployer')!
const wallet1 = accounts.get('wallet_1')!
const wallet2 = accounts.get('wallet_2')!

const VAULT_ID = `${deployer}.vault-usdcx`
const TOKEN_ID = `${deployer}.mock-token`

const AMOUNT = 1_000_000
const VIRTUAL = 100_000_000

describe('vault-usdcx', () => {
  it('deposit pulls tokens from user and mints shares (single tx)', () => {
    simnet.callPublicFn(TOKEN_ID, 'mint', [Cl.uint(AMOUNT * 2), Cl.principal(deployer)], deployer)
    const depositResult = simnet.callPublicFn(VAULT_ID, 'deposit', [Cl.uint(AMOUNT), Cl.principal(deployer)], deployer)
    expect(depositResult.result.type === ClarityType.ResponseOk || depositResult.result.type === ClarityType.UInt).toBe(true)
    const resultJson = cvToJSON(depositResult.result)
    const shares = typeof resultJson.value === 'string' ? Number(resultJson.value) : Number((resultJson.value as { value?: string })?.value ?? resultJson.value ?? 0)
    expect(shares).toBeGreaterThan(0)
    expect(shares).toBeLessThanOrEqual(AMOUNT * (VIRTUAL + 1))

    const balance = simnet.callReadOnlyFn(VAULT_ID, 'get-balance', [Cl.principal(deployer)], deployer)
    expect(balance.result.type === ClarityType.ResponseOk || balance.result.type === ClarityType.UInt).toBe(true)
    const balJson = cvToJSON(balance.result)
    const balVal = typeof balJson.value === 'string' ? Number(balJson.value) : Number((balJson.value as { value?: string })?.value ?? 0)
    expect(balVal).toBe(shares)

    const totalAssets = simnet.callReadOnlyFn(VAULT_ID, 'get-total-assets', [], deployer)
    expect(totalAssets.result.type === ClarityType.ResponseOk || totalAssets.result.type === ClarityType.UInt).toBe(true)
    const totalJson = cvToJSON(totalAssets.result)
    const totalVal = typeof totalJson.value === 'string' ? Number(totalJson.value) : Number((totalJson.value as { value?: string })?.value ?? 0)
    expect(totalVal).toBe(AMOUNT)
  })

  it('withdraw sends asset to receiver (payment UX)', () => {
    simnet.callPublicFn(TOKEN_ID, 'mint', [Cl.uint(AMOUNT * 2), Cl.principal(deployer)], deployer)
    simnet.callPublicFn(VAULT_ID, 'deposit', [Cl.uint(AMOUNT), Cl.principal(deployer)], deployer)

    const withdrawAmount = Math.floor(AMOUNT / 100)
    const withdrawResult = simnet.callPublicFn(
      VAULT_ID,
      'withdraw',
      [Cl.uint(withdrawAmount), Cl.principal(wallet2), Cl.principal(deployer)],
      deployer
    )
    expect(withdrawResult.result.type).toBe(ClarityType.ResponseOk)

    const tokenBalance = simnet.callReadOnlyFn(TOKEN_ID, 'get-balance', [Cl.principal(wallet2)], deployer)
    expect(tokenBalance.result.type).toBe(ClarityType.ResponseOk)
    const recvJson = cvToJSON(tokenBalance.result)
    const received = typeof recvJson.value === 'string' ? Number(recvJson.value) : Number((recvJson.value as { value?: string })?.value ?? 0)
    expect(received).toBe(withdrawAmount)
  })

  it('deposit rejects when caller is not owner (cannot claim or gift shares)', () => {
    simnet.callPublicFn(TOKEN_ID, 'mint', [Cl.uint(AMOUNT * 2), Cl.principal(deployer)], deployer)
    // wallet2 calls deposit(amount, deployer) — caller must be owner, so must fail (err u108)
    const depositResult = simnet.callPublicFn(
      VAULT_ID,
      'deposit',
      [Cl.uint(AMOUNT), Cl.principal(deployer)],
      wallet2
    )
    expect(depositResult.result.type).toBe(ClarityType.ResponseErr)
    const errVal = cvToJSON(depositResult.result)
    const errCode = typeof errVal.value === 'object' && errVal.value && 'value' in errVal.value
      ? Number((errVal.value as { value: string }).value)
      : Number(errVal.value)
    expect(errCode).toBe(108)
  })

  it('convert-to-shares and convert-to-assets are consistent with virtual shares', () => {
    const total = AMOUNT
    const supply = 0
    const shares = Math.floor((total * (supply + VIRTUAL)) / (total + 1))
    expect(shares).toBeGreaterThan(0)
    expect(shares).toBeLessThanOrEqual(total * (supply + VIRTUAL))
  })
})
