# Stacks Token List

Fetches, validates, and normalizes the Stacks ecosystem token list into a standard JSON format.

## Data Source

Tokens are sourced from the [Velar DEX API](https://api.velar.co/tokens), which tracks 170+ SIP-010 fungible tokens with metadata, logos, and pricing.

## Key Convention

All token list keys and lookups use **plain lowercase** contract principals:

```
sp4sze494vc2yc5jyg7ayfq44f5q4pyv7dvmdpbg.ststx-token
```

The original-case address is preserved in each token's `address` field. Always use `toTokenKey()` to derive lookup keys — never lowercase manually.

## Address Utilities (`address.ts`)

| Function | Returns | Throws on invalid |
|---|---|---|
| `toTokenKey(principal)` | Lowercase key string | Yes |
| `parseStacksAddress(principal)` | `{ address, contractName, key }` | Yes |
| `isValidStacksAddress(principal)` | `boolean` | No |

Validation checks:
- c32 character set (digits + `ABCDEFGHJKMNPQRSTVWXYZ`, no `ILOU`)
- Address length (39-41 characters)
- Prefix (`SP`, `SM`, `ST`, `SN`)
- Contract name format (lowercase alphanumeric + hyphens)

Does **not** verify the c32check checksum bytes.

## Output Format

### `StacksTokenList`

```typescript
{
  chainId: "stacks",
  version: "0",
  list: {
    "sp4sze494vc2yc5jyg7ayfq44f5q4pyv7dvmdpbg.ststx-token": {
      chainId: "stacks",
      decimals: 6,
      name: "Stacked STX",
      address: "SP4SZE494VC2YC5JYG7AYFQ44F5Q4PYV7DVMDPBG.ststx-token",
      symbol: "stSTX",
      logoURI: "https://..."
    },
    // ...
  },
  mainTokens: [
    "sp1y5ystahz88xyk1vpdh24gy0hpx5j4jectmy4a1.wstx",
    "sm3vdxk3wzzsa84xxfkafaf15nnzx32ctsg82jfq4.sbtc-token",
    // ...
  ]
}
```

### Main Tokens

The `mainTokens` array contains well-known, high-liquidity tokens:

| Symbol | Address |
|---|---|
| STX | `SP1Y5YSTAHZ88XYK1VPDH24GY0HPX5J4JECTMY4A1.wstx` |
| sBTC | `SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token` |
| stSTX | `SP4SZE494VC2YC5JYG7AYFQ44F5Q4PYV7DVMDPBG.ststx-token` |
| aeUSDC | `SP3Y2ZSH8P7D50B0VBTSX11S7XSG24M1VB9YFQA4K.token-aeusdc` |
| USDh | `SPN5AKG35QZSK2M8GAMR4AFX45659RJHDW353HSG.usdh-token-v1` |
| ALEX | `SP102V8P0F7JX67ARQ77WEA3D3CFB5XW39REDT0AM.token-alex` |
| DIKO | `SP2C2YFP12AJZB4MABJBAJ55XECVS7E4PMMZ89YZR.arkadiko-token` |
| aBTC | `SP3K8BC0PPEVCV7NZ6QSRWPQ2JE9E5B6N3PA0KBR9.token-abtc` |
| sUSDT | `SP2XD7417HGPRTREMKF748VNEQPDRR0RMANB7X1NK.token-susdt` |
| stSTXbtc | `SP4SZE494VC2YC5JYG7AYFQ44F5Q4PYV7DVMDPBG.ststxbtc-token-v2` |

Only tokens present in the Velar response are included in `mainTokens`.

## Files

| File | Purpose |
|---|---|
| `types.ts` | `StacksToken` and `StacksTokenList` interfaces |
| `address.ts` | Address validation and `toTokenKey` normalizer |
| `fetchTokenList.ts` | Fetches from Velar API, validates, normalizes |
| `writeTokenList.ts` | CLI script that writes JSON to `data/` |

## Generate the JSON

```bash
cd packages/data-provision
npm run token-list
```

Writes to `data/stacks-token-list.json`.

## Usage

### Programmatic (runtime fetch)

```typescript
import { fetchStacksTokenList, toTokenKey } from '@delta-stacks/data-provision'

const tokenList = await fetchStacksTokenList()
const token = tokenList.list[toTokenKey('SP4SZE494VC2YC5JYG7AYFQ44F5Q4PYV7DVMDPBG.ststx-token')]
console.log(token.symbol) // "stSTX"
```

### Static JSON (pre-generated)

```typescript
import tokenList from '@delta-stacks/data-provision/data/stacks-token-list.json'
import { toTokenKey } from '@delta-stacks/data-provision'

const token = tokenList.list[toTokenKey('SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token')]
console.log(token.symbol) // "sBTC"
```
