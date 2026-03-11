;; mock-adapter.clar
;;
;; Minimal lending adapter for simnet tests.
;; Implements lending-adapter-trait: holds mock-token and returns it on demand.
;; No yield accrual -- position equals exactly what was deposited.
;; Yield can be simulated in tests by minting extra tokens directly to this contract.

(impl-trait .lending-adapter-trait.lending-adapter-trait)

;; Pull `amount` tokens from the vault (tx-sender == vault via as-contract in do-allocate-*)
;; and hold them here.  Returns the amount accepted.
(define-public (adapter-deposit (amount uint))
  (begin
    (try! (contract-call? .mock-token transfer amount tx-sender (as-contract tx-sender) none))
    (ok amount)))

;; Send `amount` tokens from this adapter to `recipient`.
;; Called by do-deallocate-* (tx-sender == vault).  Returns the amount sent.
(define-public (adapter-withdraw (amount uint) (recipient principal))
  (begin
    (try! (as-contract (contract-call? .mock-token transfer amount tx-sender recipient none)))
    (ok amount)))

;; Return the current token balance of this adapter -- used for yield detection.
(define-public (adapter-get-position)
  (ok (unwrap-panic (contract-call? .mock-token get-balance (as-contract tx-sender)))))
