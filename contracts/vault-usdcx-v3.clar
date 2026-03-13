;; vault-usdcx-v3.clar
;;
;; ERC-4626-style yield vault -- PORTABLE across any SIP-010 base asset.
;; Vault shares are a SIP-010 fungible token, transferable between users.
;;
;; Portability
;; -----------
;; Call `initialize` once after deployment to configure the base asset,
;; decimals, share metadata, and virtual offset (10^decimals).
;; The base asset is passed as a SIP-010 trait arg to deposit/withdraw/etc.
;; and validated against the stored principal at runtime.
;;
;; v3 features
;; -----------
;; - Auto-allocation on deposit (proportional to current lending balances)
;; - Proportional withdrawal across idle + markets
;; - Performance fees (MetaMorpho-style dilution via share minting)
;; - Zero-sum rebalancing (reallocate)
;; - Recall (market -> idle)
;; - Symmetric virtual offset = 10^decimals for share pricing
;; - Bookkeeping-based total-assets prevents donation attacks

(use-trait lat .lending-adapter-trait.lending-adapter-trait)
(use-trait ft 'SP3FBR2AGK5H9QBDH3EEN6DF8EK8JY7RX8QJ5SVTE.sip-010-trait-ft-standard.sip-010-trait)
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
(define-constant err-not-zero-sum         (err u113))
(define-constant err-already-initialized  (err u114))
(define-constant err-invalid-decimals     (err u115))
(define-constant err-invalid-asset        (err u116))

;; ---------------------------------------------------------------------------
;; Constants
;; ---------------------------------------------------------------------------
(define-constant bps-base u10000)

;; Dust threshold: allocations at or below this are treated as zero.
;; Prevents wasted sync calls and stuck proportional-pull dust.
;; 100 = 0.0001 USDCx ($0.0001) -- effectively worthless.
(define-constant dust-threshold u100)

;; Hardcoded market addresses (mainnet live position queries -- deployment-specific)
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

;; --- Configurable base asset (set via initialize) ---
(define-data-var base-asset principal .mock-token)
(define-data-var virtual-offset uint u1000000)  ;; 10^decimals, default 10^6 for USDCx
(define-data-var vault-initialized bool false)

;; --- Configurable SIP-010 share metadata ---
(define-data-var vault-name     (string-ascii 32) "1delta Vault v3")
(define-data-var vault-symbol   (string-ascii 10) "dVAULT")
(define-data-var vault-decimals uint u6)

;; --- v3: idle buffer ---
(define-data-var idle-buffer-bps uint u500)

;; --- v3: performance fees (MetaMorpho-style) ---
(define-data-var fee-bps uint u0)
(define-data-var fee-recipient principal tx-sender)

;; ---------------------------------------------------------------------------
;; Decimals -> 10^decimals lookup (Clarity has no pow)
;; ---------------------------------------------------------------------------

(define-private (decimals-to-offset (d uint))
  (if (is-eq d u0)  u1
  (if (is-eq d u1)  u10
  (if (is-eq d u2)  u100
  (if (is-eq d u3)  u1000
  (if (is-eq d u4)  u10000
  (if (is-eq d u5)  u100000
  (if (is-eq d u6)  u1000000
  (if (is-eq d u7)  u10000000
  (if (is-eq d u8)  u100000000
  (if (is-eq d u9)  u1000000000
  (if (is-eq d u10) u10000000000
  (if (is-eq d u11) u100000000000
  (if (is-eq d u12) u1000000000000
  (if (is-eq d u13) u10000000000000
  (if (is-eq d u14) u100000000000000
  (if (is-eq d u15) u1000000000000000
  (if (is-eq d u16) u10000000000000000
  (if (is-eq d u17) u100000000000000000
  (if (is-eq d u18) u1000000000000000000
  u0)))))))))))))))))))) ;; u0 = invalid

;; ---------------------------------------------------------------------------
;; SIP-010 interface (vault shares token)
;; ---------------------------------------------------------------------------

(define-read-only (get-name)     (ok (var-get vault-name)))
(define-read-only (get-symbol)   (ok (var-get vault-symbol)))
(define-read-only (get-decimals) (ok (var-get vault-decimals)))
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
  (ok (var-get base-asset)))

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
        (total  (var-get total-assets-bookkeeping))
        (voff   (var-get virtual-offset)))
    (if (is-eq supply u0)
      shares
      (/ (+ (* shares (+ total voff)) (- (+ supply voff) u1))
         (+ supply voff)))))

