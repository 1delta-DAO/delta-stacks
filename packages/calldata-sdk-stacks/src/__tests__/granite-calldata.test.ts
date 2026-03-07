import { describe, it, expect } from 'vitest'
import { cvToJSON } from '@stacks/transactions'
import {
  GraniteLending,
  GRANITE_AEUSDC_MARKET,
  GRANITE_USDCX_MARKET,
  GRANITE_CORE_DEPLOYER,
  GRANITE_AEUSDC_DEPLOYER,
  GRANITE_USDCX_DEPLOYER,
} from '../granite'

const USER = 'SP35E2BBMDT2Y1HB0NTK139YBGYV3PAPK3WA8BRNA'
const SBTC = 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token'

describe('GraniteLending', () => {
  // === LP operations ===

  describe('encodeDeposit', () => {
    it('targets the aeUSDC market LP provider', () => {
      const call = GraniteLending.encodeDeposit(GRANITE_AEUSDC_MARKET, 1000000n, USER)
      expect(call.contractAddress).toBe(GRANITE_CORE_DEPLOYER)
      expect(call.contractName).toBe('liquidity-provider-v1')
      expect(call.functionName).toBe('deposit')
      expect(call.functionArgs).toHaveLength(2)
    })

    it('targets the USDCx market LP provider', () => {
      const call = GraniteLending.encodeDeposit(GRANITE_USDCX_MARKET, 5000000n, USER)
      expect(call.contractAddress).toBe(GRANITE_USDCX_DEPLOYER)
      expect(call.contractName).toBe('liquidity-provider-v1')
    })

    it('encodes amount and recipient correctly', () => {
      const call = GraniteLending.encodeDeposit(GRANITE_AEUSDC_MARKET, 5000000n, USER)
      expect(cvToJSON(call.functionArgs[0]).value).toBe('5000000')
      const recipientJson = cvToJSON(call.functionArgs[1])
      expect(recipientJson.value).toBe(USER)
    })
  })

  describe('encodeWithdraw', () => {
    it('has correct function name and 2 args', () => {
      const call = GraniteLending.encodeWithdraw(GRANITE_AEUSDC_MARKET, 500000n, USER)
      expect(call.functionName).toBe('withdraw')
      expect(call.functionArgs).toHaveLength(2)
    })
  })

  describe('encodeRedeem', () => {
    it('has correct function name and 2 args', () => {
      const call = GraniteLending.encodeRedeem(GRANITE_AEUSDC_MARKET, 500000n, USER)
      expect(call.functionName).toBe('redeem')
      expect(call.functionArgs).toHaveLength(2)
    })
  })

  // === Borrower operations ===

  describe('encodeAddCollateral', () => {
    it('targets the aeUSDC market borrower', () => {
      const call = GraniteLending.encodeAddCollateral(GRANITE_AEUSDC_MARKET, SBTC, 100000n)
      expect(call.contractAddress).toBe(GRANITE_CORE_DEPLOYER)
      expect(call.contractName).toBe('borrower-v1')
      expect(call.functionName).toBe('add-collateral')
      expect(call.functionArgs).toHaveLength(3)
    })

    it('encodes none for optional user when omitted', () => {
      const call = GraniteLending.encodeAddCollateral(GRANITE_AEUSDC_MARKET, SBTC, 100000n)
      const userJson = cvToJSON(call.functionArgs[2])
      expect(userJson.type).toContain('none')
    })

    it('encodes user when provided', () => {
      const call = GraniteLending.encodeAddCollateral(GRANITE_AEUSDC_MARKET, SBTC, 100000n, USER)
      const userJson = cvToJSON(call.functionArgs[2])
      expect(userJson.value).toBeDefined()
      expect(userJson.type).not.toContain('none')
    })
  })

  describe('encodeRemoveCollateral', () => {
    it('has correct arg count (4) with price feed and optional user', () => {
      const call = GraniteLending.encodeRemoveCollateral(GRANITE_AEUSDC_MARKET, SBTC, 50000n)
      expect(call.functionName).toBe('remove-collateral')
      expect(call.functionArgs).toHaveLength(4)
    })

    it('encodes none for price feed when omitted', () => {
      const call = GraniteLending.encodeRemoveCollateral(GRANITE_AEUSDC_MARKET, SBTC, 50000n)
      const feedJson = cvToJSON(call.functionArgs[0])
      expect(feedJson.type).toContain('none')
    })
  })

  describe('encodeBorrow', () => {
    it('targets the correct market borrower', () => {
      const call = GraniteLending.encodeBorrow(GRANITE_AEUSDC_MARKET, 1000000n)
      expect(call.contractAddress).toBe(GRANITE_CORE_DEPLOYER)
      expect(call.contractName).toBe('borrower-v1')
      expect(call.functionName).toBe('borrow')
      expect(call.functionArgs).toHaveLength(3)
    })

    it('targets USDCx market borrower', () => {
      const call = GraniteLending.encodeBorrow(GRANITE_USDCX_MARKET, 1000000n)
      expect(call.contractAddress).toBe(GRANITE_USDCX_DEPLOYER)
      expect(call.contractName).toBe('borrower-v1')
    })

    it('encodes none for optional fields when omitted', () => {
      const call = GraniteLending.encodeBorrow(GRANITE_AEUSDC_MARKET, 1000000n)
      expect(cvToJSON(call.functionArgs[0]).type).toContain('none') // price feed
      expect(cvToJSON(call.functionArgs[2]).type).toContain('none') // on-behalf-of
    })
  })

  describe('encodeRepay', () => {
    it('has correct function name and 2 args', () => {
      const call = GraniteLending.encodeRepay(GRANITE_AEUSDC_MARKET, 500000n)
      expect(call.functionName).toBe('repay')
      expect(call.functionArgs).toHaveLength(2)
    })

    it('encodes on-behalf-of when provided', () => {
      const call = GraniteLending.encodeRepay(GRANITE_AEUSDC_MARKET, 500000n, USER)
      expect(call.functionArgs).toHaveLength(2)
      const onBehalfJson = cvToJSON(call.functionArgs[1])
      expect(onBehalfJson.value).toBeDefined()
      expect(onBehalfJson.type).not.toContain('none')
    })
  })

  // === Liquidation ===

  describe('encodeLiquidate', () => {
    it('has correct function name and 5 args', () => {
      const call = GraniteLending.encodeLiquidate(
        GRANITE_AEUSDC_MARKET, SBTC, USER, 100000n, 50000n,
      )
      expect(call.functionName).toBe('liquidate-collateral')
      expect(call.functionArgs).toHaveLength(5)
    })
  })

  // === Flash Loan ===

  describe('encodeFlashLoan', () => {
    it('targets the core flash-loan contract', () => {
      const callback = `${GRANITE_CORE_DEPLOYER}.my-callback`
      const call = GraniteLending.encodeFlashLoan(GRANITE_AEUSDC_MARKET, 1000000n, callback)
      expect(call.contractAddress).toBe(GRANITE_CORE_DEPLOYER)
      expect(call.contractName).toBe('flash-loan-v1')
      expect(call.functionName).toBe('flash-loan')
      expect(call.functionArgs).toHaveLength(3)
    })

    it('encodes none for optional data when omitted', () => {
      const callback = `${GRANITE_CORE_DEPLOYER}.my-callback`
      const call = GraniteLending.encodeFlashLoan(GRANITE_AEUSDC_MARKET, 1000000n, callback)
      const dataJson = cvToJSON(call.functionArgs[2])
      expect(dataJson.type).toContain('none')
    })
  })
})
