(define-constant err-owner-only (err u100))
(define-constant err-asset-not-set (err u101))
(define-constant err-amount-zero (err u102))
(define-constant err-shares-zero (err u103))
(define-constant err-insufficient-balance (err u104))
(define-constant err-insufficient-shares (err u105))
(define-constant err-transfer-failed (err u106))
(define-constant err-already-set (err u107))
(define-constant err-deposit-owner-only (err u108))

;; Virtual shares
(define-constant virtual-shares u100000000)


(define-data-var total-supply uint u0)
(define-data-var total-assets-bookkeeping uint u0)
(define-map balances principal uint)

(define-read-only (get-asset)
  (some .mock-token))

(define-read-only (get-total-supply)
  (var-get total-supply))

(define-read-only (get-total-assets)
  (var-get total-assets-bookkeeping))

(define-read-only (get-balance (owner principal))
  (default-to u0 (map-get? balances owner)))

(define-read-only (convert-to-shares (amount uint))
  (let ((supply (var-get total-supply))
        (total (var-get total-assets-bookkeeping)))
    (if (is-eq total u0)
      amount
      (/ (* amount (+ supply virtual-shares)) (+ total u1)))))

(define-read-only (convert-to-assets (shares uint))
  (let ((supply (var-get total-supply))
        (total (var-get total-assets-bookkeeping)))
    (if (is-eq supply u0)
      u0
      (/ (* shares total) (+ supply virtual-shares)))))


(define-public (deposit (amount uint) (owner principal))
  (begin
    (asserts! (is-eq tx-sender owner) err-deposit-owner-only)
    (asserts! (> amount u0) err-amount-zero)
    ;; Pull tokens from user (tx-sender) to vault. Token authorizes because tx-sender == sender.
    (try! (contract-call? .mock-token transfer amount tx-sender (as-contract tx-sender) none))
    (let ((supply (var-get total-supply))
          (actual (unwrap! (contract-call? .mock-token get-balance (as-contract tx-sender)) err-transfer-failed)))
      (asserts! (>= actual amount) err-insufficient-balance)
      (let ((shares (/ (* amount (+ supply virtual-shares)) (+ actual u1))))
        (asserts! (> shares u0) err-shares-zero)
        (var-set total-supply (+ supply shares))
        (var-set total-assets-bookkeeping actual)
        (map-set balances owner (+ (get-balance owner) shares))
        (ok shares)))))


(define-public (withdraw (amount uint) (receiver principal) (owner principal))
  (begin
    (asserts! (is-eq tx-sender owner) err-owner-only)
    (let ((supply (var-get total-supply))
        (total (var-get total-assets-bookkeeping))
        (bal (get-balance owner)))
    (asserts! (> amount u0) err-amount-zero)
    (asserts! (> total u0) err-insufficient-balance)
    ;; shares to burn = ceil(amount * (supply + virtual) / total)
    (let ((shares (/ (* amount (+ supply virtual-shares)) total)))
      (let ((shares-to-burn (if (< (* shares total) (* amount (+ supply virtual-shares)))
                            (+ shares u1)
                            shares)))
        (asserts! (>= bal shares-to-burn) err-insufficient-shares)
        (var-set total-supply (- supply shares-to-burn))
        (var-set total-assets-bookkeeping (- total amount))
        (map-set balances owner (- bal shares-to-burn))
        (match (contract-call? .mock-token transfer amount (as-contract tx-sender) receiver none)
          success (ok shares-to-burn)
          e (err e))))))) 

(define-public (redeem (shares uint) (receiver principal) (owner principal))
  (begin
    (asserts! (is-eq tx-sender owner) err-owner-only)
    (let ((supply (var-get total-supply))
        (total (var-get total-assets-bookkeeping))
        (bal (get-balance owner)))
    (asserts! (> shares u0) err-shares-zero)
    (asserts! (>= bal shares) err-insufficient-shares)
    (asserts! (> supply u0) err-insufficient-balance)
    (let ((amt (/ (* shares total) (+ supply virtual-shares))))
      (asserts! (>= total amt) err-insufficient-balance)
      (var-set total-supply (- supply shares))
      (var-set total-assets-bookkeeping (- total amt))
      (map-set balances owner (- bal shares))
      (match (contract-call? .mock-token transfer amt (as-contract tx-sender) receiver none)
        success (ok amt)
        e (err e))))))
