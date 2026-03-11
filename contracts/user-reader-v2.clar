;; user-reader-v2.clar
;;
;; Batching reader contract for user-specific lending data.
;; Collapses individual per-asset user data calls into single read-only calls.
;;
;; v2 changes from v1:
;;   - Added USDA (10th asset) to V1 user data
;;   - Added z-token balance reads for ALL 10 V1 assets (deposit amounts)
;;     v1 only returned reserve data (borrow/collateral), NOT deposit balances
;;   - Fixed sUSDT z-token: zsusdt-v1-2 -> zsusdt-v2-0
;;
;; V1: 21 individual calls -> 1 call (reserve data + z-token balances + e-mode)
;; V2: 13 individual calls -> 1 call + 1 collateral call
;; Granite: 6 individual calls -> 2 calls (1 per market)
;;
;; Total: 40 individual calls -> 4 reader calls
;;
;; Deployed by delta-stacks.
;;
;; Zest V1 deployer:  SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N
;; Zest V2 deployer:  SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7
;; Granite aeUSDC:    SP35E2BBMDT2Y1HB0NTK139YBGYV3PAPK3WA8BRNA
;; Granite USDCx:     SP3M2BYF7RGF8WKW5FVDNJ6WR8D7AR9BHDXAKPXZE

;; ===================================================================
;; ZEST V1 USER DATA
;; ===================================================================
;;
;; Reads get-user-reserve-data-read + z-token get-balance for all 10 assets
;; plus e-mode in a single call.
;;
;; Each asset field is a tuple:
;;   { reserve: (optional {tuple}), z-balance: (response uint uint) }
;;
;; reserve  = pool-reserve-data.get-user-reserve-data-read (borrow + collateral)
;; z-balance = z-token.get-balance (deposit amount)

