import type { StacksContractCall } from '../../types'
import { principal, uint, noneCV } from '../../types/clarity-args'
import type { ClarityValue } from '../../types/clarity-args'
import {
  VAULT_SBTC_DEPLOYER,
  VAULT_SBTC_CONTRACTS,
  VAULT_SBTC_UNDERLYING,
  splitContract,
} from './constants'

export {
  VAULT_SBTC_DEPLOYER,
  VAULT_SBTC_CONTRACTS,
  VAULT_SBTC_UNDERLYING,
}

function call(contractId: string, functionName: string, functionArgs: ClarityValue[]): StacksContractCall {
  const [contractAddress, contractName] = splitContract(contractId)
  return { contractAddress, contractName, functionName, functionArgs }
}

/**
 * Delta sBTC Vault V3 calldata encoders.
 *
 * sBTC vault with Zest V1 (sBTC, Aave-like) + Zest V2 (sBTC, ERC-4626).
 * No Granite market for sBTC.
 *
 * sBTC is a standard SIP-010 token — no native deposit/withdraw convenience
 * functions are needed (unlike the STX vault which wraps native STX via wSTX).
 *
 * Roles:
 *   - Anyone:    deposit, mint, withdraw, redeem, transfer, sync
 *   - Allocator: deploy-to-*, recall-from-*, rebalance-*, reallocate
 *   - Owner:     initialize, set-vault-owner, set-vault-allocator,
 *                register-adapter-*, set-fee-*, set-idle-buffer
 */
export namespace DeltaVaultSBTC {
  // =================================================================
  // User operations (anyone can call)
  // =================================================================

  /**
   * Deposit sBTC into the vault, receiving proportional shares.
   * V3 auto-allocates deposits proportionally to current lending balances.
   *
   * @param amount  - sBTC amount (8 decimals, e.g. 100_000_000 = 1 sBTC)
   * @param owner   - address to receive vault shares
   * @param token   - base asset contract principal (sBTC SIP-010)
   * @param adapter - object with zestV1 and zestV2 adapter principals
   */
  export const encodeDeposit = (
    amount: bigint | number,
    owner: string,
    token: string = VAULT_SBTC_UNDERLYING,
    adapter: { zestV1: string; zestV2: string } = {
      zestV1: VAULT_SBTC_CONTRACTS.adapterZestV1,
      zestV2: VAULT_SBTC_CONTRACTS.adapterZestV2,
    },
  ): StacksContractCall =>
    call(VAULT_SBTC_CONTRACTS.vault, 'deposit', [
      uint(amount),
      principal(owner),
      principal(token),
      principal(adapter.zestV1),
      principal(adapter.zestV2),
    ])

  /**
   * Mint exact vault shares by depositing the required sBTC (ceiling-priced).
   *
   * @param shares   - number of vault shares to mint
   * @param receiver - address to receive vault shares
   * @param token    - base asset contract principal (sBTC SIP-010)
   * @param adapter  - adapter principals
   */
  export const encodeMint = (
    shares: bigint | number,
    receiver: string,
    token: string = VAULT_SBTC_UNDERLYING,
    adapter: { zestV1: string; zestV2: string } = {
      zestV1: VAULT_SBTC_CONTRACTS.adapterZestV1,
      zestV2: VAULT_SBTC_CONTRACTS.adapterZestV2,
    },
  ): StacksContractCall =>
    call(VAULT_SBTC_CONTRACTS.vault, 'mint', [
      uint(shares),
      principal(receiver),
      principal(token),
      principal(adapter.zestV1),
      principal(adapter.zestV2),
    ])

  /**
   * Withdraw exact sBTC amount, burning proportional shares.
   * V3 pulls from idle + both markets proportionally.
   *
   * @param amount   - sBTC amount to withdraw
   * @param receiver - address to receive sBTC
   * @param owner    - share owner (must be tx-sender)
   * @param token    - base asset contract principal (sBTC SIP-010)
   * @param adapter  - adapter principals
   */
  export const encodeWithdraw = (
    amount: bigint | number,
    receiver: string,
    owner: string,
    token: string = VAULT_SBTC_UNDERLYING,
    adapter: { zestV1: string; zestV2: string } = {
      zestV1: VAULT_SBTC_CONTRACTS.adapterZestV1,
      zestV2: VAULT_SBTC_CONTRACTS.adapterZestV2,
    },
  ): StacksContractCall =>
    call(VAULT_SBTC_CONTRACTS.vault, 'withdraw', [
      uint(amount),
      principal(receiver),
      principal(owner),
      principal(token),
      principal(adapter.zestV1),
      principal(adapter.zestV2),
    ])

