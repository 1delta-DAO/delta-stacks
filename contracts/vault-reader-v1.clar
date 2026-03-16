;; vault-reader-v1.clar
;;
;; Aggregator for reading all V3 vault states in a single RPC call each.
;; Collapses ~17 individual HTTP requests (USDCx) / ~15 (STX/sBTC) into 1 per vault.
;;
;; Also includes the external market data the frontend needs for APR computation
;; (Granite LP params, Zest V2 interest rate, etc.) so the frontend only needs
;; ONE read-only call per vault.
;;
;; NOTE: The sBTC vault has get-vault-state built-in (the preferred pattern going
;; forward). For USDCx and STX (deployed before this pattern existed), this
;; external reader provides the same functionality.
;;
;; Deployed by delta-stacks.

;; ===================================================================
;; USDCx VAULT (vault-usdcx-v3)
;; Markets: Granite USDCx + Zest V2 USDC
;; ===================================================================

(define-read-only (read-vault-usdcx)
  {
    ;; Core vault state
    total-assets:      (contract-call? 'SP2DRPT3AA170EK5DC4T22CMSXZ6HACATPXHPAT7H.vault-usdcx-v3 get-total-assets),
    total-supply:      (unwrap-panic (contract-call? 'SP2DRPT3AA170EK5DC4T22CMSXZ6HACATPXHPAT7H.vault-usdcx-v3 get-total-supply)),
    alloc-granite:     (contract-call? 'SP2DRPT3AA170EK5DC4T22CMSXZ6HACATPXHPAT7H.vault-usdcx-v3 get-alloc-granite),
    alloc-zest-v2:     (contract-call? 'SP2DRPT3AA170EK5DC4T22CMSXZ6HACATPXHPAT7H.vault-usdcx-v3 get-alloc-zest-v2),
    idle-bookkeeping:  (contract-call? 'SP2DRPT3AA170EK5DC4T22CMSXZ6HACATPXHPAT7H.vault-usdcx-v3 get-idle-bookkeeping),
    idle-balance:      (contract-call? 'SP2DRPT3AA170EK5DC4T22CMSXZ6HACATPXHPAT7H.vault-usdcx-v3 get-idle-balance),
    live-granite:      (contract-call? 'SP2DRPT3AA170EK5DC4T22CMSXZ6HACATPXHPAT7H.vault-usdcx-v3 get-granite-usdcx-position),
    live-zest-v2:      (contract-call? 'SP2DRPT3AA170EK5DC4T22CMSXZ6HACATPXHPAT7H.vault-usdcx-v3 get-zest-v2-usdc-position),
    live-total:        (contract-call? 'SP2DRPT3AA170EK5DC4T22CMSXZ6HACATPXHPAT7H.vault-usdcx-v3 get-live-total-assets),
    fee-bps:           (contract-call? 'SP2DRPT3AA170EK5DC4T22CMSXZ6HACATPXHPAT7H.vault-usdcx-v3 get-fee-bps),
    idle-buffer-bps:   (contract-call? 'SP2DRPT3AA170EK5DC4T22CMSXZ6HACATPXHPAT7H.vault-usdcx-v3 get-idle-buffer-bps),
    virtual-offset:    (contract-call? 'SP2DRPT3AA170EK5DC4T22CMSXZ6HACATPXHPAT7H.vault-usdcx-v3 get-virtual-offset),
    ;; External market data for APR computation
    granite-lp-params:      (contract-call? 'SP3M2BYF7RGF8WKW5FVDNJ6WR8D7AR9BHDXAKPXZE.state-v1 get-lp-params),
    granite-open-interest:  (contract-call? 'SP3M2BYF7RGF8WKW5FVDNJ6WR8D7AR9BHDXAKPXZE.state-v1 get-open-interest),
    zest-v2-interest-rate:  (unwrap-panic (contract-call? 'SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.v0-vault-usdc get-interest-rate)),
    zest-v2-utilization:    (unwrap-panic (contract-call? 'SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.v0-vault-usdc get-utilization)),
    zest-v2-fee-reserve:    (unwrap-panic (contract-call? 'SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.v0-vault-usdc get-fee-reserve)),
  }
)

;; ===================================================================
;; STX VAULT (vault-stx-v3-1)
;; Markets: Zest V1 wSTX + Zest V2 STX
;; ===================================================================

(define-read-only (read-vault-stx)
  {
    ;; Core vault state
    total-assets:      (contract-call? 'SP2DRPT3AA170EK5DC4T22CMSXZ6HACATPXHPAT7H.vault-stx-v3-1 get-total-assets),
    total-supply:      (unwrap-panic (contract-call? 'SP2DRPT3AA170EK5DC4T22CMSXZ6HACATPXHPAT7H.vault-stx-v3-1 get-total-supply)),
    alloc-zest-v1:     (contract-call? 'SP2DRPT3AA170EK5DC4T22CMSXZ6HACATPXHPAT7H.vault-stx-v3-1 get-alloc-zest-v1),
    alloc-zest-v2:     (contract-call? 'SP2DRPT3AA170EK5DC4T22CMSXZ6HACATPXHPAT7H.vault-stx-v3-1 get-alloc-zest-v2),
    idle-bookkeeping:  (contract-call? 'SP2DRPT3AA170EK5DC4T22CMSXZ6HACATPXHPAT7H.vault-stx-v3-1 get-idle-bookkeeping),
    idle-balance:      (contract-call? 'SP2DRPT3AA170EK5DC4T22CMSXZ6HACATPXHPAT7H.vault-stx-v3-1 get-idle-balance),
    live-zest-v1:      (contract-call? 'SP2DRPT3AA170EK5DC4T22CMSXZ6HACATPXHPAT7H.vault-stx-v3-1 get-zest-v1-wstx-position),
    live-zest-v2:      (contract-call? 'SP2DRPT3AA170EK5DC4T22CMSXZ6HACATPXHPAT7H.vault-stx-v3-1 get-zest-v2-stx-position),
    live-total:        (contract-call? 'SP2DRPT3AA170EK5DC4T22CMSXZ6HACATPXHPAT7H.vault-stx-v3-1 get-live-total-assets),
    fee-bps:           (contract-call? 'SP2DRPT3AA170EK5DC4T22CMSXZ6HACATPXHPAT7H.vault-stx-v3-1 get-fee-bps),
    idle-buffer-bps:   (contract-call? 'SP2DRPT3AA170EK5DC4T22CMSXZ6HACATPXHPAT7H.vault-stx-v3-1 get-idle-buffer-bps),
    virtual-offset:    (contract-call? 'SP2DRPT3AA170EK5DC4T22CMSXZ6HACATPXHPAT7H.vault-stx-v3-1 get-virtual-offset),
    ;; External market data for APR computation
    ;; (Zest V1 APR comes from backend API, not on-chain -- uses Aave-style accrual)
    zest-v2-interest-rate:  (unwrap-panic (contract-call? 'SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.v0-vault-stx get-interest-rate)),
    zest-v2-utilization:    (unwrap-panic (contract-call? 'SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.v0-vault-stx get-utilization)),
    zest-v2-fee-reserve:    (unwrap-panic (contract-call? 'SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.v0-vault-stx get-fee-reserve)),
  }
)

;; ===================================================================
;; sBTC VAULT (vault-sbtc-v3)
;; Markets: Zest V1 sBTC + Zest V2 sBTC
;; NOTE: vault-sbtc-v3 has get-vault-state built-in, so this is a
;; convenience wrapper for the unified read-all-vaults call.
;; ===================================================================

(define-read-only (read-vault-sbtc)
  {
    ;; Core vault state
    total-assets:      (contract-call? 'SP2DRPT3AA170EK5DC4T22CMSXZ6HACATPXHPAT7H.vault-sbtc-v3 get-total-assets),
    total-supply:      (unwrap-panic (contract-call? 'SP2DRPT3AA170EK5DC4T22CMSXZ6HACATPXHPAT7H.vault-sbtc-v3 get-total-supply)),
    alloc-zest-v1:     (contract-call? 'SP2DRPT3AA170EK5DC4T22CMSXZ6HACATPXHPAT7H.vault-sbtc-v3 get-alloc-zest-v1),
    alloc-zest-v2:     (contract-call? 'SP2DRPT3AA170EK5DC4T22CMSXZ6HACATPXHPAT7H.vault-sbtc-v3 get-alloc-zest-v2),
    idle-bookkeeping:  (contract-call? 'SP2DRPT3AA170EK5DC4T22CMSXZ6HACATPXHPAT7H.vault-sbtc-v3 get-idle-bookkeeping),
    idle-balance:      (contract-call? 'SP2DRPT3AA170EK5DC4T22CMSXZ6HACATPXHPAT7H.vault-sbtc-v3 get-idle-balance),
    live-zest-v1:      (contract-call? 'SP2DRPT3AA170EK5DC4T22CMSXZ6HACATPXHPAT7H.vault-sbtc-v3 get-zest-v1-sbtc-position),
    live-zest-v2:      (contract-call? 'SP2DRPT3AA170EK5DC4T22CMSXZ6HACATPXHPAT7H.vault-sbtc-v3 get-zest-v2-sbtc-position),
    live-total:        (contract-call? 'SP2DRPT3AA170EK5DC4T22CMSXZ6HACATPXHPAT7H.vault-sbtc-v3 get-live-total-assets),
    fee-bps:           (contract-call? 'SP2DRPT3AA170EK5DC4T22CMSXZ6HACATPXHPAT7H.vault-sbtc-v3 get-fee-bps),
    idle-buffer-bps:   (contract-call? 'SP2DRPT3AA170EK5DC4T22CMSXZ6HACATPXHPAT7H.vault-sbtc-v3 get-idle-buffer-bps),
    virtual-offset:    (contract-call? 'SP2DRPT3AA170EK5DC4T22CMSXZ6HACATPXHPAT7H.vault-sbtc-v3 get-virtual-offset),
    ;; External market data for APR computation
    ;; (Zest V1 APR comes from backend API -- Aave-style accrual)
    zest-v2-interest-rate:  (unwrap-panic (contract-call? 'SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.v0-vault-sbtc get-interest-rate)),
    zest-v2-utilization:    (unwrap-panic (contract-call? 'SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.v0-vault-sbtc get-utilization)),
    zest-v2-fee-reserve:    (unwrap-panic (contract-call? 'SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.v0-vault-sbtc get-fee-reserve)),
  }
)

;; ===================================================================
;; Combined: all 3 vaults in one call (~47 reads, 1 RPC call)
;; ===================================================================

(define-read-only (read-all-vaults)
  (ok {
    usdcx: (read-vault-usdcx),
    stx:   (read-vault-stx),
    sbtc:  (read-vault-sbtc),
  })
)
