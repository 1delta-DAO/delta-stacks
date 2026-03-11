import { useState } from 'react'
import { Tabs } from './Tabs'
import { ActionPanel } from './ActionPanel'
import { UserPositions } from './UserPositions'
import { useLendingData } from '../hooks/useLendingData'
import { useUserData } from '../hooks/useUserData'
import { useWallet } from '../context/WalletContext'
import type { AllLendingData, AllUserData } from '@delta-stacks/data-provision'
import {
  ZEST_V1_CONTRACTS,
  ZEST_V2_CONTRACTS,
  ZEST_V2_VAULT_TO_UNDERLYING,
} from '@delta-stacks/calldata-sdk-stacks'
import type { AssetOracleLp } from '@delta-stacks/calldata-sdk-stacks'

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
        underlying: m.isCollateral ? m.asset?.address : m.underlying,
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
function buildV1PositionAssets(
  _allMarkets: UnifiedMarket[],
  _userData: AllUserData,
): AssetOracleLp[] {
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
          <tr className="text-text-muted text-xs border-b border-border">
            <th className="text-left py-3 px-4">Market</th>
            <th className="text-left py-3 px-4">Protocol</th>
            <th className="text-right py-3 px-4">Deposits</th>
            <th className="text-right py-3 px-4">Borrows</th>
            <th className="text-right py-3 px-4">Supply APR</th>
            <th className="text-right py-3 px-4">Borrow APR</th>
            <th className="text-right py-3 px-4">LTV</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {markets.map((m) => (
            <tr
              key={m.marketUid}
              onClick={() => onSelect(m)}
              className={`cursor-pointer transition-colors ${
                selected === m.marketUid
                  ? 'bg-surface-alt border-l-2 border-l-primary'
                  : 'hover:bg-surface-alt'
              }`}
            >
              <td className="py-3 px-4 font-medium">{m.symbol}</td>
              <td className="py-3 px-4 text-text-muted text-xs">{m.protocol}</td>
              <td className="py-3 px-4 text-right font-mono">
                {formatNumber(m.totalDeposits)}
                {formatUSD(m.totalDepositsUSD) && (
                  <div className="text-xs text-text-muted">{formatUSD(m.totalDepositsUSD)}</div>
                )}
              </td>
              <td className="py-3 px-4 text-right font-mono">
                {formatNumber(m.totalBorrows)}
                {formatUSD(m.totalBorrowsUSD) && (
                  <div className="text-xs text-text-muted">{formatUSD(m.totalBorrowsUSD)}</div>
                )}
              </td>
              <td className="py-3 px-4 text-right text-positive">{formatRate(m.supplyRate)}</td>
              <td className="py-3 px-4 text-right text-negative">{formatRate(m.borrowRate)}</td>
              <td className="py-3 px-4 text-right">{formatRate(m.baseLtv)}</td>
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
  const [selectedMarket, setSelectedMarket] = useState<UnifiedMarket | null>(null)
  const { data, loading, error } = useLendingData()
  const { stxAddress } = useWallet()
  const { data: userData, loading: userLoading } = useUserData(stxAddress, data)

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

  const v1PositionAssets = buildV1PositionAssets(allMarkets, userData)
  const hasAnyData = data.v1 || data.v2 || data.granite

  return (
    <div className="space-y-4">
      {/* User positions (shown above market tables when wallet connected) */}
      {stxAddress && (
        <UserPositions data={userData} loading={userLoading} lendingData={data} />
      )}

      <Tabs tabs={LENDERS} active={lenderTab} onChange={setLenderTab} size="sm" />

      <div className={`flex gap-4 ${selectedMarket ? '' : ''}`}>
        {/* Markets table */}
        <div className={`bg-surface rounded-lg border border-border ${selectedMarket ? 'flex-1 min-w-0' : 'w-full'}`}>
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