  /**
   * Redeem exact shares for proportional sBTC.
   *
   * @param shares   - vault shares to burn
   * @param receiver - address to receive sBTC
   * @param owner    - share owner (must be tx-sender)
   * @param token    - base asset contract principal (sBTC SIP-010)
   * @param adapter  - adapter principals
   */
  export const encodeRedeem = (
    shares: bigint | number,
    receiver: string,
    owner: string,
    token: string = VAULT_SBTC_UNDERLYING,
    adapter: { zestV1: string; zestV2: string } = {
      zestV1: VAULT_SBTC_CONTRACTS.adapterZestV1,
      zestV2: VAULT_SBTC_CONTRACTS.adapterZestV2,
    },
  ): StacksContractCall =>
    call(VAULT_SBTC_CONTRACTS.vault, 'redeem', [
      uint(shares),
      principal(receiver),
      principal(owner),
      principal(token),
      principal(adapter.zestV1),
      principal(adapter.zestV2),
    ])

  /**
   * Transfer vault shares (SIP-010).
   */
  export const encodeTransfer = (
    amount: bigint | number,
    sender: string,
    recipient: string,
  ): StacksContractCall =>
    call(VAULT_SBTC_CONTRACTS.vault, 'transfer', [
      uint(amount),
      principal(sender),
      principal(recipient),
      noneCV(),
    ])

  // =================================================================
  // Yield sync (anyone can call)
  // =================================================================

  /**
   * Sync Zest V1 yield into bookkeeping (raises share price).
   */
  export const encodeSyncZestV1 = (
    adapter: string = VAULT_SBTC_CONTRACTS.adapterZestV1,
  ): StacksContractCall =>
    call(VAULT_SBTC_CONTRACTS.vault, 'sync-zest-v1', [
      principal(adapter),
    ])

  /**
   * Sync Zest V2 yield into bookkeeping (raises share price).
   */
  export const encodeSyncZestV2 = (
    adapter: string = VAULT_SBTC_CONTRACTS.adapterZestV2,
  ): StacksContractCall =>
    call(VAULT_SBTC_CONTRACTS.vault, 'sync-zest-v2', [
      principal(adapter),
    ])

  // =================================================================
  // Allocator operations (vault-allocator only)
  // =================================================================

  // --- Zest V1 operations ---
  // Deploy goes through vault (borrow-helper.supply has no depth issue).
  // Recall goes through external manager (borrow-helper.withdraw has depth issue).

  /**
   * Deploy idle sBTC into Zest V1 (via vault -- supply is shallow).
   */
  export const encodeDeployToZestV1 = (
    amount: bigint | number,
    adapter: string = VAULT_SBTC_CONTRACTS.adapterZestV1,
  ): StacksContractCall =>
    call(VAULT_SBTC_CONTRACTS.vault, 'deploy-to-zest-v1', [
      uint(amount),
      principal(adapter),
    ])

  /**
   * Update vault bookkeeping after V1 deploy via manager.
   */
  export const encodeCompleteV1Deploy = (
    amount: bigint | number,
  ): StacksContractCall =>
    call(VAULT_SBTC_CONTRACTS.vault, 'complete-v1-deploy', [
      uint(amount),
    ])

  /**
   * Recall sBTC from Zest V1 via manager (step 1 of 2).
   * Follow with encodeCompleteV1Recall for vault bookkeeping.
   */
  export const encodeRecallFromZestV1 = (
    amount: bigint | number,
  ): StacksContractCall =>
    call(VAULT_SBTC_CONTRACTS.zestV1Manager, 'recall', [
      uint(amount),
    ])

  /**
   * Update vault bookkeeping after V1 recall (step 2 of 2).
   */
  export const encodeCompleteV1Recall = (
    amount: bigint | number,
  ): StacksContractCall =>
    call(VAULT_SBTC_CONTRACTS.vault, 'complete-v1-recall', [
      uint(amount),
    ])

  // --- Zest V2 operations (in-vault, single tx) ---

