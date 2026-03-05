/**
 * A read-only call descriptor for a Stacks smart contract.
 * Analogous to the EVM `Call` type used for multicall.
 */
export interface StacksCall {
  /** Full contract address, e.g. "SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N" */
  contractAddress: string
  /** Contract name, e.g. "pool-reserve-data" */
  contractName: string
  /** Read-only function name */
  functionName: string
  /** Hex-encoded Clarity value arguments */
  args: string[]
}

export interface StacksCallResult {
  okay: boolean
  result: string
}
