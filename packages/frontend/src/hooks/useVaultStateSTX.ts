import { useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { VAULT_STX_DEPLOYER } from '@delta-stacks/calldata-sdk-stacks'

const API = 'https://api.hiro.so'
const SENDER = VAULT_STX_DEPLOYER

// Vault reader contract (same deployer)
const READER_DEPLOYER = VAULT_STX_DEPLOYER
const READER_CONTRACT = 'vault-reader-v1'

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
// Fetch — single vault get-vault-state call (1 RPC instead of 15)
// Falls back to legacy reader, then individual calls
// ---------------------------------------------------------------------------

async function fetchVaultStateSTX(): Promise<VaultStateSTX> {
  // get-vault-state exceeds Hiro free-tier RPC cost limits (calls external contracts).
  // Use sequential batched individual calls instead to avoid 429s.
  return fetchVaultStateSTXFallback()
}

async function parseReaderResponse(hex: string): Promise<VaultStateSTX> {
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

  const vo = virtualOffset > 0n ? virtualOffset : 1_000_000n
  const sharePrice =
    totalSupply > 0n
      ? Number((totalAssets + vo) * 1_000_000n / (totalSupply + vo)) / 1e6
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
        const wstxMarket = lenderData?.data?.[ZEST_V1_WSTX_MARKET_UID]
        if (wstxMarket?.depositRate != null) {
          zestV1Apr = wstxMarket.depositRate * 100
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
// Fallback: sequential batched calls (avoids 429 rate limits)
// ---------------------------------------------------------------------------

const delay = (ms: number) => new Promise(r => setTimeout(r, ms))

async function fetchVaultStateSTXFallback(): Promise<VaultStateSTX> {
  const vaultContract = 'vault-stx-v5-5'

  // Sequential calls -- one at a time to avoid 429s from Hiro rate limiter
  const totalAssetsHex = await callRead(SENDER, vaultContract, 'get-total-assets')
  const totalSupplyHex = await callRead(SENDER, vaultContract, 'get-total-supply')
  const allocV1Hex = await callRead(SENDER, vaultContract, 'get-alloc-zest-v1')
  const allocV2Hex = await callRead(SENDER, vaultContract, 'get-alloc-zest-v2')
  const idleBookHex = await callRead(SENDER, vaultContract, 'get-idle-bookkeeping')
  const virtualOffsetHex = await callRead(SENDER, vaultContract, 'get-virtual-offset')
  const feeBpsHex = await callRead(SENDER, vaultContract, 'get-fee-bps')
  const idleBufferBpsHex = await callRead(SENDER, vaultContract, 'get-idle-buffer-bps')
  const liveIdleHex = await callRead(SENDER, vaultContract, 'get-idle-balance')
  const liveV1Hex = await callRead(SENDER, vaultContract, 'get-zest-v1-wstx-position')
  const liveV2Hex = await callRead(SENDER, vaultContract, 'get-zest-v2-stx-position')
  const liveTotalHex = await callRead(SENDER, vaultContract, 'get-live-total-assets')
  const zestV2InterestRateHex = await callRead(ZEST_V2_DEPLOYER, ZEST_V2_CONTRACT, 'get-interest-rate')
  const zestV2UtilizationHex = await callRead(ZEST_V2_DEPLOYER, ZEST_V2_CONTRACT, 'get-utilization')
  const zestV2FeeReserveHex = await callRead(ZEST_V2_DEPLOYER, ZEST_V2_CONTRACT, 'get-fee-reserve')

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

  // --- Zest V1 APR (from backend API) ---
  let zestV1Apr = 0
  try {
    const backendBase = getBackendBase()
    if (backendBase) {
      const res = await fetch(`${backendBase}/zest-v1`)
      if (res.ok) {
        const lenderData = await res.json()
        const wstxMarket = lenderData?.data?.[ZEST_V1_WSTX_MARKET_UID]
        if (wstxMarket?.depositRate != null) {
          zestV1Apr = wstxMarket.depositRate * 100
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

const VAULT_STX_STATE_KEY = ['vault-stx-state'] as const

export function useVaultStateSTX(pollIntervalMs = 120_000) {
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: VAULT_STX_STATE_KEY,
    queryFn: fetchVaultStateSTX,
    staleTime: 120_000,
    refetchInterval: pollIntervalMs,
    refetchOnWindowFocus: false,
    retry: 1,
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
