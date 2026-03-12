import { useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useWallet } from '../context/WalletContext'

const API_URL = 'https://api.hiro.so'

/** STX balance + fungible token balances keyed by contract principal */
export interface Balances {
  stx: bigint
  fungible: Record<string, { balance: bigint; decimals?: number }>
}

const EMPTY: Balances = { stx: 0n, fungible: {} }

async function fetchBalances(stxAddress: string): Promise<Balances> {
  const resp = await fetch(
    `${API_URL}/extended/v1/address/${stxAddress}/balances`,
  )
  if (!resp.ok) throw new Error(`API ${resp.status}`)
  const data = await resp.json()

  const stx = BigInt(data.stx?.balance ?? '0')

  const fungible: Balances['fungible'] = {}
  if (data.fungible_tokens) {
    for (const [key, val] of Object.entries(
      data.fungible_tokens as Record<string, { balance: string }>,
    )) {
      // Hiro returns keys like "SP...token::token-name", strip the ::suffix
      const principal = key.includes('::') ? key.split('::')[0] : key
      const balance = BigInt((val as { balance: string }).balance ?? '0')
      if (balance > 0n) {
        fungible[principal] = { balance }
      }
    }
  }

  return { stx, fungible }
}

/**
 * Fetch the connected wallet's STX and fungible token balances from the Hiro API.
 * Returns raw micro-STX / smallest-unit values.
 *
 * Uses react-query for caching, dedup, and stale-while-revalidate.
 */
export function useBalances() {
  const { stxAddress, connected } = useWallet()
  const queryClient = useQueryClient()

  const queryKey = ['balances', stxAddress] as const

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: () => fetchBalances(stxAddress!),
    enabled: connected && !!stxAddress,
    // Cache for 15s — balances change less frequently than vault state
    staleTime: 15_000,
    placeholderData: (prev) => prev,
  })

  const refresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey })
  }, [queryClient, queryKey[1]])

  return { balances: data ?? EMPTY, loading: isLoading, refresh }
}
