# Zest Reader Contract

On-chain aggregator that batches dozens of cross-contract read-only calls into 3 RPC requests. Deployed on Stacks mainnet.

**Contract:** `zest-reader.clar` (Clarity v3, Epoch 3.0)

## Why

Stacks lending protocols expose data across many separate contracts and functions. A frontend querying Zest V1 alone needs ~36 individual RPC calls (9 assets x 4 calls each). This contract collapses all of that into a single `contract-call?` per protocol version:

| Protocol | Assets/Markets | Individual calls replaced | Aggregator function |
|---|---|---|---|
| Zest V1 | 9 assets | ~40 | `get-v1-reserve-data` |
| Zest V2 | 6 vaults | ~60 | `get-v2-reserve-data` |
| Granite | 2 markets | ~18 | `get-granite-reserve-data` |

## Protocol Coverage

### Zest V1 (Pool-based, Aave-style)

Deployer: `SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N`

Assets: wSTX, stSTX, sBTC, aeUSDC, DIKO, USDH, sUSDT, stSTXbtc, ALEX

Each asset returns:
- `reserve-state` - full reserve state tuple from `pool-reserve-data`
- `supply-apy` - annualized supply APY
- `borrow-apy` - annualized borrow APY
- `e-mode-type` - e-mode category (`0x00` or `0x01`)

Also includes e-mode configs and the global asset list.

### Zest V2 (Hub-spoke vaults)

Deployer: `SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7`

Vaults: STX, sBTC, stSTX, USDC, USDH, stSTXbtc

Each vault returns:
- `total-supply` / `total-assets` - shares and underlying
- `debt` - total borrowed
- `available` - available to borrow
- `interest-rate` - current borrow rate
- `index` / `lindex` - borrow and liquidity indices
- `cap-debt` / `cap-supply` - protocol caps
- `fee-reserve` - protocol fee take

Also includes the global asset enable/disable bitmap.

### Granite (Isolated markets, Compound V3-style)

Deployers: `SP35E2BBMDT2Y1HB0NTK139YBGYV3PAPK3WA8BRNA` (STX), `SP3M2BYF7RGF8WKW5FVDNJ6WR8D7AR9BHDXAKPXZE` (USDCx)

Markets: STX, USDCx

Each market returns:
- `lp-params` - `{ total-assets, total-shares }`
- `debt-params` - `{ open-interest, total-debt-shares }`
- `open-interest` - split by LP, protocol, and staked
- `reserve-balance` / `asset-cap` - reserve state and caps
- `borrow-enabled` / `deposit-enabled` - market status flags
- `ir-params` - `{ base-ir, ir-slope-1, ir-slope-2, utilization-kink }`
- `protocol-reserve-pct` - protocol fee percentage

## Querying

### From TypeScript (via data-provision package)

```typescript
import { getStacksLenderPublicData } from '@delta-stacks/data-provision'

const zestV1 = await getStacksLenderPublicData('zest-v1')
const zestV2 = await getStacksLenderPublicData('zest-v2')
const granite = await getStacksLenderPublicData('granite')
```

### Direct RPC calls

Call the aggregator functions as read-only calls against the Stacks API. Replace `<deployer>` with the address you deployed the reader contract to.

```bash
# Zest V1 - all 9 assets + e-mode configs
curl -s https://api.hiro.so/v2/contracts/call-read/<deployer>/zest-reader/get-v1-reserve-data \
  -H 'Content-Type: application/json' \
  -d '{"sender":"<deployer>","arguments":[]}'

# Zest V2 - all 6 vaults + asset bitmap
curl -s https://api.hiro.so/v2/contracts/call-read/<deployer>/zest-reader/get-v2-reserve-data \
  -H 'Content-Type: application/json' \
  -d '{"sender":"<deployer>","arguments":[]}'

# Granite - both markets
curl -s https://api.hiro.so/v2/contracts/call-read/<deployer>/zest-reader/get-granite-reserve-data \
  -H 'Content-Type: application/json' \
  -d '{"sender":"<deployer>","arguments":[]}'
```

### Individual asset queries

Each asset/vault/market also has its own read-only function if you only need one:

```
read-v1-wstx, read-v1-ststx, read-v1-sbtc, read-v1-aeusdc, ...
read-vault-stx, read-vault-sbtc, read-vault-ststx, ...
read-granite-aeusdc, read-granite-usdcx
```

## Querying User Lending Positions

The reader contract aggregates **market-level data** (reserves, rates, caps). User positions are stored in the underlying protocol contracts and must be queried directly.

### Zest V1 - User positions

```typescript
// User's supply balance for an asset
contractCall('SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.pool-read-v2-1-4', 'get-user-reserve-data', [
  userPrincipal,   // the user's address
  assetPrincipal,  // e.g. SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.wstx
])
// Returns: { principal-borrow-balance, principal-supply-balance, ... }
```

### Zest V2 - User positions

User balances are represented as z-token shares in each vault. Query the vault's SIP-010 z-token balance:

```typescript
// User's share balance in the STX vault
contractCall('SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.v0-vault-stx', 'get-balance', [
  userPrincipal,
])
```

Convert shares to underlying using the vault's `total-supply` and `total-assets` from the reader:
```
underlying = (user_shares * total_assets) / total_supply
```

### Granite - User positions

```typescript
// User's LP (deposit) position
contractCall('SP35E2BBMDT2Y1HB0NTK139YBGYV3PAPK3WA8BRNA.state-v1', 'get-lp-shares', [
  userPrincipal,
])

// User's debt position
contractCall('SP35E2BBMDT2Y1HB0NTK139YBGYV3PAPK3WA8BRNA.state-v1', 'get-debt-shares', [
  userPrincipal,
])
```

## Limitations

- **Static call graph** - Clarity requires all contract calls to be known at compile time. There is no way to make a generic "call any function" reader. Each new asset or protocol version requires a contract update and redeployment.
- **Read-only only** - This contract cannot modify state. All functions are `define-read-only`.
- **No user positions** - Market-level data only. User balances must be queried from the underlying protocol contracts directly (see above).
