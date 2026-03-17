import { useState } from 'react'
import { ActionPanel } from './ActionPanel'
import { UserPositions } from './UserPositions'
import { useLendingData } from '../hooks/useLendingData'
import { useUserData } from '../hooks/useUserData'
import { useWallet } from '../context/WalletContext'
import type { AllLendingData } from '@delta-stacks/data-provision'
import {
  ZEST_V1_CONTRACTS,
  ZEST_V2_CONTRACTS,
  ZEST_V2_VAULT_TO_UNDERLYING,
} from '@delta-stacks/calldata-sdk-stacks'
import type { AssetOracleLp } from '@delta-stacks/calldata-sdk-stacks'

import graniteLogo from '../assets/granite.png'
import zestLogo from '../assets/zest.png'
import { getTokenIcon } from '../utils/tokenIcons'

const LENDERS = ['All', 'Zest V1', 'Zest V2', 'Granite aeUSDC', 'Granite USDCx']

/** Lender key used internally */
type LenderKey = 'zest-v1' | 'zest-v2' | 'granite-aeusdc' | 'granite-usdcx'

export interface UnifiedMarket {
  marketUid: string
  protocol: string
  lender: LenderKey
  symbol: string
  totalDeposits: number
  totalBorrows: number
  totalDepositsUSD: number | null
  totalBorrowsUSD: number | null
  supplyRate: number
  borrowRate: number
  baseLtv: number
  liquidationThreshold: number
  decimals: number
  /** Underlying token principal for wallet balance lookups (e.g. SP...token-aeusdc) */
  underlying?: string
  // Protocol-specific identifiers for SDK
  v1Asset?: { underlying: string; lpToken: string; oracle: string }
  v2Vault?: string
  graniteMarketId?: 'aeusdc' | 'usdcx'
  /** True for Granite collateral entries (e.g. sBTC) */
  isCollateral?: boolean
  /** Collateral token contract principal (e.g. sbtc-token) for encodeAddCollateral */
  collateralToken?: string
}

/** Map Zest V2 vault name -> full contract principal */
const V2_VAULT_MAP: Record<string, string> = {
  'v0-vault-stx': ZEST_V2_CONTRACTS.vaultStx,
  'v0-vault-sbtc': ZEST_V2_CONTRACTS.vaultSbtc,
  'v0-vault-ststx': ZEST_V2_CONTRACTS.vaultStstx,
  'v0-vault-usdc': ZEST_V2_CONTRACTS.vaultUsdc,
  'v0-vault-usdh': ZEST_V2_CONTRACTS.vaultUsdh,
  'v0-vault-ststxbtc': ZEST_V2_CONTRACTS.vaultStstxbtc,
}

/** Z-token addresses for Zest V1 (keyed by asset principal) */
const V1_DEPLOYER = ZEST_V1_CONTRACTS.poolBorrow.split('.')[0]
const V1_Z_TOKENS: Record<string, string> = {
  [`${V1_DEPLOYER}.wstx`]: `${V1_DEPLOYER}.zwstx-v2-0`,
  'SP4SZE494VC2YC5JYG7AYFQ44F5Q4PYV7DVMDPBG.ststx-token': `${V1_DEPLOYER}.zststx-v2-0`,
  'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token': `${V1_DEPLOYER}.zsbtc-v2-0`,
  'SP3Y2ZSH8P7D50B0VBTSX11S7XSG24M1VB9YFQA4K.token-aeusdc': `${V1_DEPLOYER}.zaeusdc-v2-0`,
  'SP2C2YFP12AJZB4MABJBAJ55XECVS7E4PMMZ89YZR.arkadiko-token': `${V1_DEPLOYER}.zdiko-v2-0`,
  'SPN5AKG35QZSK2M8GAMR4AFX45659RJHDW353HSG.usdh-token-v1': `${V1_DEPLOYER}.zusdh-v2-0`,
  'SP2XD7417HGPRTREMKF748VNEQPDRR0RMANB7X1NK.token-susdt': `${V1_DEPLOYER}.zsusdt-v2-0`,
  'SP2C2YFP12AJZB4MABJBAJ55XECVS7E4PMMZ89YZR.usda-token': `${V1_DEPLOYER}.zusda-v2-0`,
  'SP102V8P0F7JX67ARQ77WEA3D3CFB5XW39REDT0AM.token-alex': `${V1_DEPLOYER}.zalex-v2-0`,
  'SP4SZE494VC2YC5JYG7AYFQ44F5Q4PYV7DVMDPBG.ststxbtc-token-v2': `${V1_DEPLOYER}.zststxbtc-v2_v2-0`,
}

