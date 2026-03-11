import type { AllLendingData, AllUserData, UserData, LendingPosition } from '@delta-stacks/data-provision'

const LENDER_LABELS: Record<string, string> = {
  'zest-v1': 'Zest V1',
  'zest-v2': 'Zest V2',
  'granite-aeusdc': 'Granite aeUSDC',
  'granite-usdcx': 'Granite USDCx',
}

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

/** Sum deposits/debt directly from positions (more reliable than balanceData which may be stale) */
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

function formatRate(rate: number): string {
  if (rate === 0) return '-'
  return `${(rate * 100).toFixed(2)}%`
}

function SummaryCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-text-muted text-xs">{label}</span>
      <span className="text-lg font-semibold font-mono">{value}</span>
      {sub && <span className="text-xs text-text-muted">{sub}</span>}
    </div>
  )
}

function LenderSection({
  lender,
  userData,
  symbolMap,
}: {
  lender: string
  userData: UserData
  symbolMap: Record<string, string>
}) {
  const pool = userData.data[0]
  if (!pool) return null

  // Only show positions with actual deposits or debt
  const positions = pool.positions.filter(p => p.depositsUSD > 0 || p.debtUSD > 0)
  if (positions.length === 0) return null

  const label = LENDER_LABELS[lender] ?? lender

  return (
    <div>
      <div className="flex items-center justify-between px-4 py-2 border-b border-border">
        <span className="text-xs font-medium text-text-muted">{label}</span>
        {pool.health !== null && (
          <span className={`text-xs font-mono ${pool.health > 1.5 ? 'text-positive' : pool.health > 1.1 ? 'text-yellow-400' : 'text-negative'}`}>
            HF {pool.health.toFixed(2)}
          </span>
        )}
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-text-muted text-xs border-b border-border">
            <th className="text-left py-2 px-4">Asset</th>
            <th className="text-right py-2 px-4">Deposits</th>
            <th className="text-right py-2 px-4">Debt</th>
            <th className="text-right py-2 px-4">Collateral</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {positions.map((pos) => (
            <PositionRow
              key={(pos as any).marketUid ?? pos.underlying}
              pos={pos}
              symbolMap={symbolMap}
            />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function PositionRow({
  pos,
  symbolMap,
}: {
  pos: LendingPosition
  symbolMap: Record<string, string>
}) {
  const uid = (pos as any).marketUid as string | undefined
  const symbol = (uid && symbolMap[uid])
    ?? pos.underlyingInfo?.symbol
    ?? pos.underlying?.split('.').pop()
    ?? uid?.split(':').pop()
    ?? '?'

  return (
    <tr className="hover:bg-surface-alt transition-colors">
      <td className="py-2 px-4 font-medium">{symbol}</td>
      <td className="py-2 px-4 text-right font-mono">
        {pos.depositsUSD > 0 ? (
          <>
            {formatUSD(pos.depositsUSD)}
            <div className="text-xs text-text-muted">{Number(pos.deposits).toFixed(6)}</div>
          </>
        ) : (
          <span className="text-text-muted">-</span>
        )}
      </td>
      <td className="py-2 px-4 text-right font-mono">
        {pos.debtUSD > 0 ? (
          <>
            <span className="text-negative">{formatUSD(pos.debtUSD)}</span>
            <div className="text-xs text-text-muted">{Number(pos.debt).toFixed(6)}</div>
          </>
        ) : (
          <span className="text-text-muted">-</span>
        )}
      </td>
      <td className="py-2 px-4 text-right">
        {pos.collateralEnabled ? (
          <span className="text-positive text-xs">Yes</span>
        ) : (
          <span className="text-text-muted text-xs">No</span>
        )}
      </td>
    </tr>
  )
}

export function UserPositions({
  data,
  loading,
  lendingData,
}: {
  data: AllUserData
  loading: boolean
  lendingData: AllLendingData
}) {
  const symbolMap = buildSymbolMap(lendingData)

  // Collect lenders that have real positions (deposits or debt > 0)
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
      <div className="bg-surface border border-border rounded-lg p-4">
        <span className="text-text-muted text-sm">Loading positions...</span>
      </div>
    )
  }

  if (lenders.length === 0) return null

  // Aggregate totals directly from positions (not balanceData which may be stale)
  let totalDeposits = 0
  let totalDebt = 0
  for (const { userData } of lenders) {
    const { deposits, debt } = sumPositions(userData.data[0].positions)
    totalDeposits += deposits
    totalDebt += debt
  }
  const netValue = totalDeposits - totalDebt

  return (
    <div className="bg-surface border border-border rounded-lg overflow-hidden">
      {/* Summary row */}
      <div className="flex items-center gap-8 px-4 py-3 border-b border-border">
        <SummaryCard label="Net Value" value={formatUSD(netValue)} />
        <SummaryCard label="Deposits" value={formatUSD(totalDeposits)} />
        <SummaryCard label="Debt" value={formatUSD(totalDebt)} />
        {loading && <span className="text-text-muted text-xs ml-auto">Refreshing...</span>}
      </div>

      {/* Per-lender position tables */}
      <div className="divide-y divide-border">
        {lenders.map(({ key, userData }) => (
          <LenderSection key={key} lender={key} userData={userData} symbolMap={symbolMap} />
        ))}
      </div>
    </div>
  )
}
