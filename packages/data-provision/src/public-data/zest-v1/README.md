# Zest V1 Data Provision

Fetches and parses public reserve data from [Zest Protocol](https://www.zestprotocol.com/) on Stacks mainnet.

## Architecture

Follows the same 3-step pattern used for EVM lenders (e.g. Aave V3):

```
buildZestReserveCalls()          →  StacksCall[]
executeStacksReadCalls(calls)    →  StacksCallResult[]
getZestReservesDataConverter()   →  ZestPublicResponse
```

### Step 1: Call Building (`publicCallBuild.ts`)

Produces an ordered array of `StacksCall` descriptors. The ordering is strict — the parser depends on it.

**Call layout for N assets and M e-mode types:**

```
Index range              Call                              Contract
─────────────────────────────────────────────────────────────────────
[0, N*4)                 Per-asset calls (4 each)          mixed
  i*4 + 0               get-reserve-state-read(asset)     pool-reserve-data
  i*4 + 1               get-asset-supply-apy(asset)       pool-read-supply-v2-1-3
  i*4 + 2               get-asset-borrow-apy(asset)       pool-read-v2-1-4
  i*4 + 3               get-asset-e-mode-type(asset)      pool-0-reserve-v2-0
[N*4, N*4+M)             E-mode config calls               pool-0-reserve-v2-0
  N*4 + j               get-e-mode-type-config(type_j)
[N*4+M]                  get-assets-read()                 pool-reserve-data
```

With 9 assets and 2 e-mode types, this produces **39 calls**.

### Step 2: Execution (`../../stacks-call/executor.ts`)

Stacks has no on-chain multicall contract (Clarity requires static contract references, making a generic multicall impossible). Instead, calls are fired as parallel HTTP requests to the Stacks node RPC:

```
POST /v2/contracts/call-read/{address}/{name}/{function}
```

Concurrency is capped (default 20) to respect API rate limits.

### Step 3: Parsing (`publicCallParse.ts`)

The parser slices the result array by the known index offsets and decodes each Clarity value into typed JS objects.

Key data source is `get-reserve-state-read`, which returns the full reserve tuple:

```
{
  last-liquidity-cumulative-index, current-liquidity-rate,
  total-borrows-stable, total-borrows-variable,
  current-variable-borrow-rate, current-stable-borrow-rate,
  base-ltv-as-collateral, liquidation-threshold, liquidation-bonus,
  decimals, a-token-address, oracle, borrowing-enabled,
  usage-as-collateral-enabled, supply-cap, borrow-cap,
  debt-ceiling, is-active, is-frozen, ...
}
```

## Output Format

### `ZestPublicResponse`

```typescript
{
  chainId: "stacks-mainnet"
  data: Record<string, ZestReserveData>  // keyed by marketUid
}
```

Market UIDs follow the pattern: `stacks-mainnet:zest-v1:{asset_principal}`

### `ZestReserveData`

| Field | Type | Description |
|---|---|---|
| `marketUid` | `string` | Unique identifier |
| `name` | `string` | e.g. `"Zest wSTX"` |
| `poolId` | `string` | Asset contract principal |
| `underlying` | `string` | Same as poolId |
| `symbol` | `string` | e.g. `"wSTX"` |
| `totalDeposits` | `number` | Total supplied (token units) |
| `totalDebt` | `number` | Total variable debt (token units) |
| `totalDebtStable` | `number` | Total stable debt (token units) |
| `totalLiquidity` | `number` | Available liquidity (token units) |
| `totalDepositsUSD` | `number` | USD value of deposits |
| `totalDebtUSD` | `number` | USD value of variable debt |
| `totalDebtStableUSD` | `number` | USD value of stable debt |
| `totalLiquidityUSD` | `number` | USD value of liquidity |
| `depositRate` | `number` | Supply APY as decimal (0.05 = 5%) |
| `variableBorrowRate` | `number` | Borrow APY as decimal |
| `stableBorrowRate` | `number` | Always 0 (Zest has no stable rate) |
| `decimals` | `number` | Token decimals |
| `config` | `Record<number, ZestEModeConfig>` | E-mode config map |
| `collateralActive` | `boolean` | Can be used as collateral |
| `borrowingEnabled` | `boolean` | Can be borrowed |
| `isActive` | `boolean` | Reserve is active |
| `isFrozen` | `boolean` | Reserve is frozen |
| `supplyCap` | `number` | Max supply allowed |
| `borrowCap` | `number` | Max borrow allowed |
| `debtCeiling` | `number` | Isolation mode debt ceiling |
| `liquidationThreshold` | `number` | As decimal (0.80 = 80%) |
| `liquidationBonus` | `number` | As decimal |
| `baseLtv` | `number` | Loan-to-value as decimal |
| `zToken` | `string \| undefined` | Z-token (receipt token) address |

### `ZestEModeConfig`

```typescript
{
  category: number          // 0 = disabled, >0 = specific e-mode
  label: string             // e.g. "Disabled", "STX Correlated"
  borrowCollateralFactor: number  // LTV in e-mode (decimal)
  collateralFactor: number        // Liquidation threshold in e-mode (decimal)
  borrowFactor: number            // Always 1
  collateralDisabled: boolean
  debtDisabled: boolean
}
```

## Supported Assets

| Symbol | Principal | Borrowable |
|---|---|---|
| wSTX | `SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.wstx` | Yes |
| stSTX | `SP4SZE494VC2YC5JYG7AYFQ44F5Q4PYV7DVMDPBG.ststx-token` | Yes |
| sBTC | `SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token` | No |
| aeUSDC | `SP3Y2ZSH8P7D50B0VBTSX11S7XSG24M1VB9YFQA4K.token-aeusdc` | Yes |
| DIKO | `SP2C2YFP12AJZB4MABJBAJ55XECVS7E4PMMZ89YZR.arkadiko-token` | Yes |
| USDH | `SPN5AKG35QZSK2M8GAMR4AFX45659RJHDW353HSG.usdh-token-v1` | Yes |
| sUSDT | `SP2XD7417HGPRTREMKF748VNEQPDRR0RMANB7X1NK.token-susdt` | Yes |
| stSTXbtc-v2 | `SP4SZE494VC2YC5JYG7AYFQ44F5Q4PYV7DVMDPBG.ststxbtc-token-v2` | No |
| ALEX | `SP102V8P0F7JX67ARQ77WEA3D3CFB5XW39REDT0AM.token-alex` | Yes |

## Contracts Used

| Contract | Purpose |
|---|---|
| `pool-reserve-data` | Raw reserve state + asset list |
| `pool-read-supply-v2-1-3` | Supply APY aggregator |
| `pool-read-v2-1-4` | Borrow APY aggregator |
| `pool-0-reserve-v2-0` | E-mode type lookups |

All deployed by `SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N`.

## Usage

```typescript
import { getStacksLenderPublicData } from '@delta-stacks/data-provision'

const result = await getStacksLenderPublicData('zest-v1', {
  wstx: 1.23,
  sbtc: 67000,
})

for (const [uid, reserve] of Object.entries(result.data)) {
  console.log(reserve.symbol, reserve.depositRate, reserve.variableBorrowRate)
}
```

### Custom API endpoint

```typescript
const result = await getStacksLenderPublicData('zest-v1', prices, {
  apiUrl: 'http://localhost:20443',  // local Stacks node
  concurrency: 50,                   // higher parallelism with own node
})
```