(define-read-only (max-withdraw (owner principal))
  (convert-to-assets (ft-get-balance vault-shares owner)))

(define-read-only (preview-withdraw (assets uint))
  (let ((supply (ft-get-supply vault-shares))
        (total  (var-get total-assets-bookkeeping))
        (voff   (var-get virtual-offset)))
    (if (is-eq total u0)
      u0
      (/ (+ (* assets (+ supply voff)) (- (+ total voff) u1))
         (+ total voff)))))

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

(define-read-only (get-fee-bps)
  (var-get fee-bps))

(define-read-only (get-fee-recipient)
  (var-get fee-recipient))

(define-read-only (get-base-asset)
  (var-get base-asset))

(define-read-only (get-virtual-offset)
  (var-get virtual-offset))

;; ---------------------------------------------------------------------------
;; Live position reads (deployment-specific -- references mainnet contracts)
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
        (total  (var-get total-assets-bookkeeping))
        (voff   (var-get virtual-offset)))
    (/ (* amount (+ supply voff)) (+ total voff))))

(define-read-only (convert-to-assets (shares uint))
  (let ((supply (ft-get-supply vault-shares))
        (total  (var-get total-assets-bookkeeping))
        (voff   (var-get virtual-offset)))
    (if (is-eq supply u0)
      u0
      (/ (* shares (+ total voff)) (+ supply voff)))))

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
(define-public (set-idle-buffer (buffer uint))
  (begin
    (asserts! (is-eq tx-sender (var-get vault-owner)) err-owner-only)
    (asserts! (<= buffer bps-base) err-invalid-weights)
    (var-set idle-buffer-bps buffer)
    (ok true)))

;; --- v3: Performance fee setters ---
(define-public (set-fee-bps (new-fee uint))
  (begin
    (asserts! (is-eq tx-sender (var-get vault-owner)) err-owner-only)
    (asserts! (<= new-fee bps-base) err-invalid-weights)
    (var-set fee-bps new-fee)
    (ok true)))

(define-public (set-fee-recipient (recipient principal))
  (begin
    (asserts! (is-eq tx-sender (var-get vault-owner)) err-owner-only)
    (var-set fee-recipient recipient)
    (ok true)))

;; ---------------------------------------------------------------------------
;; Initialize -- configure base asset, decimals, virtual offset, share metadata.
;; Owner-only, callable once. Sets virtual-offset = 10^decimals automatically.
;; ---------------------------------------------------------------------------

(define-public (initialize
               (asset <ft>)
               (name (string-ascii 32))
               (symbol (string-ascii 10))
               (decimals uint))
  (begin
    (asserts! (is-eq tx-sender (var-get vault-owner)) err-owner-only)
    (asserts! (not (var-get vault-initialized)) err-already-initialized)
    (let ((offset (decimals-to-offset decimals)))
      (asserts! (> offset u0) err-invalid-decimals)
      (var-set base-asset (contract-of asset))
      (var-set virtual-offset offset)
      (var-set vault-name name)
      (var-set vault-symbol symbol)
      (var-set vault-decimals decimals)
      (var-set vault-initialized true)
      (ok true))))

;; ---------------------------------------------------------------------------
;; User-facing vault functions
;; ---------------------------------------------------------------------------

