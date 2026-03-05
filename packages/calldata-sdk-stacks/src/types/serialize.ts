import { cvToHex, hexToCV } from '@stacks/transactions'
import type { StacksContractCall, StacksContractCallSerialized } from './index'

/**
 * Serialize a StacksContractCall for JSON transport (e.g. API response).
 * Converts ClarityValue args to hex strings.
 */
export function serializeContractCall(
  call: StacksContractCall,
): StacksContractCallSerialized {
  return {
    contractAddress: call.contractAddress,
    contractName: call.contractName,
    functionName: call.functionName,
    functionArgs: call.functionArgs.map((arg) => cvToHex(arg)),
    stxAmount: call.stxAmount?.toString(),
  }
}

/**
 * Deserialize a StacksContractCallSerialized back to StacksContractCall.
 * Converts hex strings back to ClarityValue args.
 */
export function deserializeContractCall(
  serialized: StacksContractCallSerialized,
): StacksContractCall {
  return {
    contractAddress: serialized.contractAddress,
    contractName: serialized.contractName,
    functionName: serialized.functionName,
    functionArgs: serialized.functionArgs.map((hex) => hexToCV(hex)),
    stxAmount: serialized.stxAmount ? BigInt(serialized.stxAmount) : undefined,
  }
}
