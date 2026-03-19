import { useState, useMemo, useCallback, useEffect } from 'react'
import { Tabs } from './Tabs'
import { useWallet } from '../context/useWallet'
import { useTransact } from '../hooks/useTransact'
import { usePendingTx } from '../hooks/usePendingTx'
import { useBalances, type Balances } from '../hooks/useBalances'
import { useVaultStateV3 } from '../hooks/useVaultStateV3'
import { useVaultStateSTX } from '../hooks/useVaultStateSTX'
import { useVaultStateSBTC } from '../hooks/useVaultStateSBTC'
import {
  DeltaVaultV3,
  DeltaVaultSTX,
  DeltaVaultSBTC,
} from '@delta-stacks/calldata-sdk-stacks'

import { SharePriceChart } from './SharePriceChart'
import { getTokenIcon } from '../utils/tokenIcons'
import { type VaultDef, VAULT_USDCX } from '../config/vaults'

// ---------------------------------------------------------------------------
// Vault operations (dynamic based on vault markets)
// ---------------------------------------------------------------------------

const USER_OPS = ['Deposit', 'Withdraw', 'Redeem'] as const

function getAllocatorOps(v: VaultDef) {
  return [
    `Deploy ${v.market1Label}`, `Deploy ${v.market2Label}`,
    `Recall ${v.market1Label}`, `Recall ${v.market2Label}`,
    `Rebalance ${v.market1Label[0]}→${v.market2Label[0]}`,
    `Rebalance ${v.market2Label[0]}→${v.market1Label[0]}`,
    'Reallocate',
    'Disable V1 Collateral',
  ] as const
}

function getOwnerOps(v: VaultDef) {
  return [
    'Set Allocator', 'Set Owner',
    `Register ${v.market1Label}`, `Register ${v.market2Label}`,
    'Set Fee', 'Set Fee Recipient', 'Set Idle Buffer',
  ] as const
}

const PCT_BUTTONS = [25, 50, 75, 100] as const

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatAmount(n: number, decimals = 6): string {
  if (n === 0) return '0'
  if (n >= 1000) return n.toFixed(2)
  if (n >= 1) return n.toFixed(4)
  // For small amounts (e.g. sBTC), show up to the asset's full precision
  return n.toFixed(Math.max(6, decimals))
}

/** Format smallest-units to human-readable (default 6 decimals) */
function micro(n: bigint, decimals = 6): string {
  const num = Number(n) / (10 ** decimals)
  return formatAmount(num, decimals)
}

/** Format a percentage with 2 decimals */
function pct(n: number): string {
  return n.toFixed(2) + '%'
}