;; Deposit `amount` assets on behalf of `owner`, mint shares, and
;; AUTO-ALLOCATE proportionally based on current lending balances.
;; Returns: (ok shares-minted)
(define-public (deposit (amount uint) (owner principal)
               (token <ft>) (granite <lat>) (zest-v2 <lat>))
  (begin
    (asserts! (> amount u0) err-amount-zero)
    (asserts! (is-eq (contract-of token) (var-get base-asset)) err-invalid-asset)
    ;; Auto-sync yields before computing share price (skip dust positions).
    (let ((sg (if (> (var-get alloc-granite) dust-threshold)
               (begin
                 (asserts! (is-eq (some (contract-of granite))
                                  (var-get adapter-granite-usdcx))
                           err-invalid-adapter)
                 (try! (do-sync-granite granite)))
               u0))
          (sz (if (> (var-get alloc-zest-v2) dust-threshold)
               (begin
                 (asserts! (is-eq (some (contract-of zest-v2))
                                  (var-get adapter-zest-v2-usdc))
                           err-invalid-adapter)
                 (try! (do-sync-zest-v2 zest-v2)))
               u0)))
      ;; Transfer tokens from depositor to vault.
      (try! (contract-call? token transfer amount tx-sender (as-contract tx-sender) none))
      ;; Mint shares based on post-sync, PRE-deposit bookkeeping (1:1 peg).
      (let ((supply (ft-get-supply vault-shares))
            (total  (var-get total-assets-bookkeeping))
            (voff   (var-get virtual-offset)))
        (let ((shares (/ (* amount (+ supply voff)) (+ total voff))))
          (asserts! (> shares u0) err-shares-zero)
          (try! (ft-mint? vault-shares shares owner))
          (var-set total-assets-bookkeeping (+ total amount))
          ;; --- v3: Auto-allocate based on current lending balances ---
          ;; Floor dust allocations so tiny remnants don't skew ratios.
          (let ((ag (let ((raw (var-get alloc-granite)))
                      (if (<= raw dust-threshold) u0 raw)))
                (az (let ((raw (var-get alloc-zest-v2)))
                      (if (<= raw dust-threshold) u0 raw)))
                (total-deployed (+ ag az))
                (buffer (var-get idle-buffer-bps)))
            (if (and (> total-deployed u0)
                     (is-some (var-get adapter-granite-usdcx))
                     (is-some (var-get adapter-zest-v2-usdc))
                     (is-eq (some (contract-of granite))
                            (var-get adapter-granite-usdcx))
                     (is-eq (some (contract-of zest-v2))
                            (var-get adapter-zest-v2-usdc)))
              (let ((deploy-total (/ (* amount (- bps-base buffer)) bps-base)))
                (let ((to-granite (/ (* deploy-total ag) total-deployed))
                      (to-zest    (- deploy-total
                                     (/ (* deploy-total ag) total-deployed))))
                  (if (> to-granite u0)
                    (match (as-contract (do-allocate-granite to-granite granite))
                      ok-val true
                      err-val true)
                    true)
                  (if (> to-zest u0)
                    (match (as-contract (do-allocate-zest-v2 to-zest zest-v2))
                      ok-val true
                      err-val true)
                    true)
                  (ok shares)))
              (ok shares))))))))

;; Mint exactly `shares` vault shares (no auto-alloc -- use deposit for that).
(define-public (mint (shares uint) (receiver principal)
               (token <ft>) (granite <lat>) (zest-v2 <lat>))
  (begin
    (asserts! (> shares u0) err-shares-zero)
    (asserts! (is-eq (contract-of token) (var-get base-asset)) err-invalid-asset)
    (let ((sg (if (> (var-get alloc-granite) dust-threshold)
               (begin
                 (asserts! (is-eq (some (contract-of granite))
                                  (var-get adapter-granite-usdcx))
                           err-invalid-adapter)
                 (try! (do-sync-granite granite)))
               u0))
          (sz (if (> (var-get alloc-zest-v2) dust-threshold)
               (begin
                 (asserts! (is-eq (some (contract-of zest-v2))
                                  (var-get adapter-zest-v2-usdc))
                           err-invalid-adapter)
                 (try! (do-sync-zest-v2 zest-v2)))
               u0)))
      (let ((supply (ft-get-supply vault-shares))
            (total  (var-get total-assets-bookkeeping))
            (voff   (var-get virtual-offset)))
        (let ((assets (/ (+ (* shares (+ total voff)) (- (+ supply voff) u1))
                         (+ supply voff))))
          (asserts! (> assets u0) err-amount-zero)
          (try! (contract-call? token transfer assets tx-sender (as-contract tx-sender) none))
          (try! (ft-mint? vault-shares shares receiver))
          (var-set total-assets-bookkeeping (+ total assets))
          (ok assets))))))

