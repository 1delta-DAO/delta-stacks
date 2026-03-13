;; adapter-granite-usdcx.clar
;;
;; Adapter bridging the vault to the Granite USDCx isolated lending market.
;; Implements lending-adapter-trait so the vault can deposit, withdraw, and
;; query position value through a uniform interface.
;;
;; Deployed under the same principal as the vault.  The vault calls these
;; functions via (as-contract ...), so tx-sender == vault inside them.

(impl-trait .lending-adapter-trait.lending-adapter-trait)

;; ---------------------------------------------------------------------------
;; Constants -- Granite USDCx market contracts
;; ---------------------------------------------------------------------------

;; The underlying asset managed by the vault.
(define-constant usdcx 'SP120SBRBQJ00MCWS7TM5R8WJNTTKD5K0HFRC2CNE.usdcx)

;; Granite USDCx market entry points.
(define-constant granite-lp   'SP3M2BYF7RGF8WKW5FVDNJ6WR8D7AR9BHDXAKPXZE.liquidity-provider-v1)
(define-constant granite-state 'SP3M2BYF7RGF8WKW5FVDNJ6WR8D7AR9BHDXAKPXZE.state-v1)

;; ---------------------------------------------------------------------------
;; lending-adapter-trait implementation
;; ---------------------------------------------------------------------------

;; Deposit `amount` USDCx into Granite.
;;
;; Flow: vault (as-contract) -> this adapter
;;   1. Pull USDCx from vault (tx-sender) into this adapter
;;   2. Deposit from adapter into Granite; adapter receives LP shares
;;
;; Returns: (ok amount-deposited)
(define-public (adapter-deposit (amount uint))
  (let ((vault tx-sender))
    ;; 1. Pull USDCx from the vault into this adapter contract.
    (try! (contract-call? 'SP120SBRBQJ00MCWS7TM5R8WJNTTKD5K0HFRC2CNE.usdcx
             transfer amount vault (as-contract tx-sender) none))
    ;; 2. Deposit into Granite.  LP shares are minted to this adapter.
    (try! (as-contract
            (contract-call? 'SP3M2BYF7RGF8WKW5FVDNJ6WR8D7AR9BHDXAKPXZE.liquidity-provider-v1
              deposit amount tx-sender)))
    (ok amount)))

;; Withdraw `amount` USDCx from Granite, sending proceeds to `recipient`.
;;
;; Granite's `withdraw` burns the proportional LP shares held by the caller
;; and sends the underlying to `recipient` (the vault in practice).
;;
;; Returns: (ok amount-received)
(define-public (adapter-withdraw (amount uint) (recipient principal))
  (begin
    (try! (as-contract
            (contract-call? 'SP3M2BYF7RGF8WKW5FVDNJ6WR8D7AR9BHDXAKPXZE.liquidity-provider-v1
              withdraw amount recipient)))
    (ok amount)))

;; Read the live USDCx value of this adapter's Granite position.
;;
;; Formula: my-lp-shares * (reserve + lp-open-interest) / total-lp-supply
;;
;; Returns: (ok current-asset-value)
(define-public (adapter-get-position)
  (let ((adapter-principal (as-contract tx-sender))
        (my-shares    (unwrap-panic
                        (contract-call? 'SP3M2BYF7RGF8WKW5FVDNJ6WR8D7AR9BHDXAKPXZE.state-v1
                          get-balance adapter-principal)))
        (total-shares (unwrap-panic
                        (contract-call? 'SP3M2BYF7RGF8WKW5FVDNJ6WR8D7AR9BHDXAKPXZE.state-v1
                          get-total-supply)))
        (reserve      (contract-call? 'SP3M2BYF7RGF8WKW5FVDNJ6WR8D7AR9BHDXAKPXZE.state-v1
                        get-reserve-balance))
        (loaned-out   (get lp-open-interest
                        (contract-call? 'SP3M2BYF7RGF8WKW5FVDNJ6WR8D7AR9BHDXAKPXZE.state-v1
                          get-open-interest))))
    (if (> total-shares u0)
      (ok (/ (* my-shares (+ reserve loaned-out)) total-shares))
      (ok u0))))
