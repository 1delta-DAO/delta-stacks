import { describe, it, expect } from 'vitest'
import { uintCV, principalCV, cvToJSON } from '@stacks/transactions'
import { serializeContractCall, deserializeContractCall } from '../types/serialize'
import type { StacksContractCall } from '../types'

describe('StacksContractCall serialization', () => {
  const sampleCall: StacksContractCall = {
    contractAddress: 'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N',
    contractName: 'pool-borrow-v2-0',
    functionName: 'repay',
    functionArgs: [
      principalCV('SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N'),
      uintCV(1000000),
    ],
    stxAmount: 0n,
  }

  it('serializes to hex strings', () => {
    const serialized = serializeContractCall(sampleCall)

    expect(serialized.contractAddress).toBe(sampleCall.contractAddress)
    expect(serialized.contractName).toBe(sampleCall.contractName)
    expect(serialized.functionName).toBe(sampleCall.functionName)
    expect(serialized.functionArgs).toHaveLength(2)
    expect(serialized.functionArgs[0]).toMatch(/^0x/)
    expect(serialized.functionArgs[1]).toMatch(/^0x/)
    expect(serialized.stxAmount).toBe('0')
  })

  it('round-trips through serialize/deserialize', () => {
    const serialized = serializeContractCall(sampleCall)
    const deserialized = deserializeContractCall(serialized)

    expect(deserialized.contractAddress).toBe(sampleCall.contractAddress)
    expect(deserialized.contractName).toBe(sampleCall.contractName)
    expect(deserialized.functionName).toBe(sampleCall.functionName)
    expect(deserialized.functionArgs).toHaveLength(2)
    expect(deserialized.stxAmount).toBe(0n)

    // Verify the ClarityValues round-trip correctly
    const originalJson = sampleCall.functionArgs.map(cvToJSON)
    const roundTrippedJson = deserialized.functionArgs.map(cvToJSON)
    expect(roundTrippedJson).toEqual(originalJson)
  })

  it('handles undefined stxAmount', () => {
    const call: StacksContractCall = {
      contractAddress: 'SP123',
      contractName: 'test',
      functionName: 'test',
      functionArgs: [],
    }

    const serialized = serializeContractCall(call)
    expect(serialized.stxAmount).toBeUndefined()

    const deserialized = deserializeContractCall(serialized)
    expect(deserialized.stxAmount).toBeUndefined()
  })
})
