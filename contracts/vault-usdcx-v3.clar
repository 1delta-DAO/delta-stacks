;; vault-usdcx-v3.clar
;;
;; ERC-4626-style yield vault for mock-usdcx with AUTO-ALLOCATION on deposit.
;; Vault shares are a SIP-010 fungible token (dUSDCx), transferable between users.
;;
;; v3 difference from v2:
;; ----------------------
;; Deposits are **proportionally allocated** to Granite and Zest V2 based on
;; the CURRENT allocation balances (alloc-granite / alloc-zest-v2).
;; This maintains the vault's existing balance across markets without requiring
;; manual allocator intervention.
;;
;; - If capital is already deployed, new deposits match the existing ratio.
;; - If NO capital is deployed yet (both allocs are zero), everything stays idle.
;; - An idle buffer (configurable bps, default 5%) is retained from each deposit
;;   for instant withdrawal liquidity.
;; - If adapters aren't registered, deposits gracefully fall back to 100% idle.
;; - Adapter call failures are non-fatal: deposit succeeds, capital stays idle.
;;
;; Auto-allocation math (on deposit)
;; ----------------------------------
;; Given deposit D, idle-buffer-bps B, alloc-granite AG, alloc-zest-v2 AZ:
;;   deploy-total   = D * (10000 - B) / 10000
;;   total-deployed = AG + AZ
;;   if total-deployed > 0:
;;     deploy-granite = deploy-total * AG / total-deployed
;;     deploy-zest    = deploy-total - deploy-granite
;;   else:
;;     deploy-granite = 0, deploy-zest = 0  (all stays idle)
;;   idle = D - deploy-granite - deploy-zest
;;
;; Proportional withdrawal math (unchanged from v2)
;; -------------------------------------------------
;; Given withdrawal amount A and vault total T:
;;   pull-idle    = floor(A * idle-book / T)
;;   remaining    = A - pull-idle
;;   pull-granite = floor(remaining * ag / (ag+az))
;;   pull-zest-v2 = remaining - pull-granite
;;
;; Virtual-shares anti-inflation: pre-seeded with 100,000,000 phantom shares.