;; Withdraw exactly `amount` assets -- proportional pull from idle + markets.
(define-public (withdraw (amount uint) (receiver principal) (owner principal)
               (token <ft>) (granite <lat>) (zest-v2 <lat>))
  (begin
    (asserts! (is-eq tx-sender owner) err-owner-only)
    (asserts! (is-eq (contract-of token) (var-get base-asset)) err-invalid-asset)
    (let ((sg (if (> (var-get alloc-granite) dust-threshold)
               (begin
                 (asserts! (is-eq (some (contract-of granite))
                                  (var-get adapter-granite-usdcx))
                           err-invalid-adapter)
                 (try! (do-sync-granite granite)))
               u0))
          (sz (if (> (var-get alloc-zest-v2) dust-threshold)
               (begin
                 (asserts! (is-eq (some (contract-of zest-v2))
                                  (var-get adapter-zest-v2-usdc))
                           err-invalid-adapter)
                 (try! (do-sync-zest-v2 zest-v2)))
               u0)))
    (let ((supply (ft-get-supply vault-shares))
          (total  (var-get total-assets-bookkeeping))
          (bal    (ft-get-balance vault-shares owner))
          ;; Floor dust allocations to zero for proportional math.
          (ag     (let ((raw (var-get alloc-granite)))
                    (if (<= raw dust-threshold) u0 raw)))
          (az     (let ((raw (var-get alloc-zest-v2)))
                    (if (<= raw dust-threshold) u0 raw)))
          (voff   (var-get virtual-offset)))
      (asserts! (> amount u0) err-amount-zero)
      (asserts! (> total u0) err-insufficient-balance)
      (let ((shares (/ (* amount (+ supply voff)) (+ total voff))))
        (let ((shares-to-burn
                (if (< (* shares (+ total voff)) (* amount (+ supply voff)))
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
                          (>= (unwrap! (contract-call? token get-balance (as-contract tx-sender))
                                       err-transfer-failed)
                              amount)
                          err-insufficient-balance)
                        (try! (ft-burn? vault-shares shares-to-burn owner))
                        (var-set total-assets-bookkeeping (- total-after amount))
                        (match (contract-call? token transfer amount (as-contract tx-sender) receiver none)
                          success (ok shares-to-burn)
                          e       (err e)))))))))))))))