/** Oracle addresses for Zest V1 (keyed by asset principal) */
const V1_ORACLES: Record<string, string> = {
  [`${V1_DEPLOYER}.wstx`]: `${V1_DEPLOYER}.stx-btc-oracle-v1-4`,
  'SP4SZE494VC2YC5JYG7AYFQ44F5Q4PYV7DVMDPBG.ststx-token': `${V1_DEPLOYER}.stx-btc-oracle-v1-4`,
  'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token': `${V1_DEPLOYER}.stx-btc-oracle-v1-4`,
  'SP3Y2ZSH8P7D50B0VBTSX11S7XSG24M1VB9YFQA4K.token-aeusdc': `${V1_DEPLOYER}.aeusdc-oracle-v1-0`,
  'SP2C2YFP12AJZB4MABJBAJ55XECVS7E4PMMZ89YZR.arkadiko-token': `${V1_DEPLOYER}.diko-oracle-v1-1`,
  'SPN5AKG35QZSK2M8GAMR4AFX45659RJHDW353HSG.usdh-token-v1': `${V1_DEPLOYER}.usdh-oracle-v1-0`,
  'SP2XD7417HGPRTREMKF748VNEQPDRR0RMANB7X1NK.token-susdt': `${V1_DEPLOYER}.susdt-oracle-v1-0`,
  'SP2C2YFP12AJZB4MABJBAJ55XECVS7E4PMMZ89YZR.usda-token': `${V1_DEPLOYER}.usda-oracle-v1-1`,
  'SP102V8P0F7JX67ARQ77WEA3D3CFB5XW39REDT0AM.token-alex': `${V1_DEPLOYER}.alex-oracle-v1-1`,
  'SP4SZE494VC2YC5JYG7AYFQ44F5Q4PYV7DVMDPBG.ststxbtc-token-v2': `${V1_DEPLOYER}.stx-btc-oracle-v1-4`,
}

/**
 * On-chain asset order from pool-reserve-data.get-assets-read.
 * The contract's validate-assets checks by INDEX, so the order MUST match exactly.
 */
const V1_ASSET_ORDER: string[] = [
  'SP4SZE494VC2YC5JYG7AYFQ44F5Q4PYV7DVMDPBG.ststx-token',
  'SP3Y2ZSH8P7D50B0VBTSX11S7XSG24M1VB9YFQA4K.token-aeusdc',
  `${V1_DEPLOYER}.wstx`,
  'SP2C2YFP12AJZB4MABJBAJ55XECVS7E4PMMZ89YZR.arkadiko-token',
  'SPN5AKG35QZSK2M8GAMR4AFX45659RJHDW353HSG.usdh-token-v1',
  'SP2XD7417HGPRTREMKF748VNEQPDRR0RMANB7X1NK.token-susdt',
  'SP2C2YFP12AJZB4MABJBAJ55XECVS7E4PMMZ89YZR.usda-token',
  'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token',
  'SP102V8P0F7JX67ARQ77WEA3D3CFB5XW39REDT0AM.token-alex',
  'SP4SZE494VC2YC5JYG7AYFQ44F5Q4PYV7DVMDPBG.ststxbtc-token-v2',
]

