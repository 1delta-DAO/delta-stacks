;; adapter-zest-v2-sbtc.clar
;;
;; Adapter bridging the sBTC vault to the Zest V2 sBTC vault (ERC-4626-style).
;; Implements lending-adapter-trait so the vault can deposit, withdraw, and
;; query position value through a uniform interface.
;;
;; sBTC is a standard SIP-010 token -- no wrapping needed.
;; Zest V2 sBTC vault: SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.v0-vault-sbtc

(impl-trait .lending-adapter-trait.lending-adapter-trait)

;; ---------------------------------------------------------------------------
;; Constants -- Zest V2 contracts
;; ---------------------------------------------------------------------------

(define-constant sbtc 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token)
(define-constant zest-vault 'SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.v0-vault-sbtc)

;; ---------------------------------------------------------------------------
;; lending-adapter-trait implementation
;; ---------------------------------------------------------------------------

;; Deposit `amount` sBTC into Zest V2.
;;
;; Flow: vault (as-contract) -> this adapter
;;   1. Pull sBTC from vault (tx-sender) into this adapter via SIP-010 transfer
;;   2. Deposit into Zest V2 vault; adapter receives zsBTC shares
;;
;; Returns: (ok zshares-minted)
(define-public (adapter-deposit (amount uint))
  (let ((vault tx-sender))
    ;; 1. Pull sBTC from the vault into this adapter contract.
    (try! (contract-call? 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token
             transfer amount vault (as-contract tx-sender) none))
    ;; 2. Deposit into Zest V2.  zsBTC shares minted to this adapter.
    ;;    min-out = u0 (no slippage guard; vault trusts the protocol).
    (let ((zshares (try! (as-contract
                          (contract-call? 'SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.v0-vault-sbtc
                            deposit amount u0 tx-sender)))))
      (ok zshares))))

;; Withdraw `amount` sBTC from Zest V2, sending proceeds to `recipient`.
;;
;; Converts the desired asset amount to zShares (via convert-to-shares), then
;; redeems those shares.  Zest V2's `redeem` burns shares and sends the
;; underlying sBTC to `recipient`.
;;
;; Returns: (ok underlying-received)
(define-public (adapter-withdraw (amount uint) (recipient principal))
  (let ((shares (unwrap! (as-contract
                  (contract-call? 'SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.v0-vault-sbtc
                    convert-to-shares amount))
                  (err u0)))
        (received (try! (as-contract
                    (contract-call? 'SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.v0-vault-sbtc
                      redeem shares u0 recipient)))))
    (ok received)))

;; Read the live sBTC value of this adapter's Zest V2 position.
;;
;; Reads the adapter's zsBTC share balance and converts to underlying assets
;; via the Zest V2 vault's convert-to-assets function.
;;
;; Returns: (ok current-asset-value)
(define-public (adapter-get-position)
  (let ((adapter-principal (as-contract tx-sender))
        (my-shares (unwrap! (contract-call? 'SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.v0-vault-sbtc
                               get-balance adapter-principal)
                     (err u0)))
        (assets (unwrap! (contract-call? 'SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.v0-vault-sbtc
                            convert-to-assets my-shares)
                  (err u0))))
    (ok assets)))
