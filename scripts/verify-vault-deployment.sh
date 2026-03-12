#!/usr/bin/env bash
# =============================================================================
# verify-vault-deployment.sh
# =============================================================================
# Verifies the Delta Vault V1 deployment on-chain after all batches confirm.
#
# Usage:
#   ./scripts/verify-vault-deployment.sh [mainnet|testnet]
#
# =============================================================================
set -euo pipefail

NETWORK="${1:-mainnet}"
DEPLOYER="SP2DRPT3AA170EK5DC4T22CMSXZ6HACATPXHPAT7H"

if [ "$NETWORK" = "testnet" ]; then
  API="https://api.testnet.hiro.so"
else
  API="https://api.hiro.so"
fi

echo "=== Delta Vault V1 — Post-Deployment Verification ==="
echo "Network:  $NETWORK"
echo "API:      $API"
echo "Deployer: $DEPLOYER"
echo ""

# Helper: call a read-only function with no arguments.
# Args: $1 = contract-name (not fully qualified), $2 = function-name
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

for contract in "lending-adapter-trait" "adapter-granite-usdcx" "adapter-zest-v2-usdc-v2" "vault-usdcx-v2-prod"; do
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${API}/v2/contracts/interface/${DEPLOYER}/${contract}")
  if [ "$STATUS" = "200" ]; then
    echo "  ✓ ${contract} deployed"
  else
    echo "  ✗ ${contract} NOT FOUND (HTTP $STATUS)"
  fi
done
echo ""

# -------------------------------------------------------------------------
# 2. Vault initial state
# -------------------------------------------------------------------------
echo "--- 2. Vault initial state ---"

echo "  get-total-assets:      $(call_read vault-usdcx-v2-prod get-total-assets)"
echo "  get-alloc-granite:     $(call_read vault-usdcx-v2-prod get-alloc-granite)"
echo "  get-alloc-zest-v2:     $(call_read vault-usdcx-v2-prod get-alloc-zest-v2)"
echo "  get-idle-bookkeeping:  $(call_read vault-usdcx-v2-prod get-idle-bookkeeping)"
echo ""

# -------------------------------------------------------------------------
# 3. Adapter registration
# -------------------------------------------------------------------------
echo "--- 3. Adapter registration ---"

echo "  adapter-granite-usdcx: $(call_read vault-usdcx-v2-prod get-adapter-granite-usdcx)"
echo "  adapter-zest-v2-usdc:  $(call_read vault-usdcx-v2-prod get-adapter-zest-v2-usdc)"
echo ""

# -------------------------------------------------------------------------
# 4. Ownership
# -------------------------------------------------------------------------
echo "--- 4. Ownership ---"

echo "  vault-owner:     $(call_read vault-usdcx-v2-prod get-vault-owner)"
echo "  vault-allocator: $(call_read vault-usdcx-v2-prod get-vault-allocator)"
echo ""

echo "=== Verification complete ==="