function normalizeMarkets(data: AllLendingData): UnifiedMarket[] {
  const markets: UnifiedMarket[] = []

  if (data.v1) {
    for (const m of Object.values(data.v1.data)) {
      const underlying = m.poolId || m.underlying
      markets.push({
        marketUid: m.marketUid,
        protocol: 'Zest V1',
        lender: 'zest-v1',
        symbol: m.symbol,
        totalDeposits: m.totalDeposits,
        totalBorrows: m.totalDebt,
        totalDepositsUSD: m.totalDepositsUSD || null,
        totalBorrowsUSD: m.totalDebtUSD || null,
        supplyRate: m.depositRate,
        borrowRate: m.variableBorrowRate,
        baseLtv: m.baseLtv,
        liquidationThreshold: m.liquidationThreshold,
        decimals: m.decimals,
        underlying: underlying || undefined,
        v1Asset: underlying
          ? { underlying, lpToken: V1_Z_TOKENS[underlying] || '', oracle: V1_ORACLES[underlying] || m.oracle || '' }
          : undefined,
      })
    }
  }

  if (data.v2) {
    for (const m of Object.values(data.v2.data)) {
      const vaultPrincipal = V2_VAULT_MAP[m.vault] ?? ''
      markets.push({
        marketUid: m.marketUid,
        protocol: 'Zest V2',
        lender: 'zest-v2',
        symbol: m.symbol,
        totalDeposits: m.totalDeposits,
        totalBorrows: m.totalBorrows,
        totalDepositsUSD: m.totalDepositsUSD || null,
        totalBorrowsUSD: m.totalBorrowsUSD || null,
        supplyRate: m.supplyRate,
        borrowRate: m.borrowRate,
        baseLtv: m.baseLtv,
        liquidationThreshold: m.liquidationThreshold,
        decimals: m.decimals,
        underlying: vaultPrincipal ? ZEST_V2_VAULT_TO_UNDERLYING[vaultPrincipal] : undefined,
        v2Vault: vaultPrincipal || undefined,
      })
    }
  }

  if (data.granite) {
    for (const m of Object.values(data.granite.data)) {
      const parentId = m.parentMarketId ?? m.marketId
      const isUsdcx = parentId.startsWith('usdcx')
      const graniteLabel = isUsdcx ? 'Granite USDCx' : 'Granite aeUSDC'
      const lenderKey: LenderKey = isUsdcx ? 'granite-usdcx' : 'granite-aeusdc'
      markets.push({
        marketUid: m.marketUid,
        protocol: graniteLabel,
        lender: lenderKey,
        symbol: m.symbol,
        totalDeposits: m.totalAssets,
        totalBorrows: m.openInterest,
        totalDepositsUSD: m.totalAssetsUSD || null,
        totalBorrowsUSD: m.openInterestUSD || null,
        supplyRate: m.supplyRate,
        borrowRate: m.borrowRate,
        baseLtv: m.baseLtv,
        liquidationThreshold: m.liquidationThreshold,
        decimals: m.isCollateral ? (m.asset?.decimals ?? 8) : 6,
        underlying: m.isCollateral ? m.asset?.address : undefined,
        graniteMarketId: (m.parentMarketId ?? m.marketId) as 'aeusdc' | 'usdcx',
        isCollateral: m.isCollateral || undefined,
        collateralToken: m.isCollateral ? m.asset?.address : undefined,
      })
    }
  }

  return markets
}

/**
 * Build the AssetOracleLp[] for V1 borrow/withdraw.
 *
 * CRITICAL: The contract's validate-assets checks by INDEX position against
 * the on-chain asset registry (pool-reserve-data.get-assets-read). The list
 * must contain ALL 10 assets in the EXACT on-chain order, or the tx fails
 * with ERR_INVALID_ASSETS (u30024).
 */
