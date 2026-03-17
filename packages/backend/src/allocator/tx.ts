import {
  makeContractCall,
  PostConditionMode,
  broadcastTransaction,
  fetchFeeEstimate,
} from '@stacks/transactions'
import { type StacksContractCall } from '@delta-stacks/calldata-sdk-stacks'

const contractCallOptions = (call: StacksContractCall, privateKey: string, nonce: bigint, fee: bigint) => ({
  contractAddress: call.contractAddress,
  contractName: call.contractName,
  functionName: call.functionName,
  functionArgs: call.functionArgs,
  senderKey: privateKey,
  network: 'mainnet' as const,
  fee,
  nonce,
  postConditionMode: PostConditionMode.Allow,
})

export async function buildAndBroadcast(
  call: StacksContractCall,
  privateKey: string,
  nonce: bigint,
): Promise<string> {
  // Build with fee=0 to get a signable tx for estimation, then rebuild with real fee
  const txForEstimate = await makeContractCall(contractCallOptions(call, privateKey, nonce, 0n))
  const estimatedFee = await fetchFeeEstimate({ transaction: txForEstimate, network: 'mainnet' })
  const fee = BigInt(estimatedFee)

  const tx = await makeContractCall(contractCallOptions(call, privateKey, nonce, fee))

  const result = await broadcastTransaction({ transaction: tx, network: 'mainnet' })
  if ('error' in result) {
    throw new Error((result as { reason?: string; error: string }).reason ?? (result as { error: string }).error)
  }
  return (result as { txid: string }).txid
}