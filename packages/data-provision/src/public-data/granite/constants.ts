/**
 * Granite Protocol contract addresses and market registry (Stacks Mainnet).
 *
 * Granite uses isolated markets (Compound V3 style): each market has a single
 * borrowable asset with multiple accepted collateral tokens.
 *
 * Markets:
 *   - STX market:   borrow STX against sBTC/stSTX collateral
 *   - USDCx market: borrow USDCx against sBTC/stSTX collateral
 */

/** Market deployer addresses (each market is its own deployer) */
export const GRANITE_STX_DEPLOYER = 'SP35E2BBMDT2Y1HB0NTK139YBGYV3PAPK3WA8BRNA'
export const GRANITE_USDCX_DEPLOYER = 'SP3M2BYF7RGF8WKW5FVDNJ6WR8D7AR9BHDXAKPXZE'

/** Core protocol deployer (borrower, governance, flash loan) */
export const GRANITE_CORE_DEPLOYER = 'SP26NGV9AFZBX7XBDBS2C7EC7FCPSAV9PKREQNMVS'

export interface GraniteMarket {
  id: string
  symbol: string
  deployer: string
  state: string
  ir: string
  borrower: string
  liquidator: string
  lpProvider: string
}

export const GRANITE_MARKETS: GraniteMarket[] = [
  {
    id: 'stx',
    symbol: 'STX',
    deployer: GRANITE_STX_DEPLOYER,
    state: `${GRANITE_STX_DEPLOYER}.state-v1`,
    ir: `${GRANITE_STX_DEPLOYER}.linear-kinked-ir-v1`,
    borrower: `${GRANITE_CORE_DEPLOYER}.borrower-v1`,
    liquidator: `${GRANITE_CORE_DEPLOYER}.liquidator-v1`,
    lpProvider: `${GRANITE_CORE_DEPLOYER}.liquidity-provider-v1`,
  },
  {
    id: 'usdcx',
    symbol: 'USDCx',
    deployer: GRANITE_USDCX_DEPLOYER,
    state: `${GRANITE_USDCX_DEPLOYER}.state-v1`,
    ir: `${GRANITE_USDCX_DEPLOYER}.linear-kinked-ir-v1`,
    borrower: `${GRANITE_USDCX_DEPLOYER}.borrower-v1`,
    liquidator: `${GRANITE_USDCX_DEPLOYER}.liquidator-v1`,
    lpProvider: `${GRANITE_USDCX_DEPLOYER}.liquidity-provider-v1`,
  },
] as const

/** Contract name shortcuts (same name on every deployer) */
export const GRANITE_CONTRACT_NAMES = {
  state: 'state-v1',
  ir: 'linear-kinked-ir-v1',
  constants: 'constants-v1',
} as const
