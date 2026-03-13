import { useQuery } from '@tanstack/react-query'

export interface VaultSnapshotEntry {
  timestamp: number
  totalAssets: string
  totalSupply: string
  sharePrice: number
  allocGranite: string
  allocZest: string
  idleBookkeeping: string
}

/** Derive the backend base URL from the existing VITE_DATA_API_URL env var */
function getBackendBase(): string {
  const dataUrl = import.meta.env.VITE_DATA_API_URL as string | undefined
  if (dataUrl) {
    // Strip trailing path segments like /lending
    try {
      const u = new URL(dataUrl)
      return u.origin
    } catch {
      // fallback: strip everything after last /
      return dataUrl.replace(/\/[^/]*$/, '')
    }
  }
  return ''
}

export function useVaultHistory(range: '24h' | '7d' | '30d' = '7d') {
  const base = getBackendBase()

  return useQuery<VaultSnapshotEntry[]>({
    queryKey: ['vault-history', range],
    queryFn: async () => {
      if (!base) return []

      const now = Math.floor(Date.now() / 1000)
      const rangeSeconds = range === '24h' ? 86400 : range === '7d' ? 604800 : 2592000
      const from = now - rangeSeconds

      const res = await fetch(`${base}/vault/history?from=${from}&to=${now}`)
      if (!res.ok) return []
      return res.json()
    },
    staleTime: 120_000, // 2 min — matches cron interval
    refetchInterval: 120_000,
    enabled: !!base,
  })
}