  /**
   * Deploy idle sBTC into Zest V2.
   */
  export const encodeDeployToZestV2 = (
    amount: bigint | number,
    adapter: string = VAULT_SBTC_CONTRACTS.adapterZestV2,
  ): StacksContractCall =>
    call(VAULT_SBTC_CONTRACTS.vault, 'deploy-to-zest-v2', [
      uint(amount),
      principal(adapter),
    ])

  /**
   * Recall sBTC from Zest V2 back to idle.
   */
  export const encodeRecallFromZestV2 = (
    amount: bigint | number,
    adapter: string = VAULT_SBTC_CONTRACTS.adapterZestV2,
  ): StacksContractCall =>
    call(VAULT_SBTC_CONTRACTS.vault, 'recall-from-zest-v2', [
      uint(amount),
      principal(adapter),
    ])

  /**
   * Reallocate V2 capital (V2 only).
   */
  export const encodeReallocate = (
    fromV1: bigint | number,
    fromV2: bigint | number,
    toV1: bigint | number,
    toV2: bigint | number,
    adapter: { zestV1: string; zestV2: string } = {
      zestV1: VAULT_SBTC_CONTRACTS.adapterZestV1,
      zestV2: VAULT_SBTC_CONTRACTS.adapterZestV2,
    },
  ): StacksContractCall =>
    call(VAULT_SBTC_CONTRACTS.vault, 'reallocate-v2', [
      uint(fromV2),
      uint(toV2),
      principal(adapter.zestV2),
    ])

  // =================================================================
  // Owner operations (vault-owner only)
  // =================================================================

  /**
   * Initialize the vault. Callable once.
   */
  export const encodeInitialize = (
    asset: string,
    name: string,
    symbol: string,
    decimals: bigint | number,
  ): StacksContractCall =>
    call(VAULT_SBTC_CONTRACTS.vault, 'initialize', [
      principal(asset),
      { type: 13, data: name } as unknown as ClarityValue,
      { type: 13, data: symbol } as unknown as ClarityValue,
      uint(decimals),
    ])

  /**
   * Transfer vault ownership.
   */
  export const encodeSetVaultOwner = (
    newOwner: string,
  ): StacksContractCall =>
    call(VAULT_SBTC_CONTRACTS.vault, 'set-vault-owner', [
      principal(newOwner),
    ])

  /**
   * Set allocator address.
   */
  export const encodeSetVaultAllocator = (
    newAllocator: string,
  ): StacksContractCall =>
    call(VAULT_SBTC_CONTRACTS.vault, 'set-vault-allocator', [
      principal(newAllocator),
    ])

  /**
   * Register the Zest V1 adapter contract.
   */
  export const encodeRegisterAdapterZestV1 = (
    adapter: string = VAULT_SBTC_CONTRACTS.adapterZestV1,
  ): StacksContractCall =>
    call(VAULT_SBTC_CONTRACTS.vault, 'register-adapter-zest-v1-sbtc', [
      principal(adapter),
    ])

  /**
   * Register the Zest V2 adapter contract.
   */
  export const encodeRegisterAdapterZestV2 = (
    adapter: string = VAULT_SBTC_CONTRACTS.adapterZestV2,
  ): StacksContractCall =>
    call(VAULT_SBTC_CONTRACTS.vault, 'register-adapter-zest-v2-sbtc', [
      principal(adapter),
    ])

  /**
   * Set performance fee in basis points (0-10000).
   */
  export const encodeSetFeeBps = (
    feeBps: bigint | number,
  ): StacksContractCall =>
    call(VAULT_SBTC_CONTRACTS.vault, 'set-fee-bps', [
      uint(feeBps),
    ])

  /**
   * Set fee recipient address.
   */
  export const encodeSetFeeRecipient = (
    recipient: string,
  ): StacksContractCall =>
    call(VAULT_SBTC_CONTRACTS.vault, 'set-fee-recipient', [
      principal(recipient),
    ])

  /**
   * Set idle buffer in basis points (e.g. 500 = 5%).
   */
  export const encodeSetIdleBuffer = (
    bufferBps: bigint | number,
  ): StacksContractCall =>
    call(VAULT_SBTC_CONTRACTS.vault, 'set-idle-buffer', [
      uint(bufferBps),
    ])
}
