# Zest V2 Data Provision

Fetches and parses public reserve data from [Zest Protocol V2](https://www.zestprotocol.com/) on Stacks mainnet.

## V2 vs V1 Architecture

| Aspect | V1 | V2 |
|---|---|---|
| Deployer | `SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N` | `SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7` |
| Architecture | Pool-based (single pool-reserve-data) | Hub-spoke (market.clar + individual vaults) |
| Asset keys | Contract principals (strings) | Numeric IDs (uint, 0-11) |
| Position tracking | Per-asset maps | 128-bit bitmask per obligation |
| Risk params | E-modes | Efficiency groups (egroups) |
| Z-token collateral | No | Yes (rehypothecation) |
| Interest curves | Aave-style 2-slope | 8-point interpolated curve |

## Architecture

Same 3-step pattern:

```
buildZestV2ReserveCalls()          →  StacksCall[]
executeStacksReadCalls(calls)      →  StacksCallResult[]
getZestV2ReservesDataConverter()   →  ZestV2PublicResponse
```

### Step 1: Call Building (`publicCallBuild.ts`)

Produces an ordered `StacksCall[]` array in 3 sections:

```
Section                          Index range              Count
──────────────────────────────────────────────────────────────────
1. Asset registry (per underlying)
   i*3 + 0  lookup(aid)          [0, 18)                  6 × 3 = 18
   i*3 + 1  status(aid)
   i*3 + 2  get-cached-indexes(aid)

2. Vault calls (per underlying)
   i*5 + 0  get-supply-rate      [18, 48)                 6 × 5 = 30
   i*5 + 1  get-borrow-rate
   i*5 + 2  get-total-supply
   i*5 + 3  get-total-borrows
   i*5 + 4  get-available-liquidity

3. All asset statuses (incl z-tokens)
   status(aid) for 0..11         [48, 60)                 12

                                  Total:                   60 calls
```

### Step 2: Execution

Same parallel HTTP approach as V1. 60 calls with default concurrency of 20 = 3 batches.

### Step 3: Parsing (`publicCallParse.ts`)

Slices the result array by section offsets and decodes Clarity values.

Key differences from V1 parsing:
- **Total deposits** derived from `totalBorrows + availableLiquidity` (vault-reported)
- **Indexes** come from market's `get-cached-indexes` (borrow index + liquidity index)
- **Z-token collateral status** tracked separately (rehypothecation support)

## Output Format

### `ZestV2PublicResponse`

```typescript
{
  chainId: "stacks-mainnet"
  data: Record<string, ZestV2ReserveData>       // keyed by marketUid
  assetStatuses: Record<number, ZestV2AssetStatus>  // all 12 asset statuses
}
```

Market UIDs: `stacks-mainnet:zest-v2:{asset_id}`

### `ZestV2ReserveData`

| Field | Type | Description |
|---|---|---|
| `marketUid` | `string` | Unique identifier |
| `name` | `string` | e.g. `"Zest V2 STX"` |
| `assetId` | `number` | Numeric asset ID (0, 2, 4, 6, 8, 10) |
| `symbol` | `string` | e.g. `"STX"` |
| `vault` | `string` | Vault contract name |
| `totalSupplyShares` | `number` | Z-token total supply (share units) |
| `totalBorrows` | `number` | Total borrowed (token units) |
| `availableLiquidity` | `number` | Available to borrow (token units) |
| `totalDeposits` | `number` | borrows + liquidity (token units) |
| `totalDepositsUSD` | `number` | USD value |
| `totalBorrowsUSD` | `number` | USD value |
| `availableLiquidityUSD` | `number` | USD value |
| `supplyRate` | `number` | Supply APY as decimal (0.05 = 5%) |
| `borrowRate` | `number` | Borrow APY as decimal |
| `borrowIndex` | `number` | Accumulated borrow interest index |
| `liquidityIndex` | `number` | Accumulated supply interest index |
| `decimals` | `number` | Token decimals |
| `collateralEnabled` | `boolean` | Underlying can be collateral |
| `debtEnabled` | `boolean` | Can be borrowed |
| `zTokenId` | `number` | Z-token asset ID (= assetId + 1) |
| `zTokenSymbol` | `string` | e.g. `"zSTX"` |
| `zTokenCollateralEnabled` | `boolean` | Z-token usable as collateral |
| `oracleType` | `string \| null` | `"0x00"` = Pyth, `"0x01"` = DIA |
| `principal` | `string \| null` | Underlying token contract principal |

### `ZestV2AssetStatus`

```typescript
{
  assetId: number
  symbol: string
  collateralEnabled: boolean
  debtEnabled: boolean
}
```

Covers all 12 assets (6 underlying + 6 z-tokens).

## Asset ID Mapping

| ID | Symbol | Type | Vault |
|---|---|---|---|
| 0 | STX | underlying | v0-vault-stx |
| 1 | zSTX | z-token | — |
| 2 | sBTC | underlying | v0-vault-sbtc |
| 3 | zsBTC | z-token | — |
| 4 | stSTX | underlying | v0-vault-ststx |
| 5 | zstSTX | z-token | — |
| 6 | USDC | underlying | v0-vault-usdc |
| 7 | zUSDC | z-token | — |
| 8 | USDH | underlying | v0-vault-usdh |
| 9 | zUSDH | z-token | — |
| 10 | stSTXbtc | underlying | v0-vault-ststxbtc |
| 11 | zstSTXbtc | z-token | — |

Z-token ID = underlying ID + 1. Z-tokens can be used as collateral (rehypothecation).

## Contracts Used

| Contract | Purpose |
|---|---|
| `v0-4-market` | Central hub, index caching, oracle resolution |
| `v0-assets` | Asset registry (lookup, status) |
| `v0-egroup` | Efficiency group risk parameters |
| `v0-vault-stx` | STX vault (rates, supply, borrows) |
| `v0-vault-sbtc` | sBTC vault |
| `v0-vault-ststx` | stSTX vault |
| `v0-vault-usdc` | USDC vault |
| `v0-vault-usdh` | USDH vault |
| `v0-vault-ststxbtc` | stSTXbtc vault |

All deployed by `SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7`.

## Usage

```typescript
import { getStacksLenderPublicData } from '@delta-stacks/data-provision'

const result = await getStacksLenderPublicData('zest-v2', {
  stx: 1.23,
  sbtc: 67000,
  usdc: 1.0,
})

for (const [uid, reserve] of Object.entries(result.data)) {
  console.log(
    reserve.symbol,
    `supply: ${(reserve.supplyRate * 100).toFixed(2)}%`,
    `borrow: ${(reserve.borrowRate * 100).toFixed(2)}%`,
    `zToken collateral: ${reserve.zTokenCollateralEnabled}`,
  )
}
```
