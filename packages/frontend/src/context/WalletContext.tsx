import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react'
import { disconnect as scDisconnect, isConnected, getLocalStorage, request } from '@stacks/connect'

interface WalletState {
  connected: boolean
  stxAddress: string | null
  connecting: boolean
  connect: () => Promise<void>
  disconnect: () => void
}

const WalletContext = createContext<WalletState>({
  connected: false,
  stxAddress: null,
  connecting: false,
  connect: async () => {},
  disconnect: () => {},
})

export function WalletProvider({ children }: { children: ReactNode }) {
  const [stxAddress, setStxAddress] = useState<string | null>(null)
  const [connecting, setConnecting] = useState(false)

  useEffect(() => {
    if (isConnected()) {
      const data = getLocalStorage()
      const mainnetAddr = data?.addresses?.stx?.find(a => a.symbol === 'STX')?.address as string | undefined
      if (mainnetAddr) setStxAddress(mainnetAddr)
    }
  }, [])

  const handleConnect = useCallback(async () => {
    setConnecting(true)
    try {
      const resp = await request('getAddresses')
      const stx = resp.addresses.find((a) => a.symbol === 'STX')
      if (stx) setStxAddress(stx.address)
    } catch {
      // user cancelled or error
    } finally {
      setConnecting(false)
    }
  }, [])

  const handleDisconnect = useCallback(() => {
    scDisconnect()
    setStxAddress(null)
  }, [])

  return (
    <WalletContext.Provider
      value={{
        connected: !!stxAddress,
        stxAddress,
        connecting,
        connect: handleConnect,
        disconnect: handleDisconnect,
      }}
    >
      {children}
    </WalletContext.Provider>
  )
}

export const useWallet = () => useContext(WalletContext)
