import { useState, useEffect } from 'react'
import type { StacksTokenList } from '@delta-stacks/data-provision'

const TOKEN_LIST_URL =
  'https://raw.githubusercontent.com/AxtarTechnology/delta-stacks/main/packages/data-provision/data/stacks-token-list.json'

const FALLBACK: StacksTokenList = { chainId: 'stacks', version: '0', list: {}, mainTokens: [] }

export function useTokenList() {
  const [tokenList, setTokenList] = useState<StacksTokenList>(FALLBACK)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        // Try loading from local data first (served by vite public dir)
        const resp = await fetch('/stacks-token-list.json')
        if (!resp.ok) throw new Error('not found locally')
        const data = await resp.json()
        if (!cancelled) setTokenList(data)
      } catch {
        // fallback: try remote
        try {
          const resp = await fetch(TOKEN_LIST_URL)
          const data = await resp.json()
          if (!cancelled) setTokenList(data)
        } catch {
          // use empty fallback
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  return { tokenList, loading }
}