function buildV1PositionAssets(): AssetOracleLp[] {
  return V1_ASSET_ORDER
    .map((asset) => ({
      asset,
      lpToken: V1_Z_TOKENS[asset] || '',
      oracle: V1_ORACLES[asset] || '',
    }))
    .filter((a) => a.lpToken && a.oracle)
}

function formatRate(rate: number): string {
  if (rate === 0) return '-'
  return `${(rate * 100).toFixed(2)}%`
}

function formatNumber(n: number, decimals = 2): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(decimals)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(decimals)}K`
  return n.toFixed(decimals)
}

function formatUSD(n: number | null): string | null {
  if (n === null || n === 0) return null
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000) return `$${(n / 1_000).toFixed(2)}K`
  return `$${n.toFixed(2)}`
}

/** Get the lender icon for a given protocol name */
function getLenderIcon(protocol: string): string | null {
  if (protocol.startsWith('Granite')) return graniteLogo
  if (protocol.startsWith('Zest')) return zestLogo
  return null
}

function MarketsTable({
  markets,
  selected,
  onSelect,
}: {
  markets: UnifiedMarket[]
  selected: string | null
  onSelect: (m: UnifiedMarket) => void
}) {
  if (!markets.length) return <EmptyState />

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-text-dim text-[11px] uppercase tracking-wider">
            <th className="text-left py-3 px-4 font-semibold">Market</th>
            <th className="text-left py-3 px-4 font-semibold">Protocol</th>
            <th className="text-right py-3 px-4 font-semibold">Deposits</th>
            <th className="text-right py-3 px-4 font-semibold">Borrows</th>
            <th className="text-right py-3 px-4 font-semibold">Supply APR</th>
            <th className="text-right py-3 px-4 font-semibold">Borrow APR</th>
            <th className="text-right py-3 px-4 font-semibold">LTV</th>
          </tr>
        </thead>
        <tbody>
          {markets.map((m, i) => {
            const icon = getLenderIcon(m.protocol)
            return (
              <tr
                key={m.marketUid}
                onClick={() => onSelect(m)}
                className={`cursor-pointer table-row-hover transition-all duration-150 ${
                  selected === m.marketUid
                    ? 'bg-primary/8 border-l-2 border-l-primary'
                    : i % 2 === 0 ? 'bg-transparent' : 'bg-surface-alt/30'
                }`}
              >
                <td className="py-3.5 px-4">
                  <div className="flex items-center gap-2">
                    <img
                      src={getTokenIcon(m.symbol)}
                      alt={m.symbol}
                      className="w-5 h-5 rounded-full bg-surface-alt ring-1 ring-border-subtle"
                      onError={(e) => {
                        ;(e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${m.symbol}&background=2e2e4a&color=eaeaf4&size=36&bold=true`
                      }}
                    />
                    <span className="font-semibold text-text">{m.symbol}</span>
                  </div>
                </td>
                <td className="py-3.5 px-4">
                  <div className="flex items-center gap-2">
                    {icon && (
                      <img src={icon} alt={m.protocol} className="w-4 h-4 rounded-full" />
                    )}
                    <span className="text-text-muted text-xs">{m.protocol}</span>
                  </div>
                </td>
                <td className="py-3.5 px-4 text-right font-mono text-text-muted">
                  {formatNumber(m.totalDeposits)}
                  {formatUSD(m.totalDepositsUSD) && (
                    <div className="text-[10px] text-text-dim">{formatUSD(m.totalDepositsUSD)}</div>
                  )}
                </td>
                <td className="py-3.5 px-4 text-right font-mono text-text-muted">
                  {formatNumber(m.totalBorrows)}
                  {formatUSD(m.totalBorrowsUSD) && (
                    <div className="text-[10px] text-text-dim">{formatUSD(m.totalBorrowsUSD)}</div>
                  )}
                </td>
                <td className="py-3.5 px-4 text-right">
                  <span className="text-positive font-mono">{formatRate(m.supplyRate)}</span>
                </td>
                <td className="py-3.5 px-4 text-right">
                  <span className="text-negative font-mono">{formatRate(m.borrowRate)}</span>
                </td>
                <td className="py-3.5 px-4 text-right font-mono text-text-muted">{formatRate(m.baseLtv)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-text-dim">
      <svg className="w-10 h-10 mb-3 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
      </svg>
      <span className="text-sm">No market data available</span>
    </div>
  )
}

