import { describe, it, expect } from "vitest";
import { Cl, ClarityType } from "@stacks/transactions";

const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;

describe("zest-reader mainnet fork", () => {
  it("reads V1 wstx reserve-state from mainnet", () => {
    const result = simnet.callReadOnlyFn(
      "SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.pool-reserve-data",
      "get-reserve-state-read",
      [Cl.contractPrincipal("SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N", "wstx")],
      deployer
    );
    expect(result.result.type).toBe(ClarityType.OptionalSome);
  });

  it("reads V1 sbtc reserve-state from mainnet", () => {
    const result = simnet.callReadOnlyFn(
      "SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.pool-reserve-data",
      "get-reserve-state-read",
      [Cl.contractPrincipal("SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4", "sbtc-token")],
      deployer
    );

    expect(result.result.type).toBe(ClarityType.OptionalSome);
  });

  it("reads V1 asset list from mainnet", () => {
    const result = simnet.callReadOnlyFn(
      "SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3R3ZW1QF4N.pool-reserve-data",
      "get-assets-read",
      [],
      deployer
    );
    expect(result.result.type).toBe(ClarityType.List);
  });

  it("reads V2 vault-stx available-assets from mainnet", () => {
    const result = simnet.callReadOnlyFn(
      "SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.v0-vault-stx",
      "get-available-assets",
      [],
      deployer
    );
    expect(result.result.type).toBe(ClarityType.UInt);
  });

  it("reads V2 vault-stx interest-rate from mainnet", () => {
    const result = simnet.callReadOnlyFn(
      "SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.v0-vault-stx",
      "get-interest-rate",
      [],
      deployer
    );
    expect(result.result.type).toBe(ClarityType.ResponseOk);
  });

  it("reads V2 asset bitmap from mainnet", () => {
    const result = simnet.callReadOnlyFn(
      "SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.v0-assets",
      "get-bitmap",
      [],
      deployer
    );
    expect(result.result.type).toBe(ClarityType.UInt);
  });
});
