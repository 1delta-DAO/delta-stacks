import { useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { VAULT_STX_DEPLOYER } from '@delta-stacks/calldata-sdk-stacks'

const API = 'https://api.hiro.so'
const SENDER = VAULT_STX_DEPLOYER

/** Derive the backend base URL from the VITE_DATA_API_URL env var */
function getBackendBase(): string {
  const dataUrl = import.meta.env.VITE_DATA_API_URL as string | undefined
  if (dataUrl) {
    try { return new URL(dataUrl).origin } catch { return dataUrl.replace(/\/[^/]*$/, '') }
  }
  return ''
}

// Zest V1 (wSTX pool — Aave-like)
const ZEST_V1_DEPLOYER = 'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N'
const ZEST_V1_WSTX_MARKET_UID = `stacks-mainnet:zest-v1:${ZEST_V1_DEPLOYER}.wstx`

// Zest V2 STX vault (ERC-4626)
const ZEST_V2_DEPLOYER = 'SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7'
const ZEST_V2_CONTRACT = 'v0-vault-stx'

// ---------------------------------------------------------------------------
// Clarity hex decode helpers (same as useVaultStateV3)
// ---------------------------------------------------------------------------

function decodeUint(hex: string): bigint {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex
  let data: string
  if (clean.startsWith('0701')) {
    data = clean.slice(4)
  } else if (clean.startsWith('01')) {
    data = clean.slice(2)
  } else {
    return 0n
  }
  return BigInt('0x' + data)
}

// ---------------------------------------------------------------------------
// API call helper
// ---------------------------------------------------------------------------

async function callRead(
  contractAddr: string,
  contractName: string,
  fn: string,
): Promise<string> {
  const resp = await fetch(
    `${API}/v2/contracts/call-read/${contractAddr}/${contractName}/${fn}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sender: SENDER, arguments: [] }),
    },
  )
  if (!resp.ok) return ''
  const data = await resp.json()
  return data.result ?? ''
}

// ---------------------------------------------------------------------------
// State type — reuses the same shape as VaultStateV3 for UI compatibility
// ---------------------------------------------------------------------------

export interface VaultStateSTX {
  totalAssets: bigint
  allocZestV1: bigint
  allocZestV2: bigint
  idleBookkeeping: bigint
  totalSupply: bigint
  sharePrice: number

  liveIdle: bigint
  liveZestV1: bigint
  liveZestV2: bigint
  liveTotal: bigint
  unrealizedYield: bigint

  zestV1Apr: number
  zestV2Apr: number
  blendedApr: number

  feeBps: bigint
  feeRecipient: string
  idleBufferBps: bigint
  virtualOffset: bigint
  vaultOwner: string
  vaultAllocator: string
}

const EMPTY: VaultStateSTX = {
  totalAssets: 0n,
  allocZestV1: 0n,
  allocZestV2: 0n,
  idleBookkeeping: 0n,
  totalSupply: 0n,
  sharePrice: 0,
  liveIdle: 0n,
  liveZestV1: 0n,
  liveZestV2: 0n,
  liveTotal: 0n,
  unrealizedYield: 0n,
  zestV1Apr: 0,
  zestV2Apr: 0,
  blendedApr: 0,
  feeBps: 0n,
  feeRecipient: '',
  idleBufferBps: 500n,
  virtualOffset: 1_000_000n,
  vaultOwner: '',
  vaultAllocator: '',
}

// ---------------------------------------------------------------------------
// Fetch function
// ---------------------------------------------------------------------------

async function fetchVaultStateSTX(): Promise<VaultStateSTX> {
  const vaultContract = 'vault-stx-v3-1'

  const [
    totalAssetsHex,
    allocV1Hex,
    allocV2Hex,
    idleBookHex,
    totalSupplyHex,
    liveIdleHex,
    liveV1Hex,
    liveV2Hex,
    liveTotalHex,
    feeBpsHex,
    idleBufferBpsHex,
    virtualOffsetHex,
    // Zest V1 supply rate: we read from zwstx z-token normalized income
    // Zest V2 STX vault: borrow rate, utilization, fee-reserve
    zestV2InterestRateHex,
    zestV2UtilizationHex,
    zestV2FeeReserveHex,
  ] = await Promise.all([
    callRead(SENDER, vaultContract, 'get-total-assets'),
    callRead(SENDER, vaultContract, 'get-alloc-zest-v1'),
    callRead(SENDER, vaultContract, 'get-alloc-zest-v2'),
    callRead(SENDER, vaultContract, 'get-idle-bookkeeping'),
    callRead(SENDER, vaultContract, 'get-total-supply'),
    callRead(SENDER, vaultContract, 'get-idle-balance'),
    callRead(SENDER, vaultContract, 'get-zest-v1-wstx-position'),
    callRead(SENDER, vaultContract, 'get-zest-v2-stx-position'),
    callRead(SENDER, vaultContract, 'get-live-total-assets'),
    callRead(SENDER, vaultContract, 'get-fee-bps'),
    callRead(SENDER, vaultContract, 'get-idle-buffer-bps'),
    callRead(SENDER, vaultContract, 'get-virtual-offset'),
    callRead(ZEST_V2_DEPLOYER, ZEST_V2_CONTRACT, 'get-interest-rate'),
    callRead(ZEST_V2_DEPLOYER, ZEST_V2_CONTRACT, 'get-utilization'),
    callRead(ZEST_V2_DEPLOYER, ZEST_V2_CONTRACT, 'get-fee-reserve'),
  ])

  const totalAssets = decodeUint(totalAssetsHex)
  const allocZestV1 = decodeUint(allocV1Hex)
  const allocZestV2 = decodeUint(allocV2Hex)
  const idleBookkeeping = decodeUint(idleBookHex)
  const totalSupply = decodeUint(totalSupplyHex)
  const liveIdle = decodeUint(liveIdleHex)
  const liveZestV1 = decodeUint(liveV1Hex)
  const liveZestV2 = decodeUint(liveV2Hex)
  const liveTotalDeployed = decodeUint(liveTotalHex)
  const liveTotal = liveTotalDeployed + liveIdle

  const virtualOffset = decodeUint(virtualOffsetHex)
  const vo = virtualOffset > 0n ? virtualOffset : 1_000_000n
  const sharePrice =
    totalSupply > 0n
      ? Number((totalAssets + vo) * 1_000_000n / (totalSupply + vo)) / 1e6
      : 1

  const unrealizedYield = liveTotal > totalAssets ? liveTotal - totalAssets : 0n

  const feeBps = decodeUint(feeBpsHex)
  const idleBufferBps = decodeUint(idleBufferBpsHex)

  // --- Zest V1 APR (fetch deposit rate from backend API) ---
  let zestV1Apr = 0
  try {
    const backendBase = getBackendBase()
    if (backendBase) {
      const res = await fetch(`${backendBase}/zest-v1`)
      if (res.ok) {
        const lenderData = await res.json()
        const wstxMarket = lenderData?.data?.[ZEST_V1_WSTX_MARKET_UID]
        if (wstxMarket?.depositRate != null) {
          zestV1Apr = wstxMarket.depositRate * 100 // depositRate is decimal, convert to %
        }
      }
    }
  } catch {
    // Fallback: keep 0 if backend unavailable
  }

  // --- Zest V2 APR (supply rate = borrowRate * utilization * (1 - feeReserve)) ---
  const zestV2BorrowRate = Number(decodeUint(zestV2InterestRateHex)) / 10_000
  const zestV2Utilization = Number(decodeUint(zestV2UtilizationHex)) / 10_000
  const zestV2FeeReserve = Number(decodeUint(zestV2FeeReserveHex)) / 10_000
  const zestV2Apr = zestV2BorrowRate * zestV2Utilization * (1 - zestV2FeeReserve) * 100

  // --- Blended APR ---
  let blendedApr = 0
  if (totalAssets > 0n) {
    const v1Weight = Number(allocZestV1) / Number(totalAssets)
    const v2Weight = Number(allocZestV2) / Number(totalAssets)
    blendedApr = zestV1Apr * v1Weight + zestV2Apr * v2Weight
  }

  return {
    totalAssets,
    allocZestV1,
    allocZestV2,
    idleBookkeeping,
    totalSupply,
    sharePrice,
    liveIdle,
    liveZestV1,
    liveZestV2,
    liveTotal,
    unrealizedYield,
    zestV1Apr,
    zestV2Apr,
    blendedApr,
    feeBps,
    feeRecipient: '',
    idleBufferBps,
    virtualOffset: vo,
    vaultOwner: '',
    vaultAllocator: '',
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

const VAULT_STX_STATE_KEY = ['vault-stx-state'] as const

export function useVaultStateSTX(pollIntervalMs = 60_000) {
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: VAULT_STX_STATE_KEY,
    queryFn: fetchVaultStateSTX,
    staleTime: 30_000,
    refetchInterval: pollIntervalMs,
  })

  const refresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: VAULT_STX_STATE_KEY })
  }, [queryClient])

  return {
    state: data ?? EMPTY,
    loading: isLoading,
    refresh,
  }
}
