;; mock-adapter-2.clar
;;
;; Second mock adapter for testing two-market allocation.
;; Identical to mock-adapter but deployed as a separate contract
;; so each market has its own token balance.

(impl-trait .lending-adapter-trait.lending-adapter-trait)

(define-public (adapter-deposit (amount uint))
  (begin
    (try! (contract-call? .mock-token transfer amount tx-sender (as-contract tx-sender) none))
    (ok amount)))

(define-public (adapter-withdraw (amount uint) (recipient principal))
  (begin
    (try! (as-contract (contract-call? .mock-token transfer amount tx-sender recipient none)))
    (ok amount)))

(define-public (adapter-get-position)
  (ok (unwrap-panic (contract-call? .mock-token get-balance (as-contract tx-sender)))))
