import { describe, it, expect } from "vitest";
import { Cl, ClarityType } from "@stacks/transactions";
import {
  ZestV1Lending,
  ZEST_V1_DEPLOYER,
} from "../../packages/calldata-sdk-stacks/src";
import type { StacksContractCall } from "../../packages/calldata-sdk-stacks/src";

const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;

const D = ZEST_V1_DEPLOYER;
const POOL_RESERVE_DATA = `${D}.pool-reserve-data`;
const ZWSTX = `${D}.zwstx-v2-0`;
const WSTX = `${D}.wstx`;
const POOL_RESERVE = `${D}.pool-0-reserve-v2-0`;

const DEPOSIT_AMOUNT = 100_000_000; // 100 STX

/** Execute a StacksContractCall via simnet */
function execCall(call: StacksContractCall, sender: string) {
  return simnet.callPublicFn(
    `${call.contractAddress}.${call.contractName}`,
    call.functionName,
    call.functionArgs,
    sender
  );
}

describe("zest-v1 deposit fork test (via SDK)", () => {
  it("reads wSTX reserve state before deposit", () => {
    const result = simnet.callReadOnlyFn(
      POOL_RESERVE_DATA,
      "get-reserve-state-read",
      [Cl.contractPrincipal(D, "wstx")],
      deployer
    );
    expect(result.result.type).toBe(ClarityType.OptionalSome);
  });

  it("confirms deployer has STX balance", () => {
    const stxBalances = simnet.getAssetsMap().get("STX");
    expect(stxBalances).toBeDefined();
    const balance = stxBalances!.get(deployer);
    expect(balance).toBeDefined();
    expect(balance!).toBeGreaterThan(BigInt(DEPOSIT_AMOUNT));
  });

  it("calls supply via SDK encoder", { timeout: 30_000 }, () => {
    const call = ZestV1Lending.encodeSupply(
      ZWSTX,
      POOL_RESERVE,
      WSTX,
      DEPOSIT_AMOUNT,
      deployer
    );

    // Verify the SDK produced the right target
    expect(call.contractAddress).toBe(D);
    expect(call.contractName).toBe("pool-borrow-v2-0");
    expect(call.functionName).toBe("supply");
    expect(call.functionArgs).toHaveLength(5);

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

  it("z-token balance is zero (supply was unauthorized)", () => {
    const balanceResult = simnet.callReadOnlyFn(
      ZWSTX,
      "get-balance",
      [Cl.standardPrincipal(deployer)],
      deployer
    );

    expect(balanceResult.result.type).toBe(ClarityType.ResponseOk);
    const inner = (balanceResult.result as any).value;
    expect(inner.type).toBe(ClarityType.UInt);
    expect(BigInt(inner.value)).toBe(0n);
  });

  it("reads supply APY for wSTX from mainnet", () => {
    const result = simnet.callReadOnlyFn(
      `${D}.pool-read-supply-v2-1-3`,
      "get-asset-supply-apy",
      [Cl.contractPrincipal(D, "wstx")],
      deployer
    );

    expect(result.result.type).toBe(ClarityType.UInt);
    const apy = Number(BigInt((result.result as any).value)) / 1e8;
    expect(apy).toBeGreaterThan(0);
    expect(apy).toBeLessThan(10);
  });
});
