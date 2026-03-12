import { useState, useMemo, useCallback, useEffect } from 'react'
import { Tabs } from './Tabs'
import { useWallet } from '../context/WalletContext'
import { useTransact } from '../hooks/useTransact'
import { usePendingTx } from '../hooks/usePendingTx'
import { useBalances, type Balances } from '../hooks/useBalances'
import { useVaultState, type VaultState } from '../hooks/useVaultState'
import {
  DeltaVault,
  VAULT_CONTRACTS,
  VAULT_UNDERLYING,
} from '@delta-stacks/calldata-sdk-stacks'

// ---------------------------------------------------------------------------
// Vault operations
// ---------------------------------------------------------------------------

const USER_OPS = ['Deposit', 'Withdraw', 'Redeem'] as const
const ALLOCATOR_OPS = ['Deploy Granite', 'Deploy Zest', 'Rebalance G→Z', 'Rebalance Z→G'] as const
const OWNER_OPS = ['Set Allocator', 'Register Granite', 'Register Zest'] as const

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

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function VaultTab() {
  const [roleTab, setRoleTab] = useState(0)
  const { state: vault, loading, refresh: refreshVault } = useVaultState()
  const { balances, refresh: refreshBalances } = useBalances()

  /** Called when any pending tx confirms — refresh both user balances and vault state */
  const onTxConfirm = useCallback(() => {
    refreshBalances()
    refreshVault()
  }, [refreshBalances, refreshVault])

  return (
    <div className="space-y-4">
      {/* Vault overview header */}
      <div className="bg-surface border border-border rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-medium">Delta USDCx Vault (dUSDCx)</h2>
          {!loading && vault.blendedApr > 0 && (
            <span className="text-sm font-mono text-positive">
              {pct(vault.blendedApr)} APR
            </span>
          )}
        </div>

        {/* Key metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <InfoItem label="TVL" value={loading ? '...' : `${micro(vault.liveTotal)} USDCx`} />
          <InfoItem label="Share price" value={loading ? '...' : `${vault.sharePrice.toFixed(6)}`} />
          <InfoItem label="Total shares" value={loading ? '...' : micro(vault.totalSupply)} />
          <InfoItem
            label="Unrealized yield"
            value={loading ? '...' : `${micro(vault.unrealizedYield)} USDCx`}
          />
        </div>
      </div>

      {/* Allocation breakdown */}
      {!loading && <AllocationBar vault={vault} />}

      {/* Role tabs */}
      <Tabs
        tabs={['User', 'Allocator', 'Owner']}
        active={roleTab}
        onChange={setRoleTab}
      />

      {roleTab === 0 && <UserPanel balances={balances} onTxConfirm={onTxConfirm} />}
      {roleTab === 1 && <AllocatorPanel onTxConfirm={onTxConfirm} />}
      {roleTab === 2 && <OwnerPanel onTxConfirm={onTxConfirm} />}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Allocation breakdown bar + table
// ---------------------------------------------------------------------------

function AllocationBar({ vault }: { vault: VaultState }) {
  const total = vault.totalAssets
  const idle = vault.idleBookkeeping
  const granite = vault.allocGranite
  const zest = vault.allocZest

  const idlePct = total > 0n ? Number(idle * 10000n / total) / 100 : 100
  const granitePct = total > 0n ? Number(granite * 10000n / total) / 100 : 0
  const zestPct = total > 0n ? Number(zest * 10000n / total) / 100 : 0

  return (
    <div className="bg-surface border border-border rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-medium">Allocation</h3>
        <span className="text-xs text-text-muted font-mono">{micro(total)} USDCx total</span>
      </div>

      {/* Stacked bar */}
      <div className="h-3 rounded-full overflow-hidden flex bg-surface-alt">
        {granitePct > 0 && (
          <div
            className="h-full bg-blue-500 transition-all"
            style={{ width: `${granitePct}%` }}
            title={`Granite: ${pct(granitePct)}`}
          />
        )}
        {zestPct > 0 && (
          <div
            className="h-full bg-purple-500 transition-all"
            style={{ width: `${zestPct}%` }}
            title={`Zest V2: ${pct(zestPct)}`}
          />
        )}
        {idlePct > 0 && (
          <div
            className="h-full bg-gray-500 transition-all"
            style={{ width: `${idlePct}%` }}
            title={`Idle: ${pct(idlePct)}`}
          />
        )}
      </div>

      {/* Legend + details */}
      <div className="grid grid-cols-3 gap-2 text-xs">
        <div className="space-y-1">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />
            <span className="text-text-muted">Granite</span>
          </div>
          <div className="font-mono pl-3.5">{micro(granite)}</div>
          <div className="text-text-muted pl-3.5">{pct(granitePct)}</div>
          {vault.graniteApr > 0 && (
            <div className="text-positive pl-3.5 font-mono">{pct(vault.graniteApr)} APR</div>
          )}
        </div>

        <div className="space-y-1">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-purple-500 inline-block" />
            <span className="text-text-muted">Zest V2</span>
          </div>
          <div className="font-mono pl-3.5">{micro(zest)}</div>
          <div className="text-text-muted pl-3.5">{pct(zestPct)}</div>
          {vault.zestApr > 0 && (
            <div className="text-positive pl-3.5 font-mono">{pct(vault.zestApr)} APR</div>
          )}
        </div>

        <div className="space-y-1">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-gray-500 inline-block" />
            <span className="text-text-muted">Idle</span>
          </div>
          <div className="font-mono pl-3.5">{micro(idle)}</div>
          <div className="text-text-muted pl-3.5">{pct(idlePct)}</div>
          <div className="text-text-muted pl-3.5 font-mono">0.00% APR</div>
        </div>
      </div>

      {/* Live vs bookkeeping */}
      {vault.unrealizedYield > 0n && (
        <div className="text-xs text-text-muted bg-surface-alt rounded p-2 flex justify-between">
          <span>Live total (incl. unrealized)</span>
          <span className="font-mono">{micro(vault.liveTotal)} USDCx</span>
        </div>
      )}
    </div>
  )
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-text-muted">{label}</div>
      <div className="font-mono text-text">{value}</div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// User Panel — Deposit / Withdraw / Redeem
// ---------------------------------------------------------------------------

function UserPanel({ balances, onTxConfirm }: { balances: Balances; onTxConfirm: () => void }) {
  const [opTab, setOpTab] = useState(0)
  const [amount, setAmount] = useState('')
  const { connected, stxAddress, connect } = useWallet()
  const tx = useTransact()
  const pending = usePendingTx(onTxConfirm)

  const op = USER_OPS[opTab]

  // USDCx wallet balance (human-readable)
  const walletBalance = useMemo(() => {
    const key = Object.keys(balances.fungible).find(
      (k) => k.toLowerCase() === VAULT_UNDERLYING.toLowerCase(),
    )
    if (key) return Number(balances.fungible[key].balance) / 1e6
    return 0
  }, [balances])

  // dUSDCx (vault share) balance
  const shareBalance = useMemo(() => {
    const key = Object.keys(balances.fungible).find(
      (k) => k.toLowerCase() === VAULT_CONTRACTS.vault.toLowerCase(),
    )
    if (key) return Number(balances.fungible[key].balance) / 1e6
    return 0
  }, [balances])

  const maxAmount = useMemo((): number => {
    switch (op) {
      case 'Deposit':
        return walletBalance
      case 'Withdraw':
        return walletBalance // withdrawable amount (approximate)
      case 'Redeem':
        return shareBalance
      default:
        return 0
    }
  }, [op, walletBalance, shareBalance])

  const setPercent = useCallback(
    (pct: number) => {
      if (maxAmount <= 0) return
      const val = (maxAmount * pct) / 100
      setAmount(pct === 100 ? String(maxAmount) : val.toPrecision(6))
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
          return DeltaVault.encodeDeposit(amtSmallest, stxAddress)
        case 'Withdraw':
          return DeltaVault.encodeWithdraw(amtSmallest, stxAddress, stxAddress)
        case 'Redeem':
          return DeltaVault.encodeRedeem(amtSmallest, stxAddress, stxAddress)
      }
    })
  }, [stxAddress, amount, op, tx])

  useEffect(() => {
    if (tx.status === 'submitted' && tx.txId) pending.addTx(tx.txId)
  }, [tx.status, tx.txId, pending])

  const amtExceedsMax = parseFloat(amount) > maxAmount

  return (
    <div className="bg-surface border border-border rounded-lg p-4 space-y-4">
      <Tabs
        tabs={[...USER_OPS]}
        active={opTab}
        onChange={(i) => { setOpTab(i); setAmount(''); tx.reset() }}
        size="sm"
      />

      {/* Position context */}
      {connected && (
        <div className="bg-surface-alt rounded p-2 space-y-1 text-xs text-text-muted">
          <div className="flex justify-between">
            <span>USDCx wallet</span>
            <span className="font-mono">{formatAmount(walletBalance)}</span>
          </div>
          <div className="flex justify-between">
            <span>dUSDCx shares</span>
            <span className="font-mono">{formatAmount(shareBalance)}</span>
          </div>
        </div>
      )}

      {/* Amount input */}
      <AmountInput
        amount={amount}
        setAmount={(v) => { setAmount(v); if (tx.status !== 'idle') tx.reset() }}
        label={op === 'Redeem' ? 'Shares (dUSDCx)' : 'Amount (USDCx)'}
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
// Allocator Panel — Deploy / Rebalance
// ---------------------------------------------------------------------------

function AllocatorPanel({ onTxConfirm }: { onTxConfirm: () => void }) {
  const [opTab, setOpTab] = useState(0)
  const [amount, setAmount] = useState('')
  const { connected, stxAddress, connect } = useWallet()
  const tx = useTransact()
  const pending = usePendingTx(onTxConfirm)

  const op = ALLOCATOR_OPS[opTab]

  const handleSubmit = useCallback(async () => {
    if (!stxAddress || !amount) return
    const amtRaw = parseFloat(amount)
    if (isNaN(amtRaw) || amtRaw <= 0) return
    const amtSmallest = BigInt(Math.floor(amtRaw * 1e6))

    await tx.execute(async () => {
      switch (op) {
        case 'Deploy Granite':
          return DeltaVault.encodeDeployToGranite(amtSmallest)
        case 'Deploy Zest':
          return DeltaVault.encodeDeployToZestV2(amtSmallest)
        case 'Rebalance G→Z':
          return DeltaVault.encodeRebalanceGraniteToZestV2(amtSmallest)
        case 'Rebalance Z→G':
          return DeltaVault.encodeRebalanceZestV2ToGranite(amtSmallest)
      }
    })
  }, [stxAddress, amount, op, tx])

  useEffect(() => {
    if (tx.status === 'submitted' && tx.txId) pending.addTx(tx.txId)
  }, [tx.status, tx.txId, pending])

  return (
    <div className="bg-surface border border-border rounded-lg p-4 space-y-4">
      <Tabs
        tabs={[...ALLOCATOR_OPS]}
        active={opTab}
        onChange={(i) => { setOpTab(i); setAmount(''); tx.reset() }}
        size="sm"
      />

      <div className="text-xs text-text-muted bg-surface-alt rounded p-2">
        Allocator-only operations. Only the address set via <span className="font-mono">set-vault-allocator</span> can execute these.
      </div>

      <AmountInput
        amount={amount}
        setAmount={(v) => { setAmount(v); if (tx.status !== 'idle') tx.reset() }}
        label="Amount (USDCx)"
      />

      <SubmitButton
        connected={connected}
        connect={connect}
        onClick={handleSubmit}
        disabled={!amount || tx.status === 'building' || tx.status === 'signing'}
        tx={tx}
        label={op}
      />

      <TxStatus tx={tx} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Owner Panel — Set Allocator / Register Adapters
// ---------------------------------------------------------------------------

function OwnerPanel({ onTxConfirm }: { onTxConfirm: () => void }) {
  const [opTab, setOpTab] = useState(0)
  const [principal, setPrincipal] = useState('')
  const { connected, stxAddress, connect } = useWallet()
  const tx = useTransact()
  const pending = usePendingTx(onTxConfirm)

  const op = OWNER_OPS[opTab]

  const handleSubmit = useCallback(async () => {
    if (!stxAddress) return

    await tx.execute(async () => {
      switch (op) {
        case 'Set Allocator':
          if (!principal) throw new Error('Principal required')
          return DeltaVault.encodeSetVaultAllocator(principal)
        case 'Register Granite':
          return DeltaVault.encodeRegisterAdapterGranite(
            principal || undefined,
          )
        case 'Register Zest':
          return DeltaVault.encodeRegisterAdapterZestV2(
            principal || undefined,
          )
      }
    })
  }, [stxAddress, principal, op, tx])

  useEffect(() => {
    if (tx.status === 'submitted' && tx.txId) pending.addTx(tx.txId)
  }, [tx.status, tx.txId, pending])

  return (
    <div className="bg-surface border border-border rounded-lg p-4 space-y-4">
      <Tabs
        tabs={[...OWNER_OPS]}
        active={opTab}
        onChange={(i) => { setOpTab(i); setPrincipal(''); tx.reset() }}
        size="sm"
      />

      <div className="text-xs text-text-muted bg-surface-alt rounded p-2">
        Owner-only operations. Only the vault owner can execute these.
      </div>

      {/* Principal input */}
      <div className="space-y-1">
        <label className="text-xs text-text-muted">
          {op === 'Set Allocator' ? 'New allocator principal' : 'Adapter principal (blank for default)'}
        </label>
        <input
          type="text"
          placeholder={op === 'Set Allocator' ? 'SP...' : VAULT_CONTRACTS.adapterGranite}
          value={principal}
          onChange={(e) => { setPrincipal(e.target.value); if (tx.status !== 'idle') tx.reset() }}
          className="w-full bg-surface-alt border border-border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-primary"
        />
      </div>

      <SubmitButton
        connected={connected}
        connect={connect}
        onClick={handleSubmit}
        disabled={(op === 'Set Allocator' && !principal) || tx.status === 'building' || tx.status === 'signing'}
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
        <label className="text-xs text-text-muted">{label}</label>
        {maxAmount != null && maxAmount > 0 && (
          <span className="text-xs text-text-muted">
            Max: <span className="font-mono">{formatAmount(maxAmount)}</span>
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
        className={`w-full bg-surface-alt border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-primary ${
          exceedsMax ? 'border-negative' : 'border-border'
        }`}
      />
      {pctButtons && maxAmount != null && maxAmount > 0 && onPercent && (
        <div className="flex gap-1.5">
          {PCT_BUTTONS.map((pct) => (
            <button
              key={pct}
              onClick={() => onPercent(pct)}
              className="flex-1 py-1 text-xs rounded bg-surface-alt hover:bg-border text-text-muted hover:text-text transition-colors font-mono"
            >
              {pct}%
            </button>
          ))}
        </div>
      )}
      {exceedsMax && (
        <div className="text-xs text-negative">Exceeds available balance</div>
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
        className="w-full py-2 text-sm rounded-lg bg-primary hover:bg-primary-hover text-white font-medium transition-colors"
      >
        Connect Wallet
      </button>
    )
  }
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-full py-2 text-sm rounded-lg bg-primary hover:bg-primary-hover text-white font-medium transition-colors disabled:opacity-50"
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
        <div className="text-xs text-positive bg-surface-alt rounded p-2">
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
        <div className="text-xs text-negative bg-surface-alt rounded p-2">{tx.error}</div>
      )}
    </>
  )
}
