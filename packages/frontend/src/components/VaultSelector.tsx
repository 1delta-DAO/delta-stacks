import { type VaultDef } from '../config/vaults'
import { getTokenIcon } from '../utils/tokenIcons'
import { useVaultStateV3 } from '../hooks/useVaultStateV3'
import { useVaultStateSTX } from '../hooks/useVaultStateSTX'

function formatTvl(n: bigint, decimals = 6): string {
  const num = Number(n) / 10 ** decimals
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(2)}M`
  if (num >= 1_000) return `${(num / 1_000).toFixed(2)}K`
  if (num >= 1) return num.toFixed(2)
  return num.toFixed(decimals)
}

function pct(n: number): string {
  return n.toFixed(2) + '%'
}

interface VaultTileData {
  tvl: bigint
  sharePrice: number
  blendedApr: number
  loading: boolean
}

function useVaultTileData(vault: VaultDef): VaultTileData {
  const usdcx = useVaultStateV3()
  const stx = useVaultStateSTX()

  if (vault.id === 'stx') {
    return {
      tvl: stx.state.liveTotal,
      sharePrice: stx.state.sharePrice,
      blendedApr: stx.state.blendedApr,
      loading: stx.loading,
    }
  }
  return {
    tvl: usdcx.state.liveTotal,
    sharePrice: usdcx.state.sharePrice,
    blendedApr: usdcx.state.blendedApr,
    loading: usdcx.loading,
  }
}

function VaultTile({ vault, onClick }: { vault: VaultDef; onClick: () => void }) {
  const { tvl, sharePrice, blendedApr, loading } = useVaultTileData(vault)

  return (
    <button
      onClick={onClick}
      className="glass-card rounded-xl p-5 text-left hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5 transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 border border-border-subtle w-full"
    >
      <div className="flex items-center gap-3 mb-4">
        <img
          src={getTokenIcon(vault.asset)}
          alt={vault.asset}
          className="w-10 h-10 rounded-full bg-surface-alt ring-2 ring-border-subtle"
          onError={(e) => {
            ;(e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${vault.asset}&background=2e2e4a&color=eaeaf4&size=40&bold=true`
          }}
        />
        <div>
          <h3 className="text-sm font-semibold">{vault.name}</h3>
          <span className="text-[11px] text-text-dim">{vault.symbol}</span>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <div className="text-[10px] text-text-dim uppercase tracking-wider font-semibold mb-0.5">TVL</div>
          <div className="font-mono text-sm">
            {loading ? '...' : `${formatTvl(tvl)} ${vault.asset}`}
          </div>
        </div>
        <div>
          <div className="text-[10px] text-text-dim uppercase tracking-wider font-semibold mb-0.5">Share Price</div>
          <div className="font-mono text-sm">
            {loading ? '...' : sharePrice.toFixed(6)}
          </div>
        </div>
        <div>
          <div className="text-[10px] text-text-dim uppercase tracking-wider font-semibold mb-0.5">APR</div>
          <div className={`font-mono text-sm ${blendedApr > 0 ? 'text-positive' : ''}`}>
            {loading ? '...' : pct(blendedApr)}
          </div>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2 text-[11px] text-text-dim">
        <span>Markets:</span>
        <div className="flex items-center gap-1">
          <img src={vault.market1Logo} alt={vault.market1Label} className="w-3.5 h-3.5 rounded-full" />
          <span>{vault.market1Label}</span>
        </div>
        <span>+</span>
        <div className="flex items-center gap-1">
          <img src={vault.market2Logo} alt={vault.market2Label} className="w-3.5 h-3.5 rounded-full" />
          <span>{vault.market2Label}</span>
        </div>
      </div>
    </button>
  )
}

export function VaultSelector({
  vaults,
  onSelect,
}: {
  vaults: VaultDef[]
  onSelect: (v: VaultDef) => void
}) {
  return (
    <div className="space-y-4">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-text-dim">Select a Vault</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {vaults.map((v) => (
          <VaultTile key={v.id} vault={v} onClick={() => onSelect(v)} />
        ))}
      </div>
    </div>
  )
}
