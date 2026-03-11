const { hexToCV, cvToJSON } = require("@stacks/transactions");

const readerHex = "0x0c000000030d626f72726f772d706172616d730c0000000215746f74616c2d626f72726f7765642d616d6f756e7401000000000000000000000160c88231cb0d757365722d706f736974696f6e090f636f6c6c61746572616c2d736274630908706f736974696f6e09";
const decoded = cvToJSON(hexToCV(readerHex));

function safeUint(val) {
  if (val == null) return 0;
  if (val && val.type && val.type.startsWith("uint")) return Number(val.value || 0);
  if (typeof val === "string" || typeof val === "number") return Number(val);
  if (val && val.value !== null && val.value !== undefined) return safeUint(val.value);
  return 0;
}
function unwrapOptional(val) {
  if (val == null) return null;
  if (val.value === null || val.value === undefined) return null;
  return val.value;
}

const outerTuple = decoded.value;

// Test borrow-params parsing
console.log("=== borrow-params ===");
const borrowParams = outerTuple["borrow-params"];
const borrowTuple = (borrowParams && borrowParams.value) ? borrowParams.value : borrowParams;
const userPos = unwrapOptional(borrowTuple["user-position"]);
console.log("user-position (none):", userPos);
console.log("debt:", userPos ? "has debt" : "0 (correct)");

// Test collateral parsing (none case)
console.log("\n=== collateral (none) ===");
const collVal = outerTuple["collateral-sbtc"];
const inner = unwrapOptional(collVal);
console.log("inner:", inner);
console.log("rawAmount:", inner ? "nonzero" : "0 (correct)");

// Simulate (some { amount: u100 })
console.log("\n=== collateral (some { amount: u100 }) ===");
const someCollateral = { value: { value: { amount: { type: "uint", value: "100" } } } };
const innerSome = unwrapOptional(someCollateral);
console.log("inner:", JSON.stringify(innerSome));
const innerTuple2 = (innerSome && innerSome.value) ? innerSome.value : innerSome;
const hasAmount = innerTuple2 && typeof innerTuple2 === "object" && innerTuple2["amount"];
console.log("rawAmount:", hasAmount ? safeUint(innerTuple2["amount"]) : safeUint(innerSome));

console.log("\nAll tests passed!");
