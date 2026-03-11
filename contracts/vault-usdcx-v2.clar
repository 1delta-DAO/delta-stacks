;; vault-usdcx-v2.clar
;;
;; ERC-4626-style yield vault for mock-usdcx with a constrained allocation layer.
;;
;; The vault tracks three positions:
;;   idle      -- tokens sitting undeployed in the vault contract
;;   granite   -- tokens deployed in the Granite USDCx isolated market
;;   zest-v2   -- tokens deployed in the Zest V2 USDCx vault
;;
;; Role separation
;; ---------------
;; Users    -- deposit and withdraw.  Withdrawals are always proportional
;;             across all three positions, so users can exit regardless of
;;             how much is deployed.
;;
;; Allocator (vault-owner) -- may only move funds between the three positions.
;;             Funds never reach an external address through allocator calls.
;;             Permitted operations:
;;               deploy-to-granite           idle -> Granite
;;               deploy-to-zest-v2           idle -> Zest V2
;;               rebalance-granite-to-zest-v2  Granite -> idle -> Zest V2
;;               rebalance-zest-v2-to-granite  Zest V2 -> idle -> Granite
;;
;; Proportional withdrawal math
;; ----------------------------
;; Given withdrawal amount A and vault total T:
;;   pull-idle    = floor(A * idle-book / T)       -- guaranteed <= idle tokens
;;   remaining    = A - pull-idle
;;   pull-granite = floor(remaining * ag / (ag+az)) -- floor, <= ag
;;   pull-zest-v2 = remaining - pull-granite        -- remainder, absorbs rounding
;;
;; This ensures idle-pull never exceeds the actual idle balance.  Any 1-unit
;; rounding artefact falls on zest-v2, which holds sufficient live value
;; to cover it (yield >= rounding dust).
;;
;; Share accounting with interest-accruing markets
;; -----------------------------------------------
;; Vault shares represent ownership of the whole vault (idle + granite + zest-v2).
;; Markets track value internally via LP tokens / z-tokens -- the adapters hide
;; that detail.  When market yields are harvested (via sync-granite / sync-zest-v2
;; or implicitly during deallocation that returns a surplus), alloc-granite /
;; alloc-zest-v2 and total-assets-bookkeeping both increase, raising share price.
;;
;; Virtual-shares anti-inflation: the vault is pre-seeded with 100,000,000
;; phantom shares and phantom assets to prevent first-depositor price manipulation.

(use-trait lat .lending-adapter-trait.lending-adapter-trait)

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

;; ---------------------------------------------------------------------------
;; Constants
;; ---------------------------------------------------------------------------
(define-constant virtual-shares u100000000)

;; ---------------------------------------------------------------------------
;; Hardcoded market addresses (for read-only live position queries)
;; ---------------------------------------------------------------------------
;; Because the vault is asset-specific, the set of compatible markets is finite
;; and known at compile time.  Using literals (not variables) lets Clarity verify
;; the called functions are read-only at compile time, enabling them to be called
;; from define-read-only without a transaction.

