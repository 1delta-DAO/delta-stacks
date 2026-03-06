import { useState, useEffect } from 'react'
import { getStacksLenderPublicData } from '@delta-stacks/data-provision'
import type { AllLendingData } from '@delta-stacks/data-provision'

export type { AllLendingData }

const FETCH_OPTIONS = { apiUrl: 'https://api.hiro.so', concurrency: 3 }

export function useLendingData() {
  const [data, setData] = useState<AllLendingData>({ v1: undefined, v2: undefined, granite: undefined })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function fetchData() {
      try {
        // Fetch sequentially to avoid 429 rate limits from the public Hiro API.
        // Each protocol updates the UI as soon as it resolves.
        const v1 = await getStacksLenderPublicData('zest-v1', {}, FETCH_OPTIONS)
        if (cancelled) return
        setData(prev => ({ ...prev, v1 }))

        const v2 = await getStacksLenderPublicData('zest-v2', {}, FETCH_OPTIONS)
        if (cancelled) return
        setData(prev => ({ ...prev, v2 }))

        const granite = await getStacksLenderPublicData('granite', {}, FETCH_OPTIONS)
        if (cancelled) return
        setData(prev => ({ ...prev, granite }))
      } catch (e) {
        if (!cancelled) setError('Failed to fetch lending data')
        console.warn('Lending data fetch error:', e)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetchData()
    return () => { cancelled = true }
  }, [])

  return { data, loading, error }
}
