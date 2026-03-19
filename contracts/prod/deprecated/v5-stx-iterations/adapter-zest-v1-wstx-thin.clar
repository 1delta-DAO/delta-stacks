;; adapter-zest-v1-wstx-thin.clar
;;
;; Ultra-thin Zest V1 wSTX adapter -- splits withdraw into two calls to
;; minimize stack depth during borrow-helper.withdraw.
;;
;; Problem: borrow-helper.withdraw uses ~58-60 of 64 Clarity stack frames
;; internally.  Any overhead from the vault+adapter pushes it over the limit.
;;
;; Solution: The `pull` function is a SINGLE compound expression with no
;; begin, no try!, no let -- just as-contract + contract-call.  This gives
;; borrow-helper the maximum possible stack budget.  After borrow-helper
;; returns, the vault calls `forward` to move STX from adapter to vault.
;;
;; Also implements lending-adapter-trait for deposit/get-position/recall
;; which don't have depth issues.

(impl-trait .lending-adapter-trait.lending-adapter-trait)

;; ---------------------------------------------------------------------------
;; Constants -- Zest V1 contracts (mainnet)
;; ---------------------------------------------------------------------------

(define-constant wstx-v2 'SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.wstx)

;; ---------------------------------------------------------------------------
;; Ultra-thin pull: single expression, no begin/try/let
;; ---------------------------------------------------------------------------
;; Returns whatever borrow-helper.withdraw returns.
;; STX lands at this adapter's principal (as-contract tx-sender).
;; Vault must call `forward` afterwards to receive the STX.

(define-public (pull (amount uint))
  (as-contract
    (contract-call? 'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.borrow-helper-v2-1-7
      withdraw
      'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.zwstx-v2-0
      'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.pool-0-reserve-v2-0
      'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.wstx
      'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.stx-btc-oracle-v1-4
      amount
      tx-sender
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
      'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.incentives-v2-2
      none)))

;; ---------------------------------------------------------------------------
;; Forward: move STX from adapter to recipient (separate call, after pull)
;; ---------------------------------------------------------------------------

(define-public (forward (amount uint) (to principal))
  (as-contract
    (contract-call? 'SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.wstx
      transfer amount tx-sender to none)))

;; ---------------------------------------------------------------------------
;; lending-adapter-trait implementation (for deposit, get-position, recall)
;; ---------------------------------------------------------------------------

(define-public (adapter-deposit (amount uint))
  (let ((vault tx-sender))
    (try! (contract-call? 'SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.wstx
             transfer amount vault (as-contract tx-sender) none))
    (try! (as-contract
            (contract-call? 'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.borrow-helper-v2-1-7
              supply
              'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.zwstx-v2-0
              'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.pool-0-reserve-v2-0
              'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.wstx
              amount
              tx-sender
              none
              'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.incentives-v2-2
            )))
    (ok amount)))

;; Standard adapter-withdraw (used by recall/rebalance -- more overhead but
;; these paths have fewer frames from the vault side).
(define-public (adapter-withdraw (amount uint) (recipient principal))
  (begin
    (try! (as-contract
            (contract-call? 'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.borrow-helper-v2-1-7
              withdraw
              'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.zwstx-v2-0
              'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.pool-0-reserve-v2-0
              'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.wstx
              'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.stx-btc-oracle-v1-4
              amount
              tx-sender
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
              'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.incentives-v2-2
              none)))
    (try! (as-contract
            (contract-call? 'SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.wstx
              transfer amount (as-contract tx-sender) recipient none)))
    (ok amount)))

(define-public (adapter-get-position)
  (let ((adapter-principal (as-contract tx-sender))
        (my-balance (unwrap!
                      (contract-call? 'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.zwstx-v2-0
                        get-balance adapter-principal)
                      (err u0))))
    (ok my-balance)))
