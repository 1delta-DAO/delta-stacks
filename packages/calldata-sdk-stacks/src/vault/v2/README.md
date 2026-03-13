# Vault V2 (Legacy) — Calldata SDK

Transaction calldata encoders for the legacy `vault-usdcx-v2-prod` ERC-4626 yield vault on Stacks.

> **Note:** V2 is superseded by [Vault V3](../v3/README.md) which adds portability, performance fees, idle buffer, recall, and zero-sum rebalancing. V2 remains deployed and functional but new deposits should use V3.

## Contracts

| Contract | Deployer | Name |
|----------|----------|------|
| Vault | `SP2DRPT3AA170EK5DC4T22CMSXZ6HACATPXHPAT7H` | `vault-usdcx-v2-prod` |
| Granite Adapter | same | `adapter-granite-usdcx` |
| Zest V2 Adapter | same | `adapter-zest-v2-usdc-v2` |
| Base Asset (USDCx) | `SP120SBRBQJ00MCWS7TM5R8WJNTTKD5K0HFRC2CNE` | `usdcx` |

## Usage

```typescript
import {
  DeltaVault,
  VAULT_CONTRACTS,
  VAULT_UNDERLYING,
} from '@delta-stacks/calldata-sdk-stacks'

// Deposit 10 USDCx
const call = DeltaVault.encodeDeposit(10_000_000n, senderAddress)

// Withdraw 5 USDCx
const call = DeltaVault.encodeWithdraw(5_000_000n, senderAddress, senderAddress)
```

## API

### User Operations (anyone)

| Function | Args | Description |
|----------|------|-------------|
| `encodeDeposit(amount, owner, adapter?)` | 4 | Deposit USDCx, receive shares |
| `encodeMint(shares, receiver, adapter?)` | 4 | Mint exact shares, pay required USDCx |
| `encodeWithdraw(amount, receiver, owner, adapter?)` | 5 | Withdraw exact USDCx, burn proportional shares |
| `encodeRedeem(shares, receiver, owner, adapter?)` | 5 | Redeem shares for proportional USDCx |
| `encodeTransfer(amount, sender, recipient)` | 4 | SIP-010 share transfer |

### Sync (anyone)

| Function | Args | Description |
|----------|------|-------------|
| `encodeSyncGranite(adapter?)` | 1 | Sync Granite yield into bookkeeping |
| `encodeSyncZestV2(adapter?)` | 1 | Sync Zest V2 yield into bookkeeping |

### Allocator Operations

| Function | Args | Description |
|----------|------|-------------|
| `encodeDeployToGranite(amount, adapter?)` | 2 | Deploy idle USDCx to Granite |
| `encodeDeployToZestV2(amount, adapter?)` | 2 | Deploy idle USDCx to Zest V2 |
| `encodeRebalanceGraniteToZestV2(amount, adapter?)` | 3 | Move USDCx from Granite to Zest V2 |
| `encodeRebalanceZestV2ToGranite(amount, adapter?)` | 3 | Move USDCx from Zest V2 to Granite |

### Owner Operations

| Function | Args | Description |
|----------|------|-------------|
| `encodeSetVaultOwner(newOwner)` | 1 | Transfer ownership |
| `encodeSetVaultAllocator(newAllocator)` | 1 | Set allocator address |
| `encodeRegisterAdapterGranite(adapter?)` | 1 | Register Granite adapter |
| `encodeRegisterAdapterZestV2(adapter?)` | 1 | Register Zest V2 adapter |

## V2 vs V3 Differences

| Feature | V2 | V3 |
|---------|----|----|
| Token parameter | No — hardcoded USDCx | Yes — `token <ft>` trait arg |
| Deposit args | 4 (amount, owner, granite, zest) | 5 (+ token) |
| Withdraw/Redeem args | 5 | 6 (+ token) |
| Performance fees | No | Yes (MetaMorpho-style share dilution) |
| Idle buffer | No | Yes (configurable bps) |
| Recall from markets | No | Yes (`recall-from-granite`, `recall-from-zest-v2`) |
| Zero-sum rebalance | No | Yes (`reallocate`) |
| Initialize | No — fixed config | Yes — portable (`initialize`) |
| Auto-allocation on deposit | No | Yes |
