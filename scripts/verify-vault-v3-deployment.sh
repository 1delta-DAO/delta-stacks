#!/usr/bin/env bash
# =============================================================================
# verify-vault-v3-deployment.sh
# =============================================================================
# Verifies the Delta Vault V3 / USDCx deployment on-chain after all batches
# confirm.
#
# Usage:
#   ./scripts/verify-vault-v3-deployment.sh [mainnet|testnet]
#
# =============================================================================
set -euo pipefail

NETWORK="${1:-mainnet}"
DEPLOYER="SP2DRPT3AA170EK5DC4T22CMSXZ6HACATPXHPAT7H"
VAULT="vault-usdcx-v3"

if [ "$NETWORK" = "testnet" ]; then
  API="https://api.testnet.hiro.so"
else
  API="https://api.hiro.so"
fi

echo "=== Delta Vault V3 / USDCx — Post-Deployment Verification ==="
echo "Network:  $NETWORK"
echo "API:      $API"
echo "Deployer: $DEPLOYER"
echo "Vault:    $VAULT"
echo ""

# Helper: call a read-only function with no arguments.
call_read() {
  local contract_name="$1"
  local fn="$2"
  local body='{"sender":"'"${DEPLOYER}"'","arguments":[]}'
  curl -sf -X POST \
    "${API}/v2/contracts/call-read/${DEPLOYER}/${contract_name}/${fn}" \
    -H 'Content-Type: application/json' \
    -d "${body}" 2>/dev/null || echo "(request failed — contract may not be deployed)"
}

# -------------------------------------------------------------------------
# 1. Check contracts are deployed
# -------------------------------------------------------------------------
echo "--- 1. Contract deployment status ---"

for contract in "lending-adapter-trait" "adapter-granite-usdcx-v3" "adapter-zest-v2-usdc-v3" "$VAULT"; do
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${API}/v2/contracts/interface/${DEPLOYER}/${contract}")
  if [ "$STATUS" = "200" ]; then
    echo "  ✓ ${contract} deployed"
  else
    echo "  ✗ ${contract} NOT FOUND (HTTP $STATUS)"
  fi
done
echo ""

# -------------------------------------------------------------------------
# 2. Vault initialization
# -------------------------------------------------------------------------
echo "--- 2. Vault initialization ---"

echo "  get-base-asset:       $(call_read $VAULT get-base-asset)"
echo "  get-virtual-offset:   $(call_read $VAULT get-virtual-offset)"
echo "  get-name:             $(call_read $VAULT get-name)"
echo "  get-symbol:           $(call_read $VAULT get-symbol)"
echo "  get-decimals:         $(call_read $VAULT get-decimals)"
echo ""

# -------------------------------------------------------------------------
# 3. Vault state
# -------------------------------------------------------------------------
echo "--- 3. Vault state ---"

echo "  get-total-assets:      $(call_read $VAULT get-total-assets)"
echo "  get-total-supply:      $(call_read $VAULT get-total-supply)"
echo "  get-alloc-granite:     $(call_read $VAULT get-alloc-granite)"
echo "  get-alloc-zest-v2:     $(call_read $VAULT get-alloc-zest-v2)"
echo "  get-idle-bookkeeping:  $(call_read $VAULT get-idle-bookkeeping)"
echo ""

# -------------------------------------------------------------------------
# 4. Adapter registration
# -------------------------------------------------------------------------
echo "--- 4. Adapter registration ---"

echo "  adapter-granite-usdcx: $(call_read $VAULT get-adapter-granite-usdcx)"
echo "  adapter-zest-v2-usdc:  $(call_read $VAULT get-adapter-zest-v2-usdc)"
echo ""

# -------------------------------------------------------------------------
# 5. Fee configuration
# -------------------------------------------------------------------------
echo "--- 5. Fee configuration ---"

echo "  get-fee-bps:           $(call_read $VAULT get-fee-bps)"
echo "  get-fee-recipient:     $(call_read $VAULT get-fee-recipient)"
echo "  get-idle-buffer-bps:   $(call_read $VAULT get-idle-buffer-bps)"
echo ""

# -------------------------------------------------------------------------
# 6. Ownership
# -------------------------------------------------------------------------
echo "--- 6. Ownership ---"

echo "  vault-owner:     $(call_read $VAULT get-vault-owner)"
echo "  vault-allocator: $(call_read $VAULT get-vault-allocator)"
echo ""

echo "=== Verification complete ==="
