/**
 * Granite Protocol contract addresses (Stacks Mainnet).
 *
 * Granite uses isolated markets (Compound V3 style). Each market is deployed
 * under its own address and has its own borrower, LP provider, and liquidator.
 */

export const GRANITE_CORE_DEPLOYER = 'SP26NGV9AFZBX7XBDBS2C7EC7FCPSAV9PKREQNMVS'
export const GRANITE_AEUSDC_DEPLOYER = 'SP35E2BBMDT2Y1HB0NTK139YBGYV3PAPK3WA8BRNA'
export const GRANITE_USDCX_DEPLOYER = 'SP3M2BYF7RGF8WKW5FVDNJ6WR8D7AR9BHDXAKPXZE'

export interface GraniteMarketContracts {
  deployer: string
  borrower: string
  lpProvider: string
  liquidator: string
  flashLoan: string
}

/** aeUSDC market contracts */
export const GRANITE_AEUSDC_MARKET: GraniteMarketContracts = {
  deployer: GRANITE_AEUSDC_DEPLOYER,
  borrower: `${GRANITE_CORE_DEPLOYER}.borrower-v1`,
  lpProvider: `${GRANITE_CORE_DEPLOYER}.liquidity-provider-v1`,
  liquidator: `${GRANITE_CORE_DEPLOYER}.liquidator-v1`,
  flashLoan: `${GRANITE_CORE_DEPLOYER}.flash-loan-v1`,
}

/** USDCx market contracts */
export const GRANITE_USDCX_MARKET: GraniteMarketContracts = {
  deployer: GRANITE_USDCX_DEPLOYER,
  borrower: `${GRANITE_USDCX_DEPLOYER}.borrower-v1`,
  lpProvider: `${GRANITE_USDCX_DEPLOYER}.liquidity-provider-v1`,
  liquidator: `${GRANITE_USDCX_DEPLOYER}.liquidator-v1`,
  flashLoan: `${GRANITE_CORE_DEPLOYER}.flash-loan-v1`,
}

/** All markets by ID */
export const GRANITE_MARKETS: Record<string, GraniteMarketContracts> = {
  aeusdc: GRANITE_AEUSDC_MARKET,
  usdcx: GRANITE_USDCX_MARKET,
}

/** Split a "deployer.name" string into [address, name] */
export function splitContract(contractId: string): [string, string] {
  const dot = contractId.indexOf('.')
  return [contractId.slice(0, dot), contractId.slice(dot + 1)]
}
