import type { StacksLender } from '@delta-stacks/data-provision'

export const LENDERS: StacksLender[] = ['zest-v1', 'zest-v2', 'granite']

export const ROTATION_KEY = 'cron:next-lender-index'
export const PRICES_KEY = 'prices'
export const VAULT_HISTORY_KEY = 'vault:share-price-history' // USDCx vault
export const VAULT_STX_HISTORY_KEY = 'vault-stx:share-price-history'
export const VAULT_SBTC_HISTORY_KEY = 'vault-sbtc:share-price-history'
export const MAX_VAULT_HISTORY = 21_600 // ~30 days at 2-min intervals

// KV keys for each vault's latest snapshot (written by the 2-min cron, read by allocator worker)
export const VAULT_LATEST_KEY: Record<string, string> = {
  usdcx: 'vault:latest',
  stx:   'vault-stx:latest',
  sbtc:  'vault-sbtc:latest',
}
