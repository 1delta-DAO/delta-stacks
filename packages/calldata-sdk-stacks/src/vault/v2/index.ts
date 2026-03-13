import type { StacksContractCall } from '../../types'
import { principal, uint, noneCV } from '../../types/clarity-args'
import type { ClarityValue } from '../../types/clarity-args'
import {
  VAULT_DEPLOYER,
  VAULT_CONTRACTS,
  VAULT_UNDERLYING,
  splitContract,
} from './constants'

export {
  VAULT_DEPLOYER,
  VAULT_CONTRACTS,
  VAULT_UNDERLYING,
}

function call(contractId: string, functionName: string, functionArgs: ClarityValue[]): StacksContractCall {
  const [contractAddress, contractName] = splitContract(contractId)
  return { contractAddress, contractName, functionName, functionArgs }
}

/**
 * Delta Vault V2 calldata encoders.
 *
 * The vault is an ERC-4626-style yield vault for USDCx.  It tracks three
 * positions (idle, Granite, Zest V2) and uses virtual-share accounting to
 * prevent first-depositor manipulation.
 *
 * Roles:
 *   - Anyone:    deposit, mint, withdraw, redeem, transfer, sync
 *   - Allocator: deploy-to-*, rebalance-*
 *   - Owner:     set-vault-owner, set-vault-allocator, register-adapter-*
 */
export namespace DeltaVault {
  // =================================================================
  // User operations (anyone can call)
  // =================================================================

  /**
   * Deposit USDCx into the vault, receiving proportional shares.
   *
   * @param amount  - USDCx amount (6 decimals, e.g. 1_000_000 = 1 USDCx)
   * @param owner   - address to receive vault shares
   * @param adapter - object with granite and zestV2 adapter principals
   */
  export const encodeDeposit = (
    amount: bigint | number,
    owner: string,
    adapter: { granite: string; zestV2: string } = {
      granite: VAULT_CONTRACTS.adapterGranite,
      zestV2: VAULT_CONTRACTS.adapterZestV2,
    },
  ): StacksContractCall =>
    call(VAULT_CONTRACTS.vault, 'deposit', [
      uint(amount),
      principal(owner),
      principal(adapter.granite),
      principal(adapter.zestV2),
    ])

  /**
   * Mint exact vault shares by depositing the required USDCx (ceiling-priced).
   *
   * @param shares   - number of vault shares to mint
   * @param receiver - address to receive vault shares
   * @param adapter  - adapter principals
   */
  export const encodeMint = (
    shares: bigint | number,
    receiver: string,
    adapter: { granite: string; zestV2: string } = {
      granite: VAULT_CONTRACTS.adapterGranite,
      zestV2: VAULT_CONTRACTS.adapterZestV2,
    },
  ): StacksContractCall =>
    call(VAULT_CONTRACTS.vault, 'mint', [
      uint(shares),
      principal(receiver),
      principal(adapter.granite),
      principal(adapter.zestV2),
    ])

  /**
   * Withdraw exact USDCx amount, burning proportional shares.
   * Pulls from all three positions proportionally.
   *
   * @param amount   - USDCx amount to withdraw
   * @param receiver - address to receive USDCx
   * @param owner    - share owner (must be tx-sender)
   * @param adapter  - adapter principals
   */
  export const encodeWithdraw = (
    amount: bigint | number,
    receiver: string,
    owner: string,
    adapter: { granite: string; zestV2: string } = {
      granite: VAULT_CONTRACTS.adapterGranite,
      zestV2: VAULT_CONTRACTS.adapterZestV2,
    },
  ): StacksContractCall =>
    call(VAULT_CONTRACTS.vault, 'withdraw', [
      uint(amount),
      principal(receiver),
      principal(owner),
      principal(adapter.granite),
      principal(adapter.zestV2),
    ])

  /**
   * Redeem exact shares for proportional USDCx.
   *
   * @param shares   - vault shares to burn
   * @param receiver - address to receive USDCx
   * @param owner    - share owner (must be tx-sender)
   * @param adapter  - adapter principals
   */
  export const encodeRedeem = (
    shares: bigint | number,
    receiver: string,
    owner: string,
    adapter: { granite: string; zestV2: string } = {
      granite: VAULT_CONTRACTS.adapterGranite,
      zestV2: VAULT_CONTRACTS.adapterZestV2,
    },
  ): StacksContractCall =>
    call(VAULT_CONTRACTS.vault, 'redeem', [
      uint(shares),
      principal(receiver),
      principal(owner),
      principal(adapter.granite),
      principal(adapter.zestV2),
    ])

  /**
   * Transfer vault shares (SIP-010).
   *
   * @param amount    - shares to transfer
   * @param sender    - current holder (must be tx-sender)
   * @param recipient - new holder
   */
  export const encodeTransfer = (
    amount: bigint | number,
    sender: string,
    recipient: string,
  ): StacksContractCall =>
    call(VAULT_CONTRACTS.vault, 'transfer', [
      uint(amount),
      principal(sender),
      principal(recipient),
      noneCV(),
    ])

