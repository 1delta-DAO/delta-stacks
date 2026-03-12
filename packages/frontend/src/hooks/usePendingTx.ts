import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useState } from 'react'

const API_URL = 'https://api.hiro.so'

async function checkTxStatus(txId: string): Promise<'pending' | 'confirmed' | 'failed'> {
  const res = await fetch(`${API_URL}/extended/v1/tx/${txId}`)
  if (!res.ok) return 'pending'
  const data = await res.json()
  if (data.tx_status === 'pending') return 'pending'
  if (data.tx_status === 'success') return 'confirmed'
  return 'failed'
}

/**
 * Tracks pending (mempool) transactions for the connected wallet.
 * While any tx is pending, withdraw/borrow should be disabled because
 * on-chain state may change once the tx confirms.
 */
export function usePendingTx(onConfirm?: () => void) {
  const [pendingTxIds, setPendingTxIds] = useState<string[]>([])
  const queryClient = useQueryClient()

  const addTx = useCallback((txId: string) => {
    setPendingTxIds((prev) => (prev.includes(txId) ? prev : [...prev, txId]))
  }, [])

  // Poll pending txs every 10s
  useQuery({
    queryKey: ['pending-txs', pendingTxIds],
    queryFn: async () => {
      if (pendingTxIds.length === 0) return []
      const results = await Promise.all(
        pendingTxIds.map(async (txId) => ({
          txId,
          status: await checkTxStatus(txId),
        })),
      )
      const stillPending = results.filter((r) => r.status === 'pending').map((r) => r.txId)
      if (stillPending.length < pendingTxIds.length) {
        setPendingTxIds(stillPending)
        // Invalidate user data so it refetches with new on-chain state
        queryClient.invalidateQueries({ queryKey: ['user-data'] })
        onConfirm?.()
      }
      return stillPending
    },
    enabled: pendingTxIds.length > 0,
    refetchInterval: 10_000,
  })

  return {
    hasPending: pendingTxIds.length > 0,
    pendingCount: pendingTxIds.length,
    addTx,
  }
}
