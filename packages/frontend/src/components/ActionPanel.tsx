import { useState, useMemo, useCallback, useEffect } from 'react'
import { Tabs } from './Tabs'
import { useWallet } from '../context/useWallet'
import { useTransact } from '../hooks/useTransact'
import { usePendingTx } from '../hooks/usePendingTx'
import { useBalances } from '../hooks/useBalances'
import type { UnifiedMarket } from './LendingTab'
import type { AllUserData } from '@delta-stacks/data-provision'
import {
  deposit,
  withdraw,
  borrow,
  repay,
  Lender,
  ZEST_V1_CONTRACTS,
  GraniteLending,
  GRANITE_MARKETS,
} from '@delta-stacks/calldata-sdk-stacks'
import type { AssetOracleLp } from '@delta-stacks/calldata-sdk-stacks'

import graniteLogo from '../assets/granite.png'
import zestLogo from '../assets/zest.png'
import { getTokenIcon } from '../utils/tokenIcons'

const OPERATIONS = ['Deposit', 'Withdraw', 'Borrow', 'Repay'] as const
const COLLATERAL_OPERATIONS = ['Deposit', 'Withdraw'] as const
const PCT_BUTTONS = [25, 50, 75, 100] as const

interface Props {
  market: UnifiedMarket
  userData: AllUserData
  v1PositionAssets?: AssetOracleLp[]
  onClose: () => void
}

/** Look up wallet balance for a market's underlying token (human-readable units). */
function getWalletBalance(
  market: UnifiedMarket,
  balances: { stx: bigint; fungible: Record<string, { balance: bigint }> },
): number {
  const decimals = market.decimals ?? 6

  // STX (native) — V1 wstx or V2 vault-stx
  const sym = market.symbol.toLowerCase()
  if (sym === 'stx' || sym === 'wstx') {
    return Number(balances.stx) / 10 ** 6
  }

  // SIP-10 token — look up by underlying principal
  const principal = market.underlying ?? market.collateralToken
  if (principal) {
    // Case-insensitive match — Hiro keys may differ in casing
    const key = Object.keys(balances.fungible).find(
      (k) => k.toLowerCase() === principal.toLowerCase(),
    )
    if (key) {
      return Number(balances.fungible[key].balance) / 10 ** decimals
    }
  }

  return 0
}

/** Map LenderKey to AllUserData field */
const LENDER_TO_DATA_KEY: Record<string, keyof AllUserData> = {
  'zest-v1': 'v1',
  'zest-v2': 'v2',
  'granite-aeusdc': 'granite-aeusdc',
  'granite-usdcx': 'granite-usdcx',
}

interface PositionInfo {
  deposits: number
  debt: number
  withdrawable: number
  borrowable: number
  totalDepositsUSD: number
  totalDebtUSD: number
}

const EMPTY_POSITION: PositionInfo = { deposits: 0, debt: 0, withdrawable: 0, borrowable: 0, totalDepositsUSD: 0, totalDebtUSD: 0 }

/** Find user's position amounts (deposits, debt, withdrawable, borrowable) for a specific market. */
function getUserPosition(
  market: UnifiedMarket,
  userData: AllUserData,
): PositionInfo {
  const dataKey = LENDER_TO_DATA_KEY[market.lender]
  const lenderData = dataKey ? userData[dataKey] : undefined
  if (!lenderData) return EMPTY_POSITION

  const pool = lenderData.data[0]
  if (!pool) return EMPTY_POSITION

  const totalDepositsUSD = pool.balanceData.deposits
  const totalDebtUSD = pool.balanceData.debt

  for (const pos of pool.positions) {
    if (pos.marketUid === market.marketUid) {
      return {
        deposits: Number(pos.deposits) || 0,
        debt: (Number(pos.debt) || 0) + (Number(pos.debtStable) || 0),
        withdrawable: Number(pos.withdrawable) || 0,
        borrowable: Number(pos.borrowable) || 0,
        totalDepositsUSD,
        totalDebtUSD,
      }
    }
  }
  return { ...EMPTY_POSITION, totalDepositsUSD, totalDebtUSD }
}