  // =================================================================
  // Yield sync (anyone can call)
  // =================================================================

  /**
   * Sync Granite yield into bookkeeping (raises share price).
   *
   * @param adapter - Granite adapter principal
   */
  export const encodeSyncGranite = (
    adapter: string = VAULT_CONTRACTS.adapterGranite,
  ): StacksContractCall =>
    call(VAULT_CONTRACTS.vault, 'sync-granite', [
      principal(adapter),
    ])

  /**
   * Sync Zest V2 yield into bookkeeping (raises share price).
   *
   * @param adapter - Zest V2 adapter principal
   */
  export const encodeSyncZestV2 = (
    adapter: string = VAULT_CONTRACTS.adapterZestV2,
  ): StacksContractCall =>
    call(VAULT_CONTRACTS.vault, 'sync-zest-v2', [
      principal(adapter),
    ])

  // =================================================================
  // Allocator operations (vault-allocator only)
  // =================================================================

  /**
   * Deploy idle USDCx into Granite.
   *
   * @param amount  - USDCx to deploy
   * @param adapter - Granite adapter principal
   */
  export const encodeDeployToGranite = (
    amount: bigint | number,
    adapter: string = VAULT_CONTRACTS.adapterGranite,
  ): StacksContractCall =>
    call(VAULT_CONTRACTS.vault, 'deploy-to-granite', [
      uint(amount),
      principal(adapter),
    ])

  /**
   * Deploy idle USDCx into Zest V2.
   *
   * @param amount  - USDCx to deploy
   * @param adapter - Zest V2 adapter principal
   */
  export const encodeDeployToZestV2 = (
    amount: bigint | number,
    adapter: string = VAULT_CONTRACTS.adapterZestV2,
  ): StacksContractCall =>
    call(VAULT_CONTRACTS.vault, 'deploy-to-zest-v2', [
      uint(amount),
      principal(adapter),
    ])

  /**
   * Rebalance from Granite to Zest V2 atomically.
   *
   * @param amount  - USDCx to move
   * @param adapter - adapter principals
   */
  export const encodeRebalanceGraniteToZestV2 = (
    amount: bigint | number,
    adapter: { granite: string; zestV2: string } = {
      granite: VAULT_CONTRACTS.adapterGranite,
      zestV2: VAULT_CONTRACTS.adapterZestV2,
    },
  ): StacksContractCall =>
    call(VAULT_CONTRACTS.vault, 'rebalance-granite-to-zest-v2', [
      uint(amount),
      principal(adapter.granite),
      principal(adapter.zestV2),
    ])

  /**
   * Rebalance from Zest V2 to Granite atomically.
   *
   * @param amount  - USDCx to move
   * @param adapter - adapter principals
   */
  export const encodeRebalanceZestV2ToGranite = (
    amount: bigint | number,
    adapter: { granite: string; zestV2: string } = {
      granite: VAULT_CONTRACTS.adapterGranite,
      zestV2: VAULT_CONTRACTS.adapterZestV2,
    },
  ): StacksContractCall =>
    call(VAULT_CONTRACTS.vault, 'rebalance-zest-v2-to-granite', [
      uint(amount),
      principal(adapter.zestV2),
      principal(adapter.granite),
    ])

  // =================================================================
  // Owner operations (vault-owner only)
  // =================================================================

  /**
   * Transfer vault ownership to a new address.
   *
   * @param newOwner - new vault owner principal
   */
  export const encodeSetVaultOwner = (
    newOwner: string,
  ): StacksContractCall =>
    call(VAULT_CONTRACTS.vault, 'set-vault-owner', [
      principal(newOwner),
    ])

  /**
   * Delegate allocation authority to a different principal.
   *
   * @param newAllocator - new allocator principal (bot, multisig, etc.)
   */
  export const encodeSetVaultAllocator = (
    newAllocator: string,
  ): StacksContractCall =>
    call(VAULT_CONTRACTS.vault, 'set-vault-allocator', [
      principal(newAllocator),
    ])

  /**
   * Register the Granite adapter contract.
   *
   * @param adapter - adapter contract principal
   */
  export const encodeRegisterAdapterGranite = (
    adapter: string = VAULT_CONTRACTS.adapterGranite,
  ): StacksContractCall =>
    call(VAULT_CONTRACTS.vault, 'register-adapter-granite-usdcx', [
      principal(adapter),
    ])

  /**
   * Register the Zest V2 adapter contract.
   *
   * @param adapter - adapter contract principal
   */
  export const encodeRegisterAdapterZestV2 = (
    adapter: string = VAULT_CONTRACTS.adapterZestV2,
  ): StacksContractCall =>
    call(VAULT_CONTRACTS.vault, 'register-adapter-zest-v2-usdc', [
      principal(adapter),
    ])
}
