/**
 * Derive a Stacks mainnet private key + address from a BIP39 mnemonic.
 * Uses the same derivation path as Leather wallet: m/44'/5757'/0'/0/0
 *
 * Usage:
 *   node scripts/derive-stacks-key.mjs "word1 word2 ... word24"
 */

import { mnemonicToSeedSync } from '/home/caglavol/Repos/delta-stacks/node_modules/.pnpm/@scure+bip39@1.6.0/node_modules/@scure/bip39/index.js'
import { HDKey } from '/home/caglavol/Repos/delta-stacks/node_modules/.pnpm/@scure+bip32@1.7.0/node_modules/@scure/bip32/lib/index.js'
import pkg from '/home/caglavol/Repos/delta-stacks/node_modules/.pnpm/@stacks+transactions@7.3.1/node_modules/@stacks/transactions/dist/index.js'
const { getAddressFromPrivateKey } = pkg

const mnemonic = process.argv[2]
if (!mnemonic) {
  console.error('Usage: node scripts/derive-stacks-key.mjs "<mnemonic>"')
  process.exit(1)
}

// Leather derivation path: m/44'/5757'/0'/0/0  (5757 = STX coin type)
const DERIVATION_PATH = "m/44'/5757'/0'/0/0"

const seed = mnemonicToSeedSync(mnemonic)
const root = HDKey.fromMasterSeed(seed)
const child = root.derive(DERIVATION_PATH)

// Stacks private keys are 32-byte hex + "01" suffix (compressed)
const privateKeyHex = Buffer.from(child.privateKey).toString('hex') + '01'
const address = getAddressFromPrivateKey(privateKeyHex, 'mainnet')

console.log('Address:     ', address)
console.log('Private key: ', privateKeyHex)
console.log()
console.log('Use the private key with:')
console.log('  clarinet deployments apply --private-key', privateKeyHex)
