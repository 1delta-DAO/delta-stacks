import { describe, it, expect } from "vitest";
import { Cl, ClarityType, cvToJSON } from "@stacks/transactions";

const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;

const GRANITE_STX = "SP35E2BBMDT2Y1HB0NTK139YBGYV3PAPK3WA8BRNA";
const GRANITE_USDCX = "SP3M2BYF7RGF8WKW5FVDNJ6WR8D7AR9BHDXAKPXZE";

describe("granite mainnet fork", () => {
  it("reads STX market LP params", () => {
    const result = simnet.callReadOnlyFn(
      `${GRANITE_STX}.state-v1`,
      "get-lp-params",
      [],
      deployer
    );
    expect(result.result.type).toBe(ClarityType.Tuple);
    const json = cvToJSON(result.result);
    expect(BigInt(json.value["total-assets"].value)).toBeGreaterThan(0n);
    expect(BigInt(json.value["total-shares"].value)).toBeGreaterThan(0n);
  });

  it("reads STX market debt params", () => {
    const result = simnet.callReadOnlyFn(
      `${GRANITE_STX}.state-v1`,
      "get-debt-params",
      [],
      deployer
    );
    expect(result.result.type).toBe(ClarityType.Tuple);
    const json = cvToJSON(result.result);
    expect(BigInt(json.value["open-interest"].value)).toBeGreaterThan(0n);
  });

  it("reads STX market IR params", () => {
    const result = simnet.callReadOnlyFn(
      `${GRANITE_STX}.linear-kinked-ir-v1`,
      "get-ir-params",
      [],
      deployer
    );
    expect(result.result.type).toBe(ClarityType.Tuple);
    const json = cvToJSON(result.result);
    expect(BigInt(json.value["base-ir"].value)).toBeGreaterThan(0n);
    expect(BigInt(json.value["utilization-kink"].value)).toBeGreaterThan(0n);
  });

  it("reads USDCx market LP params", () => {
    const result = simnet.callReadOnlyFn(
      `${GRANITE_USDCX}.state-v1`,
      "get-lp-params",
      [],
      deployer
    );
    expect(result.result.type).toBe(ClarityType.Tuple);
    const json = cvToJSON(result.result);
    expect(BigInt(json.value["total-assets"].value)).toBeGreaterThan(0n);
  });

  it("reads STX market borrow-enabled flag", () => {
    const result = simnet.callReadOnlyFn(
      `${GRANITE_STX}.state-v1`,
      "is-borrow-enabled",
      [],
      deployer
    );
    expect(result.result.type).toBe(ClarityType.BoolTrue);
  });

  it("reads USDCx market deposit-enabled flag", () => {
    const result = simnet.callReadOnlyFn(
      `${GRANITE_USDCX}.state-v1`,
      "is-deposit-asset-enabled",
      [],
      deployer
    );
    expect(result.result.type).toBe(ClarityType.BoolTrue);
  });

  it("reads granite data via aggregator contract", { timeout: 30_000 }, () => {
    const result = simnet.callReadOnlyFn(
      `${deployer}.zest-reader`,
      "get-granite-reserve-data",
      [],
      deployer
    );
    expect(result.result.type).toBe(ClarityType.ResponseOk);

    const json = cvToJSON(result.result);
    const data = json.value.value;

    // STX market
    expect(data.stx).toBeDefined();
    const stxLp = data.stx.value["lp-params"].value;
    expect(BigInt(stxLp["total-assets"].value)).toBeGreaterThan(0n);

    // USDCx market
    expect(data.usdcx).toBeDefined();
    const usdcxLp = data.usdcx.value["lp-params"].value;
    expect(BigInt(usdcxLp["total-assets"].value)).toBeGreaterThan(0n);
  });
});
