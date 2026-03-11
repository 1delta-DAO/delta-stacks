;; lending-adapter-trait.clar
;;
;; Interface that every external-market adapter must implement.
;; The vault calls these functions as-contract, so inside the adapter
;; tx-sender == vault-principal.  The adapter uses that to pull tokens
;; from the vault (or to authorise the vault as the return recipient).
;;
;; Adapter flow -- deposit:
;;   vault (as-contract) -> adapter.adapter-deposit(amount)
;;     -> mock-token.transfer(amount, vault, adapter, none)   ;; pull from vault
;;     -> (as-contract) external-market.deposit(amount, ...)  ;; deploy from adapter
;;
;; Adapter flow -- withdraw:
;;   vault (as-contract) -> adapter.adapter-withdraw(amount, vault)
;;     -> (as-contract) external-market.withdraw(amount, ...)  ;; market -> adapter
;;     -> (as-contract) mock-token.transfer(amount, adapter, vault, none)

(define-trait lending-adapter-trait
  (
    ;; Deposit `amount` of the vault asset into this market.
    ;; Called with tx-sender == vault. The adapter is responsible for pulling
    ;; tokens from tx-sender and deploying them into the external protocol.
    ;; Returns: (ok tokens-actually-deposited)
    (adapter-deposit (uint) (response uint uint))

    ;; Withdraw `amount` of the vault asset from this market, sending the
    ;; proceeds to `recipient` (always the vault in practice).
    ;; Called with tx-sender == vault.
    ;; Returns: (ok tokens-actually-received)
    (adapter-withdraw (uint principal) (response uint uint))

    ;; Return the current market value of the vault's position in this market,
    ;; denominated in the vault asset (e.g. USDCx).  This is a live read that
    ;; reflects accrued interest -- it will exceed the original book-cost once
    ;; yield has accumulated.
    ;;
    ;; Called as a read-only query; no state changes.
    ;; Returns: (ok current-asset-value)
    (adapter-get-position () (response uint uint))
  )
)
