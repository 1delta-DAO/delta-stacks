import { isValidStacksAddress, toTokenKey } from './address'
import type { StacksToken, StacksTokenList } from './types'

const VELAR_API = 'https://api.velar.co/tokens'
const CHAIN_ID = 'stacks'

/**
 * Well-known mainnet token addresses (original case).
 * These are high-liquidity / core ecosystem tokens.
 */
const MAIN_TOKEN_ADDRESSES = [
  // Native STX (wrapped)
  'SP1Y5YSTAHZ88XYK1VPDH24GY0HPX5J4JECTMY4A1.wstx',
  // sBTC
  'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token',
  // stSTX (Stacking DAO)
  'SP4SZE494VC2YC5JYG7AYFQ44F5Q4PYV7DVMDPBG.ststx-token',
  // USDC (bridged via aeUSDC)
  'SP3Y2ZSH8P7D50B0VBTSX11S7XSG24M1VB9YFQA4K.token-aeusdc',
  // USDh (Hermetica)
  'SPN5AKG35QZSK2M8GAMR4AFX45659RJHDW353HSG.usdh-token-v1',
  // ALEX
  'SP102V8P0F7JX67ARQ77WEA3D3CFB5XW39REDT0AM.token-alex',
  // DIKO (Arkadiko)
  'SP2C2YFP12AJZB4MABJBAJ55XECVS7E4PMMZ89YZR.arkadiko-token',
  // aBTC
  'SP3K8BC0PPEVCV7NZ6QSRWPQ2JE9E5B6N3PA0KBR9.token-abtc',
  // sUSDT
  'SP2XD7417HGPRTREMKF748VNEQPDRR0RMANB7X1NK.token-susdt',
  // stSTXbtc
  'SP4SZE494VC2YC5JYG7AYFQ44F5Q4PYV7DVMDPBG.ststxbtc-token-v2',
]

/** Shape returned by the Velar /tokens endpoint */
interface VelarToken {
  symbol: string
  name: string
  contractAddress: string
  imageUrl: string
  price: string
  decimal: string // e.g. "u6"
  tokenDecimalNum: number
  assetName: string
  percent_change_24h?: string
  imageUrlBackup?: string
  socialLinks?: {
    website?: string
    twitter?: string
    discord?: string
    telegram?: string
  }
  stats?: {
    tvl: number
    volume: number
    fees: number
  }
}

function parseDecimals(dec: string | undefined, fallback: number | undefined): number {
  if (typeof dec === 'string') {
    const num = parseInt(dec.replace(/^u/, ''), 10)
    if (!Number.isNaN(num)) return num
  }
  if (typeof fallback === 'number' && fallback > 0) {
    return Math.round(Math.log10(fallback))
  }
  return 0
}

/**
 * Fetch the Stacks token list from the Velar API and normalize it
 * into the standard {@link StacksTokenList} format.
 */
export async function fetchStacksTokenList(): Promise<StacksTokenList> {
  const response = await fetch(VELAR_API)
  if (!response.ok) {
    throw new Error(`Velar API returned ${response.status}`)
  }

  const raw: VelarToken[] = await response.json()

  const list: Record<string, StacksToken> = {}

  for (const token of raw) {
    if (!token.contractAddress || !token.symbol) continue
    if (!isValidStacksAddress(token.contractAddress)) continue

    const key = toTokenKey(token.contractAddress)
    list[key] = {
      chainId: CHAIN_ID,
      decimals: parseDecimals(token.decimal, token.tokenDecimalNum),
      name: token.name,
      address: token.contractAddress,
      symbol: token.symbol,
      logoURI: token.imageUrl ?? '',
    }
  }

  const mainTokens = MAIN_TOKEN_ADDRESSES
    .map(toTokenKey)
    .filter((addr) => addr in list)

  return {
    chainId: CHAIN_ID,
    version: '0',
    list,
    mainTokens,
  }
}
