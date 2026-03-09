import { useState, useEffect } from 'react'
import { useWallet } from '../context/WalletContext'

const API_URL = 'https://api.hiro.so'

/** STX balance + fungible token balances keyed by contract principal */
export interface Balances {
  stx: bigint
  fungible: Record<string, { balance: bigint; decimals?: number }>
}

const EMPTY: Balances = { stx: 0n, fungible: {} }

/**
 * Fetch the connected wallet's STX and fungible token balances from the Hiro API.
 * Returns raw micro-STX / smallest-unit values.
 */
export function useBalances() {
  const { stxAddress, connected } = useWallet()
  const [balances, setBalances] = useState<Balances>(EMPTY)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!connected || !stxAddress) {
      setBalances(EMPTY)
      return
    }

    let cancelled = false
    setLoading(true)

    async function fetchBalances() {
      try {
        const resp = await fetch(
          `${API_URL}/extended/v1/address/${stxAddress}/balances`,
        )
        if (!resp.ok) throw new Error(`API ${resp.status}`)
        const data = await resp.json()

        if (cancelled) return

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

        setBalances({ stx, fungible })
      } catch (err) {
        console.warn('Failed to fetch balances:', err)
        if (!cancelled) setBalances(EMPTY)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetchBalances()
    return () => {
      cancelled = true
    }
  }, [stxAddress, connected])

  return { balances, loading }
}
