# Fork Tests

These tests run against a **mainnet fork** at a pinned block height using Clarinet SDK's `remote_data` feature. They validate that our code works against real deployed contracts without spending real tokens.

## How it works

- `Clarinet.toml` enables `[repl.remote_data]` with `initial_height = 6972000` and `api_url = 'https://api.hiro.so'`
- The Clarinet SDK's `simnet` forks mainnet state at that block, so all deployed contracts and their storage are available
- `simnet.callReadOnlyFn()` reads live contract state; `simnet.callPublicFn()` executes write calls against the fork
- Write calls from the simnet deployer hit the `is-approved-contract` check on Zest V1, returning `(err u30000)` — this is expected and confirms the call encoding is correct

## SDK integration

The deposit and borrow tests import encoders from `@delta-stacks/calldata-sdk-stacks` and execute them via a helper:

```typescript
import { ZestV1Lending } from "../../packages/calldata-sdk-stacks/src";

function execCall(call: StacksContractCall, sender: string) {
  return simnet.callPublicFn(
    `${call.contractAddress}.${call.contractName}`,
    call.functionName,
    call.functionArgs,
    sender
  );
}

const call = ZestV1Lending.encodeSupply(lpToken, poolReserve, asset, amount, owner);
const result = execCall(call, deployer);
```

This validates that the SDK produces correct calldata against real mainnet contracts.

## Test files

| File | What it tests |
|------|--------------|
| `zest-reader-mainnet.test.ts` | Read-only calls to V1 and V2 contracts (reserve state, APYs, vault data) |
| `zest-v1-deposit.test.ts` | SDK `encodeSupply` against V1 pool-borrow, z-token balance check |
| `zest-v1-borrow.test.ts` | SDK `encodeBorrow` against V1 pool-borrow, reserve liquidity, borrow APY |

## Running

```bash
npx vitest run tests/fork
```

Tests that call `callPublicFn` use `{ timeout: 30_000 }` due to large execution traces from mainnet contracts.
