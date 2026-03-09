import { useState } from 'react'
import { Header } from './components/Header'
import { Tabs } from './components/Tabs'
import { BalancesTab } from './components/BalancesTab'
import { LendingTab } from './components/LendingTab'

const MAIN_TABS = ['Balances', 'Lending']

function App() {
  const [tab, setTab] = useState(0)

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 max-w-6xl w-full mx-auto px-6 py-6 space-y-6">
        <Tabs tabs={MAIN_TABS} active={tab} onChange={setTab} />
        {tab === 0 && <BalancesTab />}
        {tab === 1 && <LendingTab />}
      </main>
    </div>
  )
}

export default App
