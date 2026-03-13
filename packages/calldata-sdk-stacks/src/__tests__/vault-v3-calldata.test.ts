import { describe, it, expect } from 'vitest'
import { cvToJSON } from '@stacks/transactions'
import {
  DeltaVaultV3,
  VAULT_V3_DEPLOYER,
  VAULT_V3_CONTRACTS,
  VAULT_V3_UNDERLYING,
} from '../vault/v3'

const USER = 'SP35E2BBMDT2Y1HB0NTK139YBGYV3PAPK3WA8BRNA'
const RECEIVER = 'SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7'
const NEW_OWNER = 'SP3M2BYF7RGF8WKW5FVDNJ6WR8D7AR9BHDXAKPXZE'

describe('DeltaVaultV3', () => {
  // === User operations ===

  describe('encodeDeposit', () => {
    it('targets the v3 vault contract', () => {
      const call = DeltaVaultV3.encodeDeposit(1_000_000n, USER)
      expect(call.contractAddress).toBe(VAULT_V3_DEPLOYER)
      expect(call.contractName).toBe('vault-usdcx-v3')
      expect(call.functionName).toBe('deposit')
    })

    it('encodes 5 args: amount, owner, token, granite-adapter, zest-adapter', () => {
      const call = DeltaVaultV3.encodeDeposit(5_000_000n, USER)
      expect(call.functionArgs).toHaveLength(5)
      expect(cvToJSON(call.functionArgs[0]).value).toBe('5000000')
      expect(cvToJSON(call.functionArgs[1]).value).toBe(USER)
      expect(cvToJSON(call.functionArgs[2]).value).toBe(VAULT_V3_UNDERLYING)
    })

    it('uses v3 default adapter principals', () => {
      const call = DeltaVaultV3.encodeDeposit(1_000_000n, USER)
      const graniteArg = cvToJSON(call.functionArgs[3])
      const zestArg = cvToJSON(call.functionArgs[4])
      expect(graniteArg.value).toBe(VAULT_V3_CONTRACTS.adapterGranite)
      expect(zestArg.value).toBe(VAULT_V3_CONTRACTS.adapterZestV2)
    })
  })

  describe('encodeMint', () => {
    it('encodes correct function and 5 args', () => {
      const call = DeltaVaultV3.encodeMint(50_000_000n, USER)
      expect(call.functionName).toBe('mint')
      expect(call.functionArgs).toHaveLength(5)
      expect(cvToJSON(call.functionArgs[0]).value).toBe('50000000')
      expect(cvToJSON(call.functionArgs[2]).value).toBe(VAULT_V3_UNDERLYING)
    })
  })

  describe('encodeWithdraw', () => {
    it('encodes 6 args: amount, receiver, owner, token, granite, zest', () => {
      const call = DeltaVaultV3.encodeWithdraw(1_000_000n, RECEIVER, USER)
      expect(call.functionName).toBe('withdraw')
      expect(call.functionArgs).toHaveLength(6)
      expect(cvToJSON(call.functionArgs[0]).value).toBe('1000000')
      expect(cvToJSON(call.functionArgs[1]).value).toBe(RECEIVER)
      expect(cvToJSON(call.functionArgs[2]).value).toBe(USER)
      expect(cvToJSON(call.functionArgs[3]).value).toBe(VAULT_V3_UNDERLYING)
    })
  })

  describe('encodeRedeem', () => {
    it('encodes 6 args: shares, receiver, owner, token, granite, zest', () => {
      const call = DeltaVaultV3.encodeRedeem(99_000_000n, RECEIVER, USER)
      expect(call.functionName).toBe('redeem')
      expect(call.functionArgs).toHaveLength(6)
      expect(cvToJSON(call.functionArgs[0]).value).toBe('99000000')
      expect(cvToJSON(call.functionArgs[3]).value).toBe(VAULT_V3_UNDERLYING)
    })
  })

  describe('encodeTransfer', () => {
    it('encodes SIP-010 transfer with none memo', () => {
      const call = DeltaVaultV3.encodeTransfer(1_000n, USER, RECEIVER)
      expect(call.functionName).toBe('transfer')
      expect(call.functionArgs).toHaveLength(4)
      expect(cvToJSON(call.functionArgs[3]).type).toBe('(optional none)')
    })
  })

  // === Sync operations ===

  describe('encodeSyncGranite', () => {
    it('encodes sync-granite with 1 arg', () => {
      const call = DeltaVaultV3.encodeSyncGranite()
      expect(call.functionName).toBe('sync-granite')
      expect(call.functionArgs).toHaveLength(1)
    })
  })

  describe('encodeSyncZestV2', () => {
    it('encodes sync-zest-v2 with 1 arg', () => {
      const call = DeltaVaultV3.encodeSyncZestV2()
      expect(call.functionName).toBe('sync-zest-v2')
      expect(call.functionArgs).toHaveLength(1)
    })
  })

  // === Allocator operations ===

  describe('encodeDeployToGranite', () => {
    it('encodes deploy-to-granite with amount and adapter', () => {
      const call = DeltaVaultV3.encodeDeployToGranite(500_000n)
      expect(call.functionName).toBe('deploy-to-granite')
      expect(call.functionArgs).toHaveLength(2)
      expect(cvToJSON(call.functionArgs[0]).value).toBe('500000')
    })
  })

  describe('encodeDeployToZestV2', () => {
    it('encodes deploy-to-zest-v2 with amount and adapter', () => {
      const call = DeltaVaultV3.encodeDeployToZestV2(500_000n)
      expect(call.functionName).toBe('deploy-to-zest-v2')
      expect(call.functionArgs).toHaveLength(2)
    })
  })

  describe('encodeRecallFromGranite', () => {
    it('encodes recall-from-granite with amount and adapter', () => {
      const call = DeltaVaultV3.encodeRecallFromGranite(300_000n)
      expect(call.functionName).toBe('recall-from-granite')
      expect(call.functionArgs).toHaveLength(2)
      expect(cvToJSON(call.functionArgs[0]).value).toBe('300000')
    })
  })

  describe('encodeRecallFromZestV2', () => {
    it('encodes recall-from-zest-v2 with amount and adapter', () => {
      const call = DeltaVaultV3.encodeRecallFromZestV2(300_000n)
      expect(call.functionName).toBe('recall-from-zest-v2')
      expect(call.functionArgs).toHaveLength(2)
      expect(cvToJSON(call.functionArgs[0]).value).toBe('300000')
    })
  })

  describe('encodeRebalanceGraniteToZestV2', () => {
    it('encodes with amount + 2 adapter args', () => {
      const call = DeltaVaultV3.encodeRebalanceGraniteToZestV2(250_000n)
      expect(call.functionName).toBe('rebalance-granite-to-zest-v2')
      expect(call.functionArgs).toHaveLength(3)
    })
  })

  describe('encodeRebalanceZestV2ToGranite', () => {
    it('encodes with amount + 2 adapter args (zest first)', () => {
      const call = DeltaVaultV3.encodeRebalanceZestV2ToGranite(250_000n)
      expect(call.functionName).toBe('rebalance-zest-v2-to-granite')
      expect(call.functionArgs).toHaveLength(3)
      expect(cvToJSON(call.functionArgs[1]).value).toBe(VAULT_V3_CONTRACTS.adapterZestV2)
      expect(cvToJSON(call.functionArgs[2]).value).toBe(VAULT_V3_CONTRACTS.adapterGranite)
    })
  })

  describe('encodeReallocate', () => {
    it('encodes zero-sum rebalance with 6 args', () => {
      const call = DeltaVaultV3.encodeReallocate(100_000n, 0n, 0n, 100_000n)
      expect(call.functionName).toBe('reallocate')
      expect(call.functionArgs).toHaveLength(6)
      expect(cvToJSON(call.functionArgs[0]).value).toBe('100000')  // from-granite
      expect(cvToJSON(call.functionArgs[1]).value).toBe('0')       // from-zest
      expect(cvToJSON(call.functionArgs[2]).value).toBe('0')       // to-granite
      expect(cvToJSON(call.functionArgs[3]).value).toBe('100000')  // to-zest
    })
  })

  // === Owner operations ===

  describe('encodeSetVaultOwner', () => {
    it('encodes set-vault-owner with 1 principal arg', () => {
      const call = DeltaVaultV3.encodeSetVaultOwner(NEW_OWNER)
      expect(call.functionName).toBe('set-vault-owner')
      expect(call.functionArgs).toHaveLength(1)
      expect(cvToJSON(call.functionArgs[0]).value).toBe(NEW_OWNER)
    })
  })

  describe('encodeSetVaultAllocator', () => {
    it('encodes set-vault-allocator with 1 principal arg', () => {
      const call = DeltaVaultV3.encodeSetVaultAllocator(NEW_OWNER)
      expect(call.functionName).toBe('set-vault-allocator')
      expect(call.functionArgs).toHaveLength(1)
    })
  })

  describe('encodeRegisterAdapterGranite', () => {
    it('encodes with v3 default adapter principal', () => {
      const call = DeltaVaultV3.encodeRegisterAdapterGranite()
      expect(call.functionName).toBe('register-adapter-granite-usdcx')
      expect(call.functionArgs).toHaveLength(1)
      expect(cvToJSON(call.functionArgs[0]).value).toBe(VAULT_V3_CONTRACTS.adapterGranite)
    })
  })

  describe('encodeRegisterAdapterZestV2', () => {
    it('encodes with v3 default adapter principal', () => {
      const call = DeltaVaultV3.encodeRegisterAdapterZestV2()
      expect(call.functionName).toBe('register-adapter-zest-v2-usdc')
      expect(call.functionArgs).toHaveLength(1)
      expect(cvToJSON(call.functionArgs[0]).value).toBe(VAULT_V3_CONTRACTS.adapterZestV2)
    })
  })

  describe('encodeSetFeeBps', () => {
    it('encodes set-fee-bps with 1 uint arg', () => {
      const call = DeltaVaultV3.encodeSetFeeBps(1000n)
      expect(call.functionName).toBe('set-fee-bps')
      expect(call.functionArgs).toHaveLength(1)
      expect(cvToJSON(call.functionArgs[0]).value).toBe('1000')
    })
  })

  describe('encodeSetFeeRecipient', () => {
    it('encodes set-fee-recipient with 1 principal arg', () => {
      const call = DeltaVaultV3.encodeSetFeeRecipient(NEW_OWNER)
      expect(call.functionName).toBe('set-fee-recipient')
      expect(call.functionArgs).toHaveLength(1)
      expect(cvToJSON(call.functionArgs[0]).value).toBe(NEW_OWNER)
    })
  })

  describe('encodeSetIdleBuffer', () => {
    it('encodes set-idle-buffer with 1 uint arg', () => {
      const call = DeltaVaultV3.encodeSetIdleBuffer(300n)
      expect(call.functionName).toBe('set-idle-buffer')
      expect(call.functionArgs).toHaveLength(1)
      expect(cvToJSON(call.functionArgs[0]).value).toBe('300')
    })
  })
})
