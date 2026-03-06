import { useTokenList } from '../hooks/useTokenList'
import type { StacksToken } from '@delta-stacks/data-provision'
import { useWallet } from '../context/WalletContext'

function TokenRow({ token }: { token: StacksToken }) {
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
        <div className="text-sm font-mono">--</div>
        <div className="text-xs text-text-muted">Balance</div>
      </div>
    </div>
  )
}

export function BalancesTab() {
  const { tokenList, loading } = useTokenList()
  const { connected } = useWallet()

  if (loading) {
    return <div className="text-center py-12 text-text-muted">Loading token list...</div>
  }

  const mainTokens = tokenList.mainTokens
    .map((key) => tokenList.list[key])
    .filter(Boolean)

  const otherTokens = Object.values(tokenList.list)
    .filter((t) => !tokenList.mainTokens.includes(t.address.toLowerCase()))
    .sort((a, b) => a.symbol.localeCompare(b.symbol))

  return (
    <div className="space-y-4">
      {!connected && (
        <div className="bg-surface border border-border rounded-lg p-4 text-center text-text-muted text-sm">
          Connect your wallet to see balances
        </div>
      )}

      <div>
        <h3 className="text-sm font-medium text-text-muted mb-2 px-4">Main Tokens</h3>
        <div className="bg-surface rounded-lg border border-border divide-y divide-border">
          {mainTokens.map((token) => (
            <TokenRow key={token.address} token={token} />
          ))}
        </div>
      </div>

      {otherTokens.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-text-muted mb-2 px-4">
            All Tokens ({otherTokens.length})
          </h3>
          <div className="bg-surface rounded-lg border border-border divide-y divide-border max-h-96 overflow-y-auto">
            {otherTokens.map((token) => (
              <TokenRow key={token.address} token={token} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
