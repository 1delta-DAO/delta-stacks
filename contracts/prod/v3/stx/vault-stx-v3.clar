;; vault-stx-v3.clar
;;
;; ERC-4626-style yield vault for STX -- PORTABLE across any SIP-010 base asset.
;; Vault shares are a SIP-010 fungible token, transferable between users.
;;
;; Markets: Zest V1 (wSTX, Aave-like pool) + Zest V2 (wSTX, ERC-4626 vault).
;; No Granite market for STX.
;;
;; wSTX note
;; --------
;; Both Zest V1 and V2 use wSTX (wrapped STX) as the SIP-010 interface over
;; native STX.  wSTX.transfer() = stx-transfer?() -- they are the same balance.
;; The vault holds native STX; adapters use whichever wSTX contract their
;; protocol expects.
;;
;; v3 features (same as vault-usdcx-v3)
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
(define-constant dust-threshold u100)

;; Hardcoded market addresses (mainnet live position queries)
;; Zest V1: z-token for wSTX position
(define-constant zest-v1-zwstx
  'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.zwstx-v2-0)

;; Zest V2: STX vault (ERC-4626)
(define-constant zest-v2-stx-vault
  'SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.v0-vault-stx)

;; wSTX contract used as SIP-010 base-asset (Zest V2 deployer's wSTX)
(define-constant wstx-token
  'SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.wstx)

;; ---------------------------------------------------------------------------
;; State
;; ---------------------------------------------------------------------------

(define-data-var total-assets-bookkeeping uint u0)
(define-data-var vault-owner principal tx-sender)
(define-data-var vault-allocator principal tx-sender)
(define-data-var alloc-zest-v1 uint u0)
(define-data-var alloc-zest-v2 uint u0)
(define-data-var adapter-zest-v1-wstx (optional principal) none)
(define-data-var adapter-zest-v2-stx  (optional principal) none)

;; --- Configurable base asset (set via initialize) ---
(define-data-var base-asset principal wstx-token)
(define-data-var virtual-offset uint u1000000)  ;; 10^6 for STX
(define-data-var vault-initialized bool false)

;; --- Configurable SIP-010 share metadata ---
(define-data-var vault-name     (string-ascii 32) "1delta STX Vault v3")
(define-data-var vault-symbol   (string-ascii 10) "1dSTX")
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
  u0))))))))))))))))))))

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

(define-read-only (get-adapter-zest-v1-wstx)
  (var-get adapter-zest-v1-wstx))

(define-read-only (get-adapter-zest-v2-stx)
  (var-get adapter-zest-v2-stx))

(define-read-only (get-alloc-zest-v1)
  (var-get alloc-zest-v1))

(define-read-only (get-alloc-zest-v2)
  (var-get alloc-zest-v2))

