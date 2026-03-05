;; zest-v2-reader.clar
;;
;; Purpose-built aggregator contract for reading all Zest V2 reserve data
;; in a single read-only call. Collapses ~60 individual HTTP requests into 1.
;;
;; Deployed by delta-stacks. Calls Zest V2 contracts on mainnet:
;;   Deployer: SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7

;; -------------------------------------------------------------------
;; Vault data tuple type (returned per vault)
;; -------------------------------------------------------------------
;; {
;;   total-supply:   uint  — total z-token shares
;;   total-assets:   uint  — total underlying assets in vault
;;   debt:           uint  — total borrowed
;;   available:      uint  — available to borrow
;;   interest-rate:  uint  — current borrow interest rate
;;   index:          uint  — borrow index
;;   lindex:         uint  — liquidity index
;;   cap-debt:       uint  — max borrow cap
;;   cap-supply:     uint  — max supply cap
;;   fee-reserve:    uint  — reserve fee (protocol take)
;; }

;; -------------------------------------------------------------------
;; Helper: read one vault's full data
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
;; Main aggregator: returns all 6 vaults + asset bitmap in one call
;; -------------------------------------------------------------------

(define-read-only (get-all-reserve-data)
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
