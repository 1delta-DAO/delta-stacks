import { useState, useMemo, useCallback, useEffect } from 'react'
import { Tabs } from './Tabs'
import { useWallet } from '../context/WalletContext'
import { useTransact } from '../hooks/useTransact'
import { usePendingTx } from '../hooks/usePendingTx'
import { useBalances, type Balances } from '../hooks/useBalances'
import { useVaultStateV3, type VaultStateV3 } from '../hooks/useVaultStateV3'
import {
  DeltaVaultV3,
  VAULT_V3_CONTRACTS,
  VAULT_V3_UNDERLYING,
} from '@delta-stacks/calldata-sdk-stacks'

import graniteLogo from '../assets/granite.png'
import zestLogo from '../assets/zest.png'
import { getTokenIcon } from '../utils/tokenIcons'

// ---------------------------------------------------------------------------
// Vault operations
// ---------------------------------------------------------------------------

const USER_OPS = ['Deposit', 'Withdraw', 'Redeem'] as const
const ALLOCATOR_OPS = [
  'Deploy Granite', 'Deploy Zest',
  'Recall Granite', 'Recall Zest',
  'Rebalance G→Z', 'Rebalance Z→G',
  'Reallocate',
] as const
const OWNER_OPS = [
  'Set Allocator', 'Set Owner',
  'Register Granite', 'Register Zest',
  'Set Fee', 'Set Fee Recipient', 'Set Idle Buffer',
] as const

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

