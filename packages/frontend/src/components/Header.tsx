import { useWallet } from '../context/WalletContext'

export function Header() {
  const { connected, stxAddress, connecting, connect, disconnect } = useWallet()

  const truncated = stxAddress
    ? `${stxAddress.slice(0, 6)}...${stxAddress.slice(-4)}`
    : ''

  return (
    <header className="flex items-center justify-between px-6 py-4 border-b border-border">
      <h1 className="text-xl font-bold">Delta Stacks</h1>
      {connected ? (
        <div className="flex items-center gap-3">
          <span className="text-sm text-text-muted font-mono">{truncated}</span>
          <button
            onClick={disconnect}
            className="px-4 py-2 text-sm rounded-lg bg-surface hover:bg-surface-alt border border-border transition-colors"
          >
            Disconnect
          </button>
        </div>
      ) : (
        <button
          onClick={connect}
          disabled={connecting}
          className="px-4 py-2 text-sm rounded-lg bg-primary hover:bg-primary-hover text-white font-medium transition-colors disabled:opacity-50"
        >
          {connecting ? 'Connecting...' : 'Connect Wallet'}
        </button>
      )}
    </header>
  )
}