(define-read-only (read-v1-user (user principal))
  {
    ;; On-chain asset order: stSTX, aeUSDC, wSTX, DIKO, USDH, sUSDT, USDA, sBTC, ALEX, stSTXbtcV2
    ststx: {
      reserve: (contract-call? 'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.pool-reserve-data get-user-reserve-data-read user 'SP4SZE494VC2YC5JYG7AYFQ44F5Q4PYV7DVMDPBG.ststx-token),
      z-balance: (contract-call? 'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.zststx-v2-0 get-balance user),
    },
    aeusdc: {
      reserve: (contract-call? 'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.pool-reserve-data get-user-reserve-data-read user 'SP3Y2ZSH8P7D50B0VBTSX11S7XSG24M1VB9YFQA4K.token-aeusdc),
      z-balance: (contract-call? 'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.zaeusdc-v2-0 get-balance user),
    },
    wstx: {
      reserve: (contract-call? 'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.pool-reserve-data get-user-reserve-data-read user 'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.wstx),
      z-balance: (contract-call? 'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.zwstx-v2-0 get-balance user),
    },
    diko: {
      reserve: (contract-call? 'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.pool-reserve-data get-user-reserve-data-read user 'SP2C2YFP12AJZB4MABJBAJ55XECVS7E4PMMZ89YZR.arkadiko-token),
      z-balance: (contract-call? 'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.zdiko-v2-0 get-balance user),
    },
    usdh: {
      reserve: (contract-call? 'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.pool-reserve-data get-user-reserve-data-read user 'SPN5AKG35QZSK2M8GAMR4AFX45659RJHDW353HSG.usdh-token-v1),
      z-balance: (contract-call? 'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.zusdh-v2-0 get-balance user),
    },
    susdt: {
      reserve: (contract-call? 'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.pool-reserve-data get-user-reserve-data-read user 'SP2XD7417HGPRTREMKF748VNEQPDRR0RMANB7X1NK.token-susdt),
      z-balance: (contract-call? 'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.zsusdt-v2-0 get-balance user),
    },
    usda: {
      reserve: (contract-call? 'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.pool-reserve-data get-user-reserve-data-read user 'SP2C2YFP12AJZB4MABJBAJ55XECVS7E4PMMZ89YZR.usda-token),
      z-balance: (contract-call? 'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.zusda-v2-0 get-balance user),
    },
    sbtc: {
      reserve: (contract-call? 'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.pool-reserve-data get-user-reserve-data-read user 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token),
      z-balance: (contract-call? 'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.zsbtc-v2-0 get-balance user),
    },
    alex: {
      reserve: (contract-call? 'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.pool-reserve-data get-user-reserve-data-read user 'SP102V8P0F7JX67ARQ77WEA3D3CFB5XW39REDT0AM.token-alex),
      z-balance: (contract-call? 'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.zalex-v2-0 get-balance user),
    },
    ststxbtc: {
      reserve: (contract-call? 'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.pool-reserve-data get-user-reserve-data-read user 'SP4SZE494VC2YC5JYG7AYFQ44F5Q4PYV7DVMDPBG.ststxbtc-token-v2),
      z-balance: (contract-call? 'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.zststxbtc-v2_v2-0 get-balance user),
    },
    e-mode: (contract-call? 'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.pool-0-reserve-v2-0 get-user-e-mode user),
  }
)

;; ===================================================================
;; ZEST V2 USER DATA
;; ===================================================================
;;
;; get-supplies-user / get-user-borrows on v0-1-data exceed the read-only
;; cost budget, so we batch per-vault balance + per-asset debt calls.
;; resolve-safe returns the user's position mask and internal ID.

(define-read-only (read-v2-user (user principal))
  {
    resolve: (contract-call? 'SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.v0-market-vault resolve-safe user),
    bal-stx: (contract-call? 'SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.v0-vault-stx get-balance user),
    bal-sbtc: (contract-call? 'SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.v0-vault-sbtc get-balance user),
    bal-ststx: (contract-call? 'SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.v0-vault-ststx get-balance user),
    bal-usdc: (contract-call? 'SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.v0-vault-usdc get-balance user),
    bal-usdh: (contract-call? 'SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.v0-vault-usdh get-balance user),
    bal-ststxbtc: (contract-call? 'SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.v0-vault-ststxbtc get-balance user),
    debt-stx: (contract-call? 'SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.v0-market-vault get-account-scaled-debt user u0),
    debt-sbtc: (contract-call? 'SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.v0-market-vault get-account-scaled-debt user u2),
    debt-ststx: (contract-call? 'SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.v0-market-vault get-account-scaled-debt user u4),
    debt-usdc: (contract-call? 'SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.v0-market-vault get-account-scaled-debt user u6),
    debt-usdh: (contract-call? 'SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.v0-market-vault get-account-scaled-debt user u8),
    debt-ststxbtc: (contract-call? 'SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.v0-market-vault get-account-scaled-debt user u10),
  }
)

;; ===================================================================
;; ZEST V2 COLLATERAL
;; ===================================================================

(define-read-only (read-v2-user-collateral (user principal))
  (let ((resolved (try! (contract-call? 'SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.v0-market-vault resolve-safe user))))
    (ok {
      id: (get id resolved),
      mask: (get mask resolved),
      collateral: (contract-call? 'SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.v0-market-vault lookup-collateral (get id resolved) (get mask resolved) u4294967295),
    })
  )
)

;; ===================================================================
;; GRANITE USER DATA
;; ===================================================================

(define-read-only (read-granite-aeusdc-user (user principal))
  {
    position: (contract-call? 'SP35E2BBMDT2Y1HB0NTK139YBGYV3PAPK3WA8BRNA.state-v1 get-user-position user),
    collateral-sbtc: (contract-call? 'SP35E2BBMDT2Y1HB0NTK139YBGYV3PAPK3WA8BRNA.state-v1 get-user-collateral user 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token),
    borrow-params: (contract-call? 'SP35E2BBMDT2Y1HB0NTK139YBGYV3PAPK3WA8BRNA.state-v1 get-borrow-repay-params user),
  }
)

(define-read-only (read-granite-usdcx-user (user principal))
  {
    position: (contract-call? 'SP3M2BYF7RGF8WKW5FVDNJ6WR8D7AR9BHDXAKPXZE.state-v1 get-user-position user),
    collateral-sbtc: (contract-call? 'SP3M2BYF7RGF8WKW5FVDNJ6WR8D7AR9BHDXAKPXZE.state-v1 get-user-collateral user 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token),
    borrow-params: (contract-call? 'SP3M2BYF7RGF8WKW5FVDNJ6WR8D7AR9BHDXAKPXZE.state-v1 get-borrow-repay-params user),
  }
)
