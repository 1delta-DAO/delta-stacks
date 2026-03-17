import { DEPLOYER, GRANITE_USDCX_UID, ZEST_V2_USDCX_UID, ZEST_V1_WSTX_UID, ZEST_V2_STX_UID, ZEST_V1_SBTC_UID, ZEST_V2_SBTC_UID } from "./const";
import { VaultAllocConfig } from "./types";

export const VAULT_ALLOC_CONFIGS: VaultAllocConfig[] = [
  {
    id: 'usdcx',
    deployer: DEPLOYER,
    contractName: 'vault-usdcx-v3',
    adapterMarket1: `${DEPLOYER}.adapter-granite-usdcx-v3`,
    adapterMarket2: `${DEPLOYER}.adapter-zest-v2-usdc-v3`,
    market1Label: 'Granite',
    market2Label: 'Zest V2',
    dustThreshold: 100_000_000n,    // 100 USDCx (6 decimals)
    getMarket1Apr: (d) => d.granite?.data[GRANITE_USDCX_UID]?.supplyRate,
    getMarket2Apr: (d) => d.v2?.data[ZEST_V2_USDCX_UID]?.supplyRate,
  },
  {
    id: 'stx',
    deployer: DEPLOYER,
    contractName: 'vault-stx-v3-1',
    adapterMarket1: `${DEPLOYER}.adapter-zest-v1-wstx-v3`,
    adapterMarket2: `${DEPLOYER}.adapter-zest-v2-stx-v3`,
    market1Label: 'Zest V1',
    market2Label: 'Zest V2',
    dustThreshold: 1_000_000_000n,  // 1 000 STX (6 decimals)
    getMarket1Apr: (d) => d.v1?.data[ZEST_V1_WSTX_UID]?.depositRate,
    getMarket2Apr: (d) => d.v2?.data[ZEST_V2_STX_UID]?.supplyRate,
  },
  {
    id: 'sbtc',
    deployer: DEPLOYER,
    contractName: 'vault-sbtc-v3',
    adapterMarket1: `${DEPLOYER}.adapter-zest-v1-sbtc-v3`,
    adapterMarket2: `${DEPLOYER}.adapter-zest-v2-sbtc-v3`,
    market1Label: 'Zest V1',
    market2Label: 'Zest V2',
    dustThreshold: 100_000n,        // 0.001 sBTC (8 decimals)
    getMarket1Apr: (d) => d.v1?.data[ZEST_V1_SBTC_UID]?.depositRate,
    getMarket2Apr: (d) => d.v2?.data[ZEST_V2_SBTC_UID]?.supplyRate,
  },
]