import { useQuery } from '@tanstack/react-query'
import {
  getAllUserData,
  fetchAllPrices,
  convertPublicDataToMeta,
} from '@delta-stacks/data-provision'
import type { AllLendingData, AllUserData } from '@delta-stacks/data-provision'

const EMPTY: AllUserData = { v1: undefined, v2: undefined, 'granite-aeusdc': undefined, 'granite-usdcx': undefined }
const FETCH_OPTIONS = { apiUrl: 'https://api.hiro.so', concurrency: 5 }

async function fetchUserData(
  address: string,
  lendingData: AllLendingData,
): Promise<AllUserData> {
  const prices = await fetchAllPrices({ apiUrl: FETCH_OPTIONS.apiUrl })
  const metaMap = convertPublicDataToMeta(lendingData, prices)
  return getAllUserData(address, metaMap, prices, FETCH_OPTIONS)
}

/**
 * Fetches user lending positions across all Stacks lenders.
 * Requires a connected wallet address and public lending data (for metaMap + prices).
 */
export function useUserData(address: string | null, lendingData: AllLendingData) {
  const hasLendingData = !!(lendingData.v1 || lendingData.v2 || lendingData.granite)


  const { data, isLoading, error } = useQuery({
    queryKey: ['user-data', address],
    queryFn: () => fetchUserData(address!, lendingData),
    enabled: !!address && hasLendingData,
    staleTime: 30_000,
  })

  return {
    data: data ?? EMPTY,
    loading: isLoading,
    error: error ? 'Failed to fetch user positions' : null,
  }
}
