;; zest-v1-sbtc-manager.clar
;;
;; Standalone manager for Zest V1 sBTC operations.  All borrow-helper calls
;; happen here at minimal stack depth, avoiding MaxStackDepthReached.
;;
;; Access: restricted to the vault's registered allocator/owner.

(define-constant VAULT 'SP2DRPT3AA170EK5DC4T22CMSXZ6HACATPXHPAT7H.vault-sbtc-v5)
(define-constant THIN_ADAPTER 'SP2DRPT3AA170EK5DC4T22CMSXZ6HACATPXHPAT7H.adapter-zest-v1-sbtc-thin)

(define-constant err-not-allocator (err u200))
(define-constant err-amount-zero   (err u201))

;; ---------------------------------------------------------------------------
;; Access control -- read allocator from vault
;; ---------------------------------------------------------------------------

(define-read-only (get-allocator)
  (contract-call? 'SP2DRPT3AA170EK5DC4T22CMSXZ6HACATPXHPAT7H.vault-sbtc-v5
    get-vault-allocator))

(define-read-only (get-owner)
  (contract-call? 'SP2DRPT3AA170EK5DC4T22CMSXZ6HACATPXHPAT7H.vault-sbtc-v5
    get-vault-owner))

(define-private (is-authorized)
  (or (is-eq tx-sender (get-allocator))
      (is-eq tx-sender (get-owner))))

;; ---------------------------------------------------------------------------
;; Recall: withdraw from Zest V1 -> vault idle
;; ---------------------------------------------------------------------------

(define-public (recall (amount uint))
  (begin
    (asserts! (is-authorized) err-not-allocator)
    (asserts! (> amount u0) err-amount-zero)
    (try! (contract-call? 'SP2DRPT3AA170EK5DC4T22CMSXZ6HACATPXHPAT7H.adapter-zest-v1-sbtc-thin
             pull amount))
    (try! (contract-call? 'SP2DRPT3AA170EK5DC4T22CMSXZ6HACATPXHPAT7H.adapter-zest-v1-sbtc-thin
             forward amount VAULT))
    (ok amount)))

;; ---------------------------------------------------------------------------
;; Get position: read Zest V1 balance
;; ---------------------------------------------------------------------------

(define-public (get-position)
  (contract-call? 'SP2DRPT3AA170EK5DC4T22CMSXZ6HACATPXHPAT7H.adapter-zest-v1-sbtc-thin
    adapter-get-position))