(use-trait lat .lending-adapter-trait.lending-adapter-trait)
(impl-trait 'SP3FBR2AGK5H9QBDH3EEN6DF8EK8JY7RX8QJ5SVTE.sip-010-trait-ft-standard.sip-010-trait)

(define-fungible-token vault-shares)

;; ---------------------------------------------------------------------------
;; Error codes
;; ---------------------------------------------------------------------------
(define-constant err-owner-only           (err u100))
(define-constant err-amount-zero          (err u102))
(define-constant err-shares-zero          (err u103))
(define-constant err-insufficient-balance (err u104))
(define-constant err-insufficient-shares  (err u105))
(define-constant err-transfer-failed      (err u106))
(define-constant err-deposit-owner-only   (err u108))
(define-constant err-not-allocator        (err u109))
(define-constant err-invalid-adapter      (err u111))
(define-constant err-invalid-weights      (err u112))

;; ---------------------------------------------------------------------------
;; Constants
;; ---------------------------------------------------------------------------
(define-constant virtual-shares u100000000)
(define-constant bps-base u10000)

;; ---------------------------------------------------------------------------
;; Hardcoded market addresses (for read-only live position queries)
;; ---------------------------------------------------------------------------
(define-constant granite-usdcx-state
  'SP3M2BYF7RGF8WKW5FVDNJ6WR8D7AR9BHDXAKPXZE.state-v1)

(define-constant zest-v2-usdc-vault
  'SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.v0-vault-usdc)

;; ---------------------------------------------------------------------------
;; State
;; ---------------------------------------------------------------------------

(define-data-var total-assets-bookkeeping uint u0)
(define-data-var vault-owner principal tx-sender)
(define-data-var vault-allocator principal tx-sender)
(define-data-var alloc-granite uint u0)
(define-data-var alloc-zest-v2 uint u0)
(define-data-var adapter-granite-usdcx (optional principal) none)
(define-data-var adapter-zest-v2-usdc  (optional principal) none)

;; --- v3: idle buffer ---
;; Minimum idle buffer in bps retained from each deposit.
;; E.g. 500 = 5% stays idle for instant withdrawal liquidity.
(define-data-var idle-buffer-bps uint u500)

;; ---------------------------------------------------------------------------
;; SIP-010 interface
;; ---------------------------------------------------------------------------

(define-read-only (get-name)   (ok "1delta USDCx Vault v3"))
(define-read-only (get-symbol) (ok "dUSDCx"))
(define-read-only (get-decimals) (ok u6))
(define-read-only (get-token-uri) (ok none))

(define-read-only (get-balance (who principal))
  (ok (ft-get-balance vault-shares who)))

(define-read-only (get-total-supply)
  (ok (ft-get-supply vault-shares)))

(define-public (transfer (amount uint) (sender principal) (recipient principal)
               (memo (optional (buff 34))))
  (begin
    (asserts! (is-eq tx-sender sender) err-owner-only)
    (try! (ft-transfer? vault-shares amount sender recipient))
    (match memo m (begin (print m) true) true)
    (ok true)))

;; ---------------------------------------------------------------------------
;; ERC-4626 vault interface
;; ---------------------------------------------------------------------------

(define-read-only (get-asset)
  (ok .mock-token))

(define-read-only (get-total-assets)
  (var-get total-assets-bookkeeping))

(define-read-only (max-deposit (receiver principal))
  u340282366920938463463374607431768211455)

(define-read-only (preview-deposit (assets uint))
  (convert-to-shares assets))

(define-read-only (max-mint (receiver principal))
  u340282366920938463463374607431768211455)

(define-read-only (preview-mint (shares uint))
  (let ((supply (ft-get-supply vault-shares))
        (total  (var-get total-assets-bookkeeping)))
    (if (is-eq supply u0)
      shares
      (/ (+ (* shares (+ total u1)) (- (+ supply virtual-shares) u1))
         (+ supply virtual-shares)))))

(define-read-only (max-withdraw (owner principal))
  (convert-to-assets (ft-get-balance vault-shares owner)))

(define-read-only (preview-withdraw (assets uint))
  (let ((supply (ft-get-supply vault-shares))
        (total  (var-get total-assets-bookkeeping)))
    (if (is-eq total u0)
      u0
      (/ (+ (* assets (+ supply virtual-shares)) total)
         (+ total u1)))))

(define-read-only (max-redeem (owner principal))
  (ft-get-balance vault-shares owner))

(define-read-only (preview-redeem (shares uint))
  (convert-to-assets shares))

(define-read-only (get-vault-owner)
  (var-get vault-owner))

(define-read-only (get-vault-allocator)
  (var-get vault-allocator))

(define-read-only (get-adapter-granite-usdcx)
  (var-get adapter-granite-usdcx))

(define-read-only (get-adapter-zest-v2-usdc)
  (var-get adapter-zest-v2-usdc))

(define-read-only (get-alloc-granite)
  (var-get alloc-granite))

(define-read-only (get-alloc-zest-v2)
  (var-get alloc-zest-v2))

(define-read-only (get-idle-bookkeeping)
  (let ((total (var-get total-assets-bookkeeping))
        (ag    (var-get alloc-granite))
        (az    (var-get alloc-zest-v2)))
    (if (>= total (+ ag az))
      (- total (+ ag az))
      u0)))

(define-read-only (get-idle-buffer-bps)
  (var-get idle-buffer-bps))

;; ---------------------------------------------------------------------------
;; Live position reads
;; ---------------------------------------------------------------------------

(define-read-only (get-idle-balance)
  (unwrap-panic (contract-call? .mock-token get-balance (as-contract tx-sender))))

(define-read-only (get-zest-v2-usdc-position)
  (match (var-get adapter-zest-v2-usdc)
    adapter
    (let ((shares (unwrap-panic
                    (contract-call? 'SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.v0-vault-usdc
                      get-balance adapter))))
      (unwrap-panic
        (contract-call? 'SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.v0-vault-usdc
          convert-to-assets shares)))
    u0))

(define-read-only (get-granite-usdcx-position)
  (match (var-get adapter-granite-usdcx)
    adapter
    (let ((my-shares    (unwrap-panic
                          (contract-call? 'SP3M2BYF7RGF8WKW5FVDNJ6WR8D7AR9BHDXAKPXZE.state-v1
                            get-balance adapter)))
          (total-shares (unwrap-panic
                          (contract-call? 'SP3M2BYF7RGF8WKW5FVDNJ6WR8D7AR9BHDXAKPXZE.state-v1
                            get-total-supply)))
          (reserve      (contract-call? 'SP3M2BYF7RGF8WKW5FVDNJ6WR8D7AR9BHDXAKPXZE.state-v1
                          get-reserve-balance))
          (loaned-out   (get lp-open-interest
                          (contract-call? 'SP3M2BYF7RGF8WKW5FVDNJ6WR8D7AR9BHDXAKPXZE.state-v1
                            get-open-interest))))
      (if (> total-shares u0)
        (/ (* my-shares (+ reserve loaned-out)) total-shares)
        u0))
    u0))

(define-read-only (get-live-total-assets)
  (+ (get-idle-balance)
     (get-zest-v2-usdc-position)
     (get-granite-usdcx-position)))

(define-public (get-market-position (market <lat>))
  (contract-call? market adapter-get-position))

(define-read-only (convert-to-shares (amount uint))
  (let ((supply (ft-get-supply vault-shares))
        (total  (var-get total-assets-bookkeeping)))
    (/ (* amount (+ supply virtual-shares)) (+ total amount u1))))

(define-read-only (convert-to-assets (shares uint))
  (let ((supply (ft-get-supply vault-shares))
        (total  (var-get total-assets-bookkeeping)))
    (if (is-eq supply u0)
      u0
      (/ (* shares total) (+ supply virtual-shares)))))

;; ---------------------------------------------------------------------------
;; Vault-owner management
;; ---------------------------------------------------------------------------

(define-public (set-vault-owner (new-owner principal))
  (begin
    (asserts! (is-eq tx-sender (var-get vault-owner)) err-owner-only)
    (var-set vault-owner new-owner)
    (ok new-owner)))

(define-public (set-vault-allocator (new-allocator principal))
  (begin
    (asserts! (is-eq tx-sender (var-get vault-owner)) err-owner-only)
    (var-set vault-allocator new-allocator)
    (ok new-allocator)))

(define-public (register-adapter-granite-usdcx (adapter principal))
  (begin
    (asserts! (is-eq tx-sender (var-get vault-owner)) err-not-allocator)
    (var-set adapter-granite-usdcx (some adapter))
    (ok adapter)))

(define-public (register-adapter-zest-v2-usdc (adapter principal))
  (begin
    (asserts! (is-eq tx-sender (var-get vault-owner)) err-not-allocator)
    (var-set adapter-zest-v2-usdc (some adapter))
    (ok adapter)))

;; --- v3: Set idle buffer ---
;; `buffer` in bps (0-10000).  E.g. 500 = 5%.
(define-public (set-idle-buffer (buffer uint))
  (begin
    (asserts! (is-eq tx-sender (var-get vault-owner)) err-owner-only)
    (asserts! (<= buffer bps-base) err-invalid-weights)
    (var-set idle-buffer-bps buffer)
    (ok true)))

;; ---------------------------------------------------------------------------
;; User-facing vault functions
;; ---------------------------------------------------------------------------

;; Deposit `amount` assets on behalf of `owner`, mint shares, and
;; AUTO-ALLOCATE proportionally based on current lending balances.
;;
;; The split mirrors the existing allocation ratio:
;;   - If vault has 60% in Granite and 40% in Zest, new deposits go 60/40.
;;   - If nothing is deployed yet, 100% goes to idle (allocator deploys first).
;;   - An idle buffer (default 5%) is retained for withdrawal liquidity.
;;   - If adapters aren't registered, 100% goes to idle.
;;   - Adapter call failures are non-fatal (capital stays idle).
;;
;; Returns: (ok shares-minted)
(define-public (deposit (amount uint) (owner principal)
               (granite <lat>) (zest-v2 <lat>))
  (begin
    (asserts! (> amount u0) err-amount-zero)
    ;; Auto-sync yields before computing share price.
    (let ((sg (if (> (var-get alloc-granite) u0)
               (begin
                 (asserts! (is-eq (some (contract-of granite))
                                  (var-get adapter-granite-usdcx))
                           err-invalid-adapter)
                 (try! (do-sync-granite granite)))
               u0))
          (sz (if (> (var-get alloc-zest-v2) u0)
               (begin
                 (asserts! (is-eq (some (contract-of zest-v2))
                                  (var-get adapter-zest-v2-usdc))
                           err-invalid-adapter)
                 (try! (do-sync-zest-v2 zest-v2)))
               u0)))
      ;; Transfer tokens from depositor to vault.
      (try! (contract-call? .mock-token transfer amount tx-sender (as-contract tx-sender) none))
      ;; Mint shares based on post-sync bookkeeping.
      (let ((supply    (ft-get-supply vault-shares))
            (new-total (+ (var-get total-assets-bookkeeping) amount)))
        (let ((shares (/ (* amount (+ supply virtual-shares)) (+ new-total u1))))
          (asserts! (> shares u0) err-shares-zero)
          (try! (ft-mint? vault-shares shares owner))
          (var-set total-assets-bookkeeping new-total)
          ;; --- v3: Auto-allocate based on current lending balances ---
          (let ((ag (var-get alloc-granite))
                (az (var-get alloc-zest-v2))
                (total-deployed (+ ag az))
                (buffer (var-get idle-buffer-bps)))
            ;; Only auto-allocate if capital is already deployed (ratio exists).
            ;; If nothing deployed yet, everything stays idle for the allocator
            ;; to make the initial deployment decision.
            (if (and (> total-deployed u0)
                     (is-some (var-get adapter-granite-usdcx))
                     (is-some (var-get adapter-zest-v2-usdc))
                     (is-eq (some (contract-of granite))
                            (var-get adapter-granite-usdcx))
                     (is-eq (some (contract-of zest-v2))
                            (var-get adapter-zest-v2-usdc)))
              ;; Compute deployable amount after idle buffer.
              (let ((deploy-total (/ (* amount (- bps-base buffer)) bps-base)))
                ;; Split proportionally to current balances.
                (let ((to-granite (/ (* deploy-total ag) total-deployed))
                      (to-zest    (- deploy-total
                                     (/ (* deploy-total ag) total-deployed))))
                  ;; Deploy to Granite (non-fatal on failure).
                  (if (> to-granite u0)
                    (match (as-contract (do-allocate-granite to-granite granite))
                      ok-val true
                      err-val true)
                    true)
                  ;; Deploy to Zest (non-fatal on failure).
                  (if (> to-zest u0)
                    (match (as-contract (do-allocate-zest-v2 to-zest zest-v2))
                      ok-val true
                      err-val true)
                    true)
                  (ok shares)))
              ;; Nothing deployed or adapters missing --everything stays idle.
              (ok shares))))))))

;; Mint exactly `shares` vault shares (no auto-alloc --use deposit for that).
(define-public (mint (shares uint) (receiver principal)
               (granite <lat>) (zest-v2 <lat>))
  (begin
    (asserts! (> shares u0) err-shares-zero)
    (let ((sg (if (> (var-get alloc-granite) u0)
               (begin
                 (asserts! (is-eq (some (contract-of granite))
                                  (var-get adapter-granite-usdcx))
                           err-invalid-adapter)
                 (try! (do-sync-granite granite)))
               u0))
          (sz (if (> (var-get alloc-zest-v2) u0)
               (begin
                 (asserts! (is-eq (some (contract-of zest-v2))
                                  (var-get adapter-zest-v2-usdc))
                           err-invalid-adapter)
                 (try! (do-sync-zest-v2 zest-v2)))
               u0)))
      (let ((supply (ft-get-supply vault-shares))
            (total  (var-get total-assets-bookkeeping)))
        (let ((assets (/ (+ (* shares (+ total u1)) (- (+ supply virtual-shares) u1))
                         (+ supply virtual-shares))))
          (asserts! (> assets u0) err-amount-zero)
          (try! (contract-call? .mock-token transfer assets tx-sender (as-contract tx-sender) none))
          (try! (ft-mint? vault-shares shares receiver))
          (var-set total-assets-bookkeeping (+ total assets))
          (ok assets))))))

;; Withdraw exactly `amount` assets (unchanged --proportional pull).
(define-public (withdraw (amount uint) (receiver principal) (owner principal)
               (granite <lat>) (zest-v2 <lat>))
  (begin
    (asserts! (is-eq tx-sender owner) err-owner-only)
    (let ((sg (if (> (var-get alloc-granite) u0)
               (begin
                 (asserts! (is-eq (some (contract-of granite))
                                  (var-get adapter-granite-usdcx))
                           err-invalid-adapter)
                 (try! (do-sync-granite granite)))
               u0))
          (sz (if (> (var-get alloc-zest-v2) u0)
               (begin
                 (asserts! (is-eq (some (contract-of zest-v2))
                                  (var-get adapter-zest-v2-usdc))
                           err-invalid-adapter)
                 (try! (do-sync-zest-v2 zest-v2)))
               u0)))
    (let ((supply (ft-get-supply vault-shares))
          (total  (var-get total-assets-bookkeeping))
          (bal    (ft-get-balance vault-shares owner))
          (ag     (var-get alloc-granite))
          (az     (var-get alloc-zest-v2)))
      (asserts! (> amount u0) err-amount-zero)
      (asserts! (> total u0) err-insufficient-balance)
      (let ((shares (/ (* amount (+ supply virtual-shares)) (+ total u1))))
        (let ((shares-to-burn
                (if (< (* shares (+ total u1)) (* amount (+ supply virtual-shares)))
                  (+ shares u1)
                  shares)))
          (asserts! (>= bal shares-to-burn) err-insufficient-shares)
          (let ((idle-book (if (>= total (+ ag az)) (- total (+ ag az)) u0)))
            (let ((pull-idle    (/ (* amount idle-book) total))
                  (ag-plus-az  (+ ag az)))
              (let ((remaining    (- amount pull-idle)))
                (let ((pull-granite  (if (> ag-plus-az u0)
                                       (/ (* remaining ag) ag-plus-az)
                                       u0)))
                  (let ((pull-zest-v2 (- remaining pull-granite)))
                    (if (> pull-granite u0)
                      (asserts! (is-eq (some (contract-of granite))
                                       (var-get adapter-granite-usdcx))
                                err-invalid-adapter)
                      true)
                    (if (> pull-zest-v2 u0)
                      (asserts! (is-eq (some (contract-of zest-v2))
                                       (var-get adapter-zest-v2-usdc))
                                err-invalid-adapter)
                      true)
                    (let ((rg (if (> pull-granite u0)
                                 (try! (as-contract (do-deallocate-granite pull-granite granite)))
                                 u0))
                          (rz (if (> pull-zest-v2 u0)
                                 (try! (as-contract (do-deallocate-zest-v2 pull-zest-v2 zest-v2)))
                                 u0)))
                      (let ((total-after (var-get total-assets-bookkeeping)))
                        (asserts!
                          (>= (unwrap! (contract-call? .mock-token get-balance (as-contract tx-sender))
                                       err-transfer-failed)
                              amount)
                          err-insufficient-balance)
                        (try! (ft-burn? vault-shares shares-to-burn owner))
                        (var-set total-assets-bookkeeping (- total-after amount))
                        (match (contract-call? .mock-token transfer amount (as-contract tx-sender) receiver none)
                          success (ok shares-to-burn)
                          e       (err e)))))))))))))))

;; Redeem exactly `shares` (unchanged --proportional pull).
(define-public (redeem (shares uint) (receiver principal) (owner principal)
               (granite <lat>) (zest-v2 <lat>))
  (begin
    (asserts! (is-eq tx-sender owner) err-owner-only)
    (let ((sg (if (> (var-get alloc-granite) u0)
               (begin
                 (asserts! (is-eq (some (contract-of granite))
                                  (var-get adapter-granite-usdcx))
                           err-invalid-adapter)
                 (try! (do-sync-granite granite)))
               u0))
          (sz (if (> (var-get alloc-zest-v2) u0)
               (begin
                 (asserts! (is-eq (some (contract-of zest-v2))
                                  (var-get adapter-zest-v2-usdc))
                           err-invalid-adapter)
                 (try! (do-sync-zest-v2 zest-v2)))
               u0)))
    (let ((supply (ft-get-supply vault-shares))
          (total  (var-get total-assets-bookkeeping))
          (bal    (ft-get-balance vault-shares owner))
          (ag     (var-get alloc-granite))
          (az     (var-get alloc-zest-v2)))
      (asserts! (> shares u0) err-shares-zero)
      (asserts! (>= bal shares) err-insufficient-shares)
      (asserts! (> supply u0) err-insufficient-balance)
      (let ((amt (/ (* shares total) (+ supply virtual-shares))))
        (asserts! (> amt u0) err-amount-zero)
        (let ((idle-book  (if (>= total (+ ag az)) (- total (+ ag az)) u0)))
          (let ((pull-idle   (/ (* amt idle-book) total))
                (ag-plus-az (+ ag az)))
            (let ((remaining   (- amt pull-idle)))
              (let ((pull-granite  (if (> ag-plus-az u0)
                                     (/ (* remaining ag) ag-plus-az)
                                     u0)))
                (let ((pull-zest-v2 (- remaining pull-granite)))
                  (if (> pull-granite u0)
                    (asserts! (is-eq (some (contract-of granite))
                                     (var-get adapter-granite-usdcx))
                              err-invalid-adapter)
                    true)
                  (if (> pull-zest-v2 u0)
                    (asserts! (is-eq (some (contract-of zest-v2))
                                     (var-get adapter-zest-v2-usdc))
                              err-invalid-adapter)
                    true)
                  (let ((rg (if (> pull-granite u0)
                               (try! (as-contract (do-deallocate-granite pull-granite granite)))
                               u0))
                        (rz (if (> pull-zest-v2 u0)
                               (try! (as-contract (do-deallocate-zest-v2 pull-zest-v2 zest-v2)))
                               u0)))
                    (let ((total-after (var-get total-assets-bookkeeping)))
                      (asserts!
                        (>= (unwrap! (contract-call? .mock-token get-balance (as-contract tx-sender))
                                     err-transfer-failed)
                            amt)
                        err-insufficient-balance)
                      (try! (ft-burn? vault-shares shares owner))
                      (var-set total-assets-bookkeeping (- total-after amt))
                      (match (contract-call? .mock-token transfer amt (as-contract tx-sender) receiver none)
                        success (ok amt)
                        e       (err e))))))))))))))

;; ---------------------------------------------------------------------------
;; Allocation layer -- private helpers
;; ---------------------------------------------------------------------------

(define-private (do-allocate-granite (amount uint) (adapter <lat>))
  (let ((deposited (try! (contract-call? adapter adapter-deposit amount))))
    (var-set alloc-granite (+ (var-get alloc-granite) deposited))
    (ok deposited)))

(define-private (do-allocate-zest-v2 (amount uint) (adapter <lat>))
  (let ((deposited (try! (contract-call? adapter adapter-deposit amount))))
    (var-set alloc-zest-v2 (+ (var-get alloc-zest-v2) deposited))
    (ok deposited)))

(define-private (do-deallocate-granite (amount uint) (adapter <lat>))
  (let ((received (try! (contract-call? adapter adapter-withdraw amount tx-sender))))
    (var-set alloc-granite
      (let ((old (var-get alloc-granite)))
        (if (>= old amount) (- old amount) u0)))
    (var-set total-assets-bookkeeping
      (+ (var-get total-assets-bookkeeping)
         (if (> received amount) (- received amount) u0)))
    (ok received)))

(define-private (do-deallocate-zest-v2 (amount uint) (adapter <lat>))
  (let ((received (try! (contract-call? adapter adapter-withdraw amount tx-sender))))
    (var-set alloc-zest-v2
      (let ((old (var-get alloc-zest-v2)))
        (if (>= old amount) (- old amount) u0)))
    (var-set total-assets-bookkeeping
      (+ (var-get total-assets-bookkeeping)
         (if (> received amount) (- received amount) u0)))
    (ok received)))

;; ---------------------------------------------------------------------------
;; Allocation layer -- yield sync
;; ---------------------------------------------------------------------------

(define-private (do-sync-granite (adapter <lat>))
  (let ((book-cost  (var-get alloc-granite))
        (live-value (try! (contract-call? adapter adapter-get-position))))
    (if (> live-value book-cost)
      (let ((yield (- live-value book-cost)))
        (var-set alloc-granite live-value)
        (var-set total-assets-bookkeeping (+ (var-get total-assets-bookkeeping) yield))
        (ok yield))
      (ok u0))))

(define-private (do-sync-zest-v2 (adapter <lat>))
  (let ((book-cost  (var-get alloc-zest-v2))
        (live-value (try! (contract-call? adapter adapter-get-position))))
    (if (> live-value book-cost)
      (let ((yield (- live-value book-cost)))
        (var-set alloc-zest-v2 live-value)
        (var-set total-assets-bookkeeping (+ (var-get total-assets-bookkeeping) yield))
        (ok yield))
      (ok u0))))

(define-public (sync-granite (adapter <lat>))
  (begin
    (asserts! (is-eq (some (contract-of adapter)) (var-get adapter-granite-usdcx))
              err-invalid-adapter)
    (do-sync-granite adapter)))

(define-public (sync-zest-v2 (adapter <lat>))
  (begin
    (asserts! (is-eq (some (contract-of adapter)) (var-get adapter-zest-v2-usdc))
              err-invalid-adapter)
    (do-sync-zest-v2 adapter)))

;; ---------------------------------------------------------------------------
;; Allocation layer -- public rebalance interface (allocator-only)
;; ---------------------------------------------------------------------------

(define-public (deploy-to-granite (amount uint) (adapter <lat>))
  (begin
    (asserts! (is-eq tx-sender (var-get vault-allocator)) err-not-allocator)
    (asserts! (is-eq (some (contract-of adapter)) (var-get adapter-granite-usdcx))
              err-invalid-adapter)
    (asserts! (> amount u0) err-amount-zero)
    (as-contract (do-allocate-granite amount adapter))))

(define-public (deploy-to-zest-v2 (amount uint) (adapter <lat>))
  (begin
    (asserts! (is-eq tx-sender (var-get vault-allocator)) err-not-allocator)
    (asserts! (is-eq (some (contract-of adapter)) (var-get adapter-zest-v2-usdc))
              err-invalid-adapter)
    (asserts! (> amount u0) err-amount-zero)
    (as-contract (do-allocate-zest-v2 amount adapter))))

(define-public (rebalance-granite-to-zest-v2 (amount uint)
               (granite <lat>) (zest-v2 <lat>))
  (begin
    (asserts! (is-eq tx-sender (var-get vault-allocator)) err-not-allocator)
    (asserts! (is-eq (some (contract-of granite)) (var-get adapter-granite-usdcx))
              err-invalid-adapter)
    (asserts! (is-eq (some (contract-of zest-v2))  (var-get adapter-zest-v2-usdc))
              err-invalid-adapter)
    (asserts! (> amount u0) err-amount-zero)
    (try! (as-contract (do-deallocate-granite amount granite)))
    (as-contract (do-allocate-zest-v2 amount zest-v2))))

(define-public (rebalance-zest-v2-to-granite (amount uint)
               (zest-v2 <lat>) (granite <lat>))
  (begin
    (asserts! (is-eq tx-sender (var-get vault-allocator)) err-not-allocator)
    (asserts! (is-eq (some (contract-of zest-v2))  (var-get adapter-zest-v2-usdc))
              err-invalid-adapter)
    (asserts! (is-eq (some (contract-of granite)) (var-get adapter-granite-usdcx))
              err-invalid-adapter)
    (asserts! (> amount u0) err-amount-zero)
    (try! (as-contract (do-deallocate-zest-v2 amount zest-v2)))
    (as-contract (do-allocate-granite amount granite))))