;; Granite USDCx isolated market.  state-v1 is the LP share SIP-010 token.
(define-constant granite-usdcx-state
  'SP3M2BYF7RGF8WKW5FVDNJ6WR8D7AR9BHDXAKPXZE.state-v1)

;; Zest V2 USDCx vault.  ERC-4626-style; exposes get-balance + convert-to-assets.
(define-constant zest-v2-usdc-vault
  'SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.v0-vault-usdc)

;; ---------------------------------------------------------------------------
;; State
;; ---------------------------------------------------------------------------

;; Total shares in circulation (excludes virtual-shares phantom supply).
(define-data-var total-supply uint u0)

;; Canonical vault value: idle tokens + all deployed positions.
;; Updated on deposit/withdraw and on yield harvest.
;; Allocation moves do NOT change this (assets are relocated, not consumed).
(define-data-var total-assets-bookkeeping uint u0)

;; Share balances per depositor.
(define-map balances principal uint)

;; Address permitted to execute allocation operations.
(define-data-var vault-owner principal tx-sender)

;; Book-cost of tokens deployed in each market.
;; idle-book = total-assets-bookkeeping - alloc-granite - alloc-zest-v2
(define-data-var alloc-granite uint u0)
(define-data-var alloc-zest-v2 uint u0)

;; Adapter principals -- set once after each adapter contract is deployed.
;; Used to validate adapter arguments passed to withdraw, redeem, and rebalance.
(define-data-var adapter-granite-usdcx (optional principal) none)
(define-data-var adapter-zest-v2-usdc  (optional principal) none)

;; ---------------------------------------------------------------------------
;; Read-only helpers
;; ---------------------------------------------------------------------------

(define-read-only (get-asset)
  (some .mock-token))

(define-read-only (get-total-supply)
  (var-get total-supply))

(define-read-only (get-total-assets)
  (var-get total-assets-bookkeeping))

(define-read-only (get-balance (owner principal))
  (default-to u0 (map-get? balances owner)))

(define-read-only (get-vault-owner)
  (var-get vault-owner))

(define-read-only (get-adapter-granite-usdcx)
  (var-get adapter-granite-usdcx))

(define-read-only (get-adapter-zest-v2-usdc)
  (var-get adapter-zest-v2-usdc))

(define-read-only (get-alloc-granite)
  (var-get alloc-granite))

(define-read-only (get-alloc-zest-v2)
  (var-get alloc-zest-v2))

;; Book-cost of idle tokens: total minus both deployed positions.
(define-read-only (get-idle-bookkeeping)
  (let ((total (var-get total-assets-bookkeeping))
        (ag    (var-get alloc-granite))
        (az    (var-get alloc-zest-v2)))
    (if (>= total (+ ag az))
      (- total (+ ag az))
      u0)))

;; ---------------------------------------------------------------------------
;; Live position reads (read-only -- no transaction required)
;; ---------------------------------------------------------------------------
;; These use hardcoded literal addresses so Clarity can verify at compile time
;; that the target functions are read-only, allowing them inside define-read-only.

;; USDCx sitting idle in the vault, not deployed anywhere.
(define-read-only (get-idle-balance)
  (unwrap-panic (contract-call? .mock-token get-balance (as-contract tx-sender))))

;; Live USDCx value of the vault's Zest V2 position.
;; Reads the adapter's zShare balance then converts via convert-to-assets.
;;
;; Literal address required (not the constant) so Clarity can verify the
;; target functions are read-only at compile time.
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

;; Live USDCx value of the vault's Granite position.
;; Formula: my-shares * (reserve + open-interest) / total-supply
;;   reserve       = idle pool liquidity
;;   open-interest = capital currently lent out to borrowers
;;
;; Literal address required for the same compile-time verification reason.
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

;; Sum of all live positions including accrued yield not yet harvested.
;; Use for display / monitoring; differs from get-total-assets (bookkeeping).
(define-read-only (get-live-total-assets)
  (+ (get-idle-balance)
     (get-zest-v2-usdc-position)
     (get-granite-usdcx-position)))

;; Query live position of any adapter via trait (public -- trait calls cannot
;; be in define-read-only; this function does not modify state).
(define-public (get-market-position (market <lat>))
  (contract-call? market adapter-get-position))

;; Preview: shares minted for a deposit of `amount`.
(define-read-only (convert-to-shares (amount uint))
  (let ((supply (var-get total-supply))
        (total  (var-get total-assets-bookkeeping)))
    (if (is-eq total u0)
      amount
      (/ (* amount (+ supply virtual-shares)) (+ total amount u1)))))

;; Preview: assets returned for a redemption of `shares`.
(define-read-only (convert-to-assets (shares uint))
  (let ((supply (var-get total-supply))
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

;; Register the adapter for the Granite USDCx market.
;; Call once after the adapter is deployed.
(define-public (register-adapter-granite-usdcx (adapter principal))
  (begin
    (asserts! (is-eq tx-sender (var-get vault-owner)) err-not-allocator)
    (var-set adapter-granite-usdcx (some adapter))
    (ok adapter)))

;; Register the adapter for the Zest V2 USDCx vault.
(define-public (register-adapter-zest-v2-usdc (adapter principal))
  (begin
    (asserts! (is-eq tx-sender (var-get vault-owner)) err-not-allocator)
    (var-set adapter-zest-v2-usdc (some adapter))
    (ok adapter)))

;; ---------------------------------------------------------------------------
;; User-facing vault functions
;; ---------------------------------------------------------------------------

;; Deposit `amount` assets on behalf of `owner` and mint proportional shares.
;; tx-sender must equal `owner`.
;;
;; Returns: (ok shares-minted)
(define-public (deposit (amount uint) (owner principal)
               (granite <lat>) (zest-v2 <lat>))
  (begin
    (asserts! (is-eq tx-sender owner) err-deposit-owner-only)
    (asserts! (> amount u0) err-amount-zero)
    ;; Auto-sync yields into bookkeeping before computing the share price.
    ;; Each market is only synced when it has a non-zero allocation so that
    ;; unregistered adapters can be safely ignored when the vault is idle.
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
      (try! (contract-call? .mock-token transfer amount tx-sender (as-contract tx-sender) none))
      ;; Read bookkeeping after sync -- now includes harvested yield.
      (let ((supply    (var-get total-supply))
            (new-total (+ (var-get total-assets-bookkeeping) amount)))
        ;; shares = amount * (supply + virtual) / (new-total + 1)
        (let ((shares (/ (* amount (+ supply virtual-shares)) (+ new-total u1))))
          (asserts! (> shares u0) err-shares-zero)
          (var-set total-supply (+ supply shares))
          (var-set total-assets-bookkeeping new-total)
          (map-set balances owner (+ (get-balance owner) shares))
          (ok shares))))))

;; Withdraw exactly `amount` assets to `receiver`, burning shares proportionally
;; from `owner`.  Pulls from all three positions in proportion to their
;; book-cost share of total-assets-bookkeeping.
;;
;; Adapter arguments must match the registered adapters (validated on-chain).
;; Pass any principal for an adapter whose pull will be zero -- validation is
;; skipped when that market has no allocation.
;;
;; Shares burned use ceiling division (vault-protective).
;;
;; Returns: (ok shares-burned)
(define-public (withdraw (amount uint) (receiver principal) (owner principal)
               (granite <lat>) (zest-v2 <lat>))
  (begin
    (asserts! (is-eq tx-sender owner) err-owner-only)
    ;; Auto-sync yields before reading state so share price reflects live value.
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
    (let ((supply (var-get total-supply))
          (total  (var-get total-assets-bookkeeping))
          (bal    (get-balance owner))
          (ag     (var-get alloc-granite))
          (az     (var-get alloc-zest-v2)))
      (asserts! (> amount u0) err-amount-zero)
      (asserts! (> total u0) err-insufficient-balance)
      ;; Ceiling division: shares-to-burn = ceil(amount * (supply + virtual) / total)
      (let ((shares (/ (* amount (+ supply virtual-shares)) (+ total u1))))
        (let ((shares-to-burn
                (if (< (* shares (+ total u1)) (* amount (+ supply virtual-shares)))
                  (+ shares u1)
                  shares)))
          (asserts! (>= bal shares-to-burn) err-insufficient-shares)
          ;; Proportional pull amounts (see file header for formula).
          (let ((idle-book (if (>= total (+ ag az)) (- total (+ ag az)) u0)))
            (let ((pull-idle    (/ (* amount idle-book) total))
                  (ag-plus-az  (+ ag az)))
              (let ((remaining    (- amount pull-idle)))
                (let ((pull-granite  (if (> ag-plus-az u0)
                                       (/ (* remaining ag) ag-plus-az)
                                       u0)))
                  (let ((pull-zest-v2 (- remaining pull-granite)))
                    ;; Validate adapters only for markets we will actually pull from.
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
                    ;; Execute market pulls (side-effects update alloc-* and bookkeeping).
                    (let ((rg (if (> pull-granite u0)
                                 (try! (as-contract (do-deallocate-granite pull-granite granite)))
                                 u0))
                          (rz (if (> pull-zest-v2 u0)
                                 (try! (as-contract (do-deallocate-zest-v2 pull-zest-v2 zest-v2)))
                                 u0)))
                      ;; Re-read bookkeeping: do-deallocate-* may have harvested yield.
                      (let ((total-after (var-get total-assets-bookkeeping)))
                        ;; Safety guard: vault idle must cover the full transfer.
                        (asserts!
                          (>= (unwrap! (contract-call? .mock-token get-balance (as-contract tx-sender))
                                       err-transfer-failed)
                              amount)
                          err-insufficient-balance)
                        (var-set total-supply (- supply shares-to-burn))
                        (var-set total-assets-bookkeeping (- total-after amount))
                        (map-set balances owner (- bal shares-to-burn))
                        (match (contract-call? .mock-token transfer amount (as-contract tx-sender) receiver none)
                          success (ok shares-to-burn)
                          e       (err e)))))))))))))))

;; Redeem exactly `shares` from `owner`, sending proportional assets to `receiver`.
;; Uses floor division for assets (dust stays in vault).
;; Pulls proportionally from all three positions, same as withdraw.
;;
;; Returns: (ok assets-sent)
(define-public (redeem (shares uint) (receiver principal) (owner principal)
               (granite <lat>) (zest-v2 <lat>))
  (begin
    (asserts! (is-eq tx-sender owner) err-owner-only)
    ;; Auto-sync yields before reading state so share price reflects live value.
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
    (let ((supply (var-get total-supply))
          (total  (var-get total-assets-bookkeeping))
          (bal    (get-balance owner))
          (ag     (var-get alloc-granite))
          (az     (var-get alloc-zest-v2)))
      (asserts! (> shares u0) err-shares-zero)
      (asserts! (>= bal shares) err-insufficient-shares)
      (asserts! (> supply u0) err-insufficient-balance)
      ;; assets = shares * total / (supply + virtual)  -- floor division
      (let ((amt (/ (* shares total) (+ supply virtual-shares))))
        (asserts! (> amt u0) err-amount-zero)
        ;; Proportional pull amounts.
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
                      (var-set total-supply (- supply shares))
                      (var-set total-assets-bookkeeping (- total-after amt))
                      (map-set balances owner (- bal shares))
                      (match (contract-call? .mock-token transfer amt (as-contract tx-sender) receiver none)
                        success (ok amt)
                        e       (err e))))))))))))))

