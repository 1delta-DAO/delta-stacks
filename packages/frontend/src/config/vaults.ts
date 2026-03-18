/**
 * Multi-vault configuration registry.
 * Each vault has its own state hook, SDK namespace, and display metadata.
 */

export interface VaultDef {
  id: string
  name: string
  symbol: string
  asset: string           // display name (e.g. 'USDCx', 'STX')
  assetContract: string   // SIP-010 underlying principal
  vaultContract: string   // vault contract principal
  market1Label: string    // allocation slot 1 label
  market2Label: string    // allocation slot 2 label
  market1Logo: string     // import path or URL
  market2Logo: string
  historyEndpoint: string // backend API path for share price history
  decimals: number
}

import graniteLogo from '../assets/granite.png'
import zestLogo from '../assets/zest.png'

export const VAULT_USDCX: VaultDef = {
  id: 'usdcx',
  name: '1delta USDCx Vault v3',
  symbol: '1dUSDCx',
  asset: 'USDCx',
  assetContract: 'SP120SBRBQJ00MCWS7TM5R8WJNTTKD5K0HFRC2CNE.usdcx',
  vaultContract: 'SP2DRPT3AA170EK5DC4T22CMSXZ6HACATPXHPAT7H.vault-usdcx-v3',
  market1Label: 'Granite',
  market2Label: 'Zest V2',
  market1Logo: graniteLogo,
  market2Logo: zestLogo,
  historyEndpoint: 'vault/history',
  decimals: 6,
}

export const VAULT_STX: VaultDef = {
  id: 'stx',
  name: '1delta STX Vault v5',
  symbol: '1dSTX',
  asset: 'STX',
  assetContract: 'SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.wstx',
  vaultContract: 'SP2DRPT3AA170EK5DC4T22CMSXZ6HACATPXHPAT7H.vault-stx-v5-5',
  market1Label: 'Zest V1',
  market2Label: 'Zest V2',
  market1Logo: zestLogo,
  market2Logo: zestLogo,
  historyEndpoint: 'vault-stx/history',
  decimals: 6,
}

export const VAULT_SBTC: VaultDef = {
  id: 'sbtc',
  name: '1delta sBTC Vault v5',
  symbol: '1dsBTC',
  asset: 'sBTC',
  assetContract: 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token',
  vaultContract: 'SP2DRPT3AA170EK5DC4T22CMSXZ6HACATPXHPAT7H.vault-sbtc-v5',
  market1Label: 'Zest V1',
  market2Label: 'Zest V2',
  market1Logo: zestLogo,
  market2Logo: zestLogo,
  historyEndpoint: 'vault-sbtc/history',
  decimals: 8,
}

export const ALL_VAULTS: VaultDef[] = [VAULT_USDCX, VAULT_STX]
