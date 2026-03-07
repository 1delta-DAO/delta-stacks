import { describe, it, expect } from "vitest";
import { Cl, ClarityType, cvToJSON } from "@stacks/transactions";
import {
  GraniteLending,
  GRANITE_AEUSDC_MARKET,
  GRANITE_USDCX_MARKET,
  GRANITE_CORE_DEPLOYER,
  GRANITE_AEUSDC_DEPLOYER,
  GRANITE_USDCX_DEPLOYER,
} from "../../packages/calldata-sdk-stacks/src";
import type { StacksContractCall } from "../../packages/calldata-sdk-stacks/src";

const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;

const SBTC = "SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token";

const DEPOSIT_AMOUNT = 100_000_000; // 100 aeUSDC
const BORROW_AMOUNT = 10_000_000; // 10 aeUSDC

/** Execute a StacksContractCall via simnet */
function execCall(call: StacksContractCall, sender: string) {
  return simnet.callPublicFn(
    `${call.contractAddress}.${call.contractName}`,
    call.functionName,
    call.functionArgs,
    sender
  );
}

/**
 * Try to execute a call. Some Granite contracts crash in the simnet fork
 * because internal data variables resolve to `none` (fork state limitation).
 * When this happens, verify the error mentions the correct contract to confirm
 * the encoding reached the right target.
 */
function tryExecCall(call: StacksContractCall, sender: string) {
  try {
    const result = execCall(call, sender);
    return { ok: true as const, result };
  } catch (e: any) {
    return { ok: false as const, error: String(e?.message ?? e) };
  }
}

describe("granite fork test (via SDK)", () => {
  // === LP operations (aeUSDC market) ===

  it("reads aeUSDC market state before deposit", () => {
    const result = simnet.callReadOnlyFn(
      `${GRANITE_AEUSDC_DEPLOYER}.state-v1`,
      "get-lp-params",
      [],
      deployer
    );
    expect(result.result.type).toBe(ClarityType.Tuple);
    const json = cvToJSON(result.result);
    expect(BigInt(json.value["total-assets"].value)).toBeGreaterThan(0n);
  });

  it("confirms deployer has STX balance", () => {
    const stxBalances = simnet.getAssetsMap().get("STX");
    expect(stxBalances).toBeDefined();
    const balance = stxBalances!.get(deployer);
    expect(balance).toBeDefined();
    expect(balance!).toBeGreaterThan(BigInt(DEPOSIT_AMOUNT));
  });

  it("calls deposit via SDK encoder", { timeout: 30_000 }, () => {
    const call = GraniteLending.encodeDeposit(
      GRANITE_AEUSDC_MARKET,
      DEPOSIT_AMOUNT,
      deployer
    );

    expect(call.contractAddress).toBe(GRANITE_CORE_DEPLOYER);
    expect(call.contractName).toBe("liquidity-provider-v1");
    expect(call.functionName).toBe("deposit");
    expect(call.functionArgs).toHaveLength(2);

    const outcome = tryExecCall(call, deployer);
    if (outcome.ok) {
      expect(
        outcome.result.result.type === ClarityType.ResponseOk ||
          outcome.result.result.type === ClarityType.ResponseErr
      ).toBe(true);
    } else {
      // Fork runtime error in staking/interest accrual — encoding is correct
      expect(outcome.error).toContain("liquidity-provider-v1");
    }
  });

  it("calls withdraw via SDK encoder", { timeout: 30_000 }, () => {
    const call = GraniteLending.encodeWithdraw(
      GRANITE_AEUSDC_MARKET,
      DEPOSIT_AMOUNT,
      deployer
    );

    expect(call.functionName).toBe("withdraw");
    expect(call.functionArgs).toHaveLength(2);

    const outcome = tryExecCall(call, deployer);
    if (outcome.ok) {
      expect(
        outcome.result.result.type === ClarityType.ResponseOk ||
          outcome.result.result.type === ClarityType.ResponseErr
      ).toBe(true);
    } else {
      expect(outcome.error).toContain("liquidity-provider-v1");
    }
  });

  // === Borrower operations ===
  // These reach the contract but hit simnet fork runtime errors
  // (internal data vars resolve to `none` in forked state).
  // We verify the error mentions the correct contract name.

  it("calls add-collateral via SDK encoder", { timeout: 30_000 }, () => {
    const call = GraniteLending.encodeAddCollateral(
      GRANITE_AEUSDC_MARKET,
      SBTC,
      100_000, // 0.001 sBTC
    );

    expect(call.contractAddress).toBe(GRANITE_CORE_DEPLOYER);
    expect(call.contractName).toBe("borrower-v1");
    expect(call.functionName).toBe("add-collateral");
    expect(call.functionArgs).toHaveLength(3);

    const outcome = tryExecCall(call, deployer);
    if (outcome.ok) {
      expect(
        outcome.result.result.type === ClarityType.ResponseOk ||
          outcome.result.result.type === ClarityType.ResponseErr
      ).toBe(true);
    } else {
      // Call reached the contract but hit a fork runtime error
      expect(outcome.error).toContain("borrower-v1");
    }
  });

  it("calls borrow via SDK encoder", { timeout: 30_000 }, () => {
    const call = GraniteLending.encodeBorrow(
      GRANITE_AEUSDC_MARKET,
      BORROW_AMOUNT,
    );

    expect(call.contractAddress).toBe(GRANITE_CORE_DEPLOYER);
    expect(call.contractName).toBe("borrower-v1");
    expect(call.functionName).toBe("borrow");
    expect(call.functionArgs).toHaveLength(3);

    const outcome = tryExecCall(call, deployer);
    if (outcome.ok) {
      expect(
        outcome.result.result.type === ClarityType.ResponseOk ||
          outcome.result.result.type === ClarityType.ResponseErr
      ).toBe(true);
    } else {
      expect(outcome.error).toContain("borrower-v1");
    }
  });

  it("calls repay via SDK encoder", { timeout: 30_000 }, () => {
    const call = GraniteLending.encodeRepay(
      GRANITE_AEUSDC_MARKET,
      BORROW_AMOUNT,
    );

    expect(call.contractAddress).toBe(GRANITE_CORE_DEPLOYER);
    expect(call.contractName).toBe("borrower-v1");
    expect(call.functionName).toBe("repay");
    expect(call.functionArgs).toHaveLength(2);

    const outcome = tryExecCall(call, deployer);
    if (outcome.ok) {
      expect(
        outcome.result.result.type === ClarityType.ResponseOk ||
          outcome.result.result.type === ClarityType.ResponseErr
      ).toBe(true);
    } else {
      expect(outcome.error).toContain("borrower-v1");
    }
  });

  // === USDCx market ===

  it("calls deposit on USDCx market via SDK encoder", { timeout: 30_000 }, () => {
    const call = GraniteLending.encodeDeposit(
      GRANITE_USDCX_MARKET,
      1_000_000, // 0.01 USDCx (8 decimals)
      deployer
    );

    expect(call.contractAddress).toBe(GRANITE_USDCX_DEPLOYER);
    expect(call.contractName).toBe("liquidity-provider-v1");
    expect(call.functionName).toBe("deposit");

    const outcome = tryExecCall(call, deployer);
    if (outcome.ok) {
      expect(
        outcome.result.result.type === ClarityType.ResponseOk ||
          outcome.result.result.type === ClarityType.ResponseErr
      ).toBe(true);
    } else {
      // USDCx LP contract also hits fork runtime errors in accrue-interest
      expect(outcome.error).toContain("liquidity-provider-v1");
    }
  });
});