;; ---------------------------------------------------------------------------
;; Allocation layer -- private helpers
;; ---------------------------------------------------------------------------
;;
;; Called within (as-contract ...) so tx-sender == vault inside them.
;; The adapter receives tx-sender == vault and uses that identity to pull/push tokens.

;; Deploy `amount` idle tokens from the vault into the Granite market.
;; total-assets-bookkeeping is NOT changed (assets are relocated, not consumed).
(define-private (do-allocate-granite (amount uint) (adapter <lat>))
  (let ((deposited (try! (contract-call? adapter adapter-deposit amount))))
    (var-set alloc-granite (+ (var-get alloc-granite) deposited))
    (ok deposited)))

;; Deploy `amount` idle tokens from the vault into the Zest V2 market.
(define-private (do-allocate-zest-v2 (amount uint) (adapter <lat>))
  (let ((deposited (try! (contract-call? adapter adapter-deposit amount))))
    (var-set alloc-zest-v2 (+ (var-get alloc-zest-v2) deposited))
    (ok deposited)))

;; Withdraw `amount` from Granite back to the vault (tx-sender == vault).
;; alloc-granite decreases by `amount`.  If the market returns more than
;; requested, the surplus is harvested into total-assets-bookkeeping (raising
;; share price for all depositors).
(define-private (do-deallocate-granite (amount uint) (adapter <lat>))
  (let ((received (try! (contract-call? adapter adapter-withdraw amount tx-sender))))
    (var-set alloc-granite
      (let ((old (var-get alloc-granite)))
        (if (>= old amount) (- old amount) u0)))
    (var-set total-assets-bookkeeping
      (+ (var-get total-assets-bookkeeping)
         (if (> received amount) (- received amount) u0)))
    (ok received)))

