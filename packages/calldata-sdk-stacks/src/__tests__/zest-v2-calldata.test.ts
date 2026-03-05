import { describe, it, expect } from 'vitest'
import { cvToJSON } from '@stacks/transactions'
import { ZestV2Lending, ZestV2EGroup, ZEST_V2_DEPLOYER, ZEST_V2_CONTRACTS } from '../zest-v2'

const VAULT_STX = ZEST_V2_CONTRACTS.vaultStx
const VAULT_SBTC = ZEST_V2_CONTRACTS.vaultSbtc
const USER = 'SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7'

describe('ZestV2Lending', () => {
  describe('encodeSupplyCollateralAdd', () => {
    it('targets the market contract', () => {
      const call = ZestV2Lending.encodeSupplyCollateralAdd(VAULT_STX, 1000000n, 0n)

      expect(call.contractAddress).toBe(ZEST_V2_DEPLOYER)
      expect(call.contractName).toBe('v0-4-market')
      expect(call.functionName).toBe('supply-collateral-add')
    })

    it('encodes 4 arguments', () => {
      const call = ZestV2Lending.encodeSupplyCollateralAdd(VAULT_STX, 1000000n, 0n)
      expect(call.functionArgs).toHaveLength(4)
    })

    it('encodes amount correctly', () => {
      const call = ZestV2Lending.encodeSupplyCollateralAdd(VAULT_STX, 5000000n, 100n)
      const amountJson = cvToJSON(call.functionArgs[1])
      expect(amountJson.value).toBe('5000000')
      const minSharesJson = cvToJSON(call.functionArgs[2])
      expect(minSharesJson.value).toBe('100')
    })

    it('encodes none for missing price feeds', () => {
      const call = ZestV2Lending.encodeSupplyCollateralAdd(VAULT_STX, 1000000n, 0n)
      const feedsJson = cvToJSON(call.functionArgs[3])
      expect(feedsJson.type).toContain('none')
    })
  })

  describe('encodeCollateralAdd', () => {
    it('has correct function name and 3 args', () => {
      const call = ZestV2Lending.encodeCollateralAdd(VAULT_STX, 500000n)
      expect(call.functionName).toBe('collateral-add')
      expect(call.functionArgs).toHaveLength(3)
    })
  })

  describe('encodeCollateralRemove', () => {
    it('encodes optional receiver as none when omitted', () => {
      const call = ZestV2Lending.encodeCollateralRemove(VAULT_STX, 500000n)
      const receiverJson = cvToJSON(call.functionArgs[2])
      expect(receiverJson.type).toContain('none')
    })

    it('encodes optional receiver when provided', () => {
      const call = ZestV2Lending.encodeCollateralRemove(VAULT_STX, 500000n, USER)
      const receiverJson = cvToJSON(call.functionArgs[2])
      expect(receiverJson.value).toBeDefined()
      expect(receiverJson.type).not.toContain('none')
    })
  })

  describe('encodeCollateralRemoveRedeem', () => {
    it('returns correct function name and 5 args', () => {
      const call = ZestV2Lending.encodeCollateralRemoveRedeem(
        VAULT_STX, 1000000n, 900000n,
      )
      expect(call.functionName).toBe('collateral-remove-redeem')
      expect(call.functionArgs).toHaveLength(5)
    })
  })

  describe('encodeBorrow', () => {
    it('returns correct structure', () => {
      const call = ZestV2Lending.encodeBorrow(VAULT_STX, 1000000n)
      expect(call.functionName).toBe('borrow')
      expect(call.functionArgs).toHaveLength(4)
      expect(call.contractAddress).toBe(ZEST_V2_DEPLOYER)
    })

    it('encodes optional receiver', () => {
      const call = ZestV2Lending.encodeBorrow(VAULT_STX, 1000000n, USER)
      const receiverJson = cvToJSON(call.functionArgs[2])
      expect(receiverJson.value).toBeDefined()
      expect(receiverJson.type).not.toContain('none')
    })
  })

  describe('encodeRepay', () => {
    it('returns correct structure with 3 args', () => {
      const call = ZestV2Lending.encodeRepay(VAULT_STX, 500000n)
      expect(call.functionName).toBe('repay')
      expect(call.functionArgs).toHaveLength(3)
    })

    it('encodes on-behalf-of when provided', () => {
      const call = ZestV2Lending.encodeRepay(VAULT_STX, 500000n, USER)
      const onBehalfJson = cvToJSON(call.functionArgs[2])
      expect(onBehalfJson.value).toBeDefined()
      expect(onBehalfJson.type).not.toContain('none')
    })
  })

  describe('encodeLiquidate', () => {
    it('returns correct function name and 7 args', () => {
      const call = ZestV2Lending.encodeLiquidate(
        USER, VAULT_STX, VAULT_SBTC, 100000n, 50000n,
      )
      expect(call.functionName).toBe('liquidate')
      expect(call.functionArgs).toHaveLength(7)
    })
  })

  describe('encodeLiquidateRedeem', () => {
    it('returns correct function name and 8 args', () => {
      const call = ZestV2Lending.encodeLiquidateRedeem(
        USER, VAULT_STX, VAULT_SBTC, 100000n, 50000n, 40000n,
      )
      expect(call.functionName).toBe('liquidate-redeem')
      expect(call.functionArgs).toHaveLength(8)
    })
  })
})

describe('ZestV2EGroup', () => {
  it('encodes insert with tuple argument', () => {
    const call = ZestV2EGroup.encodeInsert({
      mask: 0n,
      ltvBorrow: 8000n,
      ltvLiqPartial: 8500n,
      ltvLiqFull: 9000n,
      liqPenaltyMin: 500n,
      liqPenaltyMax: 1000n,
      liqCurveExp: 2n,
      borrowDisabledMask: 0n,
    })
    expect(call.functionName).toBe('insert')
    expect(call.contractName).toBe('v0-egroup')
    expect(call.functionArgs).toHaveLength(1)
  })

  it('encodes update with group ID and tuple', () => {
    const call = ZestV2EGroup.encodeUpdate(1n, {
      mask: 0n,
      ltvBorrow: 8000n,
      ltvLiqPartial: 8500n,
      ltvLiqFull: 9000n,
      liqPenaltyMin: 500n,
      liqPenaltyMax: 1000n,
      liqCurveExp: 2n,
      borrowDisabledMask: 0n,
    })
    expect(call.functionName).toBe('update')
    expect(call.functionArgs).toHaveLength(2)
    const idJson = cvToJSON(call.functionArgs[0])
    expect(idJson.value).toBe('1')
  })
})
