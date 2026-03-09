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

  return (
    <div className="flex items-center gap-3 px-4 py-3 hover:bg-surface-alt rounded-lg transition-colors">
      <img
        src={token.logoURI}
        alt={token.symbol}
        className="w-8 h-8 rounded-full bg-surface-alt"
        onError={(e) => {
          ;(e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${token.symbol}&background=363649&color=e2e2f0&size=32`
        }}
      />
      <div className="flex-1 min-w-0">
        <div className="font-medium text-sm">{token.symbol}</div>
        <div className="text-xs text-text-muted truncate">{token.name}</div>
      </div>
      <div className="text-right">
        <div className="text-sm font-mono">{displayBalance}</div>
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
    return <div className="text-center py-12 text-text-muted">Loading token list...</div>
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
    <div className="space-y-4">
      {!connected && (
        <div className="bg-surface border border-border rounded-lg p-4 text-center text-text-muted text-sm">
          Connect your wallet to see balances
        </div>
      )}

      {balancesLoading && connected && (
        <div className="text-center py-2 text-text-muted text-xs">Fetching balances...</div>
      )}

      <div>
        <h3 className="text-sm font-medium text-text-muted mb-2 px-4">Main Tokens</h3>
        <div className="bg-surface rounded-lg border border-border divide-y divide-border">
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
          <h3 className="text-sm font-medium text-text-muted mb-2 px-4">
            {connected ? 'Other Tokens with Balance' : 'All Tokens'} ({otherWithBalance.length})
          </h3>
          <div className="bg-surface rounded-lg border border-border divide-y divide-border max-h-96 overflow-y-auto">
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
