import { describe, it, expect } from "vitest";
import { Cl, ClarityType, cvToJSON } from "@stacks/transactions";
import {
  ZestV1Lending,
  ZEST_V1_DEPLOYER,
} from "../../packages/calldata-sdk-stacks/src";
import type {
  StacksContractCall,
  AssetOracleLp,
} from "../../packages/calldata-sdk-stacks/src";

const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;

const D = ZEST_V1_DEPLOYER;
const POOL_RESERVE_DATA = `${D}.pool-reserve-data`;
const POOL_RESERVE = `${D}.pool-0-reserve-v2-0`;
const WSTX = `${D}.wstx`;
const ZWSTX = `${D}.zwstx-v2-0`;
const ORACLE = `${D}.stx-btc-oracle-v1-4`;
const FEE_CALC = `${D}.fees-calculator`;

const BORROW_AMOUNT = 10_000_000; // 10 STX
const VARIABLE_RATE = 1;

const wstxPosition: AssetOracleLp = {
  asset: WSTX,
  lpToken: ZWSTX,
  oracle: ORACLE,
};

/** Execute a StacksContractCall via simnet */
function execCall(call: StacksContractCall, sender: string) {
  return simnet.callPublicFn(
    `${call.contractAddress}.${call.contractName}`,
    call.functionName,
    call.functionArgs,
    sender
  );
}

describe("zest-v1 borrow fork test (via SDK)", () => {
  it("reads wSTX reserve state (confirms borrowing enabled)", () => {
    const result = simnet.callReadOnlyFn(
      POOL_RESERVE_DATA,
      "get-reserve-state-read",
      [Cl.contractPrincipal(D, "wstx")],
      deployer
    );

    expect(result.result.type).toBe(ClarityType.OptionalSome);

    const json = cvToJSON(result.result);
    expect(json.value.value["borrowing-enabled"].value).toBe(true);
  });

  it("reads borrow APY for wSTX from mainnet", () => {
    const result = simnet.callReadOnlyFn(
      `${D}.pool-read-v2-1-4`,
      "get-asset-borrow-apy",
      [Cl.contractPrincipal(D, "wstx")],
      deployer
    );

    expect(result.result.type).toBe(ClarityType.UInt);
    const apy = Number(BigInt((result.result as any).value)) / 1e8;
    expect(apy).toBeGreaterThan(0);
    expect(apy).toBeLessThan(10);
  });

  it("reads available liquidity for wSTX", () => {
    const result = simnet.callReadOnlyFn(
      POOL_RESERVE,
      "get-reserve-available-liquidity",
      [Cl.contractPrincipal(D, "wstx")],
      deployer
    );

    expect(result.result.type).toBe(ClarityType.ResponseOk);
    const liquidity = BigInt((result.result as any).value.value);
    expect(liquidity).toBeGreaterThan(0n);
  });

  it("calls borrow via SDK encoder", { timeout: 30_000 }, () => {
    const call = ZestV1Lending.encodeBorrow(
      POOL_RESERVE,
      ORACLE,
      WSTX,
      ZWSTX,
      [wstxPosition],
      BORROW_AMOUNT,
      FEE_CALC,
      VARIABLE_RATE,
      deployer
    );

    // Verify the SDK produced the right target
    expect(call.contractAddress).toBe(D);
    expect(call.contractName).toBe("pool-borrow-v2-0");
    expect(call.functionName).toBe("borrow");
    expect(call.functionArgs).toHaveLength(9);

    const result = execCall(call, deployer);

    expect(
      result.result.type === ClarityType.ResponseOk ||
        result.result.type === ClarityType.ResponseErr
    ).toBe(true);

    // On mainnet fork, expect err u30000 (caller not approved)
    if (result.result.type === ClarityType.ResponseErr) {
      const errValue = (result.result as any).value;
      expect(errValue.type).toBe(ClarityType.UInt);
      expect(BigInt(errValue.value)).toBe(30000n);
    }
  });

  it("reads user borrow position (should be empty)", () => {
    const result = simnet.callReadOnlyFn(
      POOL_RESERVE,
      "get-user-assets",
      [Cl.standardPrincipal(deployer)],
      deployer
    );

    expect(result.result.type).toBe(ClarityType.Tuple);
    const tuple = (result.result as any).value;
    const borrowed = tuple["assets-borrowed"];
    expect(borrowed.type).toBe(ClarityType.List);
    expect(borrowed.value.length).toBe(0);
  });
});
