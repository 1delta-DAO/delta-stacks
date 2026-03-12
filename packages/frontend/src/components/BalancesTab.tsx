import { useTokenList } from '../hooks/useTokenList'
import { useBalances } from '../hooks/useBalances'
import type { StacksToken } from '@delta-stacks/data-provision'
import { useWallet } from '../context/WalletContext'

function formatBalance(raw: bigint, decimals: number): string {
  if (raw === 0n) return '0'
  const divisor = 10n ** BigInt(decimals)
  const whole = raw / divisor
  const frac = raw % divisor
  if (frac === 0n) return whole.toLocaleString()
  const fracStr = frac.toString().padStart(decimals, '0').replace(/0+$/, '')
  // Show up to 6 decimal places
  const trimmed = fracStr.slice(0, 6)
  return `${whole.toLocaleString()}.${trimmed}`
}

function TokenRow({
  token,
  balance,
  connected,
}: {
  token: StacksToken
  balance: bigint | null
  connected: boolean
}) {
  const displayBalance =
    !connected ? '--' : balance === null ? '--' : formatBalance(balance, token.decimals)

  const hasBalance = connected && balance !== null && balance > 0n

  return (
    <div className="flex items-center gap-3 px-4 py-3.5 table-row-hover rounded-lg group">
      <div className="relative">
        <img
          src={token.logoURI}
          alt={token.symbol}
          className="w-9 h-9 rounded-full bg-surface-alt ring-2 ring-border-subtle group-hover:ring-border transition-all duration-200"
          onError={(e) => {
            ;(e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${token.symbol}&background=2e2e4a&color=eaeaf4&size=36&bold=true`
          }}
        />
        {hasBalance && (
          <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-positive border-2 border-surface" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-sm">{token.symbol}</div>
        <div className="text-xs text-text-dim truncate">{token.name}</div>
      </div>
      <div className="text-right">
        <div className={`text-sm font-mono ${hasBalance ? 'text-text' : 'text-text-muted'}`}>
          {displayBalance}
        </div>
      </div>
    </div>
  )
}

/** Virtual STX token entry (STX is native, not in the fungible token list) */
const STX_TOKEN: StacksToken = {
  chainId: 'stacks',
  decimals: 6,
  name: 'Stacks',
  address: 'STX',
  symbol: 'STX',
  logoURI: 'https://assets.coingecko.com/coins/images/2069/small/Stacks_logo_full.png',
}

export function BalancesTab() {
  const { tokenList, loading: tokensLoading } = useTokenList()
  const { balances, loading: balancesLoading } = useBalances()
  const { connected } = useWallet()

  if (tokensLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="flex items-center gap-3 text-text-muted">
          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span className="text-sm">Loading token list...</span>
        </div>
      </div>
    )
  }

  /** Look up a fungible token balance by its contract principal */
  function getTokenBalance(token: StacksToken): bigint | null {
    if (!connected) return null
    if (token.address === 'STX') return balances.stx
    // Try exact match
    const entry = balances.fungible[token.address]
    if (entry) return entry.balance
    // Try case-insensitive
    const lower = token.address.toLowerCase()
    for (const [key, val] of Object.entries(balances.fungible)) {
      if (key.toLowerCase() === lower) return val.balance
    }
    return 0n
  }

  const mainTokens = tokenList.mainTokens
    .map((key) => tokenList.list[key])
    .filter(Boolean)

  const otherTokens = Object.values(tokenList.list)
    .filter((t) => !tokenList.mainTokens.includes(t.address.toLowerCase()))
    .sort((a, b) => a.symbol.localeCompare(b.symbol))

  // Only show other tokens that have a balance (when connected)
  const otherWithBalance = connected
    ? otherTokens.filter((t) => {
        const bal = getTokenBalance(t)
        return bal !== null && bal > 0n
      })
    : otherTokens.slice(0, 20) // show first 20 when disconnected

  return (
    <div className="space-y-5">
      {!connected && (
        <div className="glass-card rounded-xl p-5 text-center">
          <p className="text-text-muted text-sm">Connect your wallet to see balances</p>
        </div>
      )}

      {balancesLoading && connected && (
        <div className="flex items-center justify-center py-2 gap-2 text-text-muted">
          <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span className="text-xs">Fetching balances...</span>
        </div>
      )}

      <div>
        <h3 className="text-xs font-semibold text-text-dim uppercase tracking-wider mb-2 px-4">
          Main Tokens
        </h3>
        <div className="glass-card rounded-xl overflow-hidden divide-y divide-border-subtle">
          <TokenRow token={STX_TOKEN} balance={connected ? balances.stx : null} connected={connected} />
          {mainTokens.map((token) => (
            <TokenRow
              key={token.address}
              token={token}
              balance={getTokenBalance(token)}
              connected={connected}
            />
          ))}
        </div>
      </div>

      {otherWithBalance.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-text-dim uppercase tracking-wider mb-2 px-4">
            {connected ? 'Other Tokens with Balance' : 'All Tokens'}{' '}
            <span className="text-text-muted font-normal">({otherWithBalance.length})</span>
          </h3>
          <div className="glass-card rounded-xl overflow-hidden divide-y divide-border-subtle max-h-96 overflow-y-auto">
            {otherWithBalance.map((token) => (
              <TokenRow
                key={token.address}
                token={token}
                balance={getTokenBalance(token)}
                connected={connected}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