/** Format basis points as percentage */
function bpsPct(bps: bigint): string {
  return (Number(bps) / 100).toFixed(2) + '%'
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/** Normalized vault state shape used by all panels. */
interface NormalizedVault {
  totalAssets: bigint
  allocMarket1: bigint
  allocMarket2: bigint
  idleBookkeeping: bigint
  totalSupply: bigint
  sharePrice: number
  liveIdle: bigint
  liveMarket1: bigint
  liveMarket2: bigint
  liveTotal: bigint
  unrealizedYield: bigint
  market1Apr: number
  market2Apr: number
  blendedApr: number
  feeBps: bigint
  idleBufferBps: bigint
  virtualOffset: bigint
}

function useNormalizedVault(vaultDef: VaultDef): { vault: NormalizedVault; loading: boolean; refresh: () => void } {
  const usdcx = useVaultStateV3()
  const stx = useVaultStateSTX()
  const sbtc = useVaultStateSBTC()

  if (vaultDef.id === 'sbtc') {
    const b = sbtc.state
    return {
      vault: {
        totalAssets: b.totalAssets,
        allocMarket1: b.allocZestV1,
        allocMarket2: b.allocZestV2,
        idleBookkeeping: b.idleBookkeeping,
        totalSupply: b.totalSupply,
        sharePrice: b.sharePrice,
        liveIdle: b.liveIdle,
        liveMarket1: b.liveZestV1,
        liveMarket2: b.liveZestV2,
        liveTotal: b.liveTotal,
        unrealizedYield: b.unrealizedYield,
        market1Apr: b.zestV1Apr,
        market2Apr: b.zestV2Apr,
        blendedApr: b.blendedApr,
        feeBps: b.feeBps,
        idleBufferBps: b.idleBufferBps,
        virtualOffset: b.virtualOffset,
      },
      loading: sbtc.loading,
      refresh: sbtc.refresh,
    }
  }

  if (vaultDef.id === 'stx') {
    const s = stx.state
    return {
      vault: {
        totalAssets: s.totalAssets,
        allocMarket1: s.allocZestV1,
        allocMarket2: s.allocZestV2,
        idleBookkeeping: s.idleBookkeeping,
        totalSupply: s.totalSupply,
        sharePrice: s.sharePrice,
        liveIdle: s.liveIdle,
        liveMarket1: s.liveZestV1,
        liveMarket2: s.liveZestV2,
        liveTotal: s.liveTotal,
        unrealizedYield: s.unrealizedYield,
        market1Apr: s.zestV1Apr,
        market2Apr: s.zestV2Apr,
        blendedApr: s.blendedApr,
        feeBps: s.feeBps,
        idleBufferBps: s.idleBufferBps,
        virtualOffset: s.virtualOffset,
      },
      loading: stx.loading,
      refresh: stx.refresh,
    }
  }

  const u = usdcx.state
  return {
    vault: {
      totalAssets: u.totalAssets,
      allocMarket1: u.allocGranite,
      allocMarket2: u.allocZest,
      idleBookkeeping: u.idleBookkeeping,
      totalSupply: u.totalSupply,
      sharePrice: u.sharePrice,
      liveIdle: u.liveIdle,
      liveMarket1: u.liveGranite,
      liveMarket2: u.liveZest,
      liveTotal: u.liveTotal,
      unrealizedYield: u.unrealizedYield,
      market1Apr: u.graniteApr,
      market2Apr: u.zestApr,
      blendedApr: u.blendedApr,
      feeBps: u.feeBps,
      idleBufferBps: u.idleBufferBps,
      virtualOffset: u.virtualOffset,
    },
    loading: usdcx.loading,
    refresh: usdcx.refresh,
  }
}

export function VaultTab({ vault: vaultDef = VAULT_USDCX, onBack }: { vault?: VaultDef; onBack?: () => void }) {
  const [roleTab, setRoleTab] = useState(0)
  const { vault, loading, refresh: refreshVault } = useNormalizedVault(vaultDef)
  const { balances, refresh: refreshBalances } = useBalances()

  const onTxConfirm = useCallback(() => {
    refreshBalances()
    refreshVault()
  }, [refreshBalances, refreshVault])

  return (
    <div className="space-y-4">
      {/* Vault overview header */}
      <div className="glass-card rounded-xl p-5 sm:p-6">
        {/* Top row: back + name + APR badge */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            {onBack && (
              <button
                onClick={onBack}
                className="p-1.5 -ml-1 rounded-lg hover:bg-surface-alt text-text-dim hover:text-text transition-all"
                title="Back to vault list"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
            )}
            <img
              src={getTokenIcon(vaultDef.asset)}
              alt={vaultDef.asset}
              className="w-10 h-10 rounded-full bg-surface-alt ring-2 ring-border-subtle"
              onError={(e) => {
                ;(e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${vaultDef.asset}&background=2e2e4a&color=eaeaf4&size=40&bold=true`
              }}
            />
            <div>
              <h2 className="text-base font-semibold leading-tight">{vaultDef.name}</h2>
              <span className="text-xs text-text-dim">{vaultDef.symbol}</span>
            </div>
          </div>
          {!loading && vault.blendedApr > 0 && (
            <div className="px-3.5 py-2 rounded-xl bg-positive-dim border border-positive/20">
              <span className="text-sm font-mono text-positive font-bold tracking-tight">
                {pct(vault.blendedApr)} <span className="text-xs font-medium opacity-70">APR</span>
              </span>
            </div>
          )}
        </div>

        {/* TVL hero + secondary metrics */}
        <div className="flex flex-col sm:flex-row sm:items-end gap-4 sm:gap-6">
          <div className="flex-1">
            <div className="text-[10px] text-text-dim uppercase tracking-wider font-semibold mb-1">Total Value Locked</div>
            <div className="font-mono text-2xl sm:text-3xl font-bold tracking-tight leading-none">
              {loading ? '...' : micro(vault.totalAssets, vaultDef.decimals)}
              <span className="text-base sm:text-lg text-text-muted ml-1.5 font-semibold">{vaultDef.asset}</span>
            </div>
          </div>
          <div className="flex gap-4 sm:gap-6 pb-0.5">
            <div>
              <div className="text-[10px] text-text-dim uppercase tracking-wider font-semibold mb-0.5">Share Price</div>
              <div className="font-mono text-sm text-text-muted">{loading ? '...' : vault.sharePrice.toFixed(6)}</div>
            </div>
            <div>
              <div className="text-[10px] text-text-dim uppercase tracking-wider font-semibold mb-0.5">Total Shares</div>
              <div className="font-mono text-sm text-text-muted">{loading ? '...' : micro(vault.totalSupply, vaultDef.decimals)}</div>
            </div>
            <div>
              <div className="text-[10px] text-text-dim uppercase tracking-wider font-semibold mb-0.5">Fee</div>
              <div className="font-mono text-sm text-text-muted">{loading ? '...' : bpsPct(vault.feeBps)}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Desktop: two-column layout — operations left, allocation pie right */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Left column: operations */}
        <div className="lg:col-span-3 space-y-4">
          {/* Role tabs */}
          <Tabs
            tabs={['User', 'Allocator', 'Owner']}
            active={roleTab}
            onChange={setRoleTab}
          />

          {roleTab === 0 && <UserPanel balances={balances} vault={vault} vaultDef={vaultDef} onTxConfirm={onTxConfirm} />}
          {roleTab === 1 && <AllocatorPanel vault={vault} vaultDef={vaultDef} onTxConfirm={onTxConfirm} />}
          {roleTab === 2 && <OwnerPanel vaultDef={vaultDef} onTxConfirm={onTxConfirm} />}
        </div>

        {/* Right column: allocation pie + config — stretch to match left */}
        <div className="lg:col-span-2 flex flex-col gap-4">
          {!loading && <AllocationPie vault={vault} vaultDef={vaultDef} />}

          {!loading && (
            <div className="glass-card rounded-xl p-4 space-y-2 lg:flex-1">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-text-dim">Config</h3>
              <div className="space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-text-dim">Performance Fee</span>
                  <span className="font-mono text-text-muted">{bpsPct(vault.feeBps)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-dim">Idle Buffer</span>
                  <span className="font-mono text-text-muted">{bpsPct(vault.idleBufferBps)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-dim">Virtual Offset</span>
                  <span className="font-mono text-text-muted">{vault.virtualOffset.toLocaleString()}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Share price history chart */}
      <SharePriceChart historyEndpoint={vaultDef.historyEndpoint} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Metric card
// ---------------------------------------------------------------------------

function MetricCard({ label, value, positive }: { label: string; value: string; positive?: boolean }) {
  return (
    <div className="bg-surface-alt/60 rounded-xl p-3 border border-border-subtle">
      <div className="text-[10px] text-text-dim uppercase tracking-wider font-semibold mb-1">{label}</div>
      <div className={`font-mono text-sm ${positive ? 'text-positive' : 'text-text'}`}>{value}</div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Allocation breakdown bar + table
// ---------------------------------------------------------------------------

function AllocationPie({ vault, vaultDef }: { vault: NormalizedVault; vaultDef: VaultDef }) {
  const total = vault.totalAssets
  const idle = vault.idleBookkeeping
  const m1 = vault.allocMarket1
  const m2 = vault.allocMarket2

  const idlePct = total > 0n ? Number(idle * 10000n / total) / 100 : 100
  const m1Pct = total > 0n ? Number(m1 * 10000n / total) / 100 : 0
  const m2Pct = total > 0n ? Number(m2 * 10000n / total) / 100 : 0

  // SVG pie chart using conic gradient approximation with arcs
  const cx = 60, cy = 60, r = 50
  const slices = [
    { pct: m1Pct, color: '#6366f1', label: vaultDef.market1Label }, // accent-blue / indigo
    { pct: m2Pct, color: '#a855f7', label: vaultDef.market2Label }, // accent-purple
    { pct: idlePct, color: '#4b5563', label: 'Idle' },              // gray
  ].filter(s => s.pct > 0)

  let cumulativeAngle = -90 // start at top
  const arcs = slices.map(({ pct: slicePct, color, label }) => {
    const angle = (slicePct / 100) * 360
    const startAngle = cumulativeAngle
    const endAngle = cumulativeAngle + angle
    cumulativeAngle = endAngle

    const startRad = (startAngle * Math.PI) / 180
    const endRad = (endAngle * Math.PI) / 180
    const x1 = cx + r * Math.cos(startRad)
    const y1 = cy + r * Math.sin(startRad)
    const x2 = cx + r * Math.cos(endRad)
    const y2 = cy + r * Math.sin(endRad)
    const largeArc = angle > 180 ? 1 : 0

    // Full circle edge case
    if (slicePct >= 99.9) {
      return { d: `M ${cx},${cy - r} A ${r},${r} 0 1,1 ${cx - 0.01},${cy - r} Z`, color, label, pct: slicePct }
    }

    return {
      d: `M ${cx},${cy} L ${x1},${y1} A ${r},${r} 0 ${largeArc},1 ${x2},${y2} Z`,
      color,
      label,
      pct: slicePct,
    }
  })

  return (
    <div className="glass-card rounded-xl p-4 space-y-3">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-text-dim">Allocation</h3>

      <div className="flex items-center justify-center">
        <svg viewBox="0 0 120 120" className="w-36 h-36">
          {arcs.map((arc, i) => (
            <path key={i} d={arc.d} fill={arc.color} opacity={0.85}>
              <title>{arc.label}: {arc.pct.toFixed(1)}%</title>
            </path>
          ))}
          {/* Center hole for donut effect */}
          <circle cx={cx} cy={cy} r={25} className="fill-surface" />
          <text x={cx} y={cy - 2} textAnchor="middle" className="fill-text text-[8px] font-mono font-semibold">
            {micro(total, vaultDef.decimals)}
          </text>
          <text x={cx} y={cy + 8} textAnchor="middle" className="fill-text-dim text-[6px]">
            {vaultDef.asset}
          </text>
        </svg>
      </div>

      {/* Legend */}
      <div className="space-y-2 text-xs">
        <LegendRow
          icon={vaultDef.market1Logo}
          label={vaultDef.market1Label}
          amount={micro(m1, vaultDef.decimals)}
          pctVal={pct(m1Pct)}
          apr={vault.market1Apr > 0 ? pct(vault.market1Apr) : null}
          dotColor="#6366f1"
        />
        <LegendRow
          icon={vaultDef.market2Logo}
          label={vaultDef.market2Label}
          amount={micro(m2, vaultDef.decimals)}
          pctVal={pct(m2Pct)}
          apr={vault.market2Apr > 0 ? pct(vault.market2Apr) : null}
          dotColor="#a855f7"
        />
        <LegendRow
          label="Idle"
          amount={micro(idle, vaultDef.decimals)}
          pctVal={pct(idlePct)}
          apr={null}
          dotColor="#4b5563"
        />
      </div>
    </div>
  )
}

function LegendRow({ icon, label, amount, pctVal, apr, dotColor }: {
  icon?: string; label: string; amount: string; pctVal: string; apr: string | null; dotColor: string
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-1.5">
        <span className="w-2.5 h-2.5 rounded-full inline-block shrink-0" style={{ backgroundColor: dotColor }} />
        {icon && <img src={icon} alt={label} className="w-3.5 h-3.5 rounded-full" />}
        <span className="text-text-muted font-medium">{label}</span>
      </div>
      <div className="flex items-center gap-2 font-mono">
        <span className="text-text-dim">{pctVal}</span>
        <span className="text-text-muted">{amount}</span>
        {apr && <span className="text-positive text-[10px]">{apr}</span>}
      </div>
    </div>
  )
}

function AllocationBar({ vault, vaultDef }: { vault: NormalizedVault; vaultDef: VaultDef }) {
  const total = vault.totalAssets
  const idle = vault.idleBookkeeping
  const m1 = vault.allocMarket1
  const m2 = vault.allocMarket2

  const idlePct = total > 0n ? Number(idle * 10000n / total) / 100 : 100
  const m1Pct = total > 0n ? Number(m1 * 10000n / total) / 100 : 0
  const m2Pct = total > 0n ? Number(m2 * 10000n / total) / 100 : 0

  return (
    <div className="glass-card rounded-xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-text-dim">Allocation</h3>
        <span className="text-xs text-text-dim font-mono">{micro(total, vaultDef.decimals)} {vaultDef.asset} total</span>
      </div>

      {/* Stacked bar */}
      <div className="h-3 rounded-full overflow-hidden flex bg-surface-alt border border-border-subtle">
        {m1Pct > 0 && (
          <div
            className="h-full bg-gradient-to-r from-accent-blue to-accent-blue/80 transition-all duration-500"
            style={{ width: `${m1Pct}%` }}
            title={`${vaultDef.market1Label}: ${pct(m1Pct)}`}
          />
        )}
        {m2Pct > 0 && (
          <div
            className="h-full bg-gradient-to-r from-accent-purple to-accent-purple/80 transition-all duration-500"
            style={{ width: `${m2Pct}%` }}
            title={`${vaultDef.market2Label}: ${pct(m2Pct)}`}
          />
        )}
        {idlePct > 0 && (
          <div
            className="h-full bg-text-dim/30 transition-all duration-500"
            style={{ width: `${idlePct}%` }}
            title={`Idle: ${pct(idlePct)}`}
          />
        )}
      </div>

      {/* Legend + details */}
      <div className="grid grid-cols-3 gap-3 text-xs">
        <AllocationLegendItem
          icon={vaultDef.market1Logo}
          label={vaultDef.market1Label}
          amount={micro(m1, vaultDef.decimals)}
          percentage={pct(m1Pct)}
          apr={vault.market1Apr > 0 ? pct(vault.market1Apr) : null}
          color="accent-blue"
        />
        <AllocationLegendItem
          icon={vaultDef.market2Logo}
          label={vaultDef.market2Label}
          amount={micro(m2, vaultDef.decimals)}
          percentage={pct(m2Pct)}
          apr={vault.market2Apr > 0 ? pct(vault.market2Apr) : null}
          color="accent-purple"
        />
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-text-dim/30 inline-block" />
            <span className="text-text-dim font-medium">Idle</span>
          </div>
          <div className="font-mono pl-4 text-text-muted">{micro(vault.idleBookkeeping, vaultDef.decimals)}</div>
          <div className="text-text-dim pl-4">{pct(idlePct)}</div>
          <div className="text-text-dim pl-4 font-mono">0.00% APR</div>
        </div>
      </div>

      {/* Live vs bookkeeping -- hidden when live data not fetched */}
    </div>
  )
}

function AllocationLegendItem({
  icon,
  label,
  amount,
  percentage,
  apr,
  color,
}: {
  icon: string
  label: string
  amount: string
  percentage: string
  apr: string | null
  color: string
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <img src={icon} alt={label} className="w-4 h-4 rounded-full" />
        <span className={`text-${color} font-medium`}>{label}</span>
      </div>
      <div className="font-mono pl-5.5 text-text-muted">{amount}</div>
      <div className="text-text-dim pl-5.5">{percentage}</div>
      {apr && <div className="text-positive pl-5.5 font-mono">{apr} APR</div>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// User Panel — Deposit / Withdraw / Redeem
// ---------------------------------------------------------------------------

function UserPanel({ balances, vault, vaultDef, onTxConfirm }: { balances: Balances; vault: NormalizedVault; vaultDef: VaultDef; onTxConfirm: () => void }) {
  const [opTab, setOpTab] = useState(0)
  const [amount, setAmount] = useState('')
  const { connected, stxAddress, connect } = useWallet()
  const tx = useTransact()
  const pending = usePendingTx(onTxConfirm)

  const op = USER_OPS[opTab]

  const underlying = vaultDef.assetContract
  const vaultContract = vaultDef.vaultContract

  const decFactor = 10 ** vaultDef.decimals // 1e6 for STX/USDCx, 1e8 for sBTC

  // Wallet balance (human-readable)
  const walletBalance = useMemo(() => {
    // For STX vault, use native STX balance (balances.stx is a raw bigint)
    if (vaultDef.id === 'stx') {
      return Number(balances.stx) / 1e6
    }
    const key = Object.keys(balances.fungible).find(
      (k) => k.toLowerCase() === underlying.toLowerCase(),
    )
    if (key) return Number(balances.fungible[key].balance) / decFactor
    return 0
  }, [balances, underlying, vaultDef.id, decFactor])

  // Vault share balance
  const shareBalance = useMemo(() => {
    const key = Object.keys(balances.fungible).find(
      (k) => k.toLowerCase() === vaultContract.toLowerCase(),
    )
    if (key) return Number(balances.fungible[key].balance) / decFactor
    return 0
  }, [balances, vaultContract, decFactor])

  // Withdrawable assets = shares * share price (floored to asset decimals)
  const withdrawableBalance = useMemo(() => {
    return Math.floor(shareBalance * vault.sharePrice * decFactor) / decFactor
  }, [shareBalance, vault.sharePrice, decFactor])

  const maxAmount = useMemo((): number => {
    switch (op) {
      case 'Deposit':
        return walletBalance
      case 'Withdraw':
        return withdrawableBalance
      case 'Redeem':
        return shareBalance
      default:
        return 0
    }
  }, [op, walletBalance, shareBalance, withdrawableBalance])

  const setPercent = useCallback(
    (pct: number) => {
      if (maxAmount <= 0) return
      const raw = (maxAmount * pct) / 100
      // Floor to asset decimals to match on-chain smallest-unit precision
      const val = Math.floor(raw * decFactor) / decFactor
      setAmount(String(val))
      if (tx.status !== 'idle') tx.reset()
    },
    [maxAmount, tx, decFactor],
  )

  const handleSubmit = useCallback(async () => {
    if (!stxAddress || !amount) return
    const amtRaw = parseFloat(amount)
    if (isNaN(amtRaw) || amtRaw <= 0) return
    const amtSmallest = BigInt(Math.floor(amtRaw * decFactor))

    await tx.execute(async () => {
      if (vaultDef.id === 'sbtc') {
        switch (op) {
          case 'Deposit':
            return DeltaVaultSBTC.encodeDeposit(amtSmallest, stxAddress)
          case 'Withdraw':
            return DeltaVaultSBTC.encodeWithdraw(amtSmallest, stxAddress, stxAddress)
          case 'Redeem':
            return DeltaVaultSBTC.encodeRedeem(amtSmallest, stxAddress, stxAddress)
        }
      } else if (vaultDef.id === 'stx') {
        switch (op) {
          case 'Deposit':
            return DeltaVaultSTX.encodeDepositStx(amtSmallest, stxAddress)
          case 'Withdraw':
            return DeltaVaultSTX.encodeWithdrawStx(amtSmallest, stxAddress, stxAddress)
          case 'Redeem':
            return DeltaVaultSTX.encodeRedeemForStx(amtSmallest, stxAddress, stxAddress)
        }
      } else {
        switch (op) {
          case 'Deposit':
            return DeltaVaultV3.encodeDeposit(amtSmallest, stxAddress)
          case 'Withdraw':
            return DeltaVaultV3.encodeWithdraw(amtSmallest, stxAddress, stxAddress)
          case 'Redeem':
            return DeltaVaultV3.encodeRedeem(amtSmallest, stxAddress, stxAddress)
        }
      }
    })
  }, [stxAddress, amount, op, tx, vaultDef.id, decFactor])

  useEffect(() => {
    if (tx.status === 'submitted' && tx.txId) pending.addTx(tx.txId)
  }, [tx.status, tx.txId, pending])

  // Don't block if data hasn't loaded yet (maxAmount=0 due to failed RPC)
  const amtExceedsMax = maxAmount > 0 && parseFloat(amount) > maxAmount

  // Deposit preview: shares you'd receive
  const depositPreview = useMemo(() => {
    if (op !== 'Deposit' || !amount) return null
    const amtNum = parseFloat(amount)
    if (isNaN(amtNum) || amtNum <= 0 || vault.sharePrice <= 0) return null
    return formatAmount(amtNum / vault.sharePrice, vaultDef.decimals)
  }, [op, amount, vault.sharePrice, vaultDef.decimals])

  // Withdraw preview: shares that will be burned
  const withdrawPreview = useMemo(() => {
    if (op !== 'Withdraw' || !amount) return null
    const amtNum = parseFloat(amount)
    if (isNaN(amtNum) || amtNum <= 0 || vault.sharePrice <= 0) return null
    return formatAmount(amtNum / vault.sharePrice, vaultDef.decimals)
  }, [op, amount, vault.sharePrice, vaultDef.decimals])

  // Redeem preview: assets you'd receive
  const redeemPreview = useMemo(() => {
    if (op !== 'Redeem' || !amount) return null
    const amtNum = parseFloat(amount)
    if (isNaN(amtNum) || amtNum <= 0) return null
    return formatAmount(amtNum * vault.sharePrice, vaultDef.decimals)
  }, [op, amount, vault.sharePrice, vaultDef.decimals])

  return (
    <div className="glass-card rounded-xl p-5 space-y-5">
      <Tabs
        tabs={[...USER_OPS]}
        active={opTab}
        onChange={(i) => { setOpTab(i); setAmount(''); tx.reset() }}
        size="sm"
      />

      {/* Balances card — redesigned */}
      {connected && (
        <div className="rounded-xl overflow-hidden border border-border-subtle">
          {/* Wallet balance row */}
          <div className="flex items-center justify-between px-4 py-3 bg-surface-alt/40">
            <div className="flex items-center gap-2.5">
              <img
                src={getTokenIcon(vaultDef.asset)}
                alt={vaultDef.asset}
                className="w-7 h-7 rounded-full ring-1 ring-border-subtle"
              />
              <div>
                <div className="text-xs font-medium text-text">{vaultDef.asset}</div>
                <div className="text-[10px] text-text-dim">Wallet</div>
              </div>
            </div>
            <div className="text-right">
              <div className="font-mono text-sm font-semibold text-text">{formatAmount(walletBalance, vaultDef.decimals)}</div>
            </div>
          </div>

          {/* Vault position row */}
          <div className="flex items-center justify-between px-4 py-3 bg-surface-alt/20 border-t border-border-subtle">
            <div className="flex items-center gap-2.5">
              <span className="w-7 h-7 rounded-full bg-gradient-to-br from-accent-blue to-accent-purple flex items-center justify-center text-[10px] font-bold text-white ring-1 ring-border-subtle">
                {vaultDef.symbol.slice(0, 2)}
              </span>
              <div>
                <div className="text-xs font-medium text-text">{vaultDef.symbol}</div>
                <div className="text-[10px] text-text-dim">Vault shares</div>
              </div>
            </div>
            <div className="text-right">
              <div className="font-mono text-sm font-semibold text-text">{formatAmount(shareBalance, vaultDef.decimals)}</div>
              {shareBalance > 0 && (
                <div className="text-[10px] text-text-dim font-mono">
                  = {formatAmount(withdrawableBalance, vaultDef.decimals)} {vaultDef.asset}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Amount input */}
      <AmountInput
        amount={amount}
        setAmount={(v) => { setAmount(v); if (tx.status !== 'idle') tx.reset() }}
        label={op === 'Redeem' ? `Shares (${vaultDef.symbol})` : `Amount (${vaultDef.asset})`}
        maxAmount={maxAmount}
        exceedsMax={amtExceedsMax}
        pctButtons
        onPercent={setPercent}
      />

      {/* Preview */}
      {(depositPreview || withdrawPreview || redeemPreview) && (
        <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-surface-alt/40 border border-border-subtle text-xs">
          <span className="text-text-dim">
            {op === 'Deposit' && 'You receive'}
            {op === 'Withdraw' && 'Shares burned'}
            {op === 'Redeem' && 'You receive'}
          </span>
          <span className="font-mono text-text-muted font-medium">
            {op === 'Deposit' && `~${depositPreview} ${vaultDef.symbol}`}
            {op === 'Withdraw' && `~${withdrawPreview} ${vaultDef.symbol}`}
            {op === 'Redeem' && `~${redeemPreview} ${vaultDef.asset}`}
          </span>
        </div>
      )}

      <SubmitButton
        connected={connected}
        connect={connect}
        onClick={handleSubmit}
        disabled={!amount || amtExceedsMax || tx.status === 'building' || tx.status === 'signing'}
        tx={tx}
        label={op}
      />

      <TxStatus tx={tx} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Allocator Panel — Deploy / Recall / Rebalance / Reallocate
// ---------------------------------------------------------------------------

function AllocatorPanel({ vault, vaultDef, onTxConfirm }: { vault: NormalizedVault; vaultDef: VaultDef; onTxConfirm: () => void }) {
  const allocOps = useMemo(() => getAllocatorOps(vaultDef), [vaultDef])
  const [opTab, setOpTab] = useState(0)
  const [amount, setAmount] = useState('')
  const [reallocFields, setReallocFields] = useState({ fromM1: '', fromM2: '', toM1: '', toM2: '' })
  const { connected, stxAddress, connect } = useWallet()
  const tx = useTransact()
  const pending = usePendingTx(onTxConfirm)

  const op = allocOps[opTab]
  const isReallocate = op === 'Reallocate'
  const isNoAmountOp = op === 'Disable V1 Collateral'

  const decFactor = 10 ** vaultDef.decimals

  const handleSubmit = useCallback(async () => {
    if (!stxAddress) return

    if (isReallocate) {
      const f1 = BigInt(Math.floor(parseFloat(reallocFields.fromM1 || '0') * decFactor))
      const f2 = BigInt(Math.floor(parseFloat(reallocFields.fromM2 || '0') * decFactor))
      const t1 = BigInt(Math.floor(parseFloat(reallocFields.toM1 || '0') * decFactor))
      const t2 = BigInt(Math.floor(parseFloat(reallocFields.toM2 || '0') * decFactor))

      await tx.execute(async () =>
        vaultDef.id === 'sbtc'
          ? DeltaVaultSBTC.encodeReallocate(f1, f2, t1, t2)
          : vaultDef.id === 'stx'
            ? DeltaVaultSTX.encodeReallocate(f1, f2, t1, t2)
            : DeltaVaultV3.encodeReallocate(f1, f2, t1, t2),
      )
      return
    }

    // Disable V1 Collateral -- two-step:
    // 1. Fund adapter with STX for Pyth oracle fee (user signs STX transfer)
    // 2. Call disable-collateral with fresh Pyth data (user signs contract call)
    if (op === 'Disable V1 Collateral') {
      const adapterPrincipal = vaultDef.id === 'stx'
        ? 'SP2DRPT3AA170EK5DC4T22CMSXZ6HACATPXHPAT7H.adapter-zest-v1-wstx-thin-v3'
        : 'SP2DRPT3AA170EK5DC4T22CMSXZ6HACATPXHPAT7H.adapter-zest-v1-sbtc-thin-v3'

      // Step 1: Fund adapter for Pyth fee
      try {
        const { request: walletRequest } = await import('@stacks/connect')
        await walletRequest('stx_transferStx', {
          recipient: adapterPrincipal,
          amount: '10000', // 0.01 STX
        })
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        if (msg.includes('cancel') || msg.includes('denied')) {
          return // user cancelled
        }
        // Non-cancel error -- adapter may already have funds, proceed
      }

      // Step 2: Disable collateral with fresh Pyth data
      await tx.execute(async () => {
        let priceFeedBytes: Uint8Array | null = null
        try {
          const { fetchPythPriceUpdate, PYTH_FEED_IDS } = await import('@delta-stacks/calldata-sdk-stacks')
          const feeds = vaultDef.id === 'stx'
            ? [PYTH_FEED_IDS.STX, PYTH_FEED_IDS.BTC]
            : [PYTH_FEED_IDS.BTC]
          priceFeedBytes = await fetchPythPriceUpdate(feeds)
        } catch (e) {
          console.warn('Failed to fetch Pyth price feed, trying with none:', e)
        }
        if (vaultDef.id === 'stx') return DeltaVaultSTX.encodeDisableV1Collateral(priceFeedBytes)
        if (vaultDef.id === 'sbtc') return DeltaVaultSBTC.encodeDisableV1Collateral(priceFeedBytes)
        throw new Error('Disable V1 Collateral not supported for this vault')
      })
      return
    }

    if (!amount) return
    const amtRaw = parseFloat(amount)
    if (isNaN(amtRaw) || amtRaw <= 0) return
    const amtSmallest = BigInt(Math.floor(amtRaw * decFactor))

    await tx.execute(async () => {
      const isM1Deploy = op === `Deploy ${vaultDef.market1Label}`
      const isM2Deploy = op === `Deploy ${vaultDef.market2Label}`
      const isM1Recall = op === `Recall ${vaultDef.market1Label}`
      const isM2Recall = op === `Recall ${vaultDef.market2Label}`
      const isRebal12 = op === `Rebalance ${vaultDef.market1Label[0]}→${vaultDef.market2Label[0]}`
      const isRebal21 = op === `Rebalance ${vaultDef.market2Label[0]}→${vaultDef.market1Label[0]}`

      if (vaultDef.id === 'sbtc') {
        if (isM1Deploy) return DeltaVaultSBTC.encodeDeployToZestV1(amtSmallest)
        if (isM2Deploy) return DeltaVaultSBTC.encodeDeployToZestV2(amtSmallest)
        if (isM1Recall) return DeltaVaultSBTC.encodeRecallFromZestV1(amtSmallest)
        if (isM2Recall) return DeltaVaultSBTC.encodeRecallFromZestV2(amtSmallest)
        if (isRebal12) return DeltaVaultSBTC.encodeRecallFromZestV1(amtSmallest)
        if (isRebal21) return DeltaVaultSBTC.encodeDeployToZestV1(amtSmallest)
      } else if (vaultDef.id === 'stx') {
        if (isM1Deploy) return DeltaVaultSTX.encodeDeployToZestV1(amtSmallest)
        if (isM2Deploy) return DeltaVaultSTX.encodeDeployToZestV2(amtSmallest)
        if (isM1Recall) return DeltaVaultSTX.encodeRecallFromZestV1(amtSmallest)
        if (isM2Recall) return DeltaVaultSTX.encodeRecallFromZestV2(amtSmallest)
        if (isRebal12) return DeltaVaultSTX.encodeRecallFromZestV1(amtSmallest)
        if (isRebal21) return DeltaVaultSTX.encodeDeployToZestV1(amtSmallest)
      } else {
        if (isM1Deploy) return DeltaVaultV3.encodeDeployToGranite(amtSmallest)
        if (isM2Deploy) return DeltaVaultV3.encodeDeployToZestV2(amtSmallest)
        if (isM1Recall) return DeltaVaultV3.encodeRecallFromGranite(amtSmallest)
        if (isM2Recall) return DeltaVaultV3.encodeRecallFromZestV2(amtSmallest)
        if (isRebal12) return DeltaVaultV3.encodeRebalanceGraniteToZestV2(amtSmallest)
        if (isRebal21) return DeltaVaultV3.encodeRebalanceZestV2ToGranite(amtSmallest)
      }
      throw new Error(`Unknown operation: ${op}`)
    })
  }, [stxAddress, amount, op, tx, isReallocate, reallocFields, vaultDef, decFactor])

  useEffect(() => {
    if (tx.status === 'submitted' && tx.txId) pending.addTx(tx.txId)
  }, [tx.status, tx.txId, pending])

  return (
    <div className="glass-card rounded-xl p-5 space-y-4">
      <Tabs
        tabs={[...allocOps]}
        active={opTab}
        onChange={(i) => { setOpTab(i); setAmount(''); setReallocFields({ fromM1: '', fromM2: '', toM1: '', toM2: '' }); tx.reset() }}
        size="sm"
      />

      <div className="text-xs text-text-dim bg-surface-alt/60 rounded-xl p-3 flex items-center gap-2 border border-border-subtle">
        <svg className="w-3.5 h-3.5 shrink-0 text-text-dim" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        Allocator-only operations. Only the address set via <span className="font-mono text-text-muted">set-vault-allocator</span> can execute these.
      </div>

      {/* Current balances context — shows live (actual) idle, not bookkeeping */}
      <div className="bg-surface-alt/60 rounded-xl p-3 space-y-1.5 text-xs border border-border-subtle">
        <div className="flex justify-between">
          <span className="text-text-dim">Idle (deployable)</span>
          <span className="font-mono text-text-muted">{micro(vault.idleBookkeeping, vaultDef.decimals)} {vaultDef.asset}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-text-dim">{vaultDef.market1Label}</span>
          <span className="font-mono text-text-muted">{micro(vault.allocMarket1, vaultDef.decimals)} {vaultDef.asset}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-text-dim">{vaultDef.market2Label}</span>
          <span className="font-mono text-text-muted">{micro(vault.allocMarket2, vaultDef.decimals)} {vaultDef.asset}</span>
        </div>
      </div>

      {isNoAmountOp ? (
        <div className="text-xs text-text-dim bg-surface-alt/60 rounded-xl p-3 border border-border-subtle">
          Disables the Zest V1 collateral flag on the adapter. This skips the deep health-factor check on withdrawals. Call after each deploy to V1. Requires 2 wallet signatures: first funds the adapter with 0.01 STX for the Pyth oracle fee, then calls disable-collateral with fresh price data.
        </div>
      ) : isReallocate ? (
        <div className="space-y-3">
          <div className="text-xs text-text-dim">
            Zero-sum rebalance: total recalled must equal total deployed.
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs text-text-muted font-medium">From {vaultDef.market1Label}</label>
              <input
                type="number" min="0" step="any" placeholder="0.00"
                value={reallocFields.fromM1}
                onChange={(e) => { setReallocFields(f => ({ ...f, fromM1: e.target.value })); if (tx.status !== 'idle') tx.reset() }}
                className="w-full bg-surface-alt/80 border border-border-subtle rounded-xl px-3 py-2 text-sm font-mono focus:outline-none focus:border-primary transition-all duration-200"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-text-muted font-medium">From {vaultDef.market2Label}</label>
              <input
                type="number" min="0" step="any" placeholder="0.00"
                value={reallocFields.fromM2}
                onChange={(e) => { setReallocFields(f => ({ ...f, fromM2: e.target.value })); if (tx.status !== 'idle') tx.reset() }}
                className="w-full bg-surface-alt/80 border border-border-subtle rounded-xl px-3 py-2 text-sm font-mono focus:outline-none focus:border-primary transition-all duration-200"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-text-muted font-medium">To {vaultDef.market1Label}</label>
              <input
                type="number" min="0" step="any" placeholder="0.00"
                value={reallocFields.toM1}
                onChange={(e) => { setReallocFields(f => ({ ...f, toM1: e.target.value })); if (tx.status !== 'idle') tx.reset() }}
                className="w-full bg-surface-alt/80 border border-border-subtle rounded-xl px-3 py-2 text-sm font-mono focus:outline-none focus:border-primary transition-all duration-200"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-text-muted font-medium">To {vaultDef.market2Label}</label>
              <input
                type="number" min="0" step="any" placeholder="0.00"
                value={reallocFields.toM2}
                onChange={(e) => { setReallocFields(f => ({ ...f, toM2: e.target.value })); if (tx.status !== 'idle') tx.reset() }}
                className="w-full bg-surface-alt/80 border border-border-subtle rounded-xl px-3 py-2 text-sm font-mono focus:outline-none focus:border-primary transition-all duration-200"
              />
            </div>
          </div>
        </div>
      ) : (
        <AmountInput
          amount={amount}
          setAmount={(v) => { setAmount(v); if (tx.status !== 'idle') tx.reset() }}
          label={`Amount (${vaultDef.asset})`}
        />
      )}

      <SubmitButton
        connected={connected}
        connect={connect}
        onClick={handleSubmit}
        disabled={
          (isReallocate || isNoAmountOp)
            ? tx.status === 'building' || tx.status === 'signing'
            : !amount || tx.status === 'building' || tx.status === 'signing'
        }
        tx={tx}
        label={op}
      />

      <TxStatus tx={tx} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Owner Panel — Config / Register / Set roles
// ---------------------------------------------------------------------------

function OwnerPanel({ vaultDef, onTxConfirm }: { vaultDef: VaultDef; onTxConfirm: () => void }) {
  const ownerOps = useMemo(() => getOwnerOps(vaultDef), [vaultDef])
  const [opTab, setOpTab] = useState(0)
  const [inputValue, setInputValue] = useState('')
  const { connected, stxAddress, connect } = useWallet()
  const tx = useTransact()
  const pending = usePendingTx(onTxConfirm)

  const op = ownerOps[opTab]

  // Whether the input is a number (fee/buffer) or principal
  const isNumericInput = op === 'Set Fee' || op === 'Set Idle Buffer'

  const regM1 = `Register ${vaultDef.market1Label}`
  const regM2 = `Register ${vaultDef.market2Label}`

  const inputLabel = useMemo(() => {
    switch (op) {
      case 'Set Allocator': return 'New allocator principal'
      case 'Set Owner': return 'New owner principal'
      case regM1: return 'Adapter principal (blank for default)'
      case regM2: return 'Adapter principal (blank for default)'
      case 'Set Fee': return 'Fee (basis points, e.g. 1000 = 10%)'
      case 'Set Fee Recipient': return 'Fee recipient principal'
      case 'Set Idle Buffer': return 'Idle buffer (basis points, e.g. 500 = 5%)'
      default: return 'Value'
    }
  }, [op, regM1, regM2])

  const inputPlaceholder = useMemo(() => {
    if (op === 'Set Allocator' || op === 'Set Owner' || op === 'Set Fee Recipient') return 'SP...'
    if (op === regM1 || op === regM2) return 'SP...'
    if (op === 'Set Fee') return '1000'
    if (op === 'Set Idle Buffer') return '500'
    return ''
  }, [op, regM1, regM2])

  const handleSubmit = useCallback(async () => {
    if (!stxAddress) return
    const sdk = vaultDef.id === 'sbtc' ? DeltaVaultSBTC : vaultDef.id === 'stx' ? DeltaVaultSTX : DeltaVaultV3

    await tx.execute(async () => {
      switch (op) {
        case 'Set Allocator':
          if (!inputValue) throw new Error('Principal required')
          return sdk.encodeSetVaultAllocator(inputValue)
        case 'Set Owner':
          if (!inputValue) throw new Error('Principal required')
          return sdk.encodeSetVaultOwner(inputValue)
        case 'Set Fee': {
          const bps = parseInt(inputValue, 10)
          if (isNaN(bps) || bps < 0) throw new Error('Invalid basis points')
          return sdk.encodeSetFeeBps(BigInt(bps))
        }
        case 'Set Fee Recipient':
          if (!inputValue) throw new Error('Principal required')
          return sdk.encodeSetFeeRecipient(inputValue)
        case 'Set Idle Buffer': {
          const bps = parseInt(inputValue, 10)
          if (isNaN(bps) || bps < 0) throw new Error('Invalid basis points')
          return sdk.encodeSetIdleBuffer(BigInt(bps))
        }
        default:
          // Register adapters
          if (op === regM1) {
            if (vaultDef.id === 'sbtc') return DeltaVaultSBTC.encodeRegisterAdapterZestV1(inputValue || undefined)
            if (vaultDef.id === 'stx') return DeltaVaultSTX.encodeRegisterAdapterZestV1(inputValue || undefined)
            return DeltaVaultV3.encodeRegisterAdapterGranite(inputValue || undefined)
          }
          if (op === regM2) {
            if (vaultDef.id === 'sbtc') return DeltaVaultSBTC.encodeRegisterAdapterZestV2(inputValue || undefined)
            if (vaultDef.id === 'stx') return DeltaVaultSTX.encodeRegisterAdapterZestV2(inputValue || undefined)
            return DeltaVaultV3.encodeRegisterAdapterZestV2(inputValue || undefined)
          }
          throw new Error(`Unknown operation: ${op}`)
      }
    })
  }, [stxAddress, inputValue, op, tx, vaultDef, regM1, regM2])

  useEffect(() => {
    if (tx.status === 'submitted' && tx.txId) pending.addTx(tx.txId)
  }, [tx.status, tx.txId, pending])

  const needsInput = op !== regM1 && op !== regM2

  return (
    <div className="glass-card rounded-xl p-5 space-y-4">
      <Tabs
        tabs={[...ownerOps]}
        active={opTab}
        onChange={(i) => { setOpTab(i); setInputValue(''); tx.reset() }}
        size="sm"
      />

      <div className="text-xs text-text-dim bg-surface-alt/60 rounded-xl p-3 flex items-center gap-2 border border-border-subtle">
        <svg className="w-3.5 h-3.5 shrink-0 text-text-dim" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
        Owner-only operations. Only the vault owner can execute these.
      </div>

      {/* Input */}
      <div className="space-y-1.5">
        <label className="text-xs text-text-muted font-medium">{inputLabel}</label>
        <input
          type={isNumericInput ? 'number' : 'text'}
          min={isNumericInput ? '0' : undefined}
          placeholder={inputPlaceholder}
          value={inputValue}
          onChange={(e) => { setInputValue(e.target.value); if (tx.status !== 'idle') tx.reset() }}
          className="w-full bg-surface-alt/80 border border-border-subtle rounded-xl px-4 py-3 text-sm font-mono focus:outline-none focus:border-primary transition-all duration-200"
        />
      </div>

      <SubmitButton
        connected={connected}
        connect={connect}
        onClick={handleSubmit}
        disabled={(needsInput && !inputValue) || tx.status === 'building' || tx.status === 'signing'}
        tx={tx}
        label={op}
      />

      <TxStatus tx={tx} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Shared sub-components
// ---------------------------------------------------------------------------

function AmountInput({
  amount,
  setAmount,
  label,
  maxAmount,
  exceedsMax,
  pctButtons,
  onPercent,
}: {
  amount: string
  setAmount: (v: string) => void
  label: string
  maxAmount?: number
  exceedsMax?: boolean
  pctButtons?: boolean
  onPercent?: (pct: number) => void
}) {
  return (
    <div className="space-y-2.5">
      <label className="text-xs text-text-muted font-medium">{label}</label>

      {/* Input with inline MAX button */}
      <div
        className={`relative rounded-xl border transition-all duration-200 bg-surface-alt/60 ${
          exceedsMax ? 'border-negative' : 'border-border-subtle focus-within:border-primary'
        }`}
      >
        <input
          type="number"
          min="0"
          step="any"
          placeholder="0.00"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="w-full bg-transparent px-4 py-3.5 text-base font-mono focus:outline-none"
        />
        {maxAmount != null && maxAmount > 0 && onPercent && (
          <button
            onClick={() => onPercent(100)}
            className="absolute right-3 top-1/2 -translate-y-1/2 px-2 py-1 text-[10px] uppercase tracking-wider font-bold rounded-md bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
          >
            Max
          </button>
        )}
      </div>

      {/* Percentage quick-select */}
      {pctButtons && maxAmount != null && maxAmount > 0 && onPercent && (
        <div className="flex gap-1.5">
          {PCT_BUTTONS.map((pct) => (
            <button
              key={pct}
              onClick={() => onPercent(pct)}
              className="flex-1 py-1.5 text-xs rounded-lg bg-surface-alt/80 hover:bg-surface-hover text-text-muted hover:text-text transition-all duration-200 font-mono border border-border-subtle/50 hover:border-border-subtle"
            >
              {pct}%
            </button>
          ))}
        </div>
      )}

      {exceedsMax && (
        <div className="text-xs text-negative flex items-center gap-1.5">
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01" />
          </svg>
          Exceeds available balance
        </div>
      )}
    </div>
  )
}

function SubmitButton({
  connected,
  connect,
  onClick,
  disabled,
  tx,
  label,
}: {
  connected: boolean
  connect: () => void
  onClick: () => void
  disabled: boolean
  tx: { status: string }
  label: string
}) {
  if (!connected) {
    return (
      <button
        onClick={connect}
        className="w-full py-3 text-sm rounded-xl bg-gradient-to-r from-primary to-primary-hover text-white font-medium transition-all duration-200 hover:shadow-lg hover:shadow-primary/20 hover:-translate-y-px active:translate-y-0"
      >
        Connect Wallet
      </button>
    )
  }
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-full py-3 text-sm rounded-xl bg-gradient-to-r from-primary to-primary-hover text-white font-medium transition-all duration-200 hover:shadow-lg hover:shadow-primary/20 hover:-translate-y-px active:translate-y-0 disabled:opacity-40 disabled:hover:shadow-none disabled:hover:translate-y-0 disabled:cursor-not-allowed"
    >
      {tx.status === 'building'
        ? 'Preparing...'
        : tx.status === 'signing'
          ? 'Confirm in wallet...'
          : label}
    </button>
  )
}

function TxStatus({ tx }: { tx: { status: string; txId: string | null; error: string | null } }) {
  return (
    <>
      {tx.status === 'submitted' && tx.txId && (
        <div className="text-xs text-positive bg-positive-dim rounded-xl p-3 flex items-center gap-2">
          <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          Submitted!{' '}
          <a
            href={`https://explorer.hiro.so/txid/${tx.txId}?chain=mainnet`}
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-positive"
          >
            View on explorer
          </a>
        </div>
      )}
      {tx.status === 'error' && tx.error && (
        <div className="text-xs text-negative bg-negative-dim rounded-xl p-3">{tx.error}</div>
      )}
    </>
  )
}