function LoadingState() {
  return (
    <div className="flex items-center justify-center py-16 gap-3 text-text-muted">
      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
      </svg>
      <span className="text-sm">Loading markets...</span>
    </div>
  )
}

/** Lender filter buttons with icons */
function LenderFilter({
  active,
  onChange,
}: {
  active: number
  onChange: (i: number) => void
}) {
  return (
    <div className="flex gap-1.5 flex-wrap">
      {LENDERS.map((lender, i) => {
        const icon = i === 0 ? null : getLenderIcon(lender)
        return (
          <button
            key={lender}
            onClick={() => onChange(i)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg font-medium transition-all duration-200 ${
              i === active
                ? 'bg-primary text-white shadow-sm shadow-primary/20'
                : 'bg-surface-alt text-text-muted hover:text-text hover:bg-surface-hover border border-border-subtle'
            }`}
          >
            {icon && <img src={icon} alt={lender} className="w-3.5 h-3.5 rounded-full" />}
            {lender}
          </button>
        )
      })}
    </div>
  )
}

export function LendingTab() {
  const [lenderTab, setLenderTab] = useState(0)
  const [selectedMarket, setSelectedMarket] = useState<UnifiedMarket | null>(null)
  const { data, loading, error } = useLendingData()
  const { stxAddress } = useWallet()
  const { data: userData, loading: userLoading } = useUserData(stxAddress, data)

  if (error && !data.v1 && !data.v2 && !data.granite) {
    return (
      <div className="glass-card rounded-xl p-8 text-center">
        <p className="text-text-muted text-sm">{error}</p>
      </div>
    )
  }

  const allMarkets = normalizeMarkets(data)
  const filteredMarkets = lenderTab === 0
    ? allMarkets
    : allMarkets.filter((m) => m.protocol === LENDERS[lenderTab])

  const v1PositionAssets = buildV1PositionAssets()
  const hasAnyData = data.v1 || data.v2 || data.granite

  return (
    <div className="space-y-4">
      {/* User positions (shown above market tables when wallet connected) */}
      {stxAddress && (
        <UserPositions
          data={userData}
          loading={userLoading}
          lendingData={data}
          allMarkets={allMarkets}
          selectedMarketUid={selectedMarket?.marketUid ?? null}
          onSelectMarket={setSelectedMarket}
          v1PositionAssets={v1PositionAssets}
        />
      )}

      <LenderFilter active={lenderTab} onChange={setLenderTab} />

      <div className={`flex gap-4 ${selectedMarket ? '' : ''}`}>
        {/* Markets table */}
        <div className={`glass-card rounded-xl overflow-hidden ${selectedMarket ? 'flex-1 min-w-0' : 'w-full'}`}>
          {hasAnyData ? (
            <MarketsTable
              markets={filteredMarkets}
              selected={selectedMarket?.marketUid ?? null}
              onSelect={setSelectedMarket}
            />
          ) : loading ? (
            <LoadingState />
          ) : (
            <EmptyState />
          )}
        </div>

        {/* Action panel */}
        {selectedMarket && (
          <div className="w-80 shrink-0">
            <ActionPanel
              key={selectedMarket.marketUid}
              market={selectedMarket}
              userData={userData}
              v1PositionAssets={v1PositionAssets}
              onClose={() => setSelectedMarket(null)}
            />
          </div>
        )}
      </div>
    </div>
  )
}
