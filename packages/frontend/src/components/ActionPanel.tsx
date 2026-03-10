import { useState, useCallback, useEffect } from 'react'
import { Tabs } from './Tabs'
import { useWallet } from '../context/WalletContext'
import { useTransact } from '../hooks/useTransact'
import { usePendingTx } from '../hooks/usePendingTx'
import type { UnifiedMarket } from './LendingTab'
import {
  deposit,
  withdraw,
  borrow,
  repay,
  Lender,
  ZEST_V1_CONTRACTS,
} from '@delta-stacks/calldata-sdk-stacks'

const OPERATIONS = ['Deposit', 'Withdraw', 'Borrow', 'Repay'] as const
type Operation = (typeof OPERATIONS)[number]

interface Props {
  market: UnifiedMarket
  onClose: () => void
}

/** Check if a V1 operation is supported (borrow/withdraw need full position data we don't have) */
function isV1Unsupported(op: Operation): boolean {
  return op === 'Borrow' || op === 'Withdraw'
}

export function ActionPanel({ market, onClose }: Props) {
  const [opTab, setOpTab] = useState(0)
  const [amount, setAmount] = useState('')
  const { connected, stxAddress, connect } = useWallet()
  const tx = useTransact()
  const pending = usePendingTx()

  const op = OPERATIONS[opTab]
  const v1Blocked = market.lender === 'zest-v1' && isV1Unsupported(op)
  const pendingBlocked = pending.hasPending && (op === 'Withdraw' || op === 'Borrow')

  const handleSubmit = useCallback(async () => {
    if (!stxAddress || !amount) return

    const amtRaw = parseFloat(amount)
    if (isNaN(amtRaw) || amtRaw <= 0) return

    // Convert to smallest units using market decimals
    const decimals = market.decimals ?? 6
    const amtSmallest = BigInt(Math.floor(amtRaw * 10 ** decimals))

    await tx.execute(async () => {
      switch (op) {
        case 'Deposit':
          return buildDeposit(market, amtSmallest, stxAddress)
        case 'Withdraw':
          return buildWithdraw(market, amtSmallest, stxAddress)
        case 'Borrow':
          return buildBorrow(market, amtSmallest, stxAddress)
        case 'Repay':
          return buildRepay(market, amtSmallest, stxAddress)
      }
    })
  }, [stxAddress, amount, market, op, tx])

  // Track submitted txs as pending
  useEffect(() => {
    if (tx.status === 'submitted' && tx.txId) {
      pending.addTx(tx.txId)
    }
  }, [tx.status, tx.txId, pending])

  return (
    <div className="bg-surface border border-border rounded-lg p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="font-medium text-sm">
          {market.symbol}
          <span className="text-text-muted text-xs ml-2">{market.protocol}</span>
        </h3>
        <button
          onClick={onClose}
          className="text-text-muted hover:text-text text-lg leading-none px-1"
        >
          x
        </button>
      </div>

      {/* Operation tabs */}
      <Tabs
        tabs={[...OPERATIONS]}
        active={opTab}
        onChange={(i) => {
          setOpTab(i)
          tx.reset()
        }}
        size="sm"
      />

      {/* V1 unsupported warning */}
      {v1Blocked && (
        <div className="text-xs text-text-muted bg-surface-alt rounded p-3">
          {op} for Zest V1 requires full position data not available in the frontend yet.
        </div>
      )}

      {/* Pending tx warning */}
      {!v1Blocked && pendingBlocked && (
        <div className="text-xs text-yellow-400 bg-surface-alt rounded p-3">
          {op} is disabled while {pending.pendingCount} transaction{pending.pendingCount > 1 ? 's are' : ' is'} pending confirmation.
        </div>
      )}

      {/* Amount input */}
      {!v1Blocked && !pendingBlocked && (
        <div className="space-y-2">
          <label className="text-xs text-text-muted block">Amount ({market.symbol})</label>
          <input
            type="number"
            min="0"
            step="any"
            placeholder="0.00"
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value)
              if (tx.status !== 'idle') tx.reset()
            }}
            className="w-full bg-surface-alt border border-border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-primary"
          />

          {/* Market info */}
          <div className="flex justify-between text-xs text-text-muted">
            <span>Supply APR: <span className="text-positive">{formatRate(market.supplyRate)}</span></span>
            <span>Borrow APR: <span className="text-negative">{formatRate(market.borrowRate)}</span></span>
          </div>

          {/* Action button */}
          {!connected ? (
            <button
              onClick={connect}
              className="w-full py-2 text-sm rounded-lg bg-primary hover:bg-primary-hover text-white font-medium transition-colors"
            >
              Connect Wallet
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={!amount || tx.status === 'building' || tx.status === 'signing'}
              className="w-full py-2 text-sm rounded-lg bg-primary hover:bg-primary-hover text-white font-medium transition-colors disabled:opacity-50"
            >
              {tx.status === 'building'
                ? 'Preparing...'
                : tx.status === 'signing'
                  ? 'Confirm in wallet...'
                  : op}
            </button>
          )}

          {/* Status messages */}
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
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Transaction builders - map UnifiedMarket to calldata-sdk-stacks params
// ---------------------------------------------------------------------------

function buildDeposit(m: UnifiedMarket, amount: bigint, sender: string) {
  switch (m.lender) {
    case 'zest-v1':
      if (!m.v1Asset) throw new Error('Missing V1 asset info')
      return deposit({
        lender: Lender.ZestV1,
        amount,
        lpToken: m.v1Asset.lpToken,
        poolReserve: ZEST_V1_CONTRACTS.poolReserve,
        asset: m.v1Asset.underlying,
        owner: sender,
      })
    case 'zest-v2':
      if (!m.v2Vault) throw new Error('Missing V2 vault')
      return deposit({ lender: Lender.ZestV2, amount, vault: m.v2Vault })
    case 'granite':
      if (!m.graniteMarketId) throw new Error('Missing Granite market ID')
      return deposit({
        lender: Lender.Granite,
        amount,
        marketId: m.graniteMarketId,
        recipient: sender,
      })
    default:
      throw new Error(`Unknown lender: ${m.lender}`)
  }
}

function buildWithdraw(m: UnifiedMarket, amount: bigint, sender: string) {
  switch (m.lender) {
    case 'zest-v2':
      if (!m.v2Vault) throw new Error('Missing V2 vault')
      return withdraw({ lender: Lender.ZestV2, amount, vault: m.v2Vault, receiver: sender })
    case 'granite':
      if (!m.graniteMarketId) throw new Error('Missing Granite market ID')
      return withdraw({
        lender: Lender.Granite,
        amount,
        marketId: m.graniteMarketId,
        recipient: sender,
      })
    default:
      throw new Error(`${m.lender} withdraw not supported`)
  }
}

function buildBorrow(m: UnifiedMarket, amount: bigint, _sender: string) {
  switch (m.lender) {
    case 'zest-v2':
      if (!m.v2Vault) throw new Error('Missing V2 vault')
      return borrow({ lender: Lender.ZestV2, amount, vault: m.v2Vault })
    case 'granite':
      if (!m.graniteMarketId) throw new Error('Missing Granite market ID')
      return borrow({ lender: Lender.Granite, amount, marketId: m.graniteMarketId })
    default:
      throw new Error(`${m.lender} borrow not supported`)
  }
}

function buildRepay(m: UnifiedMarket, amount: bigint, sender: string) {
  switch (m.lender) {
    case 'zest-v1':
      if (!m.v1Asset) throw new Error('Missing V1 asset info')
      return repay({
        lender: Lender.ZestV1,
        amount,
        asset: m.v1Asset.underlying,
        onBehalfOf: sender,
        payer: sender,
      })
    case 'zest-v2':
      if (!m.v2Vault) throw new Error('Missing V2 vault')
      return repay({ lender: Lender.ZestV2, amount, vault: m.v2Vault })
    case 'granite':
      if (!m.graniteMarketId) throw new Error('Missing Granite market ID')
      return repay({ lender: Lender.Granite, amount, marketId: m.graniteMarketId })
    default:
      throw new Error(`Unknown lender: ${m.lender}`)
  }
}

function formatRate(rate: number): string {
  if (rate === 0) return '-'
  return `${(rate * 100).toFixed(2)}%`
}
