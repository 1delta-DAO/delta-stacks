;; Mock usdcx token for testing
;; Structurally implements SIP-010 (all required functions present).
;; impl-trait omitted to avoid external contract resolution during clarinet check.

(define-fungible-token mock-usdcx)
(define-constant err-unauthorized (err u1))
(define-constant err-insufficient (err u2))
;; `tx-sender` or `contract-caller` tried to move a token it does not own.
(define-constant ERR_NOT_OWNER (err u4))

(define-read-only (get-name)      (ok "Mock USDCx"))
(define-read-only (get-symbol)    (ok "mUSDCx"))
(define-read-only (get-decimals)  (ok u6))
(define-read-only (get-token-uri) (ok none))

(define-read-only (get-balance (owner principal))
  (ok (ft-get-balance mock-usdcx owner)))

(define-read-only (get-total-supply)
  (ok (ft-get-supply mock-usdcx)))

(define-public (transfer
    (amount uint)
    (sender principal)
    (recipient principal)
    (memo (optional (buff 34)))
  )
  (begin
    (asserts! (or (is-eq tx-sender sender) (is-eq contract-caller sender))
      ERR_NOT_OWNER
    )
    (try! (ft-transfer? mock-usdcx amount sender recipient))
    (match memo
      to-print (print to-print)
      0x
    )
    (ok true)
  )
)
;; mint tokens to recipient
(define-public (mint (amount uint) (recipient principal))
  (ft-mint? mock-usdcx amount recipient))
