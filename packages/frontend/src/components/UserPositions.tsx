import { useState, useCallback } from 'react'
import type { AllLendingData, AllUserData, UserData, LendingPosition } from '@delta-stacks/data-provision'
import type { UnifiedMarket } from './LendingTab'
import type { AssetOracleLp } from '@delta-stacks/calldata-sdk-stacks'
import { ZestV1Lending, ZestV2Lending } from '@delta-stacks/calldata-sdk-stacks'
import { useTransact } from '../hooks/useTransact'
import { useWallet } from '../context/WalletContext'

import graniteLogo from '../assets/granite.png'
import zestLogo from '../assets/zest.png'
import { getTokenIcon } from '../utils/tokenIcons'

const LENDER_LABELS: Record<string, string> = {
  'zest-v1': 'Zest V1',
  'zest-v2': 'Zest V2',
  'granite-aeusdc': 'Granite aeUSDC',
  'granite-usdcx': 'Granite USDCx',
}

const LENDER_ICONS: Record<string, string> = {
  'zest-v1': zestLogo,
  'zest-v2': zestLogo,
  'granite-aeusdc': graniteLogo,
  'granite-usdcx': graniteLogo,
}

const EMODE_OPTIONS = [
  { value: 0, label: 'Default' },
  { value: 1, label: 'STX Correlated' },
] as const

/** Build a marketUid → symbol lookup from public lending data */
function buildSymbolMap(lendingData: AllLendingData): Record<string, string> {
  const map: Record<string, string> = {}
  if (lendingData.v1) {
    for (const m of Object.values(lendingData.v1.data)) map[m.marketUid] = m.symbol
  }
  if (lendingData.v2) {
    for (const m of Object.values(lendingData.v2.data)) map[m.marketUid] = m.symbol
  }
  if (lendingData.granite) {
    for (const m of Object.values(lendingData.granite.data)) map[m.marketUid] = m.symbol
  }
  return map
}

function sumPositions(positions: LendingPosition[]) {
  let deposits = 0
  let debt = 0
  for (const pos of positions) {
    deposits += pos.depositsUSD
    debt += pos.debtUSD + pos.debtStableUSD
  }
  return { deposits, debt }
}

function formatUSD(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000) return `$${(n / 1_000).toFixed(2)}K`
  if (n >= 0.01) return `$${n.toFixed(2)}`
  if (n > 0) return `$${n.toFixed(4)}`
  return '$0.00'
}

function formatTokenAmount(n: number): string {
  if (n === 0) return '0'
  if (n >= 1_000) return n.toFixed(2)
  if (n >= 1) return n.toFixed(4)
  if (n >= 0.0001) return n.toFixed(6)
  return n.toFixed(8)
}

function healthColor(h: number): string {
  if (h > 1.5) return 'text-positive'
  if (h > 1.2) return 'text-warning'
  return 'text-negative'
}

function healthBg(h: number): string {
  if (h > 1.5) return 'bg-positive-dim'
  if (h > 1.2) return 'bg-warning-dim'
  return 'bg-negative-dim'
}

function getSymbol(pos: LendingPosition, symbolMap: Record<string, string>): string {
  return (pos.marketUid && symbolMap[pos.marketUid])
    ?? pos.underlyingInfo?.symbol
    ?? pos.underlying?.split('.').pop()
    ?? pos.marketUid?.split(':').pop()
    ?? '?'
}

/** Small toggle switch component */
function Toggle({
  enabled,
  loading,
  onChange,
}: {
  enabled: boolean
  loading: boolean
  onChange: (enabled: boolean) => void
}) {
  return (
    <button
      type="button"
      disabled={loading}
      onClick={(e) => {
        e.stopPropagation()
        onChange(!enabled)
      }}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-all duration-200 ${
        loading ? 'opacity-50 cursor-wait' : 'cursor-pointer'
      } ${enabled ? 'bg-positive shadow-sm shadow-positive/20' : 'bg-border'}`}
    >
      <span
        className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform duration-200 shadow-sm ${
          enabled ? 'translate-x-4.5' : 'translate-x-0.5'
        }`}
      />
    </button>
  )
}