/** Format a human-readable amount to appropriate precision. */
function formatAmount(n: number, decimals = 6): string {
  if (n === 0) return '0'
  if (n >= 1000) return n.toFixed(2)
  if (n >= 1) return n.toFixed(4)
  return n.toFixed(Math.min(decimals, 8))
}

function formatUSD(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000) return `$${(n / 1_000).toFixed(2)}K`
  if (n >= 0.01) return `$${n.toFixed(2)}`
  if (n > 0) return `$${n.toFixed(4)}`
  return '$0.00'
}

function getLenderIcon(protocol: string): string | null {
  if (protocol.startsWith('Granite')) return graniteLogo
  if (protocol.startsWith('Zest')) return zestLogo
  return null
}

export function ActionPanel({ market, userData, v1PositionAssets = [], onClose }: Props) {
  const [opTab, setOpTab] = useState(0)
  const [amount, setAmount] = useState('')
  const { connected, stxAddress, connect } = useWallet()
  const tx = useTransact()
  const pending = usePendingTx()
  const { balances } = useBalances()

  const ops = market.isCollateral ? COLLATERAL_OPERATIONS : OPERATIONS
  const op = ops[opTab]
  const pendingBlocked = pending.hasPending && (op === 'Withdraw' || op === 'Borrow')

  const walletBalance = useMemo(() => getWalletBalance(market, balances), [market, balances])
  const position = useMemo(() => getUserPosition(market, userData), [market, userData])

  /** Max amount for the current operation (human-readable). */
  const maxAmount = useMemo((): number | null => {
    switch (op) {
      case 'Deposit':
        return walletBalance
      case 'Withdraw':
        return position.withdrawable > 0 ? position.withdrawable : position.deposits
      case 'Repay':
        if (position.debt === 0) return 0
        return Math.min(walletBalance, position.debt)
      case 'Borrow':
        return position.borrowable > 0 ? position.borrowable : null
      default:
        return null
    }
  }, [op, walletBalance, position])

  const setPercent = useCallback(
    (pct: number) => {
      if (maxAmount == null || maxAmount <= 0) return
      const val = (maxAmount * pct) / 100
      // Use full precision for 100%, otherwise trim to 6 significant decimals
      setAmount(pct === 100 ? String(maxAmount) : val.toPrecision(6))
      if (tx.status !== 'idle') tx.reset()
    },
    [maxAmount, tx],
  )

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
          return buildWithdraw(market, amtSmallest, stxAddress, v1PositionAssets)
        case 'Borrow':
          return buildBorrow(market, amtSmallest, stxAddress, v1PositionAssets)
        case 'Repay':
          return buildRepay(market, amtSmallest, stxAddress)
      }
    })
  }, [stxAddress, amount, market, op, tx, v1PositionAssets])

  // Track submitted txs as pending
  useEffect(() => {
    if (tx.status === 'submitted' && tx.txId) {
      pending.addTx(tx.txId)
    }
  }, [tx.status, tx.txId, pending])

  const amtExceedsMax = maxAmount != null && parseFloat(amount) > maxAmount
  const lenderIcon = getLenderIcon(market.protocol)

  return (
    <div className="glass-card rounded-xl p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="relative">
            <img
              src={getTokenIcon(market.symbol)}
              alt={market.symbol}
              className="w-7 h-7 rounded-full bg-surface-alt ring-1 ring-border-subtle"
              onError={(e) => {
                ;(e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${market.symbol}&background=2e2e4a&color=eaeaf4&size=36&bold=true`
              }}
            />
            {lenderIcon && (
              <img src={lenderIcon} alt={market.protocol} className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full ring-1 ring-surface" />
            )}
          </div>
          <div>
            <h3 className="font-semibold text-sm">{market.symbol}</h3>
            <span className="text-text-dim text-[11px]">{market.protocol}</span>
          </div>
        </div>
        <button
          onClick={onClose}
          className="w-7 h-7 flex items-center justify-center rounded-lg text-text-dim hover:text-text hover:bg-surface-hover transition-all duration-200"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Operation tabs */}
      <Tabs
        tabs={[...ops]}
        active={opTab}
        onChange={(i) => {
          setOpTab(i)
          setAmount('')
          tx.reset()
        }}
        size="sm"
      />

      {/* Pending tx warning */}
      {pendingBlocked && (
        <div className="text-xs text-warning bg-warning-dim rounded-lg p-3 flex items-center gap-2">
          <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
          {op} is disabled while {pending.pendingCount} transaction{pending.pendingCount > 1 ? 's are' : ' is'} pending confirmation.
        </div>
      )}

      {/* Amount input */}
      {!pendingBlocked && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-xs text-text-muted font-medium">Amount ({market.symbol})</label>
            {maxAmount != null && (
              <span className="text-[11px] text-text-dim">
                {op === 'Deposit' ? 'Wallet' : op === 'Withdraw' ? 'Withdrawable' : op === 'Borrow' ? 'Borrowable' : 'Max'}: <span className="font-mono text-text-muted">{formatAmount(maxAmount, market.decimals)}</span>
              </span>
            )}
          </div>
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
            className={`w-full bg-surface-alt/80 border rounded-xl px-4 py-3 text-sm font-mono focus:outline-none transition-all duration-200 ${
              amtExceedsMax ? 'border-negative' : 'border-border-subtle focus:border-primary'
            }`}
          />

          {/* Percentage quick-select buttons */}
          {maxAmount != null && maxAmount > 0 && (
            <div className="flex gap-1.5">
              {PCT_BUTTONS.map((pct) => (
                <button
                  key={pct}
                  onClick={() => setPercent(pct)}
                  className="flex-1 py-1.5 text-xs rounded-lg bg-surface-alt hover:bg-surface-hover text-text-muted hover:text-text transition-all duration-200 font-mono border border-transparent hover:border-border-subtle"
                >
                  {pct}%
                </button>
              ))}
            </div>
          )}

          {amtExceedsMax && (
            <div className="text-xs text-negative flex items-center gap-1.5">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01" />
              </svg>
              Exceeds {op === 'Deposit' ? 'wallet balance' : op === 'Withdraw' ? 'withdrawable amount' : op === 'Borrow' ? 'borrowable amount' : 'available amount'}
            </div>
          )}

          {/* Position context */}
          {connected && (op === 'Withdraw' || op === 'Borrow' || op === 'Repay') && (
            <div className="bg-surface-alt/60 rounded-xl p-3 space-y-1.5 text-xs border border-border-subtle">
              {op === 'Withdraw' && (
                <>
                  <div className="flex justify-between">
                    <span className="text-text-dim">Deposited</span>
                    <span className="font-mono text-text-muted">{formatAmount(position.deposits, market.decimals)} {market.symbol}</span>
                  </div>
                  {position.totalDepositsUSD > 0 && (
                    <div className="flex justify-between">
                      <span className="text-text-dim">Total deposits</span>
                      <span className="font-mono text-text-muted">{formatUSD(position.totalDepositsUSD)}</span>
                    </div>
                  )}
                </>
              )}
              {op === 'Borrow' && position.totalDebtUSD > 0 && (
                <div className="flex justify-between">
                  <span className="text-text-dim">Current debt</span>
                  <span className="font-mono text-negative">{formatUSD(position.totalDebtUSD)}</span>
                </div>
              )}
              {op === 'Repay' && (
                <>
                  <div className="flex justify-between">
                    <span className="text-text-dim">Debt</span>
                    <span className="font-mono text-negative">{formatAmount(position.debt, market.decimals)} {market.symbol}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-text-dim">Wallet</span>
                    <span className="font-mono text-text-muted">{formatAmount(walletBalance, market.decimals)} {market.symbol}</span>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Market info */}
          <div className="flex justify-between text-xs text-text-dim px-1">
            <span>Supply APR: <span className="text-positive font-mono">{formatRate(market.supplyRate)}</span></span>
            <span>Borrow APR: <span className="text-negative font-mono">{formatRate(market.borrowRate)}</span></span>
          </div>

          {/* Action button */}
          {!connected ? (
            <button
              onClick={connect}
              className="w-full py-3 text-sm rounded-xl bg-gradient-to-r from-primary to-primary-hover text-white font-medium transition-all duration-200 hover:shadow-lg hover:shadow-primary/20 hover:-translate-y-px active:translate-y-0"
            >
              Connect Wallet
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={!amount || amtExceedsMax || tx.status === 'building' || tx.status === 'signing'}
              className="w-full py-3 text-sm rounded-xl bg-gradient-to-r from-primary to-primary-hover text-white font-medium transition-all duration-200 hover:shadow-lg hover:shadow-primary/20 hover:-translate-y-px active:translate-y-0 disabled:opacity-40 disabled:hover:shadow-none disabled:hover:translate-y-0 disabled:cursor-not-allowed"
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
    case 'granite-aeusdc':
    case 'granite-usdcx':
      if (!m.graniteMarketId) throw new Error('Missing Granite market ID')
      if (m.isCollateral) {
        if (!m.collateralToken) throw new Error('Missing collateral token')
        const market = GRANITE_MARKETS[m.graniteMarketId]
        return GraniteLending.encodeAddCollateral(market, m.collateralToken, amount, sender)
      }
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

async function buildWithdraw(m: UnifiedMarket, amount: bigint, sender: string, v1Assets: AssetOracleLp[]) {
  switch (m.lender) {
    case 'zest-v1':
      if (!m.v1Asset) throw new Error('Missing V1 asset info')
      if (!m.v1Asset.oracle) throw new Error(`Missing oracle for ${m.symbol}`)
      if (!m.v1Asset.lpToken) throw new Error(`Missing lpToken for ${m.symbol}`)
      return withdraw({
        lender: Lender.ZestV1,
        amount,
        poolReserve: ZEST_V1_CONTRACTS.poolReserve,
        asset: m.v1Asset.underlying,
        lpToken: m.v1Asset.lpToken,
        oracle: m.v1Asset.oracle,
        assets: v1Assets,
        owner: sender,
      })
    case 'zest-v2':
      if (!m.v2Vault) throw new Error('Missing V2 vault')
      return withdraw({ lender: Lender.ZestV2, amount, vault: m.v2Vault, receiver: sender })
    case 'granite-aeusdc':
    case 'granite-usdcx':
      if (!m.graniteMarketId) throw new Error('Missing Granite market ID')
      if (m.isCollateral) {
        if (!m.collateralToken) throw new Error('Missing collateral token')
        const market = GRANITE_MARKETS[m.graniteMarketId]
        const priceFeed = await GraniteLending.fetchPriceFeedData(m.graniteMarketId)
        return GraniteLending.encodeRemoveCollateral(market, m.collateralToken, amount, sender, priceFeed)
      }
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

function buildBorrow(m: UnifiedMarket, amount: bigint, sender: string, v1Assets: AssetOracleLp[]) {
  switch (m.lender) {
    case 'zest-v1':
      if (!m.v1Asset) throw new Error('Missing V1 asset info')
      if (!m.v1Asset.oracle) throw new Error(`Missing oracle for ${m.symbol}`)
      if (!m.v1Asset.lpToken) throw new Error(`Missing lpToken for ${m.symbol}`)
      return borrow({
        lender: Lender.ZestV1,
        amount,
        poolReserve: ZEST_V1_CONTRACTS.poolReserve,
        oracle: m.v1Asset.oracle,
        assetToBorrow: m.v1Asset.underlying,
        lpToken: m.v1Asset.lpToken,
        assets: v1Assets,
        feeCalculator: ZEST_V1_CONTRACTS.feeCalculator,
        interestRateMode: 1, // variable rate
        owner: sender,
      })
    case 'zest-v2':
      if (!m.v2Vault) throw new Error('Missing V2 vault')
      return borrow({ lender: Lender.ZestV2, amount, vault: m.v2Vault })
    case 'granite-aeusdc':
    case 'granite-usdcx':
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
    case 'granite-aeusdc':
    case 'granite-usdcx':
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