export function VaultTab() {
  const [roleTab, setRoleTab] = useState(0)
  const { state: vault, loading, refresh: refreshVault } = useVaultStateV3()
  const { balances, refresh: refreshBalances } = useBalances()

  /** Called when any pending tx confirms — refresh both user balances and vault state */
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
            <img
              src={getTokenIcon('USDCx')}
              alt="USDCx"
              className="w-8 h-8 rounded-full bg-surface-alt ring-2 ring-border-subtle"
              onError={(e) => {
                ;(e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=USDCx&background=2e2e4a&color=eaeaf4&size=36&bold=true`
              }}
            />
            <div>
              <h2 className="text-sm font-semibold">1delta USDCx Vault v3</h2>
              <span className="text-[11px] text-text-dim">1dUSDCx</span>
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
          <MetricCard label="TVL" value={loading ? '...' : `${micro(vault.liveTotal)} USDCx`} />
          <MetricCard label="Share Price" value={loading ? '...' : vault.sharePrice.toFixed(6)} />
          <MetricCard label="Total Shares" value={loading ? '...' : micro(vault.totalSupply)} />
          <MetricCard
            label="Unrealized Yield"
            value={loading ? '...' : `${micro(vault.unrealizedYield)} USDCx`}
            positive={vault.unrealizedYield > 0n}
          />
        </div>

        {/* V3 config row */}
        {!loading && (
          <div className="grid grid-cols-3 gap-3 mt-3">
            <MetricCard
              label="Performance Fee"
              value={bpsPct(vault.feeBps)}
            />
            <MetricCard
              label="Idle Buffer"
              value={bpsPct(vault.idleBufferBps)}
            />
            <MetricCard
              label="Virtual Offset"
              value={vault.virtualOffset.toLocaleString()}
            />
          </div>
        )}
      </div>

      {/* Allocation breakdown */}
      {!loading && <AllocationBar vault={vault} />}

      {/* Role tabs */}
      <Tabs
        tabs={['User', 'Allocator', 'Owner']}
        active={roleTab}
        onChange={setRoleTab}
      />

      {roleTab === 0 && <UserPanel balances={balances} vault={vault} onTxConfirm={onTxConfirm} />}
      {roleTab === 1 && <AllocatorPanel vault={vault} onTxConfirm={onTxConfirm} />}
      {roleTab === 2 && <OwnerPanel onTxConfirm={onTxConfirm} />}
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

function AllocationBar({ vault }: { vault: VaultStateV3 }) {
  const total = vault.totalAssets
  const idle = vault.idleBookkeeping
  const granite = vault.allocGranite
  const zest = vault.allocZest

  const idlePct = total > 0n ? Number(idle * 10000n / total) / 100 : 100
  const granitePct = total > 0n ? Number(granite * 10000n / total) / 100 : 0
  const zestPct = total > 0n ? Number(zest * 10000n / total) / 100 : 0

  return (
    <div className="glass-card rounded-xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-text-dim">Allocation</h3>
        <span className="text-xs text-text-dim font-mono">{micro(total)} USDCx total</span>
      </div>

      {/* Stacked bar */}
      <div className="h-3 rounded-full overflow-hidden flex bg-surface-alt border border-border-subtle">
        {granitePct > 0 && (
          <div
            className="h-full bg-gradient-to-r from-accent-blue to-accent-blue/80 transition-all duration-500"
            style={{ width: `${granitePct}%` }}
            title={`Granite: ${pct(granitePct)}`}
          />
        )}
        {zestPct > 0 && (
          <div
            className="h-full bg-gradient-to-r from-accent-purple to-accent-purple/80 transition-all duration-500"
            style={{ width: `${zestPct}%` }}
            title={`Zest V2: ${pct(zestPct)}`}
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
          icon={graniteLogo}
          label="Granite"
          amount={micro(granite)}
          percentage={pct(granitePct)}
          apr={vault.graniteApr > 0 ? pct(vault.graniteApr) : null}
          color="accent-blue"
        />
        <AllocationLegendItem
          icon={zestLogo}
          label="Zest V2"
          amount={micro(zest)}
          percentage={pct(zestPct)}
          apr={vault.zestApr > 0 ? pct(vault.zestApr) : null}
          color="accent-purple"
        />
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-text-dim/30 inline-block" />
            <span className="text-text-dim font-medium">Idle</span>
          </div>
          <div className="font-mono pl-4 text-text-muted">{micro(idle)}</div>
          <div className="text-text-dim pl-4">{pct(idlePct)}</div>
          <div className="text-text-dim pl-4 font-mono">0.00% APR</div>
        </div>
      </div>

      {/* Live vs bookkeeping */}
      {vault.unrealizedYield > 0n && (
        <div className="text-xs text-text-dim bg-surface-alt/60 rounded-xl p-3 flex justify-between border border-border-subtle">
          <span>Live total (incl. unrealized)</span>
          <span className="font-mono text-text-muted">{micro(vault.liveTotal)} USDCx</span>
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

function UserPanel({ balances, vault, onTxConfirm }: { balances: Balances; vault: VaultStateV3; onTxConfirm: () => void }) {
  const [opTab, setOpTab] = useState(0)
  const [amount, setAmount] = useState('')
  const { connected, stxAddress, connect } = useWallet()
  const tx = useTransact()
  const pending = usePendingTx(onTxConfirm)

  const op = USER_OPS[opTab]

  // USDCx wallet balance (human-readable)
  const walletBalance = useMemo(() => {
    const key = Object.keys(balances.fungible).find(
      (k) => k.toLowerCase() === VAULT_V3_UNDERLYING.toLowerCase(),
    )
    if (key) return Number(balances.fungible[key].balance) / 1e6
    return 0
  }, [balances])

  // 1dUSDCx (vault share) balance
  const shareBalance = useMemo(() => {
    const key = Object.keys(balances.fungible).find(
      (k) => k.toLowerCase() === VAULT_V3_CONTRACTS.vault.toLowerCase(),
    )
    if (key) return Number(balances.fungible[key].balance) / 1e6
    return 0
  }, [balances])

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
      switch (op) {
        case 'Deposit':
          return DeltaVaultV3.encodeDeposit(amtSmallest, stxAddress)
        case 'Withdraw':
          return DeltaVaultV3.encodeWithdraw(amtSmallest, stxAddress, stxAddress)
        case 'Redeem':
          return DeltaVaultV3.encodeRedeem(amtSmallest, stxAddress, stxAddress)
      }
    })
  }, [stxAddress, amount, op, tx])

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
              <img src={getTokenIcon('USDCx')} alt="USDCx" className="w-4 h-4 rounded-full" />
              <span className="text-text-dim">USDCx wallet</span>
            </div>
            <span className="font-mono text-text-muted">{formatAmount(walletBalance)}</span>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <span className="w-4 h-4 rounded-full bg-gradient-to-br from-accent-blue to-accent-purple flex items-center justify-center text-[8px] font-bold text-white">d</span>
              <span className="text-text-dim">1dUSDCx shares</span>
            </div>
            <span className="font-mono text-text-muted">{formatAmount(shareBalance)}</span>
          </div>
          {shareBalance > 0 && (
            <div className="flex items-center justify-between border-t border-border-subtle pt-2">
              <div className="flex items-center gap-1.5">
                <img src={getTokenIcon('USDCx')} alt="USDCx" className="w-4 h-4 rounded-full opacity-60" />
                <span className="text-text-dim">Withdrawable</span>
              </div>
              <span className="font-mono text-text-muted">{formatAmount(withdrawableBalance)} USDCx</span>
            </div>
          )}
        </div>
      )}

      {/* Amount input */}
      <AmountInput
        amount={amount}
        setAmount={(v) => { setAmount(v); if (tx.status !== 'idle') tx.reset() }}
        label={op === 'Redeem' ? 'Shares (1dUSDCx)' : 'Amount (USDCx)'}
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

function AllocatorPanel({ vault, onTxConfirm }: { vault: VaultStateV3; onTxConfirm: () => void }) {
  const [opTab, setOpTab] = useState(0)
  const [amount, setAmount] = useState('')
  // Reallocate needs 4 fields
  const [reallocFields, setReallocFields] = useState({ fromGranite: '', fromZest: '', toGranite: '', toZest: '' })
  const { connected, stxAddress, connect } = useWallet()
  const tx = useTransact()
  const pending = usePendingTx(onTxConfirm)

  const op = ALLOCATOR_OPS[opTab]
  const isReallocate = op === 'Reallocate'

  const handleSubmit = useCallback(async () => {
    if (!stxAddress) return

    if (isReallocate) {
      const fg = BigInt(Math.floor(parseFloat(reallocFields.fromGranite || '0') * 1e6))
      const fz = BigInt(Math.floor(parseFloat(reallocFields.fromZest || '0') * 1e6))
      const tg = BigInt(Math.floor(parseFloat(reallocFields.toGranite || '0') * 1e6))
      const tz = BigInt(Math.floor(parseFloat(reallocFields.toZest || '0') * 1e6))

      await tx.execute(async () => DeltaVaultV3.encodeReallocate(fg, fz, tg, tz))
      return
    }

    if (!amount) return
    const amtRaw = parseFloat(amount)
    if (isNaN(amtRaw) || amtRaw <= 0) return
    const amtSmallest = BigInt(Math.floor(amtRaw * 1e6))

    await tx.execute(async () => {
      switch (op) {
        case 'Deploy Granite':
          return DeltaVaultV3.encodeDeployToGranite(amtSmallest)
        case 'Deploy Zest':
          return DeltaVaultV3.encodeDeployToZestV2(amtSmallest)
        case 'Recall Granite':
          return DeltaVaultV3.encodeRecallFromGranite(amtSmallest)
        case 'Recall Zest':
          return DeltaVaultV3.encodeRecallFromZestV2(amtSmallest)
        case 'Rebalance G→Z':
          return DeltaVaultV3.encodeRebalanceGraniteToZestV2(amtSmallest)
        case 'Rebalance Z→G':
          return DeltaVaultV3.encodeRebalanceZestV2ToGranite(amtSmallest)
      }
    })
  }, [stxAddress, amount, op, tx, isReallocate, reallocFields])

  useEffect(() => {
    if (tx.status === 'submitted' && tx.txId) pending.addTx(tx.txId)
  }, [tx.status, tx.txId, pending])

  return (
    <div className="glass-card rounded-xl p-5 space-y-4">
      <Tabs
        tabs={[...ALLOCATOR_OPS]}
        active={opTab}
        onChange={(i) => { setOpTab(i); setAmount(''); setReallocFields({ fromGranite: '', fromZest: '', toGranite: '', toZest: '' }); tx.reset() }}
        size="sm"
      />

      <div className="text-xs text-text-dim bg-surface-alt/60 rounded-xl p-3 flex items-center gap-2 border border-border-subtle">
        <svg className="w-3.5 h-3.5 shrink-0 text-text-dim" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        Allocator-only operations. Only the address set via <span className="font-mono text-text-muted">set-vault-allocator</span> can execute these.
      </div>

      {/* Current balances context */}
      <div className="bg-surface-alt/60 rounded-xl p-3 space-y-1.5 text-xs border border-border-subtle">
        <div className="flex justify-between">
          <span className="text-text-dim">Idle</span>
          <span className="font-mono text-text-muted">{micro(vault.idleBookkeeping)} USDCx</span>
        </div>
        <div className="flex justify-between">
          <span className="text-text-dim">Granite</span>
          <span className="font-mono text-text-muted">{micro(vault.allocGranite)} USDCx</span>
        </div>
        <div className="flex justify-between">
          <span className="text-text-dim">Zest V2</span>
          <span className="font-mono text-text-muted">{micro(vault.allocZest)} USDCx</span>
        </div>
      </div>

      {isReallocate ? (
        <div className="space-y-3">
          <div className="text-xs text-text-dim">
            Zero-sum rebalance: total recalled must equal total deployed.
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs text-text-muted font-medium">From Granite</label>
              <input
                type="number" min="0" step="any" placeholder="0.00"
                value={reallocFields.fromGranite}
                onChange={(e) => { setReallocFields(f => ({ ...f, fromGranite: e.target.value })); if (tx.status !== 'idle') tx.reset() }}
                className="w-full bg-surface-alt/80 border border-border-subtle rounded-xl px-3 py-2 text-sm font-mono focus:outline-none focus:border-primary transition-all duration-200"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-text-muted font-medium">From Zest V2</label>
              <input
                type="number" min="0" step="any" placeholder="0.00"
                value={reallocFields.fromZest}
                onChange={(e) => { setReallocFields(f => ({ ...f, fromZest: e.target.value })); if (tx.status !== 'idle') tx.reset() }}
                className="w-full bg-surface-alt/80 border border-border-subtle rounded-xl px-3 py-2 text-sm font-mono focus:outline-none focus:border-primary transition-all duration-200"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-text-muted font-medium">To Granite</label>
              <input
                type="number" min="0" step="any" placeholder="0.00"
                value={reallocFields.toGranite}
                onChange={(e) => { setReallocFields(f => ({ ...f, toGranite: e.target.value })); if (tx.status !== 'idle') tx.reset() }}
                className="w-full bg-surface-alt/80 border border-border-subtle rounded-xl px-3 py-2 text-sm font-mono focus:outline-none focus:border-primary transition-all duration-200"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-text-muted font-medium">To Zest V2</label>
              <input
                type="number" min="0" step="any" placeholder="0.00"
                value={reallocFields.toZest}
                onChange={(e) => { setReallocFields(f => ({ ...f, toZest: e.target.value })); if (tx.status !== 'idle') tx.reset() }}
                className="w-full bg-surface-alt/80 border border-border-subtle rounded-xl px-3 py-2 text-sm font-mono focus:outline-none focus:border-primary transition-all duration-200"
              />
            </div>
          </div>
        </div>
      ) : (
        <AmountInput
          amount={amount}
          setAmount={(v) => { setAmount(v); if (tx.status !== 'idle') tx.reset() }}
          label="Amount (USDCx)"
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

function OwnerPanel({ onTxConfirm }: { onTxConfirm: () => void }) {
  const [opTab, setOpTab] = useState(0)
  const [inputValue, setInputValue] = useState('')
  const { connected, stxAddress, connect } = useWallet()
  const tx = useTransact()
  const pending = usePendingTx(onTxConfirm)

  const op = OWNER_OPS[opTab]

  // Whether the input is a number (fee/buffer) or principal
  const isNumericInput = op === 'Set Fee' || op === 'Set Idle Buffer'

  const inputLabel = useMemo(() => {
    switch (op) {
      case 'Set Allocator': return 'New allocator principal'
      case 'Set Owner': return 'New owner principal'
      case 'Register Granite': return 'Adapter principal (blank for default)'
      case 'Register Zest': return 'Adapter principal (blank for default)'
      case 'Set Fee': return 'Fee (basis points, e.g. 1000 = 10%)'
      case 'Set Fee Recipient': return 'Fee recipient principal'
      case 'Set Idle Buffer': return 'Idle buffer (basis points, e.g. 500 = 5%)'
      default: return 'Value'
    }
  }, [op])

  const inputPlaceholder = useMemo(() => {
    switch (op) {
      case 'Set Allocator':
      case 'Set Owner':
      case 'Set Fee Recipient':
        return 'SP...'
      case 'Register Granite': return VAULT_V3_CONTRACTS.adapterGranite
      case 'Register Zest': return VAULT_V3_CONTRACTS.adapterZestV2
      case 'Set Fee': return '1000'
      case 'Set Idle Buffer': return '500'
      default: return ''
    }
  }, [op])

  const handleSubmit = useCallback(async () => {
    if (!stxAddress) return

    await tx.execute(async () => {
      switch (op) {
        case 'Set Allocator':
          if (!inputValue) throw new Error('Principal required')
          return DeltaVaultV3.encodeSetVaultAllocator(inputValue)
        case 'Set Owner':
          if (!inputValue) throw new Error('Principal required')
          return DeltaVaultV3.encodeSetVaultOwner(inputValue)
        case 'Register Granite':
          return DeltaVaultV3.encodeRegisterAdapterGranite(inputValue || undefined)
        case 'Register Zest':
          return DeltaVaultV3.encodeRegisterAdapterZestV2(inputValue || undefined)
        case 'Set Fee': {
          const bps = parseInt(inputValue, 10)
          if (isNaN(bps) || bps < 0) throw new Error('Invalid basis points')
          return DeltaVaultV3.encodeSetFeeBps(BigInt(bps))
        }
        case 'Set Fee Recipient':
          if (!inputValue) throw new Error('Principal required')
          return DeltaVaultV3.encodeSetFeeRecipient(inputValue)
        case 'Set Idle Buffer': {
          const bps = parseInt(inputValue, 10)
          if (isNaN(bps) || bps < 0) throw new Error('Invalid basis points')
          return DeltaVaultV3.encodeSetIdleBuffer(BigInt(bps))
        }
      }
    })
  }, [stxAddress, inputValue, op, tx])

  useEffect(() => {
    if (tx.status === 'submitted' && tx.txId) pending.addTx(tx.txId)
  }, [tx.status, tx.txId, pending])

  const needsInput = op !== 'Register Granite' && op !== 'Register Zest'

  return (
    <div className="glass-card rounded-xl p-5 space-y-4">
      <Tabs
        tabs={[...OWNER_OPS]}
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