function PositionTile({
  pos,
  lender,
  symbolMap,
  selected,
  onClick,
  onToggleCollateral,
  collateralLoading,
}: {
  pos: LendingPosition
  lender: string
  symbolMap: Record<string, string>
  selected: boolean
  onClick: () => void
  onToggleCollateral?: (pos: LendingPosition, enable: boolean) => void
  collateralLoading: boolean
}) {
  const symbol = getSymbol(pos, symbolMap)
  const hasDeposit = pos.depositsUSD > 0
  const hasDebt = pos.debtUSD > 0
  const showCollateralToggle = (lender === 'zest-v1' || lender === 'zest-v2') && hasDeposit && onToggleCollateral

  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left rounded-xl p-3.5 space-y-2.5 transition-all duration-200 border ${
        selected
          ? 'bg-primary/8 border-primary/30 shadow-sm shadow-primary/10'
          : 'bg-surface-alt/60 border-border-subtle hover:border-border hover:bg-surface-hover cursor-pointer'
      }`}
    >
      {/* Asset header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <img
            src={getTokenIcon(symbol)}
            alt={symbol}
            className="w-5 h-5 rounded-full bg-surface-alt ring-1 ring-border-subtle"
            onError={(e) => {
              ;(e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${symbol}&background=2e2e4a&color=eaeaf4&size=36&bold=true`
            }}
          />
          <span className="font-semibold text-sm">{symbol}</span>
        </div>
        {showCollateralToggle ? (
          <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
            <span className="text-[10px] text-text-dim">Coll</span>
            <Toggle
              enabled={pos.collateralEnabled}
              loading={collateralLoading}
              onChange={(enable) => onToggleCollateral(pos, enable)}
            />
          </div>
        ) : pos.collateralEnabled ? (
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-positive-dim text-positive font-medium">Collateral</span>
        ) : null}
      </div>

      {/* Values */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
        {hasDeposit && (
          <>
            <span className="text-text-dim">Deposited</span>
            <span className="text-right font-mono">
              {formatTokenAmount(Number(pos.deposits))}
              <span className="text-text-dim ml-1">{formatUSD(pos.depositsUSD)}</span>
            </span>
          </>
        )}
        {hasDebt && (
          <>
            <span className="text-text-dim">Debt</span>
            <span className="text-right font-mono text-negative">
              {formatTokenAmount(Number(pos.debt))}
              <span className="ml-1">{formatUSD(pos.debtUSD)}</span>
            </span>
          </>
        )}
      </div>
    </button>
  )
}

