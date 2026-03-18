;; zest-v1-manager.clar
;;
;; Standalone manager for Zest V1 wSTX operations.  All borrow-helper calls
;; happen here at minimal stack depth (~3-4 frames at borrow-helper entry),
;; avoiding the MaxStackDepthReached error that occurs when calling
;; borrow-helper.withdraw from inside the vault's deeper call chain.
;;
;; The vault never calls borrow-helper directly.  Instead:
;;   - Allocator calls this manager to deploy/recall V1 capital
;;   - Manager calls thin adapter's pull/forward for withdrawals
;;   - Manager calls standard adapter's deposit for supplies
;;   - Vault exposes bookkeeping-only functions to sync after manager ops
;;
;; Access: restricted to the vault's registered allocator (read from vault).

;; ---------------------------------------------------------------------------
;; Constants
;; ---------------------------------------------------------------------------

(define-constant VAULT 'SP2DRPT3AA170EK5DC4T22CMSXZ6HACATPXHPAT7H.vault-stx-v5-2)
(define-constant THIN_ADAPTER 'SP2DRPT3AA170EK5DC4T22CMSXZ6HACATPXHPAT7H.adapter-zest-v1-wstx-thin)

(define-constant err-not-allocator (err u200))
(define-constant err-amount-zero   (err u201))

;; ---------------------------------------------------------------------------
;; Access control -- read allocator from vault
;; ---------------------------------------------------------------------------

(define-read-only (get-allocator)
  (contract-call? 'SP2DRPT3AA170EK5DC4T22CMSXZ6HACATPXHPAT7H.vault-stx-v5-2
    get-vault-allocator))

(define-read-only (get-owner)
  (contract-call? 'SP2DRPT3AA170EK5DC4T22CMSXZ6HACATPXHPAT7H.vault-stx-v5-2
    get-vault-owner))

(define-private (is-authorized)
  (or (is-eq tx-sender (get-allocator))
      (is-eq tx-sender (get-owner))))

;; ---------------------------------------------------------------------------
;; Recall: withdraw from Zest V1 -> vault idle
;; ---------------------------------------------------------------------------
;; Step 1: pull (borrow-helper.withdraw via thin adapter -- minimal depth)
;; Step 2: forward (wSTX transfer from adapter to vault)
;;
;; After calling this, the allocator must call vault.complete-v1-recall
;; to update the vault's bookkeeping.

(define-public (recall (amount uint))
  (begin
    (asserts! (is-authorized) err-not-allocator)
    (asserts! (> amount u0) err-amount-zero)
    (try! (contract-call? 'SP2DRPT3AA170EK5DC4T22CMSXZ6HACATPXHPAT7H.adapter-zest-v1-wstx-thin
             pull amount))
    (try! (contract-call? 'SP2DRPT3AA170EK5DC4T22CMSXZ6HACATPXHPAT7H.adapter-zest-v1-wstx-thin
             forward amount VAULT))
    (ok amount)))

;; ---------------------------------------------------------------------------
;; Deploy: vault idle -> Zest V1
;; ---------------------------------------------------------------------------
;; Transfers STX from vault to adapter, then deposits into Zest V1.
;; Allocator must call vault.complete-v1-deploy afterwards for bookkeeping.

(define-public (deploy (amount uint))
  (begin
    (asserts! (is-authorized) err-not-allocator)
    (asserts! (> amount u0) err-amount-zero)
    ;; Pull STX from vault to adapter via wSTX transfer
    (try! (contract-call? 'SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.wstx
             transfer amount VAULT
             'SP2DRPT3AA170EK5DC4T22CMSXZ6HACATPXHPAT7H.adapter-zest-v1-wstx-thin none))
    ;; Deposit into Zest V1 via adapter
    (try! (contract-call? 'SP2DRPT3AA170EK5DC4T22CMSXZ6HACATPXHPAT7H.adapter-zest-v1-wstx-thin
             adapter-deposit amount))
    (ok amount)))

;; ---------------------------------------------------------------------------
;; Get position: read Zest V1 balance (for sync)
;; ---------------------------------------------------------------------------

(define-public (get-position)
  (contract-call? 'SP2DRPT3AA170EK5DC4T22CMSXZ6HACATPXHPAT7H.adapter-zest-v1-wstx-thin
    adapter-get-position))
