export const ZEST_V1_DEPLOYER = 'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N'

export const ZEST_V1_CONTRACTS = {
  poolBorrow: `${ZEST_V1_DEPLOYER}.pool-borrow-v2-0`,
  /** Approved helper contract — all user-facing calls must go through this */
  borrowHelper: `${ZEST_V1_DEPLOYER}.borrow-helper-v2-1-7`,
  poolReserve: `${ZEST_V1_DEPLOYER}.pool-0-reserve-v2-0`,
  poolReserveData: `${ZEST_V1_DEPLOYER}.pool-reserve-data`,
  feeCalculator: `${ZEST_V1_DEPLOYER}.fees-calculator`,
  incentives: `${ZEST_V1_DEPLOYER}.incentives-v2-2`,
} as const

/** Split a "deployer.name" string into [address, name] */
export function splitContract(contractId: string): [string, string] {
  const dot = contractId.indexOf('.')
  return [contractId.slice(0, dot), contractId.slice(dot + 1)]
}
