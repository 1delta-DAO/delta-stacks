import { useState, useMemo, useCallback, useEffect } from 'react'
import { Tabs } from './Tabs'
import { useWallet } from '../context/WalletContext'
import { useTransact } from '../hooks/useTransact'
import { usePendingTx } from '../hooks/usePendingTx'
import { useBalances, type Balances } from '../hooks/useBalances'
import { useVaultStateV3, type VaultStateV3 } from '../hooks/useVaultStateV3'
import { useVaultStateSTX } from '../hooks/useVaultStateSTX'
import {
  DeltaVaultV3,
  DeltaVaultSTX,
  VAULT_V3_CONTRACTS,
  VAULT_V3_UNDERLYING,
  VAULT_STX_CONTRACTS,
  VAULT_STX_UNDERLYING,
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

function formatAmount(n: number): string {
  if (n === 0) return '0'
  if (n >= 1000) return n.toFixed(2)
  if (n >= 1) return n.toFixed(4)
  return n.toFixed(6)
}

/** Format micro-units (6 decimals) to human-readable */
function micro(n: bigint): string {
  const num = Number(n) / 1e6
  return formatAmount(num)
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
      <div className="glass-card rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            {onBack && (
              <button
                onClick={onBack}
                className="mr-1 p-1.5 rounded-lg hover:bg-surface-alt text-text-dim hover:text-text transition-all"
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
              className="w-8 h-8 rounded-full bg-surface-alt ring-2 ring-border-subtle"
              onError={(e) => {
                ;(e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${vaultDef.asset}&background=2e2e4a&color=eaeaf4&size=36&bold=true`
              }}
            />
            <div>
              <h2 className="text-sm font-semibold">{vaultDef.name}</h2>
              <span className="text-[11px] text-text-dim">{vaultDef.symbol}</span>
            </div>
          </div>
          {!loading && vault.blendedApr > 0 && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-positive-dim">
              <span className="text-sm font-mono text-positive font-semibold">
                {pct(vault.blendedApr)} APR
              </span>
            </div>
          )}
        </div>

        {/* Key metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <MetricCard label="TVL" value={loading ? '...' : `${micro(vault.liveTotal)} ${vaultDef.asset}`} />
          <MetricCard label="Share Price" value={loading ? '...' : vault.sharePrice.toFixed(6)} />
          <MetricCard label="Total Shares" value={loading ? '...' : micro(vault.totalSupply)} />
          <MetricCard
            label="Unrealized Yield"
            value={loading ? '...' : `${micro(vault.unrealizedYield)} ${vaultDef.asset}`}
            positive={vault.unrealizedYield > 0n}
          />
        </div>

        {/* V3 config row */}
        {!loading && (
          <div className="grid grid-cols-3 gap-3 mt-3">
            <MetricCard label="Performance Fee" value={bpsPct(vault.feeBps)} />
            <MetricCard label="Idle Buffer" value={bpsPct(vault.idleBufferBps)} />
            <MetricCard label="Virtual Offset" value={vault.virtualOffset.toLocaleString()} />
          </div>
        )}
      </div>

      {/* Allocation breakdown */}
      {!loading && <AllocationBar vault={vault} vaultDef={vaultDef} />}

      {/* Share price history chart */}
      <SharePriceChart historyEndpoint={vaultDef.historyEndpoint} />

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
        <span className="text-xs text-text-dim font-mono">{micro(total)} {vaultDef.asset} total</span>
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
          amount={micro(m1)}
          percentage={pct(m1Pct)}
          apr={vault.market1Apr > 0 ? pct(vault.market1Apr) : null}
          color="accent-blue"
        />
        <AllocationLegendItem
          icon={vaultDef.market2Logo}
          label={vaultDef.market2Label}
          amount={micro(m2)}
          percentage={pct(m2Pct)}
          apr={vault.market2Apr > 0 ? pct(vault.market2Apr) : null}
          color="accent-purple"
        />
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-text-dim/30 inline-block" />
            <span className="text-text-dim font-medium">Idle</span>
          </div>
          <div className="font-mono pl-4 text-text-muted">{micro(vault.liveIdle)}</div>
          <div className="text-text-dim pl-4">{pct(idlePct)}</div>
          <div className="text-text-dim pl-4 font-mono">0.00% APR</div>
        </div>
      </div>

      {/* Live vs bookkeeping */}
      {vault.unrealizedYield > 0n && (
        <div className="text-xs text-text-dim bg-surface-alt/60 rounded-xl p-3 flex justify-between border border-border-subtle">
          <span>Live total (incl. unrealized)</span>
          <span className="font-mono text-text-muted">{micro(vault.liveTotal)} {vaultDef.asset}</span>
        </div>
      )}
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

  // Wallet balance (human-readable)
  const walletBalance = useMemo(() => {
    // For STX vault, use native STX balance (balances.stx is a raw bigint)
    if (vaultDef.id === 'stx') {
      return Number(balances.stx) / 1e6
    }
    const key = Object.keys(balances.fungible).find(
      (k) => k.toLowerCase() === underlying.toLowerCase(),
    )
    if (key) return Number(balances.fungible[key].balance) / 1e6
    return 0
  }, [balances, underlying, vaultDef.id])

  // Vault share balance
  const shareBalance = useMemo(() => {
    const key = Object.keys(balances.fungible).find(
      (k) => k.toLowerCase() === vaultContract.toLowerCase(),
    )
    if (key) return Number(balances.fungible[key].balance) / 1e6
    return 0
  }, [balances, vaultContract])

  // Withdrawable USDCx = shares * share price (floored to 6 decimals)
  const withdrawableBalance = useMemo(() => {
    return Math.floor(shareBalance * vault.sharePrice * 1e6) / 1e6
  }, [shareBalance, vault.sharePrice])

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
      // Floor to 6 decimals to match on-chain micro-unit precision
      const val = Math.floor(raw * 1e6) / 1e6
      setAmount(String(val))
      if (tx.status !== 'idle') tx.reset()
    },
    [maxAmount, tx],
  )

  const handleSubmit = useCallback(async () => {
    if (!stxAddress || !amount) return
    const amtRaw = parseFloat(amount)
    if (isNaN(amtRaw) || amtRaw <= 0) return
    const amtSmallest = BigInt(Math.floor(amtRaw * 1e6))

    await tx.execute(async () => {
      if (vaultDef.id === 'stx') {
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
  }, [stxAddress, amount, op, tx, vaultDef.id])

  useEffect(() => {
    if (tx.status === 'submitted' && tx.txId) pending.addTx(tx.txId)
  }, [tx.status, tx.txId, pending])

  const amtExceedsMax = parseFloat(amount) > maxAmount

  return (
    <div className="glass-card rounded-xl p-5 space-y-4">
      <Tabs
        tabs={[...USER_OPS]}
        active={opTab}
        onChange={(i) => { setOpTab(i); setAmount(''); tx.reset() }}
        size="sm"
      />

      {/* Position context */}
      {connected && (
        <div className="bg-surface-alt/60 rounded-xl p-3 space-y-2 text-xs border border-border-subtle">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <img src={getTokenIcon(vaultDef.asset)} alt={vaultDef.asset} className="w-4 h-4 rounded-full" />
              <span className="text-text-dim">{vaultDef.asset} wallet</span>
            </div>
            <span className="font-mono text-text-muted">{formatAmount(walletBalance)}</span>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <span className="w-4 h-4 rounded-full bg-gradient-to-br from-accent-blue to-accent-purple flex items-center justify-center text-[8px] font-bold text-white">d</span>
              <span className="text-text-dim">{vaultDef.symbol} shares</span>
            </div>
            <span className="font-mono text-text-muted">{formatAmount(shareBalance)}</span>
          </div>
          {shareBalance > 0 && (
            <div className="flex items-center justify-between border-t border-border-subtle pt-2">
              <div className="flex items-center gap-1.5">
                <img src={getTokenIcon(vaultDef.asset)} alt={vaultDef.asset} className="w-4 h-4 rounded-full opacity-60" />
                <span className="text-text-dim">Withdrawable</span>
              </div>
              <span className="font-mono text-text-muted">{formatAmount(withdrawableBalance)} {vaultDef.asset}</span>
            </div>
          )}
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

  const handleSubmit = useCallback(async () => {
    if (!stxAddress) return

    if (isReallocate) {
      const f1 = BigInt(Math.floor(parseFloat(reallocFields.fromM1 || '0') * 1e6))
      const f2 = BigInt(Math.floor(parseFloat(reallocFields.fromM2 || '0') * 1e6))
      const t1 = BigInt(Math.floor(parseFloat(reallocFields.toM1 || '0') * 1e6))
      const t2 = BigInt(Math.floor(parseFloat(reallocFields.toM2 || '0') * 1e6))

      await tx.execute(async () =>
        vaultDef.id === 'stx'
          ? DeltaVaultSTX.encodeReallocate(f1, f2, t1, t2)
          : DeltaVaultV3.encodeReallocate(f1, f2, t1, t2),
      )
      return
    }

    if (!amount) return
    const amtRaw = parseFloat(amount)
    if (isNaN(amtRaw) || amtRaw <= 0) return
    const amtSmallest = BigInt(Math.floor(amtRaw * 1e6))

    await tx.execute(async () => {
      const isM1Deploy = op === `Deploy ${vaultDef.market1Label}`
      const isM2Deploy = op === `Deploy ${vaultDef.market2Label}`
      const isM1Recall = op === `Recall ${vaultDef.market1Label}`
      const isM2Recall = op === `Recall ${vaultDef.market2Label}`
      const isRebal12 = op === `Rebalance ${vaultDef.market1Label[0]}→${vaultDef.market2Label[0]}`
      const isRebal21 = op === `Rebalance ${vaultDef.market2Label[0]}→${vaultDef.market1Label[0]}`

      if (vaultDef.id === 'stx') {
        if (isM1Deploy) return DeltaVaultSTX.encodeDeployToZestV1(amtSmallest)
        if (isM2Deploy) return DeltaVaultSTX.encodeDeployToZestV2(amtSmallest)
        if (isM1Recall) return DeltaVaultSTX.encodeRecallFromZestV1(amtSmallest)
        if (isM2Recall) return DeltaVaultSTX.encodeRecallFromZestV2(amtSmallest)
        if (isRebal12) return DeltaVaultSTX.encodeRebalanceV1ToV2(amtSmallest)
        if (isRebal21) return DeltaVaultSTX.encodeRebalanceV2ToV1(amtSmallest)
      } else {
        if (isM1Deploy) return DeltaVaultV3.encodeDeployToGranite(amtSmallest)
        if (isM2Deploy) return DeltaVaultV3.encodeDeployToZestV2(amtSmallest)
        if (isM1Recall) return DeltaVaultV3.encodeRecallFromGranite(amtSmallest)
        if (isM2Recall) return DeltaVaultV3.encodeRecallFromZestV2(amtSmallest)
        if (isRebal12) return DeltaVaultV3.encodeRebalanceGraniteToZestV2(amtSmallest)
        if (isRebal21) return DeltaVaultV3.encodeRebalanceZestV2ToGranite(amtSmallest)
      }
    })
  }, [stxAddress, amount, op, tx, isReallocate, reallocFields, vaultDef])

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
          <span className="font-mono text-text-muted">{micro(vault.liveIdle)} {vaultDef.asset}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-text-dim">{vaultDef.market1Label}</span>
          <span className="font-mono text-text-muted">{micro(vault.allocMarket1)} {vaultDef.asset}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-text-dim">{vaultDef.market2Label}</span>
          <span className="font-mono text-text-muted">{micro(vault.allocMarket2)} {vaultDef.asset}</span>
        </div>
      </div>

      {isReallocate ? (
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
          isReallocate
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
    const sdk = vaultDef.id === 'stx' ? DeltaVaultSTX : DeltaVaultV3

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
            return vaultDef.id === 'stx'
              ? DeltaVaultSTX.encodeRegisterAdapterZestV1(inputValue || undefined)
              : DeltaVaultV3.encodeRegisterAdapterGranite(inputValue || undefined)
          }
          if (op === regM2) {
            return vaultDef.id === 'stx'
              ? DeltaVaultSTX.encodeRegisterAdapterZestV2(inputValue || undefined)
              : DeltaVaultV3.encodeRegisterAdapterZestV2(inputValue || undefined)
          }
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
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-xs text-text-muted font-medium">{label}</label>
        {maxAmount != null && maxAmount > 0 && (
          <span className="text-[11px] text-text-dim">
            Max: <span className="font-mono text-text-muted">{formatAmount(maxAmount)}</span>
          </span>
        )}
      </div>
      <input
        type="number"
        min="0"
        step="any"
        placeholder="0.00"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        className={`w-full bg-surface-alt/80 border rounded-xl px-4 py-3 text-sm font-mono focus:outline-none transition-all duration-200 ${
          exceedsMax ? 'border-negative' : 'border-border-subtle focus:border-primary'
        }`}
      />
      {pctButtons && maxAmount != null && maxAmount > 0 && onPercent && (
        <div className="flex gap-1.5">
          {PCT_BUTTONS.map((pct) => (
            <button
              key={pct}
              onClick={() => onPercent(pct)}
              className="flex-1 py-1.5 text-xs rounded-lg bg-surface-alt hover:bg-surface-hover text-text-muted hover:text-text transition-all duration-200 font-mono border border-transparent hover:border-border-subtle"
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