(define-read-only (get-idle-bookkeeping)
  (let ((total (var-get total-assets-bookkeeping))
        (a1    (var-get alloc-zest-v1))
        (a2    (var-get alloc-zest-v2)))
    (if (>= total (+ a1 a2))
      (- total (+ a1 a2))
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

;; Idle = native STX balance held by vault (via wSTX SIP-010 get-balance)
(define-read-only (get-idle-balance)
  (unwrap-panic (contract-call? 'SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.wstx
    get-balance (as-contract tx-sender))))

;; Zest V1 position: z-token balance (aToken-style, auto-increases with interest)
(define-read-only (get-zest-v1-wstx-position)
  (match (var-get adapter-zest-v1-wstx)
    adapter
    (unwrap-panic
      (contract-call? 'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.zwstx-v2-0
        get-balance adapter))
    u0))

;; Zest V2 position: z-shares converted to underlying
(define-read-only (get-zest-v2-stx-position)
  (match (var-get adapter-zest-v2-stx)
    adapter
    (let ((shares (unwrap-panic
                    (contract-call? 'SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.v0-vault-stx
                      get-balance adapter))))
      (unwrap-panic
        (contract-call? 'SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.v0-vault-stx
          convert-to-assets shares)))
    u0))

(define-read-only (get-live-total-assets)
  (+ (get-idle-balance)
     (get-zest-v1-wstx-position)
     (get-zest-v2-stx-position)))

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

(define-public (register-adapter-zest-v1-wstx (adapter principal))
  (begin
    (asserts! (is-eq tx-sender (var-get vault-owner)) err-not-allocator)
    (var-set adapter-zest-v1-wstx (some adapter))
    (ok adapter)))

(define-public (register-adapter-zest-v2-stx (adapter principal))
  (begin
    (asserts! (is-eq tx-sender (var-get vault-owner)) err-not-allocator)
    (var-set adapter-zest-v2-stx (some adapter))
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
;; Owner-only, callable once.
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

;; Deposit `amount` wSTX on behalf of `owner`, mint shares, and
;; AUTO-ALLOCATE proportionally based on current lending balances.
(define-public (deposit (amount uint) (owner principal)
               (token <ft>) (zest-v1 <lat>) (zest-v2 <lat>))
  (begin
    (asserts! (> amount u0) err-amount-zero)
    (asserts! (is-eq (contract-of token) (var-get base-asset)) err-invalid-asset)
    ;; Auto-sync yields before computing share price (skip dust positions).
    (let ((s1 (if (> (var-get alloc-zest-v1) dust-threshold)
               (begin
                 (asserts! (is-eq (some (contract-of zest-v1))
                                  (var-get adapter-zest-v1-wstx))
                           err-invalid-adapter)
                 (try! (do-sync-zest-v1 zest-v1)))
               u0))
          (s2 (if (> (var-get alloc-zest-v2) dust-threshold)
               (begin
                 (asserts! (is-eq (some (contract-of zest-v2))
                                  (var-get adapter-zest-v2-stx))
                           err-invalid-adapter)
                 (try! (do-sync-zest-v2 zest-v2)))
               u0)))
      ;; Transfer wSTX from depositor to vault (= native STX transfer).
      (try! (contract-call? token transfer amount tx-sender (as-contract tx-sender) none))
      ;; Mint shares based on post-sync, PRE-deposit bookkeeping.
      (let ((supply (ft-get-supply vault-shares))
            (total  (var-get total-assets-bookkeeping))
            (voff   (var-get virtual-offset)))
        (let ((shares (/ (* amount (+ supply voff)) (+ total voff))))
          (asserts! (> shares u0) err-shares-zero)
          (try! (ft-mint? vault-shares shares owner))
          (var-set total-assets-bookkeeping (+ total amount))
          ;; --- v3: Auto-allocate ---
          (let ((a1 (let ((raw (var-get alloc-zest-v1)))
                      (if (<= raw dust-threshold) u0 raw)))
                (a2 (let ((raw (var-get alloc-zest-v2)))
                      (if (<= raw dust-threshold) u0 raw)))
                (total-deployed (+ a1 a2))
                (buffer (var-get idle-buffer-bps)))
            (if (and (> total-deployed u0)
                     (is-some (var-get adapter-zest-v1-wstx))
                     (is-some (var-get adapter-zest-v2-stx))
                     (is-eq (some (contract-of zest-v1))
                            (var-get adapter-zest-v1-wstx))
                     (is-eq (some (contract-of zest-v2))
                            (var-get adapter-zest-v2-stx)))
              (let ((deploy-total (/ (* amount (- bps-base buffer)) bps-base)))
                (let ((to-v1 (/ (* deploy-total a1) total-deployed))
                      (to-v2 (- deploy-total
                                 (/ (* deploy-total a1) total-deployed))))
                  (if (> to-v1 u0)
                    (match (as-contract (do-allocate-zest-v1 to-v1 zest-v1))
                      ok-val true
                      err-val true)
                    true)
                  (if (> to-v2 u0)
                    (match (as-contract (do-allocate-zest-v2 to-v2 zest-v2))
                      ok-val true
                      err-val true)
                    true)
                  (ok shares)))
              (ok shares))))))))

;; Mint exactly `shares` vault shares (no auto-alloc).
(define-public (mint (shares uint) (receiver principal)
               (token <ft>) (zest-v1 <lat>) (zest-v2 <lat>))
  (begin
    (asserts! (> shares u0) err-shares-zero)
    (asserts! (is-eq (contract-of token) (var-get base-asset)) err-invalid-asset)
    (let ((s1 (if (> (var-get alloc-zest-v1) dust-threshold)
               (begin
                 (asserts! (is-eq (some (contract-of zest-v1))
                                  (var-get adapter-zest-v1-wstx))
                           err-invalid-adapter)
                 (try! (do-sync-zest-v1 zest-v1)))
               u0))
          (s2 (if (> (var-get alloc-zest-v2) dust-threshold)
               (begin
                 (asserts! (is-eq (some (contract-of zest-v2))
                                  (var-get adapter-zest-v2-stx))
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
               (token <ft>) (zest-v1 <lat>) (zest-v2 <lat>))
  (begin
    (asserts! (is-eq tx-sender owner) err-owner-only)
    (asserts! (is-eq (contract-of token) (var-get base-asset)) err-invalid-asset)
    (let ((s1 (if (> (var-get alloc-zest-v1) dust-threshold)
               (begin
                 (asserts! (is-eq (some (contract-of zest-v1))
                                  (var-get adapter-zest-v1-wstx))
                           err-invalid-adapter)
                 (try! (do-sync-zest-v1 zest-v1)))
               u0))
          (s2 (if (> (var-get alloc-zest-v2) dust-threshold)
               (begin
                 (asserts! (is-eq (some (contract-of zest-v2))
                                  (var-get adapter-zest-v2-stx))
                           err-invalid-adapter)
                 (try! (do-sync-zest-v2 zest-v2)))
               u0)))
    (let ((supply (ft-get-supply vault-shares))
          (total  (var-get total-assets-bookkeeping))
          (bal    (ft-get-balance vault-shares owner))
          (a1     (let ((raw (var-get alloc-zest-v1)))
                    (if (<= raw dust-threshold) u0 raw)))
          (a2     (let ((raw (var-get alloc-zest-v2)))
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
          (let ((idle-book (if (>= total (+ a1 a2)) (- total (+ a1 a2)) u0)))
            (let ((pull-idle    (/ (* amount idle-book) total))
                  (a1-plus-a2  (+ a1 a2)))
              (let ((remaining    (- amount pull-idle)))
                (let ((pull-v1  (if (> a1-plus-a2 u0)
                                   (/ (* remaining a1) a1-plus-a2)
                                   u0)))
                  (let ((pull-v2 (- remaining pull-v1)))
                    (if (> pull-v1 u0)
                      (asserts! (is-eq (some (contract-of zest-v1))
                                       (var-get adapter-zest-v1-wstx))
                                err-invalid-adapter)
                      true)
                    (if (> pull-v2 u0)
                      (asserts! (is-eq (some (contract-of zest-v2))
                                       (var-get adapter-zest-v2-stx))
                                err-invalid-adapter)
                      true)
                    (let ((r1 (if (> pull-v1 u0)
                                 (try! (as-contract (do-deallocate-zest-v1 pull-v1 zest-v1)))
                                 u0))
                          (r2 (if (> pull-v2 u0)
                                 (try! (as-contract (do-deallocate-zest-v2 pull-v2 zest-v2)))
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
               (token <ft>) (zest-v1 <lat>) (zest-v2 <lat>))
  (begin
    (asserts! (is-eq tx-sender owner) err-owner-only)
    (asserts! (is-eq (contract-of token) (var-get base-asset)) err-invalid-asset)
    (let ((s1 (if (> (var-get alloc-zest-v1) dust-threshold)
               (begin
                 (asserts! (is-eq (some (contract-of zest-v1))
                                  (var-get adapter-zest-v1-wstx))
                           err-invalid-adapter)
                 (try! (do-sync-zest-v1 zest-v1)))
               u0))
          (s2 (if (> (var-get alloc-zest-v2) dust-threshold)
               (begin
                 (asserts! (is-eq (some (contract-of zest-v2))
                                  (var-get adapter-zest-v2-stx))
                           err-invalid-adapter)
                 (try! (do-sync-zest-v2 zest-v2)))
               u0)))
    (let ((supply (ft-get-supply vault-shares))
          (total  (var-get total-assets-bookkeeping))
          (bal    (ft-get-balance vault-shares owner))
          (a1     (let ((raw (var-get alloc-zest-v1)))
                    (if (<= raw dust-threshold) u0 raw)))
          (a2     (let ((raw (var-get alloc-zest-v2)))
                    (if (<= raw dust-threshold) u0 raw)))
          (voff   (var-get virtual-offset)))
      (asserts! (> shares u0) err-shares-zero)
      (asserts! (>= bal shares) err-insufficient-shares)
      (asserts! (> supply u0) err-insufficient-balance)
      (let ((amt (/ (* shares (+ total voff)) (+ supply voff))))
        (asserts! (> amt u0) err-amount-zero)
        (let ((idle-book  (if (>= total (+ a1 a2)) (- total (+ a1 a2)) u0)))
          (let ((pull-idle   (/ (* amt idle-book) total))
                (a1-plus-a2 (+ a1 a2)))
            (let ((remaining   (- amt pull-idle)))
              (let ((pull-v1  (if (> a1-plus-a2 u0)
                                 (/ (* remaining a1) a1-plus-a2)
                                 u0)))
                (let ((pull-v2 (- remaining pull-v1)))
                  (if (> pull-v1 u0)
                    (asserts! (is-eq (some (contract-of zest-v1))
                                     (var-get adapter-zest-v1-wstx))
                              err-invalid-adapter)
                    true)
                  (if (> pull-v2 u0)
                    (asserts! (is-eq (some (contract-of zest-v2))
                                     (var-get adapter-zest-v2-stx))
                              err-invalid-adapter)
                    true)
                  (let ((r1 (if (> pull-v1 u0)
                               (try! (as-contract (do-deallocate-zest-v1 pull-v1 zest-v1)))
                               u0))
                        (r2 (if (> pull-v2 u0)
                               (try! (as-contract (do-deallocate-zest-v2 pull-v2 zest-v2)))
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
;; Native STX convenience functions
;; ---------------------------------------------------------------------------
;; These use stx-transfer? directly so users don't need to know about wSTX.
;; The vault holds native STX (= wSTX balance). On withdraw/redeem the vault
;; sends native STX back via stx-transfer?.

;; Deposit native STX, mint shares, auto-allocate.
;; Same logic as `deposit` but uses stx-transfer? instead of wSTX SIP-010.
(define-public (deposit-stx (amount uint) (owner principal)
               (zest-v1 <lat>) (zest-v2 <lat>))
  (begin
    (asserts! (> amount u0) err-amount-zero)
    (let ((s1 (if (> (var-get alloc-zest-v1) dust-threshold)
               (begin
                 (asserts! (is-eq (some (contract-of zest-v1))
                                  (var-get adapter-zest-v1-wstx))
                           err-invalid-adapter)
                 (try! (do-sync-zest-v1 zest-v1)))
               u0))
          (s2 (if (> (var-get alloc-zest-v2) dust-threshold)
               (begin
                 (asserts! (is-eq (some (contract-of zest-v2))
                                  (var-get adapter-zest-v2-stx))
                           err-invalid-adapter)
                 (try! (do-sync-zest-v2 zest-v2)))
               u0)))
      ;; Transfer native STX from depositor to vault.
      (try! (stx-transfer? amount tx-sender (as-contract tx-sender)))
      (let ((supply (ft-get-supply vault-shares))
            (total  (var-get total-assets-bookkeeping))
            (voff   (var-get virtual-offset)))
        (let ((shares (/ (* amount (+ supply voff)) (+ total voff))))
          (asserts! (> shares u0) err-shares-zero)
          (try! (ft-mint? vault-shares shares owner))
          (var-set total-assets-bookkeeping (+ total amount))
          ;; Auto-allocate (same as deposit)
          (let ((a1 (let ((raw (var-get alloc-zest-v1)))
                      (if (<= raw dust-threshold) u0 raw)))
                (a2 (let ((raw (var-get alloc-zest-v2)))
                      (if (<= raw dust-threshold) u0 raw)))
                (total-deployed (+ a1 a2))
                (buffer (var-get idle-buffer-bps)))
            (if (and (> total-deployed u0)
                     (is-some (var-get adapter-zest-v1-wstx))
                     (is-some (var-get adapter-zest-v2-stx))
                     (is-eq (some (contract-of zest-v1))
                            (var-get adapter-zest-v1-wstx))
                     (is-eq (some (contract-of zest-v2))
                            (var-get adapter-zest-v2-stx)))
              (let ((deploy-total (/ (* amount (- bps-base buffer)) bps-base)))
                (let ((to-v1 (/ (* deploy-total a1) total-deployed))
                      (to-v2 (- deploy-total
                                 (/ (* deploy-total a1) total-deployed))))
                  (if (> to-v1 u0)
                    (match (as-contract (do-allocate-zest-v1 to-v1 zest-v1))
                      ok-val true
                      err-val true)
                    true)
                  (if (> to-v2 u0)
                    (match (as-contract (do-allocate-zest-v2 to-v2 zest-v2))
                      ok-val true
                      err-val true)
                    true)
                  (ok shares)))
              (ok shares))))))))

;; Withdraw exact STX amount via native stx-transfer?.
;; Proportional pull from idle + markets, then sends STX to receiver.
(define-public (withdraw-stx (amount uint) (receiver principal) (owner principal)
               (zest-v1 <lat>) (zest-v2 <lat>))
  (begin
    (asserts! (is-eq tx-sender owner) err-owner-only)
    (let ((s1 (if (> (var-get alloc-zest-v1) dust-threshold)
               (begin
                 (asserts! (is-eq (some (contract-of zest-v1))
                                  (var-get adapter-zest-v1-wstx))
                           err-invalid-adapter)
                 (try! (do-sync-zest-v1 zest-v1)))
               u0))
          (s2 (if (> (var-get alloc-zest-v2) dust-threshold)
               (begin
                 (asserts! (is-eq (some (contract-of zest-v2))
                                  (var-get adapter-zest-v2-stx))
                           err-invalid-adapter)
                 (try! (do-sync-zest-v2 zest-v2)))
               u0)))
    (let ((supply (ft-get-supply vault-shares))
          (total  (var-get total-assets-bookkeeping))
          (bal    (ft-get-balance vault-shares owner))
          (a1     (let ((raw (var-get alloc-zest-v1)))
                    (if (<= raw dust-threshold) u0 raw)))
          (a2     (let ((raw (var-get alloc-zest-v2)))
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
          (let ((idle-book (if (>= total (+ a1 a2)) (- total (+ a1 a2)) u0)))
            (let ((pull-idle    (/ (* amount idle-book) total))
                  (a1-plus-a2  (+ a1 a2)))
              (let ((remaining    (- amount pull-idle)))
                (let ((pull-v1  (if (> a1-plus-a2 u0)
                                   (/ (* remaining a1) a1-plus-a2)
                                   u0)))
                  (let ((pull-v2 (- remaining pull-v1)))
                    (if (> pull-v1 u0)
                      (asserts! (is-eq (some (contract-of zest-v1))
                                       (var-get adapter-zest-v1-wstx))
                                err-invalid-adapter)
                      true)
                    (if (> pull-v2 u0)
                      (asserts! (is-eq (some (contract-of zest-v2))
                                       (var-get adapter-zest-v2-stx))
                                err-invalid-adapter)
                      true)
                    (let ((r1 (if (> pull-v1 u0)
                                 (try! (as-contract (do-deallocate-zest-v1 pull-v1 zest-v1)))
                                 u0))
                          (r2 (if (> pull-v2 u0)
                                 (try! (as-contract (do-deallocate-zest-v2 pull-v2 zest-v2)))
                                 u0)))
                      (let ((total-after (var-get total-assets-bookkeeping)))
                        (asserts!
                          (>= (stx-get-balance (as-contract tx-sender)) amount)
                          err-insufficient-balance)
                        (try! (ft-burn? vault-shares shares-to-burn owner))
                        (var-set total-assets-bookkeeping (- total-after amount))
                        (match (as-contract (stx-transfer? amount tx-sender receiver))
                          success (ok shares-to-burn)
                          e       (err e)))))))))))))))

;; Redeem exact shares for native STX via stx-transfer?.
(define-public (redeem-for-stx (shares uint) (receiver principal) (owner principal)
               (zest-v1 <lat>) (zest-v2 <lat>))
  (begin
    (asserts! (is-eq tx-sender owner) err-owner-only)
    (let ((s1 (if (> (var-get alloc-zest-v1) dust-threshold)
               (begin
                 (asserts! (is-eq (some (contract-of zest-v1))
                                  (var-get adapter-zest-v1-wstx))
                           err-invalid-adapter)
                 (try! (do-sync-zest-v1 zest-v1)))
               u0))
          (s2 (if (> (var-get alloc-zest-v2) dust-threshold)
               (begin
                 (asserts! (is-eq (some (contract-of zest-v2))
                                  (var-get adapter-zest-v2-stx))
                           err-invalid-adapter)
                 (try! (do-sync-zest-v2 zest-v2)))
               u0)))
    (let ((supply (ft-get-supply vault-shares))
          (total  (var-get total-assets-bookkeeping))
          (bal    (ft-get-balance vault-shares owner))
          (a1     (let ((raw (var-get alloc-zest-v1)))
                    (if (<= raw dust-threshold) u0 raw)))
          (a2     (let ((raw (var-get alloc-zest-v2)))
                    (if (<= raw dust-threshold) u0 raw)))
          (voff   (var-get virtual-offset)))
      (asserts! (> shares u0) err-shares-zero)
      (asserts! (>= bal shares) err-insufficient-shares)
      (asserts! (> supply u0) err-insufficient-balance)
      (let ((amt (/ (* shares (+ total voff)) (+ supply voff))))
        (asserts! (> amt u0) err-amount-zero)
        (let ((idle-book  (if (>= total (+ a1 a2)) (- total (+ a1 a2)) u0)))
          (let ((pull-idle   (/ (* amt idle-book) total))
                (a1-plus-a2 (+ a1 a2)))
            (let ((remaining   (- amt pull-idle)))
              (let ((pull-v1  (if (> a1-plus-a2 u0)
                                 (/ (* remaining a1) a1-plus-a2)
                                 u0)))
                (let ((pull-v2 (- remaining pull-v1)))
                  (if (> pull-v1 u0)
                    (asserts! (is-eq (some (contract-of zest-v1))
                                     (var-get adapter-zest-v1-wstx))
                              err-invalid-adapter)
                    true)
                  (if (> pull-v2 u0)
                    (asserts! (is-eq (some (contract-of zest-v2))
                                     (var-get adapter-zest-v2-stx))
                              err-invalid-adapter)
                    true)
                  (let ((r1 (if (> pull-v1 u0)
                               (try! (as-contract (do-deallocate-zest-v1 pull-v1 zest-v1)))
                               u0))
                        (r2 (if (> pull-v2 u0)
                               (try! (as-contract (do-deallocate-zest-v2 pull-v2 zest-v2)))
                               u0)))
                    (let ((total-after (var-get total-assets-bookkeeping)))
                      (asserts!
                        (>= (stx-get-balance (as-contract tx-sender)) amt)
                        err-insufficient-balance)
                      (try! (ft-burn? vault-shares shares owner))
                      (var-set total-assets-bookkeeping (- total-after amt))
                      (match (as-contract (stx-transfer? amt tx-sender receiver))
                        success (ok amt)
                        e       (err e))))))))))))))

;; ---------------------------------------------------------------------------
;; Allocation layer -- private helpers
;; ---------------------------------------------------------------------------

(define-private (do-allocate-zest-v1 (amount uint) (adapter <lat>))
  (let ((deposited (try! (contract-call? adapter adapter-deposit amount))))
    (var-set alloc-zest-v1 (+ (var-get alloc-zest-v1) deposited))
    (ok deposited)))

(define-private (do-allocate-zest-v2 (amount uint) (adapter <lat>))
  (let ((deposited (try! (contract-call? adapter adapter-deposit amount))))
    (var-set alloc-zest-v2 (+ (var-get alloc-zest-v2) deposited))
    (ok deposited)))

(define-private (do-deallocate-zest-v1 (amount uint) (adapter <lat>))
  (let ((received (try! (contract-call? adapter adapter-withdraw amount tx-sender))))
    (var-set alloc-zest-v1
      (let ((old (var-get alloc-zest-v1)))
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

(define-private (do-sync-zest-v1 (adapter <lat>))
  (let ((book-cost  (var-get alloc-zest-v1))
        (live-value (try! (contract-call? adapter adapter-get-position))))
    (if (> live-value book-cost)
      (let ((yield (- live-value book-cost)))
        (var-set alloc-zest-v1 live-value)
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

(define-public (sync-zest-v1 (adapter <lat>))
  (begin
    (asserts! (is-eq (some (contract-of adapter)) (var-get adapter-zest-v1-wstx))
              err-invalid-adapter)
    (do-sync-zest-v1 adapter)))

(define-public (sync-zest-v2 (adapter <lat>))
  (begin
    (asserts! (is-eq (some (contract-of adapter)) (var-get adapter-zest-v2-stx))
              err-invalid-adapter)
    (do-sync-zest-v2 adapter)))

;; ---------------------------------------------------------------------------
;; Allocation layer -- public rebalance interface (allocator-only)
;; ---------------------------------------------------------------------------

(define-public (deploy-to-zest-v1 (amount uint) (adapter <lat>))
  (begin
    (asserts! (is-eq tx-sender (var-get vault-allocator)) err-not-allocator)
    (asserts! (is-eq (some (contract-of adapter)) (var-get adapter-zest-v1-wstx))
              err-invalid-adapter)
    (asserts! (> amount u0) err-amount-zero)
    (as-contract (do-allocate-zest-v1 amount adapter))))

(define-public (deploy-to-zest-v2 (amount uint) (adapter <lat>))
  (begin
    (asserts! (is-eq tx-sender (var-get vault-allocator)) err-not-allocator)
    (asserts! (is-eq (some (contract-of adapter)) (var-get adapter-zest-v2-stx))
              err-invalid-adapter)
    (asserts! (> amount u0) err-amount-zero)
    (as-contract (do-allocate-zest-v2 amount adapter))))

(define-public (recall-from-zest-v1 (amount uint) (adapter <lat>))
  (begin
    (asserts! (is-eq tx-sender (var-get vault-allocator)) err-not-allocator)
    (asserts! (is-eq (some (contract-of adapter)) (var-get adapter-zest-v1-wstx))
              err-invalid-adapter)
    (asserts! (> amount u0) err-amount-zero)
    (as-contract (do-deallocate-zest-v1 amount adapter))))

(define-public (recall-from-zest-v2 (amount uint) (adapter <lat>))
  (begin
    (asserts! (is-eq tx-sender (var-get vault-allocator)) err-not-allocator)
    (asserts! (is-eq (some (contract-of adapter)) (var-get adapter-zest-v2-stx))
              err-invalid-adapter)
    (asserts! (> amount u0) err-amount-zero)
    (as-contract (do-deallocate-zest-v2 amount adapter))))

(define-public (rebalance-v1-to-v2 (amount uint)
               (zest-v1 <lat>) (zest-v2 <lat>))
  (begin
    (asserts! (is-eq tx-sender (var-get vault-allocator)) err-not-allocator)
    (asserts! (is-eq (some (contract-of zest-v1)) (var-get adapter-zest-v1-wstx))
              err-invalid-adapter)
    (asserts! (is-eq (some (contract-of zest-v2)) (var-get adapter-zest-v2-stx))
              err-invalid-adapter)
    (asserts! (> amount u0) err-amount-zero)
    (try! (as-contract (do-deallocate-zest-v1 amount zest-v1)))
    (as-contract (do-allocate-zest-v2 amount zest-v2))))

(define-public (rebalance-v2-to-v1 (amount uint)
               (zest-v2 <lat>) (zest-v1 <lat>))
  (begin
    (asserts! (is-eq tx-sender (var-get vault-allocator)) err-not-allocator)
    (asserts! (is-eq (some (contract-of zest-v2)) (var-get adapter-zest-v2-stx))
              err-invalid-adapter)
    (asserts! (is-eq (some (contract-of zest-v1)) (var-get adapter-zest-v1-wstx))
              err-invalid-adapter)
    (asserts! (> amount u0) err-amount-zero)
    (try! (as-contract (do-deallocate-zest-v2 amount zest-v2)))
    (as-contract (do-allocate-zest-v1 amount zest-v1))))

;; --- v3: Zero-sum rebalancing ---
(define-public (reallocate
               (from-v1 uint) (from-v2 uint)
               (to-v1 uint)   (to-v2 uint)
               (zest-v1 <lat>) (zest-v2 <lat>))
  (begin
    (asserts! (is-eq tx-sender (var-get vault-allocator)) err-not-allocator)
    (asserts! (is-eq (+ from-v1 from-v2) (+ to-v1 to-v2)) err-not-zero-sum)
    (asserts! (is-eq (some (contract-of zest-v1)) (var-get adapter-zest-v1-wstx))
              err-invalid-adapter)
    (asserts! (is-eq (some (contract-of zest-v2)) (var-get adapter-zest-v2-stx))
              err-invalid-adapter)
    (if (> from-v1 u0)
      (begin (try! (as-contract (do-deallocate-zest-v1 from-v1 zest-v1))) true)
      true)
    (if (> from-v2 u0)
      (begin (try! (as-contract (do-deallocate-zest-v2 from-v2 zest-v2))) true)
      true)
    (if (> to-v1 u0)
      (begin (try! (as-contract (do-allocate-zest-v1 to-v1 zest-v1))) true)
      true)
    (if (> to-v2 u0)
      (begin (try! (as-contract (do-allocate-zest-v2 to-v2 zest-v2))) true)
      true)
    (ok true)))