;; Redeem exactly `shares` -- proportional pull from idle + markets.
(define-public (redeem (shares uint) (receiver principal) (owner principal)
               (token <ft>) (granite <lat>) (zest-v2 <lat>))
  (begin
    (asserts! (is-eq tx-sender owner) err-owner-only)
    (asserts! (is-eq (contract-of token) (var-get base-asset)) err-invalid-asset)
    (let ((sg (if (> (var-get alloc-granite) dust-threshold)
               (begin
                 (asserts! (is-eq (some (contract-of granite))
                                  (var-get adapter-granite-usdcx))
                           err-invalid-adapter)
                 (try! (do-sync-granite granite)))
               u0))
          (sz (if (> (var-get alloc-zest-v2) dust-threshold)
               (begin
                 (asserts! (is-eq (some (contract-of zest-v2))
                                  (var-get adapter-zest-v2-usdc))
                           err-invalid-adapter)
                 (try! (do-sync-zest-v2 zest-v2)))
               u0)))
    (let ((supply (ft-get-supply vault-shares))
          (total  (var-get total-assets-bookkeeping))
          (bal    (ft-get-balance vault-shares owner))
          ;; Floor dust allocations to zero for proportional math.
          (ag     (let ((raw (var-get alloc-granite)))
                    (if (<= raw dust-threshold) u0 raw)))
          (az     (let ((raw (var-get alloc-zest-v2)))
                    (if (<= raw dust-threshold) u0 raw)))
          (voff   (var-get virtual-offset)))
      (asserts! (> shares u0) err-shares-zero)
      (asserts! (>= bal shares) err-insufficient-shares)
      (asserts! (> supply u0) err-insufficient-balance)
      (let ((amt (/ (* shares (+ total voff)) (+ supply voff))))
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
                        (>= (unwrap! (contract-call? token get-balance (as-contract tx-sender))
                                     err-transfer-failed)
                            amt)
                        err-insufficient-balance)
                      (try! (ft-burn? vault-shares shares owner))
                      (var-set total-assets-bookkeeping (- total-after amt))
                      (match (contract-call? token transfer amt (as-contract tx-sender) receiver none)
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
;; Allocation layer -- performance fee helper
;; ---------------------------------------------------------------------------

(define-private (mint-fee-shares (yield-amount uint))
  (let ((fee-rate (var-get fee-bps)))
    (if (is-eq fee-rate u0)
      (ok u0)
      (let ((fee-assets (/ (* yield-amount fee-rate) bps-base)))
        (if (is-eq fee-assets u0)
          (ok u0)
          (let ((supply (ft-get-supply vault-shares))
                (total  (var-get total-assets-bookkeeping))
                (voff   (var-get virtual-offset))
                (fee-shares (/ (* fee-assets (+ supply voff))
                               (+ (- total fee-assets) voff))))
            (if (is-eq fee-shares u0)
              (ok u0)
              (begin
                (try! (ft-mint? vault-shares fee-shares (var-get fee-recipient)))
                (ok fee-shares)))))))))

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
        (try! (mint-fee-shares yield))
        (ok yield))
      (ok u0))))

(define-private (do-sync-zest-v2 (adapter <lat>))
  (let ((book-cost  (var-get alloc-zest-v2))
        (live-value (try! (contract-call? adapter adapter-get-position))))
    (if (> live-value book-cost)
      (let ((yield (- live-value book-cost)))
        (var-set alloc-zest-v2 live-value)
        (var-set total-assets-bookkeeping (+ (var-get total-assets-bookkeeping) yield))
        (try! (mint-fee-shares yield))
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

(define-public (recall-from-granite (amount uint) (adapter <lat>))
  (begin
    (asserts! (is-eq tx-sender (var-get vault-allocator)) err-not-allocator)
    (asserts! (is-eq (some (contract-of adapter)) (var-get adapter-granite-usdcx))
              err-invalid-adapter)
    (asserts! (> amount u0) err-amount-zero)
    (as-contract (do-deallocate-granite amount adapter))))

(define-public (recall-from-zest-v2 (amount uint) (adapter <lat>))
  (begin
    (asserts! (is-eq tx-sender (var-get vault-allocator)) err-not-allocator)
    (asserts! (is-eq (some (contract-of adapter)) (var-get adapter-zest-v2-usdc))
              err-invalid-adapter)
    (asserts! (> amount u0) err-amount-zero)
    (as-contract (do-deallocate-zest-v2 amount adapter))))

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

;; --- v3: Zero-sum rebalancing (MetaMorpho-style) ---
(define-public (reallocate
               (from-granite uint) (from-zest uint)
               (to-granite uint)   (to-zest uint)
               (granite <lat>)     (zest-v2 <lat>))
  (begin
    (asserts! (is-eq tx-sender (var-get vault-allocator)) err-not-allocator)
    (asserts! (is-eq (+ from-granite from-zest) (+ to-granite to-zest)) err-not-zero-sum)
    (asserts! (is-eq (some (contract-of granite)) (var-get adapter-granite-usdcx))
              err-invalid-adapter)
    (asserts! (is-eq (some (contract-of zest-v2)) (var-get adapter-zest-v2-usdc))
              err-invalid-adapter)
    (if (> from-granite u0)
      (begin (try! (as-contract (do-deallocate-granite from-granite granite))) true)
      true)
    (if (> from-zest u0)
      (begin (try! (as-contract (do-deallocate-zest-v2 from-zest zest-v2))) true)
      true)
    (if (> to-granite u0)
      (begin (try! (as-contract (do-allocate-granite to-granite granite))) true)
      true)
    (if (> to-zest u0)
      (begin (try! (as-contract (do-allocate-zest-v2 to-zest zest-v2))) true)
      true)
    (ok true)))
