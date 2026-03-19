;; adapter-zest-v1-wstx.clar
;;
;; Adapter bridging the STX vault to the Zest V1 wSTX lending pool (Aave-like).
;; Implements lending-adapter-trait so the vault can deposit, withdraw, and
;; query position value through a uniform interface.
;;
;; wSTX wrapping
;; -------------
;; Zest V1 uses wSTX (SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.wstx) which is
;; a SIP-010 wrapper around native STX -- balance = stx-get-balance, transfer =
;; stx-transfer?.  No explicit wrap/unwrap step is needed; the adapter just
;; passes wSTX as the token trait reference.
;;
;; On deposit the adapter receives STX from the vault (via any wSTX.transfer)
;; and calls borrow-helper.supply with the Zest V1 wSTX contract.
;;
;; On withdraw the adapter calls borrow-helper.withdraw which sends wSTX
;; (= native STX) back to the recipient (vault).
;;
;; Pyth note
;; ---------
;; borrow-helper.withdraw requires Pyth price feeds for health factor checks.
;; Since this adapter is a pure supplier with NO borrows, the health factor is
;; infinite.  We pass `none` for price-feed-bytes -- the protocol skips the
;; health check when there is no debt.

(impl-trait .lending-adapter-trait.lending-adapter-trait)

;; ---------------------------------------------------------------------------
;; Constants -- Zest V1 contracts (mainnet)
;; ---------------------------------------------------------------------------