;; Withdraw `amount` from Zest V2 back to the vault (tx-sender == vault).
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
;;
;; Harvest unrealised yield from a market without withdrawing any tokens.
;; Calls adapter-get-position to read the live asset value, compares with the
;; book-cost, and credits any surplus to total-assets-bookkeeping.
;; Can be called by anyone -- it only reads from the market and adjusts
;; bookkeeping upward, never moves tokens.

;; Private sync helpers -- shared by the public sync-* functions and by
;; deposit / withdraw / redeem (which auto-sync before reading share price).

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

;; Sync Granite yield.  Returns (ok yield-harvested) or (ok u0) if none.
(define-public (sync-granite (adapter <lat>))
  (begin
    (asserts! (is-eq (some (contract-of adapter)) (var-get adapter-granite-usdcx))
              err-invalid-adapter)
    (do-sync-granite adapter)))

;; Sync Zest V2 yield.  Returns (ok yield-harvested) or (ok u0) if none.
(define-public (sync-zest-v2 (adapter <lat>))
  (begin
    (asserts! (is-eq (some (contract-of adapter)) (var-get adapter-zest-v2-usdc))
              err-invalid-adapter)
    (do-sync-zest-v2 adapter)))

;; ---------------------------------------------------------------------------
;; Allocation layer -- public rebalance interface
;; ---------------------------------------------------------------------------
;;
;; All four functions require tx-sender == vault-owner.
;; All adapter arguments are validated against registered addresses on-chain.
;; Funds stay within the vault system at all times.

