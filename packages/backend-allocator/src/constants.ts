// KV keys for each vault's latest snapshot (written by the data worker, read by allocator)
export const VAULT_LATEST_KEY: Record<string, string> = {
  usdcx: 'vault:latest',
  stx:   'vault-stx:latest',
  sbtc:  'vault-sbtc:latest',
}