(define-constant ZEST_V1 'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N)

;; wSTX token (SIP-010 wrapper around native STX)
(define-constant wstx 'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.wstx)

;; z-token for wSTX (receipt token, balance = supplied + accrued interest)
(define-constant zwstx 'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.zwstx-v2-0)

;; Borrow helper (approved gateway for all Zest V1 user-facing calls)
(define-constant borrow-helper 'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.borrow-helper-v2-1-7)

;; Pool reserve
(define-constant pool-reserve 'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.pool-0-reserve-v2-0)

;; Oracle for STX-based assets
(define-constant stx-oracle 'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.stx-btc-oracle-v1-4)

;; Incentives contract
(define-constant incentives 'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.incentives-v2-2)

;; Vault's wSTX for pulling tokens (Zest V2 deployer's wSTX = same native STX)
(define-constant wstx-v2 'SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.wstx)

;; ---------------------------------------------------------------------------
;; lending-adapter-trait implementation
;; ---------------------------------------------------------------------------

;; Deposit `amount` STX into Zest V1.
;;
;; Flow: vault (as-contract) -> this adapter
;;   1. Pull STX from vault (tx-sender) into this adapter via wSTX transfer
;;   2. Supply wSTX to Zest V1 via borrow-helper; adapter receives z-tokens
;;
;; Returns: (ok amount-deposited)
(define-public (adapter-deposit (amount uint))
  (let ((vault tx-sender))
    ;; 1. Pull STX from the vault into this adapter (wSTX.transfer = stx-transfer?).
    (try! (contract-call? 'SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.wstx
             transfer amount vault (as-contract tx-sender) none))
    ;; 2. Supply to Zest V1 via borrow-helper.
    ;;    Args: lp-token, pool-reserve, asset, amount, owner, referral, incentives
    (try! (as-contract
            (contract-call? 'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.borrow-helper-v2-1-7
              supply
              'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.zwstx-v2-0       ;; lp (z-token)
              'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.pool-0-reserve-v2-0 ;; pool-reserve
              'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.wstx              ;; asset (wSTX)
              amount                                                       ;; amount
              tx-sender                                                    ;; owner = adapter
              none                                                         ;; referral
              'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.incentives-v2-2   ;; incentives
            )))
    (ok amount)))

;; Withdraw `amount` STX from Zest V1, sending proceeds to `recipient`.
;;
;; Calls borrow-helper.withdraw with the full 10-asset collateral list
;; (required by Zest V1's validate-assets).  Since this adapter has NO borrows,
;; health factor is infinite and price-feed-bytes = none.
;;
;; Returns: (ok amount-received)
(define-public (adapter-withdraw (amount uint) (recipient principal))
  (begin
    (try! (as-contract
            (contract-call? 'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.borrow-helper-v2-1-7
              withdraw
              'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.zwstx-v2-0          ;; lp (z-token)
              'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.pool-0-reserve-v2-0  ;; pool-reserve
              'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.wstx                 ;; asset (wSTX)
              'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.stx-btc-oracle-v1-4  ;; oracle
              amount                                                          ;; amount
              tx-sender                                                       ;; owner = adapter
              ;; Full 10-asset list in on-chain order (required by validate-assets)
              (list
                { asset: 'SP4SZE494VC2YC5JYG7AYFQ44F5Q4PYV7DVMDPBG.ststx-token,
                  lp-token: 'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.zststx-v2-0,
                  oracle: 'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.stx-btc-oracle-v1-4 }
                { asset: 'SP3Y2ZSH8P7D50B0VBTSX11S7XSG24M1VB9YFQA4K.token-aeusdc,
                  lp-token: 'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.zaeusdc-v2-0,
                  oracle: 'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.aeusdc-oracle-v1-0 }
                { asset: 'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.wstx,
                  lp-token: 'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.zwstx-v2-0,
                  oracle: 'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.stx-btc-oracle-v1-4 }
                { asset: 'SP2C2YFP12AJZB4MABJBAJ55XECVS7E4PMMZ89YZR.arkadiko-token,
                  lp-token: 'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.zdiko-v2-0,
                  oracle: 'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.diko-oracle-v1-1 }
                { asset: 'SPN5AKG35QZSK2M8GAMR4AFX45659RJHDW353HSG.usdh-token-v1,
                  lp-token: 'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.zusdh-v2-0,
                  oracle: 'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.usdh-oracle-v1-0 }
                { asset: 'SP2XD7417HGPRTREMKF748VNEQPDRR0RMANB7X1NK.token-susdt,
                  lp-token: 'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.zsusdt-v2-0,
                  oracle: 'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.susdt-oracle-v1-0 }
                { asset: 'SP2C2YFP12AJZB4MABJBAJ55XECVS7E4PMMZ89YZR.usda-token,
                  lp-token: 'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.zusda-v2-0,
                  oracle: 'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.usda-oracle-v1-1 }
                { asset: 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token,
                  lp-token: 'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.zsbtc-v2-0,
                  oracle: 'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.stx-btc-oracle-v1-4 }
                { asset: 'SP102V8P0F7JX67ARQ77WEA3D3CFB5XW39REDT0AM.token-alex,
                  lp-token: 'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.zalex-v2-0,
                  oracle: 'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.alex-oracle-v1-1 }
                { asset: 'SP4SZE494VC2YC5JYG7AYFQ44F5Q4PYV7DVMDPBG.ststxbtc-token-v2,
                  lp-token: 'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.zststxbtc-v2_v2-0,
                  oracle: 'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.stx-btc-oracle-v1-4 }
              )
              'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.incentives-v2-2  ;; incentives
              none  ;; price-feed-bytes (none = no Pyth data; adapter has no debt)
            )))
    ;; wSTX.withdraw sends STX to owner (adapter), forward to recipient
    ;; Actually, wSTX = STX natively, so the STX is already at the adapter.
    ;; Transfer from adapter to recipient (vault).
    (try! (as-contract
            (contract-call? 'SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.wstx
              transfer amount (as-contract tx-sender) recipient none)))
    (ok amount)))

;; Read the live STX value of this adapter's Zest V1 position.
;;
;; z-token balance auto-increases with accrued interest (aToken model).
;; get-balance returns the interest-adjusted amount.
;;
;; Returns: (ok current-asset-value)
(define-public (adapter-get-position)
  (let ((adapter-principal (as-contract tx-sender))
        (my-balance (unwrap!
                      (contract-call? 'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.zwstx-v2-0
                        get-balance adapter-principal)
                      (err u0))))
    (ok my-balance)))
