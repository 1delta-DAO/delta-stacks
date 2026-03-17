import {
  makeContractCall,
  PostConditionMode,
  broadcastTransaction,
} from '@stacks/transactions'
import { type StacksContractCall } from '@delta-stacks/calldata-sdk-stacks'
import { TX_FEE } from './const'

export async function buildAndBroadcast(
  call: StacksContractCall,
  privateKey: string,
  nonce: bigint,
): Promise<string> {
  const tx = await makeContractCall({
    contractAddress: call.contractAddress,
    contractName: call.contractName,
    functionName: call.functionName,
    functionArgs: call.functionArgs,
    senderKey: privateKey,
    network: 'mainnet',
    fee: TX_FEE,
    nonce,
    postConditionMode: PostConditionMode.Allow,
  })

  const result = await broadcastTransaction({ transaction: tx, network: 'mainnet' })
  if ('error' in result) {
    throw new Error((result as { reason?: string; error: string }).reason ?? (result as { error: string }).error)
  }
  return (result as { txid: string }).txid
}