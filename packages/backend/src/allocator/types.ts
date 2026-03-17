import {
  type AllLendingData,
} from '@delta-stacks/data-provision'

export interface VaultAllocConfig {
  id: string
  deployer: string
  contractName: string
  /** Full principal (deployer.contract-name) for market-1 adapter */
  adapterMarket1: string
  /** Full principal (deployer.contract-name) for market-2 adapter */
  adapterMarket2: string
  market1Label: string
  market2Label: string
  /**
   * Minimum amount to rebalance (in the vault's base-asset micro-units).
   * Reallocations smaller than this are skipped as dust.
   */
  dustThreshold: bigint
  getMarket1Apr(data: AllLendingData): number | undefined
  getMarket2Apr(data: AllLendingData): number | undefined
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
