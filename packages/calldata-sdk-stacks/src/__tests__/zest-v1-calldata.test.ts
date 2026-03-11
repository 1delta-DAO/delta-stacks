import { describe, it, expect } from 'vitest'
import { cvToJSON } from '@stacks/transactions'
import { ZestV1Lending, ZEST_V1_DEPLOYER } from '../zest-v1'
import type { AssetOracleLp } from '../zest-v1'

const POOL_RESERVE = `${ZEST_V1_DEPLOYER}.pool-0-reserve-v2-0`
const WSTX = `${ZEST_V1_DEPLOYER}.wstx`
const ZWSTX = `${ZEST_V1_DEPLOYER}.zwstx-v2-0`
const ORACLE = `${ZEST_V1_DEPLOYER}.oracle-stx`
const FEE_CALC = `${ZEST_V1_DEPLOYER}.fees-calculator`
const USER = 'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N'

const sampleAssets: AssetOracleLp[] = [
  { asset: WSTX, lpToken: ZWSTX, oracle: ORACLE },
]

describe('ZestV1Lending', () => {
  describe('encodeSupply', () => {
    it('returns correct contract target', () => {
      const call = ZestV1Lending.encodeSupply(ZWSTX, POOL_RESERVE, WSTX, 1000000n, USER)

      expect(call.contractAddress).toBe(ZEST_V1_DEPLOYER)
      expect(call.contractName).toBe('borrow-helper-v2-1-7')
      expect(call.functionName).toBe('supply')
    })

    it('encodes 7 function arguments (including referral + incentives)', () => {
      const call = ZestV1Lending.encodeSupply(ZWSTX, POOL_RESERVE, WSTX, 1000000n, USER)
      expect(call.functionArgs).toHaveLength(7)
    })

    it('encodes amount as uint', () => {
      const call = ZestV1Lending.encodeSupply(ZWSTX, POOL_RESERVE, WSTX, 5000000n, USER)
      const json = cvToJSON(call.functionArgs[3])
      expect(json.value).toBe('5000000')
    })
  })

  describe('encodeWithdraw', () => {
    it('returns correct function name', () => {
      const call = ZestV1Lending.encodeWithdraw(
        POOL_RESERVE, WSTX, ZWSTX, ORACLE, sampleAssets, 500000n, USER,
      )
      expect(call.functionName).toBe('withdraw')
    })

    it('encodes 9 arguments (including incentives + price-feed-bytes)', () => {
      const call = ZestV1Lending.encodeWithdraw(
        POOL_RESERVE, WSTX, ZWSTX, ORACLE, sampleAssets, 500000n, USER,
      )
      expect(call.functionArgs).toHaveLength(9)
    })
  })

  describe('encodeBorrow', () => {
    it('returns correct function name and arg count', () => {
      const call = ZestV1Lending.encodeBorrow(
        POOL_RESERVE, ORACLE, WSTX, ZWSTX, sampleAssets,
        1000000n, FEE_CALC, 1, USER,
      )
      expect(call.functionName).toBe('borrow')
      expect(call.functionArgs).toHaveLength(10)
    })

    it('encodes interest rate mode as uint', () => {
      const call = ZestV1Lending.encodeBorrow(
        POOL_RESERVE, ORACLE, WSTX, ZWSTX, sampleAssets,
        1000000n, FEE_CALC, 2, USER,
      )
      const json = cvToJSON(call.functionArgs[7])
      expect(json.value).toBe('2')
    })
  })

  describe('encodeRepay', () => {
    it('returns correct function name and arg count', () => {
      const call = ZestV1Lending.encodeRepay(WSTX, 500000n, USER, USER)
      expect(call.functionName).toBe('repay')
      expect(call.functionArgs).toHaveLength(4)
    })
  })

  describe('encodeSetUserUseReserveAsCollateral', () => {
    it('encodes boolean correctly', () => {
      const call = ZestV1Lending.encodeSetUserUseReserveAsCollateral(
        USER, ZWSTX, WSTX, true, ORACLE, sampleAssets,
      )
      expect(call.functionName).toBe('set-user-use-reserve-as-collateral')
      const boolJson = cvToJSON(call.functionArgs[3])
      expect(boolJson.value).toBe(true)
    })
  })

  describe('encodeSetEMode', () => {
    it('encodes e-mode type as buff(1)', () => {
      const call = ZestV1Lending.encodeSetEMode(USER, sampleAssets, 0x01)
      expect(call.functionName).toBe('set-e-mode')
      expect(call.functionArgs).toHaveLength(4)
      // The third arg is buff(1) with value 0x01
      const buffJson = cvToJSON(call.functionArgs[2])
      expect(buffJson.value).toBe('0x01')
    })
  })

  describe('encodeLiquidationCall', () => {
    it('returns correct function name and arg count', () => {
      const call = ZestV1Lending.encodeLiquidationCall(
        sampleAssets, ZWSTX, WSTX, WSTX, ORACLE, ORACLE, USER, 100000n, false,
      )
      expect(call.functionName).toBe('liquidation-call')
      expect(call.functionArgs).toHaveLength(10)
    })
  })
})