;; Deploy `amount` idle tokens into Granite.
;;
;; Returns: (ok amount-deposited)
(define-public (deploy-to-granite (amount uint) (adapter <lat>))
  (begin
    (asserts! (is-eq tx-sender (var-get vault-owner)) err-not-allocator)
    (asserts! (is-eq (some (contract-of adapter)) (var-get adapter-granite-usdcx))
              err-invalid-adapter)
    (asserts! (> amount u0) err-amount-zero)
    (as-contract (do-allocate-granite amount adapter))))

;; Deploy `amount` idle tokens into Zest V2.
;;
;; Returns: (ok amount-deposited)
(define-public (deploy-to-zest-v2 (amount uint) (adapter <lat>))
  (begin
    (asserts! (is-eq tx-sender (var-get vault-owner)) err-not-allocator)
    (asserts! (is-eq (some (contract-of adapter)) (var-get adapter-zest-v2-usdc))
              err-invalid-adapter)
    (asserts! (> amount u0) err-amount-zero)
    (as-contract (do-allocate-zest-v2 amount adapter))))

;; Move `amount` from Granite to Zest V2 atomically (Granite -> idle -> Zest V2).
;; If the deallocation from Granite yields a surplus it is harvested before
;; the re-deployment, so Zest V2 receives exactly `amount` (not amount+yield).
;;
;; Returns: (ok amount-deposited-to-zest-v2)
(define-public (rebalance-granite-to-zest-v2 (amount uint)
               (granite <lat>) (zest-v2 <lat>))
  (begin
    (asserts! (is-eq tx-sender (var-get vault-owner)) err-not-allocator)
    (asserts! (is-eq (some (contract-of granite)) (var-get adapter-granite-usdcx))
              err-invalid-adapter)
    (asserts! (is-eq (some (contract-of zest-v2))  (var-get adapter-zest-v2-usdc))
              err-invalid-adapter)
    (asserts! (> amount u0) err-amount-zero)
    (try! (as-contract (do-deallocate-granite amount granite)))
    (as-contract (do-allocate-zest-v2 amount zest-v2))))

;; Move `amount` from Zest V2 to Granite atomically (Zest V2 -> idle -> Granite).
;;
;; Returns: (ok amount-deposited-to-granite)
(define-public (rebalance-zest-v2-to-granite (amount uint)
               (zest-v2 <lat>) (granite <lat>))
  (begin
    (asserts! (is-eq tx-sender (var-get vault-owner)) err-not-allocator)
    (asserts! (is-eq (some (contract-of zest-v2))  (var-get adapter-zest-v2-usdc))
              err-invalid-adapter)
    (asserts! (is-eq (some (contract-of granite)) (var-get adapter-granite-usdcx))
              err-invalid-adapter)
    (asserts! (> amount u0) err-amount-zero)
    (try! (as-contract (do-deallocate-zest-v2 amount zest-v2)))
    (as-contract (do-allocate-granite amount granite))))
