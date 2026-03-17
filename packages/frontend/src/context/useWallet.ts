import { createContext, useContext } from 'react'

export interface WalletState {
  connected: boolean
  stxAddress: string | null
  connecting: boolean
  connect: () => Promise<void>
  disconnect: () => void
}

export const WalletContext = createContext<WalletState>({
  connected: false,
  stxAddress: null,
  connecting: false,
  connect: async () => {},
  disconnect: () => {},
})

export const useWallet = () => useContext(WalletContext)
