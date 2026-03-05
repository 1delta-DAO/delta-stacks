;; zest-reader.clar
;;
;; Unified aggregator contract for reading all Zest V1 + V2 reserve data
;; in single read-only calls. Collapses ~100 individual HTTP requests into 2.
;;
;; Deployed by delta-stacks.
;;
;; V1 deployer: SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N
;; V2 deployer: SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7

;; ===================================================================
;; V1 READER -9 assets, pool-based architecture (like Aave)
;; ===================================================================
;;
;; Per-asset data tuple:
;; {
;;   reserve-state: {tuple}  -full reserve state from pool-reserve-data
;;   supply-apy:    uint     -annualized supply APY
;;   borrow-apy:    uint     -annualized borrow APY
;;   e-mode-type:   (buff 1) -e-mode category for this asset
;; }

;; -------------------------------------------------------------------
;; V1 per-asset helpers
;; -------------------------------------------------------------------

(define-read-only (read-v1-wstx)
  {
    reserve-state: (contract-call? 'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.pool-reserve-data get-reserve-state-read 'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.wstx),
    supply-apy:    (contract-call? 'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.pool-read-supply-v2-1-3 get-asset-supply-apy 'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.wstx),
    borrow-apy:    (contract-call? 'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.pool-read-v2-1-4 get-asset-borrow-apy 'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.wstx),
    e-mode-type:   (contract-call? 'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.pool-0-reserve-v2-0 get-asset-e-mode-type 'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.wstx),
  }
)

(define-read-only (read-v1-ststx)
  {
    reserve-state: (contract-call? 'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.pool-reserve-data get-reserve-state-read 'SP4SZE494VC2YC5JYG7AYFQ44F5Q4PYV7DVMDPBG.ststx-token),
    supply-apy:    (contract-call? 'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.pool-read-supply-v2-1-3 get-asset-supply-apy 'SP4SZE494VC2YC5JYG7AYFQ44F5Q4PYV7DVMDPBG.ststx-token),
    borrow-apy:    (contract-call? 'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.pool-read-v2-1-4 get-asset-borrow-apy 'SP4SZE494VC2YC5JYG7AYFQ44F5Q4PYV7DVMDPBG.ststx-token),
    e-mode-type:   (contract-call? 'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.pool-0-reserve-v2-0 get-asset-e-mode-type 'SP4SZE494VC2YC5JYG7AYFQ44F5Q4PYV7DVMDPBG.ststx-token),
  }
)

