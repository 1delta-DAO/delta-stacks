import { useState } from 'react'
import { Tabs } from './Tabs'
import { useLendingData } from '../hooks/useLendingData'
import type { AllLendingData } from '@delta-stacks/data-provision'

const LENDERS = ['All', 'Zest V1', 'Zest V2', 'Granite aeUSDC', 'Granite USDCx']

interface UnifiedMarket {
  marketUid: string
  protocol: string
  symbol: string
  totalDeposits: number
  totalBorrows: number
  supplyRate: number
  borrowRate: number
  baseLtv: number
  liquidationThreshold: number
}

function normalizeMarkets(data: AllLendingData): UnifiedMarket[] {
  const markets: UnifiedMarket[] = []

  if (data.v1) {
    for (const m of Object.values(data.v1.data)) {
      markets.push({
        marketUid: m.marketUid,
        protocol: 'Zest V1',
        symbol: m.symbol,
        totalDeposits: m.totalDeposits,
        totalBorrows: m.totalDebt,
        supplyRate: m.depositRate,
        borrowRate: m.variableBorrowRate,
        baseLtv: m.baseLtv,
        liquidationThreshold: m.liquidationThreshold,
      })
    }
  }

  if (data.v2) {
    for (const m of Object.values(data.v2.data)) {
      markets.push({
        marketUid: m.marketUid,
        protocol: 'Zest V2',
        symbol: m.symbol,
        totalDeposits: m.totalDeposits,
        totalBorrows: m.totalBorrows,
        supplyRate: m.supplyRate,
        borrowRate: m.borrowRate,
        baseLtv: m.baseLtv,
        liquidationThreshold: m.liquidationThreshold,
      })
    }
  }

  if (data.granite) {
    for (const m of Object.values(data.granite.data)) {
      const parentId = m.parentMarketId ?? m.marketId
      const graniteLabel = parentId.startsWith('usdcx') ? 'Granite USDCx' : 'Granite aeUSDC'
      markets.push({
        marketUid: m.marketUid,
        protocol: graniteLabel,
        symbol: m.symbol,
        totalDeposits: m.totalAssets,
        totalBorrows: m.openInterest,
        supplyRate: m.supplyRate,
        borrowRate: m.borrowRate,
        baseLtv: m.baseLtv,
        liquidationThreshold: m.liquidationThreshold,
      })
    }
  }

  return markets
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

function MarketsTable({ markets }: { markets: UnifiedMarket[] }) {
  if (!markets.length) return <EmptyState />

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-text-muted text-xs border-b border-border">
            <th className="text-left py-3 px-4">Market</th>
            <th className="text-left py-3 px-4">Protocol</th>
            <th className="text-right py-3 px-4">Deposits</th>
            <th className="text-right py-3 px-4">Borrows</th>
            <th className="text-right py-3 px-4">Supply APR</th>
            <th className="text-right py-3 px-4">Borrow APR</th>
            <th className="text-right py-3 px-4">LTV</th>
            <th className="text-right py-3 px-4">Liq. Threshold</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {markets.map((m) => (
            <tr key={m.marketUid} className="hover:bg-surface-alt transition-colors">
              <td className="py-3 px-4 font-medium">{m.symbol}</td>
              <td className="py-3 px-4 text-text-muted text-xs">{m.protocol}</td>
              <td className="py-3 px-4 text-right font-mono">{formatNumber(m.totalDeposits)}</td>
              <td className="py-3 px-4 text-right font-mono">{formatNumber(m.totalBorrows)}</td>
              <td className="py-3 px-4 text-right text-positive">{formatRate(m.supplyRate)}</td>
              <td className="py-3 px-4 text-right text-negative">{formatRate(m.borrowRate)}</td>
              <td className="py-3 px-4 text-right">{formatRate(m.baseLtv)}</td>
              <td className="py-3 px-4 text-right">{formatRate(m.liquidationThreshold)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="text-center py-12 text-text-muted text-sm">
      No market data available
    </div>
  )
}

function LoadingState() {
  return (
    <div className="text-center py-12 text-text-muted text-sm">Loading...</div>
  )
}

export function LendingTab() {
  const [lenderTab, setLenderTab] = useState(0)
  const { data, loading, error } = useLendingData()

  if (error && !data.v1 && !data.v2 && !data.granite) {
    return (
      <div className="bg-surface border border-border rounded-lg p-6 text-center">
        <p className="text-text-muted text-sm">{error}</p>
      </div>
    )
  }

  const allMarkets = normalizeMarkets(data)
  const filteredMarkets = lenderTab === 0
    ? allMarkets
    : allMarkets.filter((m) => m.protocol === LENDERS[lenderTab])

  const hasAnyData = data.v1 || data.v2 || data.granite

  return (
    <div className="space-y-4">
      <Tabs tabs={LENDERS} active={lenderTab} onChange={setLenderTab} size="sm" />

      <div className="bg-surface rounded-lg border border-border">
        {hasAnyData
          ? <MarketsTable markets={filteredMarkets} />
          : loading ? <LoadingState /> : <EmptyState />}
      </div>
    </div>
  )
}
