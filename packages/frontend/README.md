# Frontend

React 19 + Tailwind 4 single-page app for interacting with Delta Stacks vaults and monitoring Stacks lending markets.

## Features

- **Balances** — View your token holdings across supported assets
- **Lending** — Live APR, liquidity, and reserve data for Zest V1, Zest V2, and Granite
- **Vault (V3)** — Deposit/withdraw/rebalance for the three active vaults (USDCx, STX, sBTC) with a share-price history chart
- **Vault (Legacy)** — Read-only support for V2 vault positions
- Wallet connection via Leather (stacks-connect)
- Dark/light theme toggle

## Tech Stack

| Library | Version | Role |
|---------|---------|------|
| React | 19.2 | UI framework (with React compiler) |
| Tailwind CSS | 4.2 | Utility-first styling |
| DaisyUI | 5.5 | Component library |
| Vite | 7.3 | Build tool |
| TanStack Query | 5.90 | Data fetching and caching |
| stacks-connect | 7.x | Wallet authentication |
| @stacks/transactions | 7.x | Transaction building + broadcasting |

## Setup

### Prerequisites

- Node.js 18+
- A running backend instance (local or remote)

### Install

```bash
cd packages/frontend
npm install
```

### Environment

Copy `.env.example` to `.env` and set:

```env
VITE_DATA_API_URL=http://localhost:8787
```

Point `VITE_DATA_API_URL` at the backend Worker (local dev server or deployed URL).

### Run

```bash
npm run dev        # Start Vite dev server at http://localhost:5173
npm run build      # Production build to dist/
npm run preview    # Preview production build locally
npm run typecheck  # TypeScript type-check only
npm run lint       # ESLint
```

## Vaults

Three vaults are configured in `src/config/vaults.ts`:

| Vault | Asset | Decimals | Markets | Share Token |
|-------|-------|----------|---------|-------------|
| USDCx | USDCx | 6 | Granite, Zest V2 | 1dUSDCx |
| STX | wSTX | 6 | Zest V1, Zest V2 | 1dSTX |
| sBTC | sBTC | 8 | Zest V1, Zest V2 | 1dsBTC |

## Project Structure

```
src/
  App.tsx                  Root component with tab routing
  main.tsx                 Entry point
  config/
    vaults.ts              Vault definitions (asset, markets, contract addresses)
  components/
    Header.tsx             Navigation + wallet connect button
    BalancesTab.tsx        Token balances view
    LendingTab.tsx         Market APR + liquidity table
    VaultTab.tsx           V3 vault UI (selector, chart, actions)
    VaultLegacyTab.tsx     V2 vault read-only view
    VaultSelector.tsx      Grid to pick active vault
    SharePriceChart.tsx    Line chart of vault share-price history
    UserPositions.tsx      User's vault shares and USD value
    ActionPanel.tsx        Deposit / withdraw / rebalance forms
  context/
    WalletContext.tsx       Stacks wallet state (address, connected, sign)
    useWallet.ts           Wallet hook
    ThemeContext.tsx        Dark/light theme state
    useTheme.ts            Theme hook
  hooks/
    useLendingData.ts      Fetch all lending data from backend API
    useVaultState.ts       USDCx vault state (V2 + V3)
    useVaultStateSTX.ts    STX vault state
    useVaultStateSBTC.ts   sBTC vault state
    useVaultStateV3.ts     V3-specific state helpers
    useUserData.ts         User lending positions
    useBalances.ts         Token balances
    useTokenList.ts        SIP-010 token metadata
    useVaultHistory.ts     Vault share-price history from backend
    usePendingTx.ts        Track in-flight transactions
    useTransact.ts         Build and broadcast transactions
  utils/                   Shared helpers (formatting, conversions)
```

## Data Flow

```
Backend API (cached every 2 min)
        │
  useLendingData / useVaultHistory
        │
   TanStack Query (60s stale time)
        │
  Component renders

On-chain reads (for user positions)
        │
  useVaultState / useBalances
        │
  @stacks/transactions (read-only calls)
        │
  Component renders
```

## Wallet Integration

The app uses `stacks-connect` for wallet authentication. The `WalletContext` exposes:

- `address` — Connected Stacks address (mainnet)
- `connected` — Boolean connection state
- `connect()` / `disconnect()` — Auth actions
- `signAndBroadcast(call)` — Sign a `StacksContractCall` and broadcast to mainnet
