import { useState, useCallback } from 'react'
import { request } from '@stacks/connect'
import { cvToHex } from '@stacks/transactions'
import type { StacksContractCall } from '@delta-stacks/calldata-sdk-stacks'

export type TxStatus = 'idle' | 'building' | 'signing' | 'submitted' | 'error'

interface TransactState {
  status: TxStatus
  txId: string | null
  error: string | null
}

/**
 * Hook to build a StacksContractCall and broadcast via the connected wallet.
 */
export function useTransact() {
  const [state, setState] = useState<TransactState>({
    status: 'idle',
    txId: null,
    error: null,
  })

  const reset = useCallback(() => {
    setState({ status: 'idle', txId: null, error: null })
  }, [])

  const execute = useCallback(
    async (buildCall: () => Promise<StacksContractCall>) => {
      setState({ status: 'building', txId: null, error: null })

      let call: StacksContractCall
      try {
        call = await buildCall()
      } catch (e) {
        setState({ status: 'error', txId: null, error: `Build failed: ${e}` })
        return
      }

      setState((s) => ({ ...s, status: 'signing' }))

      try {
        const resp = await request('stx_callContract', {
          contract: `${call.contractAddress}.${call.contractName}`,
          functionName: call.functionName,
          functionArgs: call.functionArgs.map((arg) => cvToHex(arg)),
          postConditionMode: 'allow',
        })
        setState({ status: 'submitted', txId: resp.txid ?? null, error: null })
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        if (msg.includes('cancel') || msg.includes('denied')) {
          setState({ status: 'idle', txId: null, error: null })
        } else {
          setState({ status: 'error', txId: null, error: msg })
        }
      }
    },
    [],
  )

  return { ...state, execute, reset }
}
