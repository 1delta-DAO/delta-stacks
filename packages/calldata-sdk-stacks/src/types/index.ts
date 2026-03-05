import type { ClarityValue } from '@stacks/transactions'

/**
 * Stacks contract call descriptor — the Stacks equivalent of EVM's { to, data, value }.
 *
 * This is the minimal object needed to build and broadcast a Stacks contract call.
 * A client takes this, adds sender auth + network info, and submits via
 * `makeContractCall()` from @stacks/transactions.
 *
 * For an API that returns e2e-executable transaction data:
 *   EVM:    { to: address, data: hex, value: bigint }
 *   Stacks: { contractAddress, contractName, functionName, functionArgs, postConditions?, stxAmount? }
 */
export interface StacksContractCall {
  /** Deployer address of the target contract (SP...) */
  contractAddress: string
  /** Contract name */
  contractName: string
  /** Public function to invoke */
  functionName: string
  /** Serialized Clarity function arguments */
  functionArgs: ClarityValue[]
  /** Optional STX micro-amount to transfer with the call (for STX-denominated operations) */
  stxAmount?: bigint
}

/**
 * A serialized version of StacksContractCall where functionArgs are hex-encoded.
 * Suitable for JSON transport over an API.
 */
export interface StacksContractCallSerialized {
  contractAddress: string
  contractName: string
  functionName: string
  /** Hex-encoded Clarity values (0x-prefixed) */
  functionArgs: string[]
  stxAmount?: string
}
