import { type StacksContractCall } from '@delta-stacks/calldata-sdk-stacks'
import { type AllLendingData } from '@delta-stacks/data-provision'

export interface VaultAllocConfig {
  id: string
  market1Label: string
  market2Label: string
  /**
   * Minimum amount to rebalance (in the vault's base-asset micro-units).
   * Reallocations smaller than this are skipped as dust.
   */
  dustThreshold: bigint
  /** Delegates to the calldata-sdk encoder — same function the frontend uses. */
  encodeReallocate(from1: bigint, from2: bigint, to1: bigint, to2: bigint): StacksContractCall
  getMarket1Apr(data: AllLendingData): number | undefined
  getMarket2Apr(data: AllLendingData): number | undefined
  /** On-chain contract principal (deployer.name) used to verify the registered allocator. */
  vaultPrincipal: string
}

export interface VaultAllocationResult {
  vault: string
  status: 'rebalanced' | 'skipped' | 'error'
  reason?: string
  txid?: string
  market1Label?: string
  market2Label?: string
  market1Apr?: number
  market2Apr?: number
  fromMarket1?: string
  fromMarket2?: string
  toMarket1?: string
  toMarket2?: string
}
