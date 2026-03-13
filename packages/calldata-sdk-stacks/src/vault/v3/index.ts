import type { StacksContractCall } from '../../types'
import { principal, uint, noneCV } from '../../types/clarity-args'
import type { ClarityValue } from '../../types/clarity-args'
import {
  VAULT_V3_DEPLOYER,
  VAULT_V3_CONTRACTS,
  VAULT_V3_UNDERLYING,
  splitContract,
} from './constants'

export {
  VAULT_V3_DEPLOYER,
  VAULT_V3_CONTRACTS,
  VAULT_V3_UNDERLYING,
}

function call(contractId: string, functionName: string, functionArgs: ClarityValue[]): StacksContractCall {
  const [contractAddress, contractName] = splitContract(contractId)
  return { contractAddress, contractName, functionName, functionArgs }
}

/**
 * Delta Vault V3 calldata encoders.
 *
 * V3 extends V2 with:
 *   - initialize() for portable vault setup
 *   - Performance fees (set-fee-bps, set-fee-recipient)
 *   - Idle buffer configuration (set-idle-buffer)
 *   - Recall from markets (recall-from-granite, recall-from-zest-v2)
 *   - Zero-sum rebalancing (reallocate)
 *   - Auto-allocation on deposit
 *   - Dust threshold handling
 *
 * Roles:
 *   - Anyone:    deposit, mint, withdraw, redeem, transfer, sync
 *   - Allocator: deploy-to-*, recall-from-*, rebalance-*, reallocate
 *   - Owner:     initialize, set-vault-owner, set-vault-allocator,
 *                register-adapter-*, set-fee-*, set-idle-buffer
 */
export namespace DeltaVaultV3 {
  // =================================================================
  // User operations (anyone can call)
  // =================================================================

  /**
   * Deposit USDCx into the vault, receiving proportional shares.
   * V3 auto-allocates deposits proportionally to current lending balances.
   *
   * @param amount  - USDCx amount (6 decimals, e.g. 1_000_000 = 1 USDCx)
   * @param owner   - address to receive vault shares
   * @param token   - base asset contract principal (SIP-010 trait)
   * @param adapter - object with granite and zestV2 adapter principals
   */
  export const encodeDeposit = (
    amount: bigint | number,
    owner: string,
    token: string = VAULT_V3_UNDERLYING,
    adapter: { granite: string; zestV2: string } = {
      granite: VAULT_V3_CONTRACTS.adapterGranite,
      zestV2: VAULT_V3_CONTRACTS.adapterZestV2,
    },
  ): StacksContractCall =>
    call(VAULT_V3_CONTRACTS.vault, 'deposit', [
      uint(amount),
      principal(owner),
      principal(token),
      principal(adapter.granite),
      principal(adapter.zestV2),
    ])

  /**
   * Mint exact vault shares by depositing the required USDCx (ceiling-priced).
   *
   * @param shares   - number of vault shares to mint
   * @param receiver - address to receive vault shares
   * @param token    - base asset contract principal (SIP-010 trait)
   * @param adapter  - adapter principals
   */
  export const encodeMint = (
    shares: bigint | number,
    receiver: string,
    token: string = VAULT_V3_UNDERLYING,
    adapter: { granite: string; zestV2: string } = {
      granite: VAULT_V3_CONTRACTS.adapterGranite,
      zestV2: VAULT_V3_CONTRACTS.adapterZestV2,
    },
  ): StacksContractCall =>
    call(VAULT_V3_CONTRACTS.vault, 'mint', [
      uint(shares),
      principal(receiver),
      principal(token),
      principal(adapter.granite),
      principal(adapter.zestV2),
    ])

  /**
   * Withdraw exact USDCx amount, burning proportional shares.
   * V3 pulls from all three positions proportionally.
   *
   * @param amount   - USDCx amount to withdraw
   * @param receiver - address to receive USDCx
   * @param owner    - share owner (must be tx-sender)
   * @param token    - base asset contract principal (SIP-010 trait)
   * @param adapter  - adapter principals
   */
  export const encodeWithdraw = (
    amount: bigint | number,
    receiver: string,
    owner: string,
    token: string = VAULT_V3_UNDERLYING,
    adapter: { granite: string; zestV2: string } = {
      granite: VAULT_V3_CONTRACTS.adapterGranite,
      zestV2: VAULT_V3_CONTRACTS.adapterZestV2,
    },
  ): StacksContractCall =>
    call(VAULT_V3_CONTRACTS.vault, 'withdraw', [
      uint(amount),
      principal(receiver),
      principal(owner),
      principal(token),
      principal(adapter.granite),
      principal(adapter.zestV2),
    ])

