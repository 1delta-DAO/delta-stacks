import {
  makeContractCall,
  PostConditionMode,
  uintCV,
  contractPrincipalCV,
} from '@stacks/transactions'
import { API_URL, TX_FEE } from './const'

export async function buildAndBroadcast(
  deployer: string,
  contractName: string,
  functionName: string,
  functionArgs: ReturnType<typeof uintCV | typeof contractPrincipalCV>[],
  privateKey: string,
  nonce: bigint,
): Promise<string> {
  const tx = await makeContractCall({
    contractAddress: deployer,
    contractName,
    functionName,
    functionArgs,
    senderKey: privateKey,
    network: 'mainnet',
    fee: TX_FEE,
    nonce,
    postConditionMode: PostConditionMode.Allow,
  })

  const serialized = tx.serialize()
  const res = await fetch(`${API_URL}/v2/transactions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: serialized,
  })

  const body = await res.json() as { txid?: string; error?: string; reason?: string }
  if (!res.ok || body.error) {
    throw new Error(body.reason ?? body.error ?? `broadcast failed: ${res.status}`)
  }
  return body.txid ?? ''
}