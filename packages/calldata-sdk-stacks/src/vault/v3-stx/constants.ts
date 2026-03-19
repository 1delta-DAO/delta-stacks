/**
 * Delta STX Vault V5 contract addresses (Stacks Mainnet).
 *
 * Markets: Zest V1 (wSTX, Aave-like pool) + Zest V2 (wSTX, ERC-4626 vault).
 * No Granite market for STX.
 *
 * V5 fix: Data-var scratch space for withdrawal params.  The helper writes
 * shares-to-burn / pull-v1 / pull-v2 to data vars, stack fully unwinds,
 * then adapter calls happen at depth ~4 (absolute minimum).  Sync removed
 * from withdraw path to save additional frames.
 *
 * wSTX note: Both protocols use wSTX — a SIP-010 wrapper around native STX.
 * wSTX.transfer() = stx-transfer?(), balance = stx-get-balance.
 * Users deposit STX via the wSTX SIP-010 interface; no explicit wrap step.
 */

export const VAULT_STX_DEPLOYER = 'SP2DRPT3AA170EK5DC4T22CMSXZ6HACATPXHPAT7H'

export const VAULT_STX_CONTRACTS = {
  vault: `${VAULT_STX_DEPLOYER}.vault-stx-v6`,
  adapterZestV1: `${VAULT_STX_DEPLOYER}.adapter-zest-v1-wstx-thin-v3`,
  adapterZestV2: `${VAULT_STX_DEPLOYER}.adapter-zest-v2-stx-v5`,
  trait: `${VAULT_STX_DEPLOYER}.lending-adapter-trait`,
  zestV1Manager: `${VAULT_STX_DEPLOYER}.zest-v1-manager-v3`,
} as const

/**
 * The underlying asset managed by the vault (wSTX = SIP-010 native STX wrapper).
 * Zest V2 deployer's wSTX is the canonical base-asset.
 */
export const VAULT_STX_UNDERLYING = 'SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.wstx'

/** Zest V1's wSTX contract (different deployer, same native STX). */
export const WSTX_ZEST_V1 = 'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.wstx'

/** Split a "deployer.name" string into [address, name] */
export function splitContract(contractId: string): [string, string] {
  const dot = contractId.indexOf('.')
  return [contractId.slice(0, dot), contractId.slice(dot + 1)]
}
