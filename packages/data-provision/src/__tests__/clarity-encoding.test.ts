import { describe, it, expect } from 'vitest'
import {
  encodeClarityPrincipal,
  encodeClarityUint,
  decodeClarityValue,
  extractUint,
  extractBool,
  extractTuple,
  extractPrincipal,
} from '../stacks-call'

describe('Clarity encoding', () => {
  it('encodes a uint', () => {
    const hex = encodeClarityUint(100)
    expect(hex).toBe('0x0100000000000000000000000000000064')
  })

  it('encodes a large uint', () => {
    const hex = encodeClarityUint(5000000)
    expect(hex).toBe('0x01000000000000000000000000004c4b40')
  })

  it('encodes a bigint', () => {
    const hex = encodeClarityUint(5000000000n)
    expect(hex).toMatch(/^0x01/)
    expect(hex.length).toBe(36) // 0x + type byte (2) + 16 bytes (32 hex chars)
  })

  it('encodes a principal', () => {
    const hex = encodeClarityPrincipal('SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N')
    expect(hex).toMatch(/^0x05/) // standard principal prefix
  })

  it('encodes a contract principal', () => {
    const hex = encodeClarityPrincipal(
      'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.pool-reserve-data',
    )
    expect(hex).toMatch(/^0x06/) // contract principal prefix
  })
})

describe('Clarity decoding', () => {
  it('decodes a uint', () => {
    const decoded = decodeClarityValue('0x0100000000000000000000000000000064')
    const value = extractUint(decoded)
    expect(value).toBe(100n)
  })

  it('decodes a large uint', () => {
    const decoded = decodeClarityValue('0x01000000000000000000000000004c4b40')
    const value = extractUint(decoded)
    expect(value).toBe(5000000n)
  })

  it('decodes a bool true', () => {
    const decoded = decodeClarityValue('0x03')
    expect(extractBool(decoded)).toBe(true)
  })

  it('decodes a bool false', () => {
    const decoded = decodeClarityValue('0x04')
    expect(extractBool(decoded)).toBe(false)
  })

  it('decodes a tuple', async () => {
    // A minimal tuple with two fields
    const { tupleCV, uintCV, trueCV, cvToHex } = await import(
      '@stacks/transactions'
    )
    const hex = cvToHex(
      tupleCV({
        amount: uintCV(42),
        active: trueCV(),
      }),
    )
    const decoded = decodeClarityValue(hex)
    const tuple = extractTuple(decoded)
    expect(tuple['amount'].value).toBe('42')
    expect(tuple['active'].value).toBe(true)
  })
})
