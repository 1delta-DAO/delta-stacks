import { useState } from 'react'
import { Header } from './components/Header'
import { Tabs } from './components/Tabs'
import { BalancesTab } from './components/BalancesTab'
import { LendingTab } from './components/LendingTab'
import { VaultTab } from './components/VaultTab'
import { VaultLegacyTab } from './components/VaultLegacyTab'

const MAIN_TABS = ['Balances', 'Lending', 'Vault', 'Vault (Legacy)']

function App() {
  const [tab, setTab] = useState(0)

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 max-w-6xl w-full mx-auto px-6 py-6 space-y-6">
        <Tabs tabs={MAIN_TABS} active={tab} onChange={setTab} />
        {tab === 0 && <BalancesTab />}
        {tab === 1 && <LendingTab />}
        {tab === 2 && <VaultTab />}
        {tab === 3 && <VaultLegacyTab />}
      </main>
    </div>
  )
}

export default App
