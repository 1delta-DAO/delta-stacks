import {
  DeltaVaultV3,
  DeltaVaultSTX,
  DeltaVaultSBTC,
  VAULT_V3_CONTRACTS,
  VAULT_STX_CONTRACTS,
  VAULT_SBTC_CONTRACTS,
} from '@delta-stacks/calldata-sdk-stacks'
import { GRANITE_USDCX_UID, ZEST_V2_USDCX_UID, ZEST_V1_WSTX_UID, ZEST_V2_STX_UID, ZEST_V1_SBTC_UID, ZEST_V2_SBTC_UID } from "./const";
import { VaultAllocConfig } from "./types";

export const VAULT_ALLOC_CONFIGS: VaultAllocConfig[] = [
  {
    id: 'usdcx',
    vaultPrincipal: VAULT_V3_CONTRACTS.vault,
    market1Label: 'Granite',
    market2Label: 'Zest V2',
    dustThreshold: 1_000n,          // 0.001 USDCx (6 decimals)
    encodeReallocate: (f1, f2, t1, t2) => DeltaVaultV3.encodeReallocate(f1, f2, t1, t2),
    getMarket1Apr: (d) => d.granite?.data[GRANITE_USDCX_UID]?.supplyRate,
    getMarket2Apr: (d) => d.v2?.data[ZEST_V2_USDCX_UID]?.supplyRate,
  },
  {
    id: 'stx',
    vaultPrincipal: VAULT_STX_CONTRACTS.vault,
    market1Label: 'Zest V1',
    market2Label: 'Zest V2',
    dustThreshold: 1_000_000_000n,  // 1 000 STX (6 decimals)
    encodeReallocate: (f1, f2, t1, t2) => DeltaVaultSTX.encodeReallocate(f1, f2, t1, t2),
    getMarket1Apr: (d) => d.v1?.data[ZEST_V1_WSTX_UID]?.depositRate,
    getMarket2Apr: (d) => d.v2?.data[ZEST_V2_STX_UID]?.supplyRate,
  },
  {
    id: 'sbtc',
    vaultPrincipal: VAULT_SBTC_CONTRACTS.vault,
    market1Label: 'Zest V1',
    market2Label: 'Zest V2',
    dustThreshold: 100_000n,        // 0.001 sBTC (8 decimals)
    encodeReallocate: (f1, f2, t1, t2) => DeltaVaultSBTC.encodeReallocate(f1, f2, t1, t2),
    getMarket1Apr: (d) => d.v1?.data[ZEST_V1_SBTC_UID]?.depositRate,
    getMarket2Apr: (d) => d.v2?.data[ZEST_V2_SBTC_UID]?.supplyRate,
  },
]