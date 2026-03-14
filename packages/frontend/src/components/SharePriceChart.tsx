import { useState, useMemo } from 'react'
import { useVaultHistory, type VaultSnapshotEntry } from '../hooks/useVaultHistory'

const RANGES = ['24h', '7d', '30d'] as const
type Range = (typeof RANGES)[number]

const W = 600
const H = 200
const PAD = { top: 20, right: 16, bottom: 28, left: 64 }

export function SharePriceChart({ historyEndpoint = 'vault/history' }: { historyEndpoint?: string }) {
  const [range, setRange] = useState<Range>('7d')
  const { data: history, isLoading } = useVaultHistory(range, historyEndpoint)

  const points = useMemo(() => history ?? [], [history])

  // Downsample to max ~300 points for rendering performance
  const sampled = useMemo(() => {
    if (points.length <= 300) return points
    const step = Math.ceil(points.length / 300)
    return points.filter((_, i) => i % step === 0 || i === points.length - 1)
  }, [points])

  const { minPrice, maxPrice, minTs, maxTs } = useMemo(() => {
    if (sampled.length === 0) return { minPrice: 1, maxPrice: 1, minTs: 0, maxTs: 1 }
    let min = Infinity, max = -Infinity
    for (const s of sampled) {
      if (s.sharePrice < min) min = s.sharePrice
      if (s.sharePrice > max) max = s.sharePrice
    }
    // Add 5% padding to y-axis
    const pad = (max - min) * 0.05 || 0.0001
    return {
      minPrice: min - pad,
      maxPrice: max + pad,
      minTs: sampled[0].timestamp,
      maxTs: sampled[sampled.length - 1].timestamp,
    }
  }, [sampled])

  const toX = (ts: number) =>
    PAD.left + ((ts - minTs) / (maxTs - minTs || 1)) * (W - PAD.left - PAD.right)

  const toY = (price: number) =>
    PAD.top + (1 - (price - minPrice) / (maxPrice - minPrice || 1)) * (H - PAD.top - PAD.bottom)

  const linePath = useMemo(() => {
    if (sampled.length < 2) return ''
    return sampled
      .map((s, i) => `${i === 0 ? 'M' : 'L'}${toX(s.timestamp).toFixed(1)},${toY(s.sharePrice).toFixed(1)}`)
      .join(' ')
  }, [sampled, minTs, maxTs, minPrice, maxPrice])

  const areaPath = useMemo(() => {
    if (!linePath) return ''
    const bottom = H - PAD.bottom
    const first = toX(sampled[0].timestamp).toFixed(1)
    const last = toX(sampled[sampled.length - 1].timestamp).toFixed(1)
    return `${linePath} L${last},${bottom} L${first},${bottom} Z`
  }, [linePath, sampled])

  // Y-axis labels (4 ticks)
  const yTicks = useMemo(() => {
    const ticks: number[] = []
    for (let i = 0; i < 4; i++) {
      ticks.push(minPrice + ((maxPrice - minPrice) * i) / 3)
    }
    return ticks
  }, [minPrice, maxPrice])

  // X-axis labels (5 ticks)
  const xTicks = useMemo(() => {
    if (sampled.length < 2) return []
    const ticks: { ts: number; label: string }[] = []
    for (let i = 0; i < 5; i++) {
      const ts = minTs + ((maxTs - minTs) * i) / 4
      const d = new Date(ts * 1000)
      const label = range === '24h'
        ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        : d.toLocaleDateString([], { month: 'short', day: 'numeric' })
      ticks.push({ ts, label })
    }
    return ticks
  }, [sampled, minTs, maxTs, range])

  // Price change
  const priceChange = useMemo(() => {
    if (points.length < 2) return null
    const first = points[0].sharePrice
    const last = points[points.length - 1].sharePrice
    const diff = last - first
    const pct = (diff / first) * 100
    return { diff, pct, positive: diff >= 0 }
  }, [points])

  const empty = !isLoading && sampled.length === 0

  return (
    <div className="glass-card rounded-xl p-5 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-text-dim">
            Share Price History
          </h3>
          {priceChange && (
            <span className={`text-xs font-mono ${priceChange.positive ? 'text-positive' : 'text-negative'}`}>
              {priceChange.positive ? '+' : ''}{priceChange.pct.toFixed(4)}%
            </span>
          )}
        </div>
        <div className="flex gap-1">
          {RANGES.map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`px-2.5 py-1 text-[11px] rounded-lg font-mono transition-all duration-200 ${
                range === r
                  ? 'bg-primary/20 text-primary border border-primary/30'
                  : 'bg-surface-alt text-text-dim hover:text-text-muted border border-transparent hover:border-border-subtle'
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center h-[200px] text-xs text-text-dim">
          Loading history...
        </div>
      )}

      {empty && (
        <div className="flex items-center justify-center h-[200px] text-xs text-text-dim">
          No data yet — snapshots are recorded every 2 minutes.
        </div>
      )}

      {!isLoading && sampled.length >= 2 && (
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="none">
          <defs>
            <linearGradient id="area-gradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-primary, #6366f1)" stopOpacity="0.2" />
              <stop offset="100%" stopColor="var(--color-primary, #6366f1)" stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* Grid lines */}
          {yTicks.map((tick, i) => (
            <line
              key={i}
              x1={PAD.left}
              y1={toY(tick)}
              x2={W - PAD.right}
              y2={toY(tick)}
              stroke="currentColor"
              className="text-border-subtle"
              strokeWidth="0.5"
              strokeDasharray="4 3"
            />
          ))}

          {/* Area fill */}
          <path d={areaPath} fill="url(#area-gradient)" />

          {/* Price line */}
          <path
            d={linePath}
            fill="none"
            stroke="var(--color-primary, #6366f1)"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />

          {/* Y-axis labels */}
          {yTicks.map((tick, i) => (
            <text
              key={i}
              x={PAD.left - 6}
              y={toY(tick) + 3}
              textAnchor="end"
              className="text-text-dim"
              fill="currentColor"
              fontSize="9"
              fontFamily="monospace"
            >
              {tick.toFixed(6)}
            </text>
          ))}

          {/* X-axis labels */}
          {xTicks.map((tick, i) => (
            <text
              key={i}
              x={toX(tick.ts)}
              y={H - 6}
              textAnchor="middle"
              className="text-text-dim"
              fill="currentColor"
              fontSize="9"
              fontFamily="monospace"
            >
              {tick.label}
            </text>
          ))}
        </svg>
      )}

      {/* Current price + stats */}
      {!isLoading && points.length > 0 && (
        <div className="flex items-center justify-between text-xs text-text-dim">
          <span>
            Latest: <span className="font-mono text-text-muted">{points[points.length - 1].sharePrice.toFixed(6)}</span>
          </span>
          <span>
            {points.length} snapshots
          </span>
        </div>
      )}
    </div>
  )
}
