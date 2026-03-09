import { useQuery } from '@tanstack/react-query'
import { getStacksLenderPublicData } from '@delta-stacks/data-provision'
import type { AllLendingData } from '@delta-stacks/data-provision'

export type { AllLendingData }

const DATA_API_URL = import.meta.env.VITE_DATA_API_URL as string | undefined
const FORCE_CLIENT_FETCH = import.meta.env.VITE_FORCE_CLIENT_FETCH === 'true'
const FALLBACK_OPTIONS = { apiUrl: 'https://api.hiro.so', concurrency: 2 }

const EMPTY: AllLendingData = { v1: undefined, v2: undefined, granite: undefined }

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

async function fetchLendingData(): Promise<AllLendingData> {
  if (FORCE_CLIENT_FETCH) return fetchClientSide()
  try {
    return await fetchFromApi()
  } catch {
    console.warn('API fetch failed, falling back to client-side')
    return fetchClientSide()
  }
}

export function useLendingData() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['lending-data'],
    queryFn: fetchLendingData,
    staleTime: 60_000,
  })

  return {
    data: data ?? EMPTY,
    loading: isLoading,
    error: error ? 'Failed to fetch lending data' : null,
  }
}
