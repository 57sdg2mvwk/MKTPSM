import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeProviderStatus, settleOrderCredit } from "./order-status";

test("normalizes provider terminal statuses including partial", () => {
  assert.equal(normalizeProviderStatus("Completed", "En proceso"), "Completado");
  assert.equal(normalizeProviderStatus("Canceled", "En proceso"), "Cancelado");
  assert.equal(normalizeProviderStatus("Refunded", "En proceso"), "Reembolso");
  assert.equal(normalizeProviderStatus("Partially Completed", "En proceso"), "Parcial");
});

test("adjusts reserved credit to the provider charge for partial orders", () => {
  assert.deepEqual(
    settleOrderCredit({ status: "Parcial", currentCostMicros: 1_000_000, providerChargeMicros: 640_000, finalRefundApplied: false }),
    { nextCostMicros: 640_000, adjustmentMicros: -360_000, refundMicros: 0 },
  );
});

test("releases a canceled order once and never duplicates the refund", () => {
  assert.deepEqual(
    settleOrderCredit({ status: "Cancelado", currentCostMicros: 640_000, finalRefundApplied: false }),
    { nextCostMicros: 0, adjustmentMicros: 0, refundMicros: -640_000 },
  );
  assert.deepEqual(
    settleOrderCredit({ status: "Cancelado", currentCostMicros: 0, finalRefundApplied: true }),
    { nextCostMicros: 0, adjustmentMicros: 0, refundMicros: 0 },
  );
});

test("does not invent a partial refund when the provider charge is unavailable", () => {
  assert.deepEqual(
    settleOrderCredit({ status: "Parcial", currentCostMicros: 1_000_000, finalRefundApplied: false }),
    { nextCostMicros: 1_000_000, adjustmentMicros: 0, refundMicros: 0 },
  );
});