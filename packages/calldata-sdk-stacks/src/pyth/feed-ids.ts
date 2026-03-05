/**
 * Pyth price feed IDs for assets used across Stacks lending protocols.
 * These are the hex-encoded 32-byte feed identifiers from Pyth Network.
 *
 * Full list: https://pyth.network/developers/price-feed-ids#stacks
 */

export const PYTH_FEED_IDS = {
  BTC: '0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43',
  STX: '0xec7a775f46379b5e943c3526b1c8d54cd49749176b0b98e02dde68d1bd335c17',
  USDC: '0xeaa020c61cc479712813461ce153894a96a6c00b21ed0cfc2798d1f9a9e9c94a',
  ETH: '0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace',
} as const

export type PythFeedId = (typeof PYTH_FEED_IDS)[keyof typeof PYTH_FEED_IDS]

/** Default Hermes endpoint for fetching Pyth price updates. */
export const PYTH_HERMES_URL = 'https://hermes.pyth.network'
