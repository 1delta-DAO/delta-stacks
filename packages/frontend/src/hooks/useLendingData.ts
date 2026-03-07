import { useState, useEffect } from 'react'
import { getStacksLenderPublicData } from '@delta-stacks/data-provision'
import type { AllLendingData } from '@delta-stacks/data-provision'

export type { AllLendingData }

const DATA_API_URL = import.meta.env.VITE_DATA_API_URL as string | undefined
const FORCE_CLIENT_FETCH = import.meta.env.VITE_FORCE_CLIENT_FETCH === 'true'
const FALLBACK_OPTIONS = { apiUrl: 'https://api.hiro.so', concurrency: 2 }

async function fetchFromApi(): Promise<AllLendingData> {
  if (!DATA_API_URL) throw new Error('No API URL')
  const res = await fetch(DATA_API_URL)
  if (!res.ok) throw new Error(`API returned ${res.status}`)
  return res.json()
}

async function fetchClientSide(): Promise<AllLendingData> {
  const [v1, v2, granite] = await Promise.all([
    getStacksLenderPublicData('zest-v1', {}, FALLBACK_OPTIONS),
    getStacksLenderPublicData('zest-v2', {}, FALLBACK_OPTIONS),
    getStacksLenderPublicData('granite', {}, FALLBACK_OPTIONS),
  ])
  return { v1, v2, granite }
}

export function useLendingData() {
  const [data, setData] = useState<AllLendingData>({ v1: undefined, v2: undefined, granite: undefined })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function fetchData() {
      try {
        if (FORCE_CLIENT_FETCH) {
          const result = await fetchClientSide()
          if (cancelled) return
          setData(result)
          return
        }

        const result = await fetchFromApi()
        if (cancelled) return
        setData(result)
      } catch (apiErr) {
        console.warn('API fetch failed, falling back to client-side:', apiErr)
        try {
          const result = await fetchClientSide()
          if (cancelled) return
          setData(result)
        } catch (e) {
          if (!cancelled) setError('Failed to fetch lending data')
          console.warn('Client-side fallback also failed:', e)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetchData()
    return () => { cancelled = true }
  }, [])

  return { data, loading, error }
}