(define-read-only (read-v1-sbtc)
  {
    reserve-state: (contract-call? 'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.pool-reserve-data get-reserve-state-read 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token),
    supply-apy:    (contract-call? 'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.pool-read-supply-v2-1-3 get-asset-supply-apy 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token),
    borrow-apy:    (contract-call? 'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.pool-read-v2-1-4 get-asset-borrow-apy 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token),
    e-mode-type:   (contract-call? 'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.pool-0-reserve-v2-0 get-asset-e-mode-type 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token),
  }
)

(define-read-only (read-v1-aeusdc)
  {
    reserve-state: (contract-call? 'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.pool-reserve-data get-reserve-state-read 'SP3Y2ZSH8P7D50B0VBTSX11S7XSG24M1VB9YFQA4K.token-aeusdc),
    supply-apy:    (contract-call? 'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.pool-read-supply-v2-1-3 get-asset-supply-apy 'SP3Y2ZSH8P7D50B0VBTSX11S7XSG24M1VB9YFQA4K.token-aeusdc),
    borrow-apy:    (contract-call? 'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.pool-read-v2-1-4 get-asset-borrow-apy 'SP3Y2ZSH8P7D50B0VBTSX11S7XSG24M1VB9YFQA4K.token-aeusdc),
    e-mode-type:   (contract-call? 'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.pool-0-reserve-v2-0 get-asset-e-mode-type 'SP3Y2ZSH8P7D50B0VBTSX11S7XSG24M1VB9YFQA4K.token-aeusdc),
  }
)

(define-read-only (read-v1-diko)
  {
    reserve-state: (contract-call? 'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.pool-reserve-data get-reserve-state-read 'SP2C2YFP12AJZB4MABJBAJ55XECVS7E4PMMZ89YZR.arkadiko-token),
    supply-apy:    (contract-call? 'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.pool-read-supply-v2-1-3 get-asset-supply-apy 'SP2C2YFP12AJZB4MABJBAJ55XECVS7E4PMMZ89YZR.arkadiko-token),
    borrow-apy:    (contract-call? 'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.pool-read-v2-1-4 get-asset-borrow-apy 'SP2C2YFP12AJZB4MABJBAJ55XECVS7E4PMMZ89YZR.arkadiko-token),
    e-mode-type:   (contract-call? 'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.pool-0-reserve-v2-0 get-asset-e-mode-type 'SP2C2YFP12AJZB4MABJBAJ55XECVS7E4PMMZ89YZR.arkadiko-token),
  }
)

(define-read-only (read-v1-usdh)
  {
    reserve-state: (contract-call? 'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.pool-reserve-data get-reserve-state-read 'SPN5AKG35QZSK2M8GAMR4AFX45659RJHDW353HSG.usdh-token-v1),
    supply-apy:    (contract-call? 'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.pool-read-supply-v2-1-3 get-asset-supply-apy 'SPN5AKG35QZSK2M8GAMR4AFX45659RJHDW353HSG.usdh-token-v1),
    borrow-apy:    (contract-call? 'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.pool-read-v2-1-4 get-asset-borrow-apy 'SPN5AKG35QZSK2M8GAMR4AFX45659RJHDW353HSG.usdh-token-v1),
    e-mode-type:   (contract-call? 'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.pool-0-reserve-v2-0 get-asset-e-mode-type 'SPN5AKG35QZSK2M8GAMR4AFX45659RJHDW353HSG.usdh-token-v1),
  }
)

(define-read-only (read-v1-susdt)
  {
    reserve-state: (contract-call? 'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.pool-reserve-data get-reserve-state-read 'SP2XD7417HGPRTREMKF748VNEQPDRR0RMANB7X1NK.token-susdt),
    supply-apy:    (contract-call? 'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.pool-read-supply-v2-1-3 get-asset-supply-apy 'SP2XD7417HGPRTREMKF748VNEQPDRR0RMANB7X1NK.token-susdt),
    borrow-apy:    (contract-call? 'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.pool-read-v2-1-4 get-asset-borrow-apy 'SP2XD7417HGPRTREMKF748VNEQPDRR0RMANB7X1NK.token-susdt),
    e-mode-type:   (contract-call? 'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.pool-0-reserve-v2-0 get-asset-e-mode-type 'SP2XD7417HGPRTREMKF748VNEQPDRR0RMANB7X1NK.token-susdt),
  }
)

(define-read-only (read-v1-ststxbtc)
  {
    reserve-state: (contract-call? 'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.pool-reserve-data get-reserve-state-read 'SP4SZE494VC2YC5JYG7AYFQ44F5Q4PYV7DVMDPBG.ststxbtc-token-v2),
    supply-apy:    (contract-call? 'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.pool-read-supply-v2-1-3 get-asset-supply-apy 'SP4SZE494VC2YC5JYG7AYFQ44F5Q4PYV7DVMDPBG.ststxbtc-token-v2),
    borrow-apy:    (contract-call? 'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.pool-read-v2-1-4 get-asset-borrow-apy 'SP4SZE494VC2YC5JYG7AYFQ44F5Q4PYV7DVMDPBG.ststxbtc-token-v2),
    e-mode-type:   (contract-call? 'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.pool-0-reserve-v2-0 get-asset-e-mode-type 'SP4SZE494VC2YC5JYG7AYFQ44F5Q4PYV7DVMDPBG.ststxbtc-token-v2),
  }
)

(define-read-only (read-v1-alex)
  {
    reserve-state: (contract-call? 'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.pool-reserve-data get-reserve-state-read 'SP102V8P0F7JX67ARQ77WEA3D3CFB5XW39REDT0AM.token-alex),
    supply-apy:    (contract-call? 'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.pool-read-supply-v2-1-3 get-asset-supply-apy 'SP102V8P0F7JX67ARQ77WEA3D3CFB5XW39REDT0AM.token-alex),
    borrow-apy:    (contract-call? 'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.pool-read-v2-1-4 get-asset-borrow-apy 'SP102V8P0F7JX67ARQ77WEA3D3CFB5XW39REDT0AM.token-alex),
    e-mode-type:   (contract-call? 'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.pool-0-reserve-v2-0 get-asset-e-mode-type 'SP102V8P0F7JX67ARQ77WEA3D3CFB5XW39REDT0AM.token-alex),
  }
)

;; -------------------------------------------------------------------
;; V1 e-mode config helpers
;; -------------------------------------------------------------------

(define-read-only (read-v1-emode-config-0)
  (contract-call? 'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.pool-0-reserve-v2-0 get-e-mode-type-config 0x00)
)

(define-read-only (read-v1-emode-config-1)
  (contract-call? 'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.pool-0-reserve-v2-0 get-e-mode-type-config 0x01)
)

;; -------------------------------------------------------------------
;; V1 main aggregator: returns all 9 assets + e-mode configs in one call
;; -------------------------------------------------------------------

(define-read-only (get-v1-reserve-data)
  (ok {
    wstx:     (read-v1-wstx),
    ststx:    (read-v1-ststx),
    sbtc:     (read-v1-sbtc),
    aeusdc:   (read-v1-aeusdc),
    diko:     (read-v1-diko),
    usdh:     (read-v1-usdh),
    susdt:    (read-v1-susdt),
    ststxbtc: (read-v1-ststxbtc),
    alex:     (read-v1-alex),
    ;; E-mode configs
    emode-0:  (read-v1-emode-config-0),
    emode-1:  (read-v1-emode-config-1),
    ;; Global asset list
    assets:   (contract-call? 'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.pool-reserve-data get-assets-read),
  })
)

;; ===================================================================
;; V2 READER -6 vaults, hub-spoke architecture
;; ===================================================================
;;
;; Per-vault data tuple:
;; {
;;   total-supply:   uint  -total z-token shares
;;   total-assets:   uint  -total underlying assets in vault
;;   debt:           uint  -total borrowed
;;   available:      uint  -available to borrow
;;   interest-rate:  uint  -current borrow interest rate
;;   index:          uint  -borrow index
;;   lindex:         uint  -liquidity index
;;   cap-debt:       uint  -max borrow cap
;;   cap-supply:     uint  -max supply cap
;;   fee-reserve:    uint  -reserve fee (protocol take)
;; }

;; -------------------------------------------------------------------
;; V2 per-vault helpers
;; -------------------------------------------------------------------

(define-read-only (read-vault-stx)
  {
    total-supply:   (unwrap-panic (contract-call? 'SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.v0-vault-stx get-total-supply)),
    total-assets:   (unwrap-panic (contract-call? 'SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.v0-vault-stx get-total-assets)),
    debt:           (unwrap-panic (contract-call? 'SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.v0-vault-stx get-debt)),
    available:      (contract-call? 'SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.v0-vault-stx get-available-assets),
    interest-rate:  (unwrap-panic (contract-call? 'SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.v0-vault-stx get-interest-rate)),
    index:          (unwrap-panic (contract-call? 'SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.v0-vault-stx get-index)),
    lindex:         (unwrap-panic (contract-call? 'SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.v0-vault-stx get-liquidity-index)),
    cap-debt:       (unwrap-panic (contract-call? 'SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.v0-vault-stx get-cap-debt)),
    cap-supply:     (unwrap-panic (contract-call? 'SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.v0-vault-stx get-cap-supply)),
    fee-reserve:    (unwrap-panic (contract-call? 'SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.v0-vault-stx get-fee-reserve))
  }
)

(define-read-only (read-vault-sbtc)
  {
    total-supply:   (unwrap-panic (contract-call? 'SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.v0-vault-sbtc get-total-supply)),
    total-assets:   (unwrap-panic (contract-call? 'SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.v0-vault-sbtc get-total-assets)),
    debt:           (unwrap-panic (contract-call? 'SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.v0-vault-sbtc get-debt)),
    available:      (contract-call? 'SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.v0-vault-sbtc get-available-assets),
    interest-rate:  (unwrap-panic (contract-call? 'SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.v0-vault-sbtc get-interest-rate)),
    index:          (unwrap-panic (contract-call? 'SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.v0-vault-sbtc get-index)),
    lindex:         (unwrap-panic (contract-call? 'SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.v0-vault-sbtc get-liquidity-index)),
    cap-debt:       (unwrap-panic (contract-call? 'SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.v0-vault-sbtc get-cap-debt)),
    cap-supply:     (unwrap-panic (contract-call? 'SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.v0-vault-sbtc get-cap-supply)),
    fee-reserve:    (unwrap-panic (contract-call? 'SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.v0-vault-sbtc get-fee-reserve))
  }
)

(define-read-only (read-vault-ststx)
  {
    total-supply:   (unwrap-panic (contract-call? 'SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.v0-vault-ststx get-total-supply)),
    total-assets:   (unwrap-panic (contract-call? 'SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.v0-vault-ststx get-total-assets)),
    debt:           (unwrap-panic (contract-call? 'SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.v0-vault-ststx get-debt)),
    available:      (contract-call? 'SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.v0-vault-ststx get-available-assets),
    interest-rate:  (unwrap-panic (contract-call? 'SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.v0-vault-ststx get-interest-rate)),
    index:          (unwrap-panic (contract-call? 'SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.v0-vault-ststx get-index)),
    lindex:         (unwrap-panic (contract-call? 'SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.v0-vault-ststx get-liquidity-index)),
    cap-debt:       (unwrap-panic (contract-call? 'SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.v0-vault-ststx get-cap-debt)),
    cap-supply:     (unwrap-panic (contract-call? 'SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.v0-vault-ststx get-cap-supply)),
    fee-reserve:    (unwrap-panic (contract-call? 'SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.v0-vault-ststx get-fee-reserve))
  }
)

(define-read-only (read-vault-usdc)
  {
    total-supply:   (unwrap-panic (contract-call? 'SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.v0-vault-usdc get-total-supply)),
    total-assets:   (unwrap-panic (contract-call? 'SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.v0-vault-usdc get-total-assets)),
    debt:           (unwrap-panic (contract-call? 'SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.v0-vault-usdc get-debt)),
    available:      (contract-call? 'SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.v0-vault-usdc get-available-assets),
    interest-rate:  (unwrap-panic (contract-call? 'SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.v0-vault-usdc get-interest-rate)),
    index:          (unwrap-panic (contract-call? 'SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.v0-vault-usdc get-index)),
    lindex:         (unwrap-panic (contract-call? 'SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.v0-vault-usdc get-liquidity-index)),
    cap-debt:       (unwrap-panic (contract-call? 'SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.v0-vault-usdc get-cap-debt)),
    cap-supply:     (unwrap-panic (contract-call? 'SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.v0-vault-usdc get-cap-supply)),
    fee-reserve:    (unwrap-panic (contract-call? 'SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.v0-vault-usdc get-fee-reserve))
  }
)

(define-read-only (read-vault-usdh)
  {
    total-supply:   (unwrap-panic (contract-call? 'SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.v0-vault-usdh get-total-supply)),
    total-assets:   (unwrap-panic (contract-call? 'SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.v0-vault-usdh get-total-assets)),
    debt:           (unwrap-panic (contract-call? 'SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.v0-vault-usdh get-debt)),
    available:      (contract-call? 'SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.v0-vault-usdh get-available-assets),
    interest-rate:  (unwrap-panic (contract-call? 'SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.v0-vault-usdh get-interest-rate)),
    index:          (unwrap-panic (contract-call? 'SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.v0-vault-usdh get-index)),
    lindex:         (unwrap-panic (contract-call? 'SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.v0-vault-usdh get-liquidity-index)),
    cap-debt:       (unwrap-panic (contract-call? 'SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.v0-vault-usdh get-cap-debt)),
    cap-supply:     (unwrap-panic (contract-call? 'SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.v0-vault-usdh get-cap-supply)),
    fee-reserve:    (unwrap-panic (contract-call? 'SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.v0-vault-usdh get-fee-reserve))
  }
)

(define-read-only (read-vault-ststxbtc)
  {
    total-supply:   (unwrap-panic (contract-call? 'SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.v0-vault-ststxbtc get-total-supply)),
    total-assets:   (unwrap-panic (contract-call? 'SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.v0-vault-ststxbtc get-total-assets)),
    debt:           (unwrap-panic (contract-call? 'SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.v0-vault-ststxbtc get-debt)),
    available:      (contract-call? 'SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.v0-vault-ststxbtc get-available-assets),
    interest-rate:  (unwrap-panic (contract-call? 'SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.v0-vault-ststxbtc get-interest-rate)),
    index:          (unwrap-panic (contract-call? 'SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.v0-vault-ststxbtc get-index)),
    lindex:         (unwrap-panic (contract-call? 'SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.v0-vault-ststxbtc get-liquidity-index)),
    cap-debt:       (unwrap-panic (contract-call? 'SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.v0-vault-ststxbtc get-cap-debt)),
    cap-supply:     (unwrap-panic (contract-call? 'SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.v0-vault-ststxbtc get-cap-supply)),
    fee-reserve:    (unwrap-panic (contract-call? 'SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.v0-vault-ststxbtc get-fee-reserve))
  }
)

;; -------------------------------------------------------------------
;; V2 main aggregator: returns all 6 vaults + asset bitmap in one call
;; -------------------------------------------------------------------

(define-read-only (get-v2-reserve-data)
  (ok {
    stx:      (read-vault-stx),
    sbtc:     (read-vault-sbtc),
    ststx:    (read-vault-ststx),
    usdc:     (read-vault-usdc),
    usdh:     (read-vault-usdh),
    ststxbtc: (read-vault-ststxbtc),
    ;; Global asset enable/disable bitmap from registry
    asset-bitmap: (contract-call? 'SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.v0-assets get-bitmap)
  })
)

;; Keep legacy name for backwards compatibility
(define-read-only (get-all-reserve-data)
  (get-v2-reserve-data)
)
