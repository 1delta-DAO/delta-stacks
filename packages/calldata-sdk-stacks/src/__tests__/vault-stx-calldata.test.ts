import { describe, it, expect } from 'vitest'
import { cvToJSON } from '@stacks/transactions'
import {
  DeltaVaultSTX,
  VAULT_STX_DEPLOYER,
  VAULT_STX_CONTRACTS,
  VAULT_STX_UNDERLYING,
  WSTX_ZEST_V1,
} from '../vault/v3-stx'

const USER = 'SP35E2BBMDT2Y1HB0NTK139YBGYV3PAPK3WA8BRNA'
const RECEIVER = 'SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7'
const NEW_OWNER = 'SP3M2BYF7RGF8WKW5FVDNJ6WR8D7AR9BHDXAKPXZE'

describe('DeltaVaultSTX', () => {
  // === User operations ===

  describe('encodeDeposit', () => {
    it('targets the STX vault contract', () => {
      const call = DeltaVaultSTX.encodeDeposit(1_000_000n, USER)
      expect(call.contractAddress).toBe(VAULT_STX_DEPLOYER)
      expect(call.contractName).toBe('vault-stx-v5-5')
      expect(call.functionName).toBe('deposit')
    })

    it('encodes 5 args: amount, owner, token, zest-v1, zest-v2', () => {
      const call = DeltaVaultSTX.encodeDeposit(5_000_000n, USER)
      expect(call.functionArgs).toHaveLength(5)
      expect(cvToJSON(call.functionArgs[0]).value).toBe('5000000')
      expect(cvToJSON(call.functionArgs[1]).value).toBe(USER)
      expect(cvToJSON(call.functionArgs[2]).value).toBe(VAULT_STX_UNDERLYING)
    })

    it('uses default adapter principals', () => {
      const call = DeltaVaultSTX.encodeDeposit(1_000_000n, USER)
      const v1Arg = cvToJSON(call.functionArgs[3])
      const v2Arg = cvToJSON(call.functionArgs[4])
      expect(v1Arg.value).toBe(VAULT_STX_CONTRACTS.adapterZestV1)
      expect(v2Arg.value).toBe(VAULT_STX_CONTRACTS.adapterZestV2)
    })

    it('accepts custom adapter overrides', () => {
      const custom = { zestV1: `${RECEIVER}.custom-v1`, zestV2: `${NEW_OWNER}.custom-v2` }
      const call = DeltaVaultSTX.encodeDeposit(1_000_000n, USER, VAULT_STX_UNDERLYING, custom)
      expect(cvToJSON(call.functionArgs[3]).value).toBe(`${RECEIVER}.custom-v1`)
      expect(cvToJSON(call.functionArgs[4]).value).toBe(`${NEW_OWNER}.custom-v2`)
    })
  })

  describe('encodeMint', () => {
    it('encodes correct function and 5 args', () => {
      const call = DeltaVaultSTX.encodeMint(50_000_000n, USER)
      expect(call.functionName).toBe('mint')
      expect(call.functionArgs).toHaveLength(5)
      expect(cvToJSON(call.functionArgs[0]).value).toBe('50000000')
      expect(cvToJSON(call.functionArgs[2]).value).toBe(VAULT_STX_UNDERLYING)
    })
  })

  describe('encodeWithdraw', () => {
    it('encodes 6 args: amount, receiver, owner, token, v1, v2', () => {
      const call = DeltaVaultSTX.encodeWithdraw(1_000_000n, RECEIVER, USER)
      expect(call.functionName).toBe('withdraw')
      expect(call.functionArgs).toHaveLength(6)
      expect(cvToJSON(call.functionArgs[0]).value).toBe('1000000')
      expect(cvToJSON(call.functionArgs[1]).value).toBe(RECEIVER)
      expect(cvToJSON(call.functionArgs[2]).value).toBe(USER)
      expect(cvToJSON(call.functionArgs[3]).value).toBe(VAULT_STX_UNDERLYING)
    })
  })

  describe('encodeRedeem', () => {
    it('encodes 6 args: shares, receiver, owner, token, v1, v2', () => {
      const call = DeltaVaultSTX.encodeRedeem(99_000_000n, RECEIVER, USER)
      expect(call.functionName).toBe('redeem')
      expect(call.functionArgs).toHaveLength(6)
      expect(cvToJSON(call.functionArgs[0]).value).toBe('99000000')
      expect(cvToJSON(call.functionArgs[3]).value).toBe(VAULT_STX_UNDERLYING)
    })
  })

  // === Native STX convenience functions ===

  describe('encodeDepositStx', () => {
    it('targets deposit-stx function', () => {
      const call = DeltaVaultSTX.encodeDepositStx(10_000_000n, USER)
      expect(call.contractAddress).toBe(VAULT_STX_DEPLOYER)
      expect(call.contractName).toBe('vault-stx-v5-5')
      expect(call.functionName).toBe('deposit-stx')
    })

    it('encodes 4 args (no token): amount, owner, v1-adapter, v2-adapter', () => {
      const call = DeltaVaultSTX.encodeDepositStx(5_000_000n, USER)
      expect(call.functionArgs).toHaveLength(4)
      expect(cvToJSON(call.functionArgs[0]).value).toBe('5000000')
      expect(cvToJSON(call.functionArgs[1]).value).toBe(USER)
      expect(cvToJSON(call.functionArgs[2]).value).toBe(VAULT_STX_CONTRACTS.adapterZestV1)
      expect(cvToJSON(call.functionArgs[3]).value).toBe(VAULT_STX_CONTRACTS.adapterZestV2)
    })

    it('has one fewer arg than deposit (no token param)', () => {
      const stxCall = DeltaVaultSTX.encodeDepositStx(1_000_000n, USER)
      const wstxCall = DeltaVaultSTX.encodeDeposit(1_000_000n, USER)
      expect(stxCall.functionArgs).toHaveLength(4)
      expect(wstxCall.functionArgs).toHaveLength(5)
    })

    it('accepts custom adapter overrides', () => {
      const custom = { zestV1: `${RECEIVER}.custom-v1`, zestV2: `${NEW_OWNER}.custom-v2` }
      const call = DeltaVaultSTX.encodeDepositStx(1_000_000n, USER, custom)
      expect(cvToJSON(call.functionArgs[2]).value).toBe(`${RECEIVER}.custom-v1`)
      expect(cvToJSON(call.functionArgs[3]).value).toBe(`${NEW_OWNER}.custom-v2`)
    })
  })

  describe('encodeWithdrawStx', () => {
    it('targets withdraw-stx function', () => {
      const call = DeltaVaultSTX.encodeWithdrawStx(2_000_000n, RECEIVER, USER)
      expect(call.functionName).toBe('withdraw-stx')
    })

    it('encodes 5 args (no token): amount, receiver, owner, v1-adapter, v2-adapter', () => {
      const call = DeltaVaultSTX.encodeWithdrawStx(2_000_000n, RECEIVER, USER)
      expect(call.functionArgs).toHaveLength(5)
      expect(cvToJSON(call.functionArgs[0]).value).toBe('2000000')
      expect(cvToJSON(call.functionArgs[1]).value).toBe(RECEIVER)
      expect(cvToJSON(call.functionArgs[2]).value).toBe(USER)
      expect(cvToJSON(call.functionArgs[3]).value).toBe(VAULT_STX_CONTRACTS.adapterZestV1)
      expect(cvToJSON(call.functionArgs[4]).value).toBe(VAULT_STX_CONTRACTS.adapterZestV2)
    })

    it('has one fewer arg than withdraw (no token param)', () => {
      const stxCall = DeltaVaultSTX.encodeWithdrawStx(1_000_000n, RECEIVER, USER)
      const wstxCall = DeltaVaultSTX.encodeWithdraw(1_000_000n, RECEIVER, USER)
      expect(stxCall.functionArgs).toHaveLength(5)
      expect(wstxCall.functionArgs).toHaveLength(6)
    })
  })

  describe('encodeRedeemForStx', () => {
    it('targets redeem-for-stx function', () => {
      const call = DeltaVaultSTX.encodeRedeemForStx(50_000_000n, RECEIVER, USER)
      expect(call.functionName).toBe('redeem-for-stx')
    })

    it('encodes 5 args (no token): shares, receiver, owner, v1-adapter, v2-adapter', () => {
      const call = DeltaVaultSTX.encodeRedeemForStx(50_000_000n, RECEIVER, USER)
      expect(call.functionArgs).toHaveLength(5)
      expect(cvToJSON(call.functionArgs[0]).value).toBe('50000000')
      expect(cvToJSON(call.functionArgs[1]).value).toBe(RECEIVER)
      expect(cvToJSON(call.functionArgs[2]).value).toBe(USER)
      expect(cvToJSON(call.functionArgs[3]).value).toBe(VAULT_STX_CONTRACTS.adapterZestV1)
      expect(cvToJSON(call.functionArgs[4]).value).toBe(VAULT_STX_CONTRACTS.adapterZestV2)
    })

    it('has one fewer arg than redeem (no token param)', () => {
      const stxCall = DeltaVaultSTX.encodeRedeemForStx(1_000_000n, RECEIVER, USER)
      const wstxCall = DeltaVaultSTX.encodeRedeem(1_000_000n, RECEIVER, USER)
      expect(stxCall.functionArgs).toHaveLength(5)
      expect(wstxCall.functionArgs).toHaveLength(6)
    })
  })

  describe('encodeTransfer', () => {
    it('encodes SIP-010 transfer with none memo', () => {
      const call = DeltaVaultSTX.encodeTransfer(1_000n, USER, RECEIVER)
      expect(call.functionName).toBe('transfer')
      expect(call.functionArgs).toHaveLength(4)
      expect(cvToJSON(call.functionArgs[3]).type).toBe('(optional none)')
    })
  })

  // === Sync operations ===

  describe('encodeSyncZestV1', () => {
    it('encodes sync-zest-v1 with 1 arg', () => {
      const call = DeltaVaultSTX.encodeSyncZestV1()
      expect(call.functionName).toBe('sync-zest-v1')
      expect(call.functionArgs).toHaveLength(1)
      expect(cvToJSON(call.functionArgs[0]).value).toBe(VAULT_STX_CONTRACTS.adapterZestV1)
    })
  })

  describe('encodeSyncZestV2', () => {
    it('encodes sync-zest-v2 with 1 arg', () => {
      const call = DeltaVaultSTX.encodeSyncZestV2()
      expect(call.functionName).toBe('sync-zest-v2')
      expect(call.functionArgs).toHaveLength(1)
    })
  })

  // === Allocator operations ===

  // v5-3: V1 deploy goes through vault (supply is shallow), recall through manager

  describe('encodeDeployToZestV1', () => {
    it('targets vault deploy-to-zest-v1 (supply has no depth issue)', () => {
      const call = DeltaVaultSTX.encodeDeployToZestV1(500_000n)
      expect(call.contractName).toBe('vault-stx-v5-5')
      expect(call.functionName).toBe('deploy-to-zest-v1')
      expect(call.functionArgs).toHaveLength(2)
      expect(cvToJSON(call.functionArgs[0]).value).toBe('500000')
    })
  })

  describe('encodeDeployToZestV2', () => {
    it('encodes deploy-to-zest-v2 with amount and adapter', () => {
      const call = DeltaVaultSTX.encodeDeployToZestV2(500_000n)
      expect(call.functionName).toBe('deploy-to-zest-v2')
      expect(call.functionArgs).toHaveLength(2)
    })
  })

  describe('encodeRecallFromZestV1', () => {
    it('targets zest-v1-manager-v2.recall with amount', () => {
      const call = DeltaVaultSTX.encodeRecallFromZestV1(300_000n)
      expect(call.contractName).toBe('zest-v1-manager-v2')
      expect(call.functionName).toBe('recall')
      expect(call.functionArgs).toHaveLength(1)
      expect(cvToJSON(call.functionArgs[0]).value).toBe('300000')
    })
  })

  describe('encodeRecallFromZestV2', () => {
    it('encodes recall-from-zest-v2 with amount and adapter', () => {
      const call = DeltaVaultSTX.encodeRecallFromZestV2(300_000n)
      expect(call.functionName).toBe('recall-from-zest-v2')
      expect(call.functionArgs).toHaveLength(2)
    })
  })

  describe('encodeCompleteV1Deploy', () => {
    it('targets vault complete-v1-deploy bookkeeping', () => {
      const call = DeltaVaultSTX.encodeCompleteV1Deploy(500_000n)
      expect(call.contractName).toBe('vault-stx-v5-5')
      expect(call.functionName).toBe('complete-v1-deploy')
      expect(call.functionArgs).toHaveLength(1)
    })
  })

  describe('encodeCompleteV1Recall', () => {
    it('targets vault complete-v1-recall bookkeeping', () => {
      const call = DeltaVaultSTX.encodeCompleteV1Recall(300_000n)
      expect(call.contractName).toBe('vault-stx-v5-5')
      expect(call.functionName).toBe('complete-v1-recall')
      expect(call.functionArgs).toHaveLength(1)
    })
  })

  describe('encodeReallocate', () => {
    it('encodes V2-only reallocate', () => {
      const call = DeltaVaultSTX.encodeReallocate(100_000n, 0n, 0n, 100_000n)
      expect(call.functionName).toBe('reallocate-v2')
      expect(call.functionArgs).toHaveLength(3) // from-v2, to-v2, adapter
    })
  })

  // === Owner operations ===

  describe('encodeSetVaultOwner', () => {
    it('encodes set-vault-owner with 1 principal arg', () => {
      const call = DeltaVaultSTX.encodeSetVaultOwner(NEW_OWNER)
      expect(call.functionName).toBe('set-vault-owner')
      expect(call.functionArgs).toHaveLength(1)
      expect(cvToJSON(call.functionArgs[0]).value).toBe(NEW_OWNER)
    })
  })

  describe('encodeSetVaultAllocator', () => {
    it('encodes set-vault-allocator with 1 principal arg', () => {
      const call = DeltaVaultSTX.encodeSetVaultAllocator(NEW_OWNER)
      expect(call.functionName).toBe('set-vault-allocator')
      expect(call.functionArgs).toHaveLength(1)
    })
  })

  describe('encodeRegisterAdapterZestV1', () => {
    it('encodes with default adapter principal', () => {
      const call = DeltaVaultSTX.encodeRegisterAdapterZestV1()
      expect(call.functionName).toBe('register-adapter-zest-v1-wstx')
      expect(call.functionArgs).toHaveLength(1)
      expect(cvToJSON(call.functionArgs[0]).value).toBe(VAULT_STX_CONTRACTS.adapterZestV1)
    })
  })

  describe('encodeRegisterAdapterZestV2', () => {
    it('encodes with default adapter principal', () => {
      const call = DeltaVaultSTX.encodeRegisterAdapterZestV2()
      expect(call.functionName).toBe('register-adapter-zest-v2-stx')
      expect(call.functionArgs).toHaveLength(1)
      expect(cvToJSON(call.functionArgs[0]).value).toBe(VAULT_STX_CONTRACTS.adapterZestV2)
    })
  })

  describe('encodeSetFeeBps', () => {
    it('encodes set-fee-bps with 1 uint arg', () => {
      const call = DeltaVaultSTX.encodeSetFeeBps(1000n)
      expect(call.functionName).toBe('set-fee-bps')
      expect(call.functionArgs).toHaveLength(1)
      expect(cvToJSON(call.functionArgs[0]).value).toBe('1000')
    })
  })

  describe('encodeSetFeeRecipient', () => {
    it('encodes set-fee-recipient with 1 principal arg', () => {
      const call = DeltaVaultSTX.encodeSetFeeRecipient(NEW_OWNER)
      expect(call.functionName).toBe('set-fee-recipient')
      expect(call.functionArgs).toHaveLength(1)
      expect(cvToJSON(call.functionArgs[0]).value).toBe(NEW_OWNER)
    })
  })

  describe('encodeSetIdleBuffer', () => {
    it('encodes set-idle-buffer with 1 uint arg', () => {
      const call = DeltaVaultSTX.encodeSetIdleBuffer(300n)
      expect(call.functionName).toBe('set-idle-buffer')
      expect(call.functionArgs).toHaveLength(1)
      expect(cvToJSON(call.functionArgs[0]).value).toBe('300')
    })
  })

  // =================================================================
  // wSTX wrapping / unwrapping semantics
  // =================================================================
  // The STX vault uses wSTX (SIP-010 wrapper around native STX) as its base
  // asset. Both Zest V1 and Zest V2 use different wSTX contracts deployed by
  // their respective teams, but both are transparent wrappers where
  // wSTX.transfer() = stx-transfer?() and balance = stx-get-balance.
  //
  // These tests verify that:
  //   1. The vault's token arg always points to the canonical wSTX (Zest V2's)
  //   2. The adapter args correctly route to each protocol's adapter
  //   3. Deposit/withdraw with default wSTX works identically to explicit wSTX
  //   4. Alternative wSTX contracts (Zest V1's) can be passed when needed

  describe('native STX vs wSTX — deposit comparison', () => {
    it('deposit-stx skips the token arg entirely', () => {
      const stxCall = DeltaVaultSTX.encodeDepositStx(1_000_000n, USER)
      const wstxCall = DeltaVaultSTX.encodeDeposit(1_000_000n, USER)
      // deposit-stx: [amount, owner, v1, v2] (4 args)
      // deposit:     [amount, owner, token, v1, v2] (5 args)
      expect(stxCall.functionArgs).toHaveLength(4)
      expect(wstxCall.functionArgs).toHaveLength(5)
      // amount and owner are the same
      expect(cvToJSON(stxCall.functionArgs[0]).value).toBe(
        cvToJSON(wstxCall.functionArgs[0]).value,
      )
      expect(cvToJSON(stxCall.functionArgs[1]).value).toBe(
        cvToJSON(wstxCall.functionArgs[1]).value,
      )
      // deposit-stx adapters at [2],[3] match deposit adapters at [3],[4]
      expect(cvToJSON(stxCall.functionArgs[2]).value).toBe(
        cvToJSON(wstxCall.functionArgs[3]).value,
      )
      expect(cvToJSON(stxCall.functionArgs[3]).value).toBe(
        cvToJSON(wstxCall.functionArgs[4]).value,
      )
    })

    it('withdraw-stx skips the token arg entirely', () => {
      const stxCall = DeltaVaultSTX.encodeWithdrawStx(1_000_000n, RECEIVER, USER)
      const wstxCall = DeltaVaultSTX.encodeWithdraw(1_000_000n, RECEIVER, USER)
      // withdraw-stx: [amount, receiver, owner, v1, v2] (5 args)
      // withdraw:     [amount, receiver, owner, token, v1, v2] (6 args)
      expect(stxCall.functionArgs).toHaveLength(5)
      expect(wstxCall.functionArgs).toHaveLength(6)
      // withdraw-stx adapters at [3],[4] match withdraw adapters at [4],[5]
      expect(cvToJSON(stxCall.functionArgs[3]).value).toBe(
        cvToJSON(wstxCall.functionArgs[4]).value,
      )
      expect(cvToJSON(stxCall.functionArgs[4]).value).toBe(
        cvToJSON(wstxCall.functionArgs[5]).value,
      )
    })

    it('redeem-for-stx skips the token arg entirely', () => {
      const stxCall = DeltaVaultSTX.encodeRedeemForStx(1_000_000n, RECEIVER, USER)
      const wstxCall = DeltaVaultSTX.encodeRedeem(1_000_000n, RECEIVER, USER)
      expect(stxCall.functionArgs).toHaveLength(5)
      expect(wstxCall.functionArgs).toHaveLength(6)
      // redeem-for-stx adapters at [3],[4] match redeem adapters at [4],[5]
      expect(cvToJSON(stxCall.functionArgs[3]).value).toBe(
        cvToJSON(wstxCall.functionArgs[4]).value,
      )
      expect(cvToJSON(stxCall.functionArgs[4]).value).toBe(
        cvToJSON(wstxCall.functionArgs[5]).value,
      )
    })
  })

  describe('wSTX wrapping — deposit flow', () => {
    it('default deposit uses Zest V2 wSTX as base asset (token arg)', () => {
      const call = DeltaVaultSTX.encodeDeposit(10_000_000n, USER)
      // arg[2] = token — must be the vault's canonical wSTX
      expect(cvToJSON(call.functionArgs[2]).value).toBe(VAULT_STX_UNDERLYING)
      expect(VAULT_STX_UNDERLYING).toBe('SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.wstx')
    })

    it('deposit routes to Zest V1 adapter (wSTX wrapping) as arg[3]', () => {
      const call = DeltaVaultSTX.encodeDeposit(10_000_000n, USER)
      // arg[3] = zest-v1 adapter — handles STX → wSTX(V1) wrapping internally
      expect(cvToJSON(call.functionArgs[3]).value).toBe(VAULT_STX_CONTRACTS.adapterZestV1)
      expect(VAULT_STX_CONTRACTS.adapterZestV1).toContain('adapter-zest-v1-wstx')
    })

    it('deposit routes to Zest V2 adapter as arg[4]', () => {
      const call = DeltaVaultSTX.encodeDeposit(10_000_000n, USER)
      // arg[4] = zest-v2 adapter — uses Zest V2's own wSTX
      expect(cvToJSON(call.functionArgs[4]).value).toBe(VAULT_STX_CONTRACTS.adapterZestV2)
      expect(VAULT_STX_CONTRACTS.adapterZestV2).toContain('adapter-zest-v2-stx')
    })

    it('explicit wSTX token matches default (transparent wrapping)', () => {
      const implicit = DeltaVaultSTX.encodeDeposit(5_000_000n, USER)
      const explicit = DeltaVaultSTX.encodeDeposit(5_000_000n, USER, VAULT_STX_UNDERLYING)
      // Both should produce identical calldata
      expect(implicit.functionArgs).toEqual(explicit.functionArgs)
    })

    it('deposit with Zest V1 wSTX as token arg differs from default', () => {
      // Passing a non-canonical wSTX — on-chain the vault will reject this
      // (err-invalid-asset) unless initialize was called with this wSTX.
      // We verify the encoding produces a different token arg.
      const defaultCall = DeltaVaultSTX.encodeDeposit(1_000_000n, USER)
      const v1WstxCall = DeltaVaultSTX.encodeDeposit(1_000_000n, USER, WSTX_ZEST_V1)
      expect(cvToJSON(defaultCall.functionArgs[2]).value).not.toBe(
        cvToJSON(v1WstxCall.functionArgs[2]).value,
      )
      expect(cvToJSON(v1WstxCall.functionArgs[2]).value).toBe(WSTX_ZEST_V1)
    })
  })

  describe('wSTX wrapping — mint flow', () => {
    it('mint uses the same wSTX base asset as deposit', () => {
      const dep = DeltaVaultSTX.encodeDeposit(1_000_000n, USER)
      const mnt = DeltaVaultSTX.encodeMint(1_000_000n, USER)
      // token position is arg[2] for both
      expect(cvToJSON(mnt.functionArgs[2]).value).toBe(
        cvToJSON(dep.functionArgs[2]).value,
      )
    })

    it('mint passes both adapters for sync (same positions as deposit)', () => {
      const call = DeltaVaultSTX.encodeMint(1_000_000n, USER)
      expect(cvToJSON(call.functionArgs[3]).value).toBe(VAULT_STX_CONTRACTS.adapterZestV1)
      expect(cvToJSON(call.functionArgs[4]).value).toBe(VAULT_STX_CONTRACTS.adapterZestV2)
    })
  })

  describe('wSTX unwrapping — withdraw flow', () => {
    it('withdraw returns wSTX (= native STX) to receiver', () => {
      const call = DeltaVaultSTX.encodeWithdraw(2_000_000n, RECEIVER, USER)
      // arg[0] = amount, arg[1] = receiver (gets wSTX = STX)
      expect(cvToJSON(call.functionArgs[0]).value).toBe('2000000')
      expect(cvToJSON(call.functionArgs[1]).value).toBe(RECEIVER)
      // arg[3] = token (wSTX)
      expect(cvToJSON(call.functionArgs[3]).value).toBe(VAULT_STX_UNDERLYING)
    })

    it('withdraw passes Zest V1 adapter first, Zest V2 second', () => {
      const call = DeltaVaultSTX.encodeWithdraw(2_000_000n, RECEIVER, USER)
      // The vault proportionally pulls from both markets via these adapters.
      // Zest V1 adapter unwraps: withdraw from borrow-helper → wSTX(V1) → STX to vault
      expect(cvToJSON(call.functionArgs[4]).value).toBe(VAULT_STX_CONTRACTS.adapterZestV1)
      expect(cvToJSON(call.functionArgs[5]).value).toBe(VAULT_STX_CONTRACTS.adapterZestV2)
    })

    it('owner must match tx-sender (arg[2])', () => {
      const call = DeltaVaultSTX.encodeWithdraw(1_000_000n, RECEIVER, USER)
      expect(cvToJSON(call.functionArgs[2]).value).toBe(USER)
    })
  })

  describe('wSTX unwrapping — redeem flow', () => {
    it('redeem burns shares and returns wSTX (= STX)', () => {
      const call = DeltaVaultSTX.encodeRedeem(50_000_000n, RECEIVER, USER)
      expect(cvToJSON(call.functionArgs[0]).value).toBe('50000000') // shares
      expect(cvToJSON(call.functionArgs[1]).value).toBe(RECEIVER)   // gets STX
      expect(cvToJSON(call.functionArgs[3]).value).toBe(VAULT_STX_UNDERLYING)
    })

    it('redeem and withdraw share the same adapter arg positions', () => {
      const w = DeltaVaultSTX.encodeWithdraw(1_000_000n, RECEIVER, USER)
      const r = DeltaVaultSTX.encodeRedeem(1_000_000n, RECEIVER, USER)
      // Both have 6 args with identical layout for token + adapters
      expect(w.functionArgs).toHaveLength(6)
      expect(r.functionArgs).toHaveLength(6)
      // token at [3], adapters at [4] and [5]
      expect(cvToJSON(w.functionArgs[3]).value).toBe(cvToJSON(r.functionArgs[3]).value)
      expect(cvToJSON(w.functionArgs[4]).value).toBe(cvToJSON(r.functionArgs[4]).value)
      expect(cvToJSON(w.functionArgs[5]).value).toBe(cvToJSON(r.functionArgs[5]).value)
    })
  })

  // v5-2: V1 ops go through external manager, V2 ops stay in vault

  describe('wSTX wrapping — allocator deploy/recall', () => {
    it('deploy-to-zest-v1 targets vault (supply is shallow)', () => {
      const call = DeltaVaultSTX.encodeDeployToZestV1(3_000_000n)
      expect(call.contractName).toBe('vault-stx-v5-5')
      expect(call.functionName).toBe('deploy-to-zest-v1')
      expect(call.functionArgs).toHaveLength(2)
    })

    it('deploy-to-zest-v2 routes STX through Zest V2 wSTX adapter', () => {
      const call = DeltaVaultSTX.encodeDeployToZestV2(3_000_000n)
      expect(call.functionName).toBe('deploy-to-zest-v2')
      expect(cvToJSON(call.functionArgs[1]).value).toBe(VAULT_STX_CONTRACTS.adapterZestV2)
    })

    it('recall-from-zest-v1 targets the external manager', () => {
      const call = DeltaVaultSTX.encodeRecallFromZestV1(1_500_000n)
      expect(call.contractName).toBe('zest-v1-manager-v2')
      expect(call.functionName).toBe('recall')
      expect(cvToJSON(call.functionArgs[0]).value).toBe('1500000')
    })

    it('recall-from-zest-v2 returns STX via Zest V2 wSTX', () => {
      const call = DeltaVaultSTX.encodeRecallFromZestV2(1_500_000n)
      expect(call.functionName).toBe('recall-from-zest-v2')
      expect(cvToJSON(call.functionArgs[0]).value).toBe('1500000')
      expect(cvToJSON(call.functionArgs[1]).value).toBe(VAULT_STX_CONTRACTS.adapterZestV2)
    })
  })

  describe('v5-2 V1 bookkeeping completers', () => {
    it('complete-v1-deploy updates vault bookkeeping after manager deploy', () => {
      const call = DeltaVaultSTX.encodeCompleteV1Deploy(3_000_000n)
      expect(call.contractName).toBe('vault-stx-v5-5')
      expect(call.functionName).toBe('complete-v1-deploy')
    })

    it('complete-v1-recall updates vault bookkeeping after manager recall', () => {
      const call = DeltaVaultSTX.encodeCompleteV1Recall(1_500_000n)
      expect(call.contractName).toBe('vault-stx-v5-5')
      expect(call.functionName).toBe('complete-v1-recall')
    })
  })

  describe('v5-2 reallocate (V2 only)', () => {
    it('reallocate-v2 only touches Zest V2', () => {
      const call = DeltaVaultSTX.encodeReallocate(0n, 500_000n, 0n, 500_000n)
      expect(call.functionName).toBe('reallocate-v2')
      expect(call.functionArgs).toHaveLength(3)
    })
  })

  describe('wSTX contract identity', () => {
    it('vault base asset is Zest V2 wSTX', () => {
      expect(VAULT_STX_UNDERLYING).toBe('SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.wstx')
    })

    it('Zest V1 wSTX is a different contract from vault base asset', () => {
      expect(WSTX_ZEST_V1).toBe('SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.wstx')
      expect(WSTX_ZEST_V1).not.toBe(VAULT_STX_UNDERLYING)
    })

    it('both wSTX contracts are SIP-010 wrappers over native STX (same .wstx name)', () => {
      expect(VAULT_STX_UNDERLYING.endsWith('.wstx')).toBe(true)
      expect(WSTX_ZEST_V1.endsWith('.wstx')).toBe(true)
    })

    it('Zest V1 adapter name reflects wSTX wrapping role', () => {
      expect(VAULT_STX_CONTRACTS.adapterZestV1).toContain('wstx')
    })
  })
})
