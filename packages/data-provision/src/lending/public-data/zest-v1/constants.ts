/**
 * Zest Protocol V1 contract addresses and asset registry (Stacks Mainnet).
 */

export const ZEST_DEPLOYER = 'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N'

/** Core data / read contracts */
export const ZEST_CONTRACTS = {
  poolReserveData: { address: ZEST_DEPLOYER, name: 'pool-reserve-data' },
  poolReserveData3: { address: ZEST_DEPLOYER, name: 'pool-reserve-data-3' },
  poolReadBorrow: { address: ZEST_DEPLOYER, name: 'pool-read-v2-1-4' },
  poolReadSupply: { address: ZEST_DEPLOYER, name: 'pool-read-supply-v2-1-3' },
  poolReserve: { address: ZEST_DEPLOYER, name: 'pool-0-reserve-v2-0' },
} as const

/**
 * Supported assets with their on-chain principal addresses.
 * Order matches the on-chain registry (pool-reserve-data.get-assets-read).
 * The contract's validate-assets checks by INDEX — order matters!
 */
export const ZEST_ASSETS = {
  stSTX: 'SP4SZE494VC2YC5JYG7AYFQ44F5Q4PYV7DVMDPBG.ststx-token',
  aeUSDC: 'SP3Y2ZSH8P7D50B0VBTSX11S7XSG24M1VB9YFQA4K.token-aeusdc',
  wSTX: `${ZEST_DEPLOYER}.wstx`,
  DIKO: 'SP2C2YFP12AJZB4MABJBAJ55XECVS7E4PMMZ89YZR.arkadiko-token',
  USDH: 'SPN5AKG35QZSK2M8GAMR4AFX45659RJHDW353HSG.usdh-token-v1',
  sUSDT: 'SP2XD7417HGPRTREMKF748VNEQPDRR0RMANB7X1NK.token-susdt',
  USDA: 'SP2C2YFP12AJZB4MABJBAJ55XECVS7E4PMMZ89YZR.usda-token',
  sBTC: 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token',
  ALEX: 'SP102V8P0F7JX67ARQ77WEA3D3CFB5XW39REDT0AM.token-alex',
  stSTXbtcV2: 'SP4SZE494VC2YC5JYG7AYFQ44F5Q4PYV7DVMDPBG.ststxbtc-token-v2',
} as const

/** Z-token (receipt token) addresses */
export const ZEST_Z_TOKENS: Record<string, string> = {
  [ZEST_ASSETS.stSTX]: `${ZEST_DEPLOYER}.zststx-v2-0`,
  [ZEST_ASSETS.aeUSDC]: `${ZEST_DEPLOYER}.zaeusdc-v2-0`,
  [ZEST_ASSETS.wSTX]: `${ZEST_DEPLOYER}.zwstx-v2-0`,
  [ZEST_ASSETS.DIKO]: `${ZEST_DEPLOYER}.zdiko-v2-0`,
  [ZEST_ASSETS.USDH]: `${ZEST_DEPLOYER}.zusdh-v2-0`,
  [ZEST_ASSETS.sUSDT]: `${ZEST_DEPLOYER}.zsusdt-v2-0`,
  [ZEST_ASSETS.USDA]: `${ZEST_DEPLOYER}.zusda-v2-0`,
  [ZEST_ASSETS.sBTC]: `${ZEST_DEPLOYER}.zsbtc-v2-0`,
  [ZEST_ASSETS.ALEX]: `${ZEST_DEPLOYER}.zalex-v2-0`,
  [ZEST_ASSETS.stSTXbtcV2]: `${ZEST_DEPLOYER}.zststxbtc-v2_v2-0`,
}

/** Human-readable symbols keyed by asset principal */
export const ZEST_ASSET_SYMBOLS: Record<string, string> = {
  [ZEST_ASSETS.stSTX]: 'stSTX',
  [ZEST_ASSETS.aeUSDC]: 'aeUSDC',
  [ZEST_ASSETS.wSTX]: 'wSTX',
  [ZEST_ASSETS.DIKO]: 'DIKO',
  [ZEST_ASSETS.USDH]: 'USDH',
  [ZEST_ASSETS.sUSDT]: 'sUSDT',
  [ZEST_ASSETS.USDA]: 'USDA',
  [ZEST_ASSETS.sBTC]: 'sBTC',
  [ZEST_ASSETS.ALEX]: 'ALEX',
  [ZEST_ASSETS.stSTXbtcV2]: 'stSTXbtc-v2',
}

/** Assets that cannot be borrowed */
export const ZEST_NON_BORROWABLE: Set<string> = new Set([
  ZEST_ASSETS.sBTC,
  ZEST_ASSETS.stSTXbtcV2,
])

/** All asset principals as an ordered list */
export function getZestAssets(): string[] {
  return Object.values(ZEST_ASSETS)
}
