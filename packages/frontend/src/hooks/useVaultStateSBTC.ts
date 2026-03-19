import { useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { VAULT_SBTC_DEPLOYER } from '@delta-stacks/calldata-sdk-stacks'

const API = 'https://api.hiro.so'
const SENDER = VAULT_SBTC_DEPLOYER

// Vault reader contract (same deployer as STX vault reader)
const READER_DEPLOYER = VAULT_SBTC_DEPLOYER
const READER_CONTRACT = 'vault-reader-v1'

/** Derive the backend base URL from the VITE_DATA_API_URL env var */
function getBackendBase(): string {
  const dataUrl = import.meta.env.VITE_DATA_API_URL as string | undefined
  if (dataUrl) {
    try { return new URL(dataUrl).origin } catch { return dataUrl.replace(/\/[^/]*$/, '') }
  }
  return ''
}

// Zest V1 (sBTC pool — Aave-like)
// const _ZEST_V1_DEPLOYER = 'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N'
const ZEST_V1_SBTC_MARKET_UID = `stacks-mainnet:zest-v1:SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token`

// Zest V2 sBTC vault (ERC-4626)
const ZEST_V2_DEPLOYER = 'SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7'
const ZEST_V2_CONTRACT = 'v0-vault-sbtc'

// ---------------------------------------------------------------------------
// Clarity hex decode helpers
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

function strToHex(s: string): string {
  let out = ''
  for (let i = 0; i < s.length; i++) {
    out += s.charCodeAt(i).toString(16).padStart(2, '0')
  }
  return out
}

function decodeTupleUint(hex: string, fieldName: string): bigint {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex
  const nameHex = strToHex(fieldName)
  const nameLen = (fieldName.length).toString(16).padStart(2, '0')
  const marker = nameLen + nameHex + '01'
  const idx = clean.indexOf(marker)
  if (idx === -1) return 0n
  const start = idx + marker.length
  const uintHex = clean.slice(start, start + 32)
  return BigInt('0x' + uintHex)
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
// State type
// ---------------------------------------------------------------------------

export interface VaultStateSBTC {
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

const EMPTY: VaultStateSBTC = {
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
  virtualOffset: 100_000_000n,
  vaultOwner: '',
  vaultAllocator: '',
}

// ---------------------------------------------------------------------------
// Fetch — single reader call (1 RPC + 1 backend fetch instead of 15+1)
// Falls back to individual calls if reader not deployed
// ---------------------------------------------------------------------------

async function fetchVaultStateSBTC(): Promise<VaultStateSBTC> {
  // v6: go straight to sequential calls (reader not deployed for v5)
  return fetchVaultStateSBTCFallback()
}

async function parseReaderResponse(hex: string): Promise<VaultStateSBTC> {
  const totalAssets = decodeTupleUint(hex, 'total-assets')
  const totalSupply = decodeTupleUint(hex, 'total-supply')
  const allocZestV1 = decodeTupleUint(hex, 'alloc-zest-v1')
  const allocZestV2 = decodeTupleUint(hex, 'alloc-zest-v2')
  const idleBookkeeping = decodeTupleUint(hex, 'idle-bookkeeping')
  const liveIdle = decodeTupleUint(hex, 'idle-balance')
  const liveZestV1 = decodeTupleUint(hex, 'live-zest-v1')
  const liveZestV2 = decodeTupleUint(hex, 'live-zest-v2')
  const liveTotalDeployed = decodeTupleUint(hex, 'live-total')
  const liveTotal = liveTotalDeployed + liveIdle
  const feeBps = decodeTupleUint(hex, 'fee-bps')
  const idleBufferBps = decodeTupleUint(hex, 'idle-buffer-bps')
  const virtualOffset = decodeTupleUint(hex, 'virtual-offset')

  const vo = virtualOffset > 0n ? virtualOffset : 100_000_000n
  const sharePrice =
    totalSupply > 0n
      ? Number((totalAssets + vo) * 100_000_000n / (totalSupply + vo)) / 1e8
      : 1

  const unrealizedYield = liveTotal > totalAssets ? liveTotal - totalAssets : 0n

  // --- Zest V1 APR (from backend API — Aave-style accrual, not on-chain) ---
  let zestV1Apr = 0
  try {
    const backendBase = getBackendBase()
    if (backendBase) {
      const res = await fetch(`${backendBase}/zest-v1`)
      if (res.ok) {
        const lenderData = await res.json()
        const sbtcMarket = lenderData?.data?.[ZEST_V1_SBTC_MARKET_UID]
        if (sbtcMarket?.depositRate != null) {
          zestV1Apr = sbtcMarket.depositRate * 100
        }
      }
    }
  } catch { /* keep 0 */ }

  // --- Zest V2 APR (from reader tuple) ---
  const zestV2BorrowRate = Number(decodeTupleUint(hex, 'zest-v2-interest-rate')) / 10_000
  const zestV2Utilization = Number(decodeTupleUint(hex, 'zest-v2-utilization')) / 10_000
  const zestV2FeeReserve = Number(decodeTupleUint(hex, 'zest-v2-fee-reserve')) / 10_000
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
// Fallback: individual calls (for when reader is not deployed)
// ---------------------------------------------------------------------------

async function fetchVaultStateSBTCFallback(): Promise<VaultStateSBTC> {
  const vaultContract = 'vault-sbtc-v6'

  // Essential reads only (6 calls instead of 15 to reduce RPC load)
  const totalAssetsHex = await callRead(SENDER, vaultContract, 'get-total-assets')
  const totalSupplyHex = await callRead(SENDER, vaultContract, 'get-total-supply')
  const allocV1Hex = await callRead(SENDER, vaultContract, 'get-alloc-zest-v1')
  const allocV2Hex = await callRead(SENDER, vaultContract, 'get-alloc-zest-v2')
  const idleBookHex = await callRead(SENDER, vaultContract, 'get-idle-bookkeeping')
  const feeBpsHex = await callRead(SENDER, vaultContract, 'get-fee-bps')
  // Derive the rest from bookkeeping (skip live position reads + Zest V2 APR)
  const virtualOffsetHex = ''
  const idleBufferBpsHex = ''
  const liveIdleHex = ''
  const liveV1Hex = ''
  const liveV2Hex = ''
  const liveTotalHex = ''
  const zestV2InterestRateHex = ''
  const zestV2UtilizationHex = ''
  const zestV2FeeReserveHex = ''

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
  const vo = virtualOffset > 0n ? virtualOffset : 100_000_000n
  const sharePrice =
    totalSupply > 0n
      ? Number((totalAssets + vo) * 100_000_000n / (totalSupply + vo)) / 1e8
      : 1

  const unrealizedYield = liveTotal > totalAssets ? liveTotal - totalAssets : 0n

  const feeBps = decodeUint(feeBpsHex)
  const idleBufferBps = decodeUint(idleBufferBpsHex)

  // --- Zest V1 APR (from backend API) ---
  let zestV1Apr = 0
  try {
    const backendBase = getBackendBase()
    if (backendBase) {
      const res = await fetch(`${backendBase}/zest-v1`)
      if (res.ok) {
        const lenderData = await res.json()
        const sbtcMarket = lenderData?.data?.[ZEST_V1_SBTC_MARKET_UID]
        if (sbtcMarket?.depositRate != null) {
          zestV1Apr = sbtcMarket.depositRate * 100
        }
      }
    }
  } catch { /* keep 0 */ }

  // --- Zest V2 APR ---
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

const VAULT_SBTC_STATE_KEY = ['vault-sbtc-state'] as const

export function useVaultStateSBTC(pollIntervalMs = 120_000) {
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: VAULT_SBTC_STATE_KEY,
    queryFn: fetchVaultStateSBTC,
    staleTime: 120_000,
    refetchInterval: pollIntervalMs,
    refetchOnWindowFocus: false,
    retry: 1,
  })

  const refresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: VAULT_SBTC_STATE_KEY })
  }, [queryClient])

  return {
    state: data ?? EMPTY,
    loading: isLoading,
    refresh,
  }
}
