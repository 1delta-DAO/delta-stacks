;; adapter-zest-v2-usdc.clar
;;
;; Adapter bridging the vault to the Zest V2 USDCx vault (ERC-4626-style).
;; Implements lending-adapter-trait so the vault can deposit, withdraw, and
;; query position value through a uniform interface.
;;
;; Zest V2 deposits mint zShares which appreciate as borrowers pay interest.
;; No collateral registration -- pure yield supply only.

(impl-trait .lending-adapter-trait.lending-adapter-trait)

;; ---------------------------------------------------------------------------
;; Constants -- Zest V2 contracts
;; ---------------------------------------------------------------------------

(define-constant usdcx 'SP120SBRBQJ00MCWS7TM5R8WJNTTKD5K0HFRC2CNE.usdcx)
(define-constant zest-vault 'SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.v0-vault-usdc)

;; ---------------------------------------------------------------------------
;; lending-adapter-trait implementation
;; ---------------------------------------------------------------------------

;; Deposit `amount` USDCx into Zest V2.
;;
;; Flow: vault (as-contract) -> this adapter
;;   1. Pull USDCx from vault (tx-sender) into this adapter
;;   2. Deposit into Zest V2 vault; adapter receives zShares
;;
;; Returns: (ok zshares-minted)
(define-public (adapter-deposit (amount uint))
  (let ((vault tx-sender))
    ;; 1. Pull USDCx from the vault into this adapter contract.
    (try! (contract-call? 'SP120SBRBQJ00MCWS7TM5R8WJNTTKD5K0HFRC2CNE.usdcx
             transfer amount vault (as-contract tx-sender) none))
    ;; 2. Deposit into Zest V2.  zShares minted to this adapter.
    ;;    min-out = u0 (no slippage guard; vault trusts the protocol).
    (let ((zshares (try! (as-contract
                          (contract-call? 'SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.v0-vault-usdc
                            deposit amount u0 tx-sender)))))
      (ok zshares))))

;; Withdraw `amount` USDCx from Zest V2, sending proceeds to `recipient`.
;;
;; Converts the desired asset amount to zShares (via convert-to-shares), then
;; redeems those shares.  Zest V2's `redeem` burns shares and sends the
;; underlying to `recipient`.
;;
;; Returns: (ok underlying-received)
(define-public (adapter-withdraw (amount uint) (recipient principal))
  (let ((shares (unwrap! (as-contract
                  (contract-call? 'SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.v0-vault-usdc
                    convert-to-shares amount))
                  (err u0)))
        (received (try! (as-contract
                    (contract-call? 'SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.v0-vault-usdc
                      redeem shares u0 recipient)))))
    (ok received)))

;; Read the live USDCx value of this adapter's Zest V2 position.
;;
;; Reads the adapter's zShare balance and converts to underlying assets
;; via the Zest V2 vault's convert-to-assets function.
;;
;; Returns: (ok current-asset-value)
(define-public (adapter-get-position)
  (let ((adapter-principal (as-contract tx-sender))
        (my-shares (unwrap! (contract-call? 'SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.v0-vault-usdc
                               get-balance adapter-principal)
                     (err u0)))
        (assets (unwrap! (contract-call? 'SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.v0-vault-usdc
                            convert-to-assets my-shares)
                  (err u0))))
    (ok assets)))