  /**
   * Redeem exact shares for proportional USDCx.
   *
   * @param shares   - vault shares to burn
   * @param receiver - address to receive USDCx
   * @param owner    - share owner (must be tx-sender)
   * @param token    - base asset contract principal (SIP-010 trait)
   * @param adapter  - adapter principals
   */
  export const encodeRedeem = (
    shares: bigint | number,
    receiver: string,
    owner: string,
    token: string = VAULT_V3_UNDERLYING,
    adapter: { granite: string; zestV2: string } = {
      granite: VAULT_V3_CONTRACTS.adapterGranite,
      zestV2: VAULT_V3_CONTRACTS.adapterZestV2,
    },
  ): StacksContractCall =>
    call(VAULT_V3_CONTRACTS.vault, 'redeem', [
      uint(shares),
      principal(receiver),
      principal(owner),
      principal(token),
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
    call(VAULT_V3_CONTRACTS.vault, 'transfer', [
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
   * V3 mints performance fee shares on sync.
   *
   * @param adapter - Granite adapter principal
   */
  export const encodeSyncGranite = (
    adapter: string = VAULT_V3_CONTRACTS.adapterGranite,
  ): StacksContractCall =>
    call(VAULT_V3_CONTRACTS.vault, 'sync-granite', [
      principal(adapter),
    ])

  /**
   * Sync Zest V2 yield into bookkeeping (raises share price).
   * V3 mints performance fee shares on sync.
   *
   * @param adapter - Zest V2 adapter principal
   */
  export const encodeSyncZestV2 = (
    adapter: string = VAULT_V3_CONTRACTS.adapterZestV2,
  ): StacksContractCall =>
    call(VAULT_V3_CONTRACTS.vault, 'sync-zest-v2', [
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
    adapter: string = VAULT_V3_CONTRACTS.adapterGranite,
  ): StacksContractCall =>
    call(VAULT_V3_CONTRACTS.vault, 'deploy-to-granite', [
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
    adapter: string = VAULT_V3_CONTRACTS.adapterZestV2,
  ): StacksContractCall =>
    call(VAULT_V3_CONTRACTS.vault, 'deploy-to-zest-v2', [
      uint(amount),
      principal(adapter),
    ])

  /**
   * Recall USDCx from Granite back to idle.
   *
   * @param amount  - USDCx to recall
   * @param adapter - Granite adapter principal
   */
  export const encodeRecallFromGranite = (
    amount: bigint | number,
    adapter: string = VAULT_V3_CONTRACTS.adapterGranite,
  ): StacksContractCall =>
    call(VAULT_V3_CONTRACTS.vault, 'recall-from-granite', [
      uint(amount),
      principal(adapter),
    ])

  /**
   * Recall USDCx from Zest V2 back to idle.
   *
   * @param amount  - USDCx to recall
   * @param adapter - Zest V2 adapter principal
   */
  export const encodeRecallFromZestV2 = (
    amount: bigint | number,
    adapter: string = VAULT_V3_CONTRACTS.adapterZestV2,
  ): StacksContractCall =>
    call(VAULT_V3_CONTRACTS.vault, 'recall-from-zest-v2', [
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
      granite: VAULT_V3_CONTRACTS.adapterGranite,
      zestV2: VAULT_V3_CONTRACTS.adapterZestV2,
    },
  ): StacksContractCall =>
    call(VAULT_V3_CONTRACTS.vault, 'rebalance-granite-to-zest-v2', [
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
      granite: VAULT_V3_CONTRACTS.adapterGranite,
      zestV2: VAULT_V3_CONTRACTS.adapterZestV2,
    },
  ): StacksContractCall =>
    call(VAULT_V3_CONTRACTS.vault, 'rebalance-zest-v2-to-granite', [
      uint(amount),
      principal(adapter.zestV2),
      principal(adapter.granite),
    ])

  /**
   * Zero-sum rebalance across both markets atomically.
   * Total recalled must equal total deployed (from-granite + from-zest = to-granite + to-zest).
   *
   * @param fromGranite - USDCx to pull from Granite
   * @param fromZest    - USDCx to pull from Zest V2
   * @param toGranite   - USDCx to deploy to Granite
   * @param toZest      - USDCx to deploy to Zest V2
   * @param adapter     - adapter principals
   */
  export const encodeReallocate = (
    fromGranite: bigint | number,
    fromZest: bigint | number,
    toGranite: bigint | number,
    toZest: bigint | number,
    adapter: { granite: string; zestV2: string } = {
      granite: VAULT_V3_CONTRACTS.adapterGranite,
      zestV2: VAULT_V3_CONTRACTS.adapterZestV2,
    },
  ): StacksContractCall =>
    call(VAULT_V3_CONTRACTS.vault, 'reallocate', [
      uint(fromGranite),
      uint(fromZest),
      uint(toGranite),
      uint(toZest),
      principal(adapter.granite),
      principal(adapter.zestV2),
    ])

  // =================================================================
  // Owner operations (vault-owner only)
  // =================================================================

  /**
   * Initialize the vault. Callable once. Configures base asset, share metadata,
   * and virtual offset (10^decimals).
   *
   * @param asset    - SIP-010 token contract principal (e.g. USDCx)
   * @param name     - vault share token name
   * @param symbol   - vault share token symbol
   * @param decimals - vault share decimals (also sets virtual offset = 10^decimals)
   */
  export const encodeInitialize = (
    asset: string,
    name: string,
    symbol: string,
    decimals: bigint | number,
  ): StacksContractCall =>
    call(VAULT_V3_CONTRACTS.vault, 'initialize', [
      principal(asset),
      // Clarity string-ascii args are passed as string literals
      // The wallet/SDK handles encoding these as Clarity values
      { type: 13, data: name } as unknown as ClarityValue,
      { type: 13, data: symbol } as unknown as ClarityValue,
      uint(decimals),
    ])

  /**
   * Transfer vault ownership to a new address.
   *
   * @param newOwner - new vault owner principal
   */
  export const encodeSetVaultOwner = (
    newOwner: string,
  ): StacksContractCall =>
    call(VAULT_V3_CONTRACTS.vault, 'set-vault-owner', [
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
    call(VAULT_V3_CONTRACTS.vault, 'set-vault-allocator', [
      principal(newAllocator),
    ])

  /**
   * Register the Granite adapter contract.
   *
   * @param adapter - adapter contract principal
   */
  export const encodeRegisterAdapterGranite = (
    adapter: string = VAULT_V3_CONTRACTS.adapterGranite,
  ): StacksContractCall =>
    call(VAULT_V3_CONTRACTS.vault, 'register-adapter-granite-usdcx', [
      principal(adapter),
    ])

  /**
   * Register the Zest V2 adapter contract.
   *
   * @param adapter - adapter contract principal
   */
  export const encodeRegisterAdapterZestV2 = (
    adapter: string = VAULT_V3_CONTRACTS.adapterZestV2,
  ): StacksContractCall =>
    call(VAULT_V3_CONTRACTS.vault, 'register-adapter-zest-v2-usdc', [
      principal(adapter),
    ])

  /**
   * Set performance fee in basis points (0-10000).
   *
   * @param feeBps - fee in basis points (e.g. 1000 = 10%)
   */
  export const encodeSetFeeBps = (
    feeBps: bigint | number,
  ): StacksContractCall =>
    call(VAULT_V3_CONTRACTS.vault, 'set-fee-bps', [
      uint(feeBps),
    ])

  /**
   * Set the address that receives minted fee shares.
   *
   * @param recipient - fee recipient principal
   */
  export const encodeSetFeeRecipient = (
    recipient: string,
  ): StacksContractCall =>
    call(VAULT_V3_CONTRACTS.vault, 'set-fee-recipient', [
      principal(recipient),
    ])

  /**
   * Set the idle buffer in basis points.
   * Determines target idle liquidity ratio (e.g. 500 = 5%).
   *
   * @param bufferBps - idle buffer in basis points
   */
  export const encodeSetIdleBuffer = (
    bufferBps: bigint | number,
  ): StacksContractCall =>
    call(VAULT_V3_CONTRACTS.vault, 'set-idle-buffer', [
      uint(bufferBps),
    ])
}
