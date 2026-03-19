import { useState } from 'react'
import { Header } from './components/Header'
import { Tabs } from './components/Tabs'
import { BalancesTab } from './components/BalancesTab'
import { LendingTab } from './components/LendingTab'
import { VaultTab } from './components/VaultTab'
import { VaultSelector } from './components/VaultSelector'
import { ALL_VAULTS, type VaultDef } from './config/vaults'

const MAIN_TABS = ['Vaults', 'Lending', 'Balances']

function App() {
  const [tab, setTab] = useState(0)
  const [selectedVault, setSelectedVault] = useState<VaultDef | null>(null)

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 max-w-6xl w-full mx-auto px-6 py-6 space-y-6">
        <Tabs tabs={MAIN_TABS} active={tab} onChange={setTab} />
        {tab === 0 && (
          selectedVault
            ? <VaultTab vault={selectedVault} onBack={() => setSelectedVault(null)} />
            : <VaultSelector vaults={ALL_VAULTS} onSelect={setSelectedVault} />
        )}
        {tab === 1 && <LendingTab />}
        {tab === 2 && <BalancesTab />}
      </main>
    </div>
  )
}

export default App
