import type { StacksCall } from '../../../stacks-call'
import { encodeClarityPrincipal } from '../../../stacks-call'
import { USER_READER_CONTRACT_ADDRESS, USER_READER_CONTRACT_NAME } from '../constants'

/**
 * Build a single reader call that fetches all V1 user data at once.
 * The reader function `read-v1-user(principal)` returns a tuple with
 * all 9 asset positions + e-mode in one call.
 */
export function buildV1UserReaderCalls(
  account: string,
  readerAddress = USER_READER_CONTRACT_ADDRESS,
): StacksCall[] {
  return [
    {
      contractAddress: readerAddress,
      contractName: USER_READER_CONTRACT_NAME,
      functionName: 'read-v1-user',
      args: [encodeClarityPrincipal(account)],
    },
  ]
}
