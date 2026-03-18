;; adapter-zest-v2-stx.clar
;;
;; Adapter bridging the STX vault to the Zest V2 STX vault (ERC-4626-style).
;; Implements lending-adapter-trait so the vault can deposit, withdraw, and
;; query position value through a uniform interface.
;;
;; Zest V2 uses its own wSTX (SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.wstx)
;; as the underlying token.  Since wSTX = native STX (transparent wrapper),
;; the adapter pulls STX from the vault via wSTX.transfer and deposits into
;; the Zest V2 vault.

(impl-trait .lending-adapter-trait.lending-adapter-trait)

;; ---------------------------------------------------------------------------
;; Constants -- Zest V2 contracts
;; ---------------------------------------------------------------------------

(define-constant wstx 'SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.wstx)
(define-constant zest-vault 'SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.v0-vault-stx)

;; ---------------------------------------------------------------------------
;; lending-adapter-trait implementation
;; ---------------------------------------------------------------------------

;; Deposit `amount` STX into Zest V2.
;;
;; Flow: vault (as-contract) -> this adapter
;;   1. Pull STX from vault (tx-sender) into this adapter via wSTX transfer
;;   2. Deposit into Zest V2 vault; adapter receives zSTX shares
;;
;; Returns: (ok zshares-minted)
(define-public (adapter-deposit (amount uint))
  (let ((vault tx-sender))
    ;; 1. Pull STX from the vault into this adapter contract.
    (try! (contract-call? 'SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.wstx
             transfer amount vault (as-contract tx-sender) none))
    ;; 2. Deposit into Zest V2.  zSTX shares minted to this adapter.
    ;;    min-out = u0 (no slippage guard; vault trusts the protocol).
    (let ((zshares (try! (as-contract
                          (contract-call? 'SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.v0-vault-stx
                            deposit amount u0 tx-sender)))))
      (ok zshares))))

;; Withdraw `amount` STX from Zest V2, sending proceeds to `recipient`.
;;
;; Converts the desired asset amount to zShares (via convert-to-shares), then
;; redeems those shares.  Zest V2's `redeem` burns shares and sends the
;; underlying wSTX (= native STX) to `recipient`.
;;
;; Returns: (ok underlying-received)
(define-public (adapter-withdraw (amount uint) (recipient principal))
  (let ((shares (unwrap! (as-contract
                  (contract-call? 'SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.v0-vault-stx
                    convert-to-shares amount))
                  (err u0)))
        (received (try! (as-contract
                    (contract-call? 'SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.v0-vault-stx
                      redeem shares u0 recipient)))))
    (ok received)))

;; Read the live STX value of this adapter's Zest V2 position.
;;
;; Reads the adapter's zSTX share balance and converts to underlying assets
;; via the Zest V2 vault's convert-to-assets function.
;;
;; Returns: (ok current-asset-value)
(define-public (adapter-get-position)
  (let ((adapter-principal (as-contract tx-sender))
        (my-shares (unwrap! (contract-call? 'SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.v0-vault-stx
                               get-balance adapter-principal)
                     (err u0)))
        (assets (unwrap! (contract-call? 'SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.v0-vault-stx
                            convert-to-assets my-shares)
                  (err u0))))
    (ok assets)))
