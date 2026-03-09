import type { StacksCall } from '../../../stacks-call'
import { encodeClarityPrincipal } from '../../../stacks-call'
import { USER_READER_CONTRACT_ADDRESS, USER_READER_CONTRACT_NAME } from '../constants'
import { GRANITE_MARKETS } from '../../public-data/granite/constants'

/**
 * Reader function names for Granite user data, one per market.
 * Must match the contract in user-reader-v1.clar.
 */
const GRANITE_USER_READER_FNS: Record<string, string> = {
  aeusdc: 'read-granite-aeusdc-user',
  usdcx: 'read-granite-usdcx-user',
}

/**
 * Build reader calls for Granite user data.
 * One call per market (each returns position + collateral + borrow-params).
 */
export function buildGraniteUserReaderCalls(
  account: string,
  readerAddress = USER_READER_CONTRACT_ADDRESS,
): StacksCall[] {
  const userArg = encodeClarityPrincipal(account)

  return GRANITE_MARKETS.map((market) => ({
    contractAddress: readerAddress,
    contractName: USER_READER_CONTRACT_NAME,
    functionName: GRANITE_USER_READER_FNS[market.id],
    args: [userArg],
  }))
}
