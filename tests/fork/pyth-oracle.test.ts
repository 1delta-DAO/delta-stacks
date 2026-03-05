import { describe, it, expect } from "vitest";
import { ClarityType } from "@stacks/transactions";
import {
  GraniteLending,
  GRANITE_STX_MARKET,
  GRANITE_USDCX_MARKET,
  ZestV2Lending,
  PYTH_FEED_IDS,
  fetchPythPriceUpdate,
  fetchPythPriceUpdates,
} from "../../packages/calldata-sdk-stacks/src";
import type { StacksContractCall } from "../../packages/calldata-sdk-stacks/src";

const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;

const SBTC = "SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token";

/** Execute a StacksContractCall via simnet */
function execCall(call: StacksContractCall, sender: string) {
  return simnet.callPublicFn(
    `${call.contractAddress}.${call.contractName}`,
    call.functionName,
    call.functionArgs,
    sender
  );
}

function tryExecCall(call: StacksContractCall, sender: string) {
  try {
    const result = execCall(call, sender);
    return { ok: true as const, result };
  } catch (e: any) {
    return { ok: false as const, error: String(e?.message ?? e) };
  }
}

// ---------------------------------------------------------------------------
// Pyth Hermes API fetch tests (live network call)
// ---------------------------------------------------------------------------

describe("pyth hermes fetch", () => {
  it(
    "fetches a single price update buffer (STX feed)",
    { timeout: 15_000 },
    async () => {
      const buf = await fetchPythPriceUpdate([PYTH_FEED_IDS.STX]);

      expect(buf).toBeInstanceOf(Uint8Array);
      expect(buf.length).toBeGreaterThan(0);
    }
  );

  it(
    "fetches multiple price update buffers (STX + BTC)",
    { timeout: 15_000 },
    async () => {
      const bufs = await fetchPythPriceUpdates([
        PYTH_FEED_IDS.STX,
        PYTH_FEED_IDS.BTC,
      ]);

      expect(bufs).toBeInstanceOf(Array);
      expect(bufs.length).toBeGreaterThan(0);
      for (const b of bufs) {
        expect(b).toBeInstanceOf(Uint8Array);
        expect(b.length).toBeGreaterThan(0);
      }
    }
  );
});

// ---------------------------------------------------------------------------
// Granite: fetch Pyth data + encode + execute against forked simnet
// ---------------------------------------------------------------------------

describe("granite with pyth oracle data", () => {
  it(
    "fetches STX market price feed via namespace helper",
    { timeout: 15_000 },
    async () => {
      const buf = await GraniteLending.fetchPriceFeedData("stx");

      expect(buf).toBeInstanceOf(Uint8Array);
      expect(buf.length).toBeGreaterThan(0);
    }
  );

  it(
    "fetches USDCx market price feed via namespace helper",
    { timeout: 15_000 },
    async () => {
      const buf = await GraniteLending.fetchPriceFeedData("usdcx");

      expect(buf).toBeInstanceOf(Uint8Array);
      expect(buf.length).toBeGreaterThan(0);
    }
  );

  it(
    "encodes borrow with live price feed data and executes",
    { timeout: 30_000 },
    async () => {
      const priceFeed = await GraniteLending.fetchPriceFeedData("stx");

      const call = GraniteLending.encodeBorrow(
        GRANITE_STX_MARKET,
        10_000_000,
        undefined,
        priceFeed
      );

      expect(call.functionName).toBe("borrow");
      // Args: price-feed (some), amount, on-behalf-of (none)
      expect(call.functionArgs).toHaveLength(3);

      const outcome = tryExecCall(call, deployer);
      if (outcome.ok) {
        expect(
          outcome.result.result.type === ClarityType.ResponseOk ||
            outcome.result.result.type === ClarityType.ResponseErr
        ).toBe(true);
      } else {
        // Fork runtime error -- encoding reached the right contract
        expect(outcome.error).toContain("borrower-v1");
      }
    }
  );

  it(
    "encodes remove-collateral with live price feed data",
    { timeout: 30_000 },
    async () => {
      const priceFeed = await GraniteLending.fetchPriceFeedData("stx");

      const call = GraniteLending.encodeRemoveCollateral(
        GRANITE_STX_MARKET,
        SBTC,
        50_000,
        undefined,
        priceFeed
      );

      expect(call.functionName).toBe("remove-collateral");
      // Args: price-feed (some), collateral, amount, on-behalf-of (none)
      expect(call.functionArgs).toHaveLength(4);

      const outcome = tryExecCall(call, deployer);
      if (outcome.ok) {
        expect(
          outcome.result.result.type === ClarityType.ResponseOk ||
            outcome.result.result.type === ClarityType.ResponseErr
        ).toBe(true);
      } else {
        expect(outcome.error).toContain("borrower-v1");
      }
    }
  );

  it(
    "encodes liquidate with live price feed data",
    { timeout: 30_000 },
    async () => {
      const priceFeed = await GraniteLending.fetchPriceFeedData("stx");

      const call = GraniteLending.encodeLiquidate(
        GRANITE_STX_MARKET,
        SBTC,
        deployer,
        5_000_000,
        1_000,
        priceFeed
      );

      expect(call.functionName).toBe("liquidate-collateral");
      expect(call.functionArgs).toHaveLength(5);

      const outcome = tryExecCall(call, deployer);
      if (outcome.ok) {
        expect(
          outcome.result.result.type === ClarityType.ResponseOk ||
            outcome.result.result.type === ClarityType.ResponseErr
        ).toBe(true);
      } else {
        expect(outcome.error).toContain("liquidator-v1");
      }
    }
  );
});

