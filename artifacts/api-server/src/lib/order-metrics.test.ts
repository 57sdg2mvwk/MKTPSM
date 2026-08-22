import assert from "node:assert/strict";
import { test } from "node:test";
import { deriveOrderMetrics, toNonNegativeInteger } from "./order-metrics";

test("does not turn missing provider counters into zero", () => {
  assert.equal(toNonNegativeInteger(null), undefined);
  assert.equal(toNonNegativeInteger(undefined), undefined);
  assert.equal(toNonNegativeInteger(""), undefined);
  assert.equal(toNonNegativeInteger("not-a-number"), undefined);
});

test("preserves a valid zero counter", () => {
  assert.equal(toNonNegativeInteger(0), 0);
  assert.equal(toNonNegativeInteger("0"), 0);
});

test("derives sent and progress from a valid remaining count", () => {
  assert.deepEqual(
    deriveOrderMetrics({ quantity: 100, status: "En proceso", progress: 0, remains: 25 }),
    { delivered: 75, progress: 75 },
  );
});

test("keeps delivery figures unknown when remains is unavailable", () => {
  assert.deepEqual(
    deriveOrderMetrics({ quantity: 100, status: "Completado", progress: 0, remains: null }),
    { delivered: null, progress: 100 },
  );
});

test("a real zero remaining count means all units were sent", () => {
  assert.deepEqual(
    deriveOrderMetrics({ quantity: 100, status: "En proceso", progress: 0, remains: 0 }),
    { delivered: 100, progress: 100 },
  );
});