function LenderCard({
  lender,
  userData,
  symbolMap,
  selectedMarketUid,
  marketLookup,
  onSelectMarket,
  onToggleCollateral,
  collateralLoadingUid,
  onSetEMode,
  eModeLoading,
}: {
  lender: string
  userData: UserData
  symbolMap: Record<string, string>
  selectedMarketUid: string | null
  marketLookup: Record<string, UnifiedMarket>
  onSelectMarket: (m: UnifiedMarket) => void
  onToggleCollateral?: (lender: string, pos: LendingPosition, enable: boolean) => void
  collateralLoadingUid: string | null
  onSetEMode?: (mode: number) => void
  eModeLoading: boolean
}) {
  const pool = userData.data[0]
  if (!pool) return null

  const positions = pool.positions.filter(p => p.depositsUSD > 0 || p.debtUSD > 0)
  if (positions.length === 0) return null

  const label = LENDER_LABELS[lender] ?? lender
  const icon = LENDER_ICONS[lender]
  const { deposits, debt } = sumPositions(positions)
  const currentEMode = parseInt(pool.userConfig.selectedMode, 10)

  return (
    <div className="glass-card rounded-xl overflow-hidden">
      {/* Lender header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border-subtle">
        <div className="flex items-center gap-3">
          {icon && <img src={icon} alt={label} className="w-5 h-5 rounded-full" />}
          <span className="text-sm font-semibold">{label}</span>
          <div className="flex items-center gap-3 text-xs text-text-dim ml-1">
            <span>Dep <span className="font-mono text-text-muted">{formatUSD(deposits)}</span></span>
            {debt > 0 && (
              <span>Debt <span className="font-mono text-negative">{formatUSD(debt)}</span></span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* E-mode dropdown (V1 only) */}
          {lender === 'zest-v1' && onSetEMode && (
            <select
              value={currentEMode}
              disabled={eModeLoading}
              onChange={(e) => {
                e.stopPropagation()
                onSetEMode(parseInt(e.target.value, 10))
              }}
              className={`text-xs bg-surface-alt border border-border-subtle rounded-lg px-2 py-1 text-text focus:outline-none focus:border-primary transition-all duration-200 ${
                eModeLoading ? 'opacity-50 cursor-wait' : 'cursor-pointer'
              }`}
            >
              {EMODE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          )}
          {pool.health !== null && (
            <span className={`text-xs font-mono px-2.5 py-1 rounded-lg ${healthColor(pool.health)} ${healthBg(pool.health)}`}>
              HF {pool.health.toFixed(2)}
            </span>
          )}
        </div>
      </div>

      {/* Position tiles */}
      <div className="p-3 grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.min(positions.length, 3)}, minmax(0, 1fr))` }}>
        {positions.map((pos) => {
          const uid = pos.marketUid
          const market = uid ? marketLookup[uid] : undefined
          return (
            <PositionTile
              key={uid ?? pos.underlying}
              pos={pos}
              lender={lender}
              symbolMap={symbolMap}
              selected={uid === selectedMarketUid}
              onClick={() => market && onSelectMarket(market)}
              onToggleCollateral={
                onToggleCollateral
                  ? (p, enable) => onToggleCollateral(lender, p, enable)
                  : undefined
              }
              collateralLoading={collateralLoadingUid === uid}
            />
          )
        })}
      </div>
    </div>
  )
}

export function UserPositions({
  data,
  loading,
  lendingData,
  allMarkets,
  selectedMarketUid,
  onSelectMarket,
  v1PositionAssets,
}: {
  data: AllUserData
  loading: boolean
  lendingData: AllLendingData
  allMarkets: UnifiedMarket[]
  selectedMarketUid: string | null
  onSelectMarket: (m: UnifiedMarket) => void
  v1PositionAssets: AssetOracleLp[]
}) {
  const { stxAddress } = useWallet()
  const tx = useTransact()
  const [collateralLoadingUid, setCollateralLoadingUid] = useState<string | null>(null)
  const [eModeLoading, setEModeLoading] = useState(false)

  const symbolMap = buildSymbolMap(lendingData)

  // Build marketUid → UnifiedMarket lookup
  const marketLookup: Record<string, UnifiedMarket> = {}
  for (const m of allMarkets) {
    marketLookup[m.marketUid] = m
  }

  const handleToggleCollateral = useCallback(
    async (lender: string, pos: LendingPosition, enable: boolean) => {
      if (!stxAddress) return
      const uid = pos.marketUid
      setCollateralLoadingUid(uid)

      try {
        await tx.execute(async () => {
          if (lender === 'zest-v1') {
            const market = uid ? marketLookup[uid] : undefined
            if (!market?.v1Asset) throw new Error('Missing V1 asset info')
            const priceFeedBytes = enable ? undefined : await ZestV1Lending.fetchPriceFeeds()
            return ZestV1Lending.encodeSetUserUseReserveAsCollateral(
              stxAddress,
              market.v1Asset.lpToken,
              market.v1Asset.underlying,
              enable,
              market.v1Asset.oracle,
              v1PositionAssets,
              priceFeedBytes,
            )
          } else if (lender === 'zest-v2') {
            const market = uid ? marketLookup[uid] : undefined
            if (!market?.v2Vault) throw new Error('Missing V2 vault')
            const deposits = BigInt(Math.floor(Number(pos.deposits) * 10 ** (market.decimals ?? 6)))
            if (enable) {
              return ZestV2Lending.encodeCollateralAdd(market.v2Vault, deposits)
            } else {
              const feeds = await ZestV2Lending.fetchPriceFeedsForVaults([market.v2Vault])
              return ZestV2Lending.encodeCollateralRemove(market.v2Vault, deposits, stxAddress, feeds)
            }
          }
          throw new Error(`Collateral toggle not supported for ${lender}`)
        })
      } finally {
        setCollateralLoadingUid(null)
      }
    },
    [stxAddress, tx, marketLookup, v1PositionAssets],
  )

  const handleSetEMode = useCallback(
    async (mode: number) => {
      if (!stxAddress) return
      setEModeLoading(true)

      try {
        await tx.execute(async () => {
          const priceFeedBytes = await ZestV1Lending.fetchPriceFeeds()
          return ZestV1Lending.encodeSetEMode(
            stxAddress,
            v1PositionAssets,
            mode,
            priceFeedBytes,
          )
        })
      } finally {
        setEModeLoading(false)
      }
    },
    [stxAddress, tx, v1PositionAssets],
  )

  const lenders: { key: string; userData: UserData }[] = []
  for (const [key, ud] of [['zest-v1', data.v1], ['zest-v2', data.v2], ['granite-aeusdc', data['granite-aeusdc']], ['granite-usdcx', data['granite-usdcx']]] as const) {
    if (!ud) continue
    const positions = ud.data[0]?.positions
    if (positions?.some(p => p.depositsUSD > 0 || p.debtUSD > 0)) {
      lenders.push({ key, userData: ud })
    }
  }

  if (loading && lenders.length === 0) {
    return (
      <div className="glass-card rounded-xl p-4 flex items-center gap-3">
        <svg className="animate-spin h-4 w-4 text-text-muted" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        <span className="text-text-muted text-sm">Loading positions...</span>
      </div>
    )
  }

  if (lenders.length === 0) return null

  let totalDeposits = 0
  let totalDebt = 0
  for (const { userData } of lenders) {
    const { deposits, debt } = sumPositions(userData.data[0].positions)
    totalDeposits += deposits
    totalDebt += debt
  }
  const netValue = totalDeposits - totalDebt

  return (
    <div className="space-y-3">
      {/* Global summary */}
      <div className="glass-card rounded-xl px-5 py-4 flex items-center gap-8">
        <div className="flex flex-col">
          <span className="text-text-dim text-[10px] uppercase tracking-wider font-semibold">Net Value</span>
          <span className="text-xl font-bold font-mono">{formatUSD(netValue)}</span>
        </div>
        <div className="w-px h-8 bg-border-subtle" />
        <div className="flex flex-col">
          <span className="text-text-dim text-[10px] uppercase tracking-wider font-semibold">Deposits</span>
          <span className="text-sm font-mono text-positive">{formatUSD(totalDeposits)}</span>
        </div>
        <div className="flex flex-col">
          <span className="text-text-dim text-[10px] uppercase tracking-wider font-semibold">Debt</span>
          <span className="text-sm font-mono text-negative">{formatUSD(totalDebt)}</span>
        </div>
        {loading && (
          <div className="ml-auto flex items-center gap-2 text-text-dim">
            <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <span className="text-xs">Refreshing...</span>
          </div>
        )}
      </div>

      {/* Tx status feedback */}
      {tx.status === 'submitted' && tx.txId && (
        <div className="text-xs text-positive bg-positive-dim glass-card rounded-xl p-3 flex items-center gap-2">
          <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          Submitted!{' '}
          <a
            href={`https://explorer.hiro.so/txid/${tx.txId}?chain=mainnet`}
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            View on explorer
          </a>
        </div>
      )}
      {tx.status === 'error' && tx.error && (
        <div className="text-xs text-negative bg-negative-dim glass-card rounded-xl p-3">{tx.error}</div>
      )}

      {/* Per-lender cards */}
      {lenders.map(({ key, userData }) => (
        <LenderCard
          key={key}
          lender={key}
          userData={userData}
          symbolMap={symbolMap}
          selectedMarketUid={selectedMarketUid}
          marketLookup={marketLookup}
          onSelectMarket={onSelectMarket}
          onToggleCollateral={stxAddress ? handleToggleCollateral : undefined}
          collateralLoadingUid={collateralLoadingUid}
          onSetEMode={stxAddress ? handleSetEMode : undefined}
          eModeLoading={eModeLoading}
        />
      ))}
    </div>
  )
}
