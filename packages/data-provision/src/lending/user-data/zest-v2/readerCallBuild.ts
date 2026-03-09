import type { StacksCall } from '../../../stacks-call'
import { encodeClarityPrincipal } from '../../../stacks-call'
import { USER_READER_CONTRACT_ADDRESS, USER_READER_CONTRACT_NAME } from '../constants'

/**
 * Build reader calls for V2 user data: balances/debt + z-token collateral.
 *
 * [0] read-v2-user(principal) -> vault balances + debt + resolve
 * [1] read-v2-user-collateral(principal) -> z-token collateral from market-vault
 */
export function buildV2UserReaderCalls(
  account: string,
  readerAddress = USER_READER_CONTRACT_ADDRESS,
): StacksCall[] {
  const userArg = encodeClarityPrincipal(account)
  return [
    {
      contractAddress: readerAddress,
      contractName: USER_READER_CONTRACT_NAME,
      functionName: 'read-v2-user',
      args: [userArg],
    },
    {
      contractAddress: readerAddress,
      contractName: USER_READER_CONTRACT_NAME,
      functionName: 'read-v2-user-collateral',
      args: [userArg],
    },
  ]
}

/** Expected number of V2 reader calls */
export const EXPECTED_V2_READER_CALL_COUNT = 2