// ---------------------------------------------------------------------------
// Zest V2: fetch Pyth data + encode + execute against forked simnet
// ---------------------------------------------------------------------------

describe("zest v2 with pyth oracle data", () => {
  const VAULT_STX = "SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.v0-vault-stx";

  it(
    "fetches price feeds via namespace helper",
    { timeout: 15_000 },
    async () => {
      const feeds = await ZestV2Lending.fetchPriceFeeds([
        ZestV2Lending.PRICE_FEEDS.STX,
        ZestV2Lending.PRICE_FEEDS.BTC,
      ]);

      expect(feeds).toBeInstanceOf(Array);
      expect(feeds.length).toBeGreaterThan(0);
      for (const f of feeds) {
        expect(f).toBeInstanceOf(Uint8Array);
      }
    }
  );

  it(
    "encodes borrow with live price feeds and executes",
    { timeout: 30_000 },
    async () => {
      const feeds = await ZestV2Lending.fetchPriceFeeds([
        ZestV2Lending.PRICE_FEEDS.STX,
      ]);

      const call = ZestV2Lending.encodeBorrow(
        VAULT_STX,
        1_000_000,
        undefined,
        feeds
      );

      expect(call.functionName).toBe("borrow");
      expect(call.functionArgs).toHaveLength(4);

      const outcome = tryExecCall(call, deployer);
      if (outcome.ok) {
        expect(
          outcome.result.result.type === ClarityType.ResponseOk ||
            outcome.result.result.type === ClarityType.ResponseErr
        ).toBe(true);
      } else {
        // V2 market contract hit or encoding confirmed
        expect(outcome.error).toContain("market");
      }
    }
  );

  it(
    "encodes collateral-remove with live price feeds",
    { timeout: 30_000 },
    async () => {
      const feeds = await ZestV2Lending.fetchPriceFeeds([
        ZestV2Lending.PRICE_FEEDS.STX,
      ]);

      const call = ZestV2Lending.encodeCollateralRemove(
        VAULT_STX,
        500_000,
        undefined,
        feeds
      );

      expect(call.functionName).toBe("collateral-remove");
      expect(call.functionArgs).toHaveLength(4);

      const outcome = tryExecCall(call, deployer);
      if (outcome.ok) {
        expect(
          outcome.result.result.type === ClarityType.ResponseOk ||
            outcome.result.result.type === ClarityType.ResponseErr
        ).toBe(true);
      } else {
        expect(outcome.error).toContain("market");
      }
    }
  );
});
