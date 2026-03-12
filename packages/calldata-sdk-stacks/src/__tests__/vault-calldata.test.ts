import { describe, it, expect } from 'vitest'
import { cvToJSON } from '@stacks/transactions'
import {
  DeltaVault,
  VAULT_DEPLOYER,
  VAULT_CONTRACTS,
} from '../vault'

const USER = 'SP35E2BBMDT2Y1HB0NTK139YBGYV3PAPK3WA8BRNA'
const RECEIVER = 'SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7'
const NEW_OWNER = 'SP3M2BYF7RGF8WKW5FVDNJ6WR8D7AR9BHDXAKPXZE'

describe('DeltaVault', () => {
  // === User operations ===

  describe('encodeDeposit', () => {
    it('targets the vault contract with correct function', () => {
      const call = DeltaVault.encodeDeposit(1_000_000n, USER)
      expect(call.contractAddress).toBe(VAULT_DEPLOYER)
      expect(call.contractName).toBe('vault-usdcx-v2-prod')
      expect(call.functionName).toBe('deposit')
    })

    it('encodes 4 args: amount, owner, granite-adapter, zest-adapter', () => {
      const call = DeltaVault.encodeDeposit(5_000_000n, USER)
      expect(call.functionArgs).toHaveLength(4)
      expect(cvToJSON(call.functionArgs[0]).value).toBe('5000000')
      expect(cvToJSON(call.functionArgs[1]).value).toBe(USER)
    })

    it('uses default adapter principals', () => {
      const call = DeltaVault.encodeDeposit(1_000_000n, USER)
      const graniteArg = cvToJSON(call.functionArgs[2])
      const zestArg = cvToJSON(call.functionArgs[3])
      expect(graniteArg.value).toBe(VAULT_CONTRACTS.adapterGranite)
      expect(zestArg.value).toBe(VAULT_CONTRACTS.adapterZestV2)
    })
  })

  describe('encodeMint', () => {
    it('encodes correct function and 4 args', () => {
      const call = DeltaVault.encodeMint(50_000_000n, USER)
      expect(call.functionName).toBe('mint')
      expect(call.functionArgs).toHaveLength(4)
      expect(cvToJSON(call.functionArgs[0]).value).toBe('50000000')
    })
  })

  describe('encodeWithdraw', () => {
    it('encodes 5 args: amount, receiver, owner, granite, zest', () => {
      const call = DeltaVault.encodeWithdraw(1_000_000n, RECEIVER, USER)
      expect(call.functionName).toBe('withdraw')
      expect(call.functionArgs).toHaveLength(5)
      expect(cvToJSON(call.functionArgs[0]).value).toBe('1000000')
      expect(cvToJSON(call.functionArgs[1]).value).toBe(RECEIVER)
      expect(cvToJSON(call.functionArgs[2]).value).toBe(USER)
    })
  })

  describe('encodeRedeem', () => {
    it('encodes 5 args: shares, receiver, owner, granite, zest', () => {
      const call = DeltaVault.encodeRedeem(99_000_000n, RECEIVER, USER)
      expect(call.functionName).toBe('redeem')
      expect(call.functionArgs).toHaveLength(5)
      expect(cvToJSON(call.functionArgs[0]).value).toBe('99000000')
    })
  })

  describe('encodeTransfer', () => {
    it('encodes SIP-010 transfer with none memo', () => {
      const call = DeltaVault.encodeTransfer(1_000n, USER, RECEIVER)
      expect(call.functionName).toBe('transfer')
      expect(call.functionArgs).toHaveLength(4)
      expect(cvToJSON(call.functionArgs[3]).type).toBe('(optional none)')
    })
  })

  // === Sync operations ===

  describe('encodeSyncGranite', () => {
    it('encodes sync-granite with 1 arg', () => {
      const call = DeltaVault.encodeSyncGranite()
      expect(call.functionName).toBe('sync-granite')
      expect(call.functionArgs).toHaveLength(1)
    })
  })

  describe('encodeSyncZestV2', () => {
    it('encodes sync-zest-v2 with 1 arg', () => {
      const call = DeltaVault.encodeSyncZestV2()
      expect(call.functionName).toBe('sync-zest-v2')
      expect(call.functionArgs).toHaveLength(1)
    })
  })

  // === Allocator operations ===

  describe('encodeDeployToGranite', () => {
    it('encodes deploy-to-granite with amount and adapter', () => {
      const call = DeltaVault.encodeDeployToGranite(500_000n)
      expect(call.functionName).toBe('deploy-to-granite')
      expect(call.functionArgs).toHaveLength(2)
      expect(cvToJSON(call.functionArgs[0]).value).toBe('500000')
    })
  })

  describe('encodeDeployToZestV2', () => {
    it('encodes deploy-to-zest-v2 with amount and adapter', () => {
      const call = DeltaVault.encodeDeployToZestV2(500_000n)
      expect(call.functionName).toBe('deploy-to-zest-v2')
      expect(call.functionArgs).toHaveLength(2)
    })
  })

  describe('encodeRebalanceGraniteToZestV2', () => {
    it('encodes with amount + 2 adapter args', () => {
      const call = DeltaVault.encodeRebalanceGraniteToZestV2(250_000n)
      expect(call.functionName).toBe('rebalance-granite-to-zest-v2')
      expect(call.functionArgs).toHaveLength(3)
    })
  })

  describe('encodeRebalanceZestV2ToGranite', () => {
    it('encodes with amount + 2 adapter args (zest first)', () => {
      const call = DeltaVault.encodeRebalanceZestV2ToGranite(250_000n)
      expect(call.functionName).toBe('rebalance-zest-v2-to-granite')
      expect(call.functionArgs).toHaveLength(3)
      // zest-v2 adapter should be first arg (matches contract signature)
      expect(cvToJSON(call.functionArgs[1]).value).toBe(VAULT_CONTRACTS.adapterZestV2)
      expect(cvToJSON(call.functionArgs[2]).value).toBe(VAULT_CONTRACTS.adapterGranite)
    })
  })

  // === Owner operations ===

  describe('encodeSetVaultOwner', () => {
    it('encodes set-vault-owner with 1 principal arg', () => {
      const call = DeltaVault.encodeSetVaultOwner(NEW_OWNER)
      expect(call.functionName).toBe('set-vault-owner')
      expect(call.functionArgs).toHaveLength(1)
      expect(cvToJSON(call.functionArgs[0]).value).toBe(NEW_OWNER)
    })
  })

  describe('encodeSetVaultAllocator', () => {
    it('encodes set-vault-allocator with 1 principal arg', () => {
      const call = DeltaVault.encodeSetVaultAllocator(NEW_OWNER)
      expect(call.functionName).toBe('set-vault-allocator')
      expect(call.functionArgs).toHaveLength(1)
    })
  })

  describe('encodeRegisterAdapterGranite', () => {
    it('encodes with default adapter principal', () => {
      const call = DeltaVault.encodeRegisterAdapterGranite()
      expect(call.functionName).toBe('register-adapter-granite-usdcx')
      expect(call.functionArgs).toHaveLength(1)
      expect(cvToJSON(call.functionArgs[0]).value).toBe(VAULT_CONTRACTS.adapterGranite)
    })
  })

  describe('encodeRegisterAdapterZestV2', () => {
    it('encodes with default adapter principal', () => {
      const call = DeltaVault.encodeRegisterAdapterZestV2()
      expect(call.functionName).toBe('register-adapter-zest-v2-usdc')
      expect(call.functionArgs).toHaveLength(1)
      expect(cvToJSON(call.functionArgs[0]).value).toBe(VAULT_CONTRACTS.adapterZestV2)
    })
  })
})
