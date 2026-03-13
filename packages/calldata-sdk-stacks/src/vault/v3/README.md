# Vault V3 — Calldata SDK

Transaction calldata encoders for the [vault-usdcx-v3](../../../../contracts/prod/v3/usdcx/README.md) ERC-4626 yield vault on Stacks.

## Contracts

| Contract | Deployer | Name |
|----------|----------|------|
| Vault | `SP2DRPT3AA170EK5DC4T22CMSXZ6HACATPXHPAT7H` | `vault-usdcx-v3` |
| Granite Adapter | same | `adapter-granite-usdcx-v3` |
| Zest V2 Adapter | same | `adapter-zest-v2-usdc-v3` |
| Base Asset (USDCx) | `SP120SBRBQJ00MCWS7TM5R8WJNTTKD5K0HFRC2CNE` | `usdcx` |

## Usage

```typescript
import {
  DeltaVaultV3,
  VAULT_V3_CONTRACTS,
  VAULT_V3_UNDERLYING,
} from '@delta-stacks/calldata-sdk-stacks'

// Deposit 10 USDCx
const call = DeltaVaultV3.encodeDeposit(10_000_000n, senderAddress)
// -> { contractAddress, contractName, functionName, functionArgs }

// Withdraw 5 USDCx
const call = DeltaVaultV3.encodeWithdraw(5_000_000n, senderAddress, senderAddress)
```

## API

### User Operations (anyone)

| Function | Args | Description |
|----------|------|-------------|
| `encodeDeposit(amount, owner, token?, adapter?)` | 5 | Deposit USDCx, receive shares (auto-allocates) |
| `encodeMint(shares, receiver, token?, adapter?)` | 5 | Mint exact shares, pay required USDCx |
| `encodeWithdraw(amount, receiver, owner, token?, adapter?)` | 6 | Withdraw exact USDCx, burn proportional shares |
| `encodeRedeem(shares, receiver, owner, token?, adapter?)` | 6 | Redeem shares for proportional USDCx |
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
| `encodeRecallFromGranite(amount, adapter?)` | 2 | Recall USDCx from Granite to idle |
| `encodeRecallFromZestV2(amount, adapter?)` | 2 | Recall USDCx from Zest V2 to idle |
| `encodeRebalanceGraniteToZestV2(amount, adapter?)` | 3 | Move USDCx from Granite to Zest V2 |
| `encodeRebalanceZestV2ToGranite(amount, adapter?)` | 3 | Move USDCx from Zest V2 to Granite |
| `encodeReallocate(fromGranite, fromZest, toGranite, toZest, adapter?)` | 6 | Zero-sum rebalance across both markets |

### Owner Operations

| Function | Args | Description |
|----------|------|-------------|
| `encodeInitialize(asset, name, symbol, decimals)` | 4 | One-time vault setup |
| `encodeSetVaultOwner(newOwner)` | 1 | Transfer ownership |
| `encodeSetVaultAllocator(newAllocator)` | 1 | Set allocator address |
| `encodeRegisterAdapterGranite(adapter?)` | 1 | Register Granite adapter |
| `encodeRegisterAdapterZestV2(adapter?)` | 1 | Register Zest V2 adapter |
| `encodeSetFeeBps(feeBps)` | 1 | Set performance fee (basis points) |
| `encodeSetFeeRecipient(recipient)` | 1 | Set fee recipient address |
| `encodeSetIdleBuffer(bufferBps)` | 1 | Set idle buffer (basis points) |

## Key Difference from V2

V3 user operations include a `token` parameter for the SIP-010 trait, allowing the vault to be portable across base assets. The SDK defaults this to `VAULT_V3_UNDERLYING` (USDCx). V2 does not have this parameter.

| | V2 deposit args | V3 deposit args |
|---|---|---|
| Count | 4 | 5 |
| Params | amount, owner, granite, zest | amount, owner, **token**, granite, zest |
