import assert from "node:assert/strict";
import { test } from "node:test";
import { applyServiceMarkupMicros, decimalToMicros, estimateCostMicros, getCreditWindow, getServicePriceFactorPpm, LEGACY_SERVICE_PRICE_FACTOR_PPM, microsToUsd, PREVIOUS_SERVICE_PRICE_FACTOR_PPM } from "./credit";

test("keeps direct provider pricing at micro-dollar precision", () => {
  assert.equal(decimalToMicros("0.0064"), 6400);
  assert.equal(decimalToMicros(1.5), 1_500_000);
  assert.equal(decimalToMicros("invalid"), undefined);
  assert.equal(microsToUsd(6400), 0.0064);
});

test("estimates a service cost without losing fractions below one cent", () => {
  assert.equal(estimateCostMicros(320_000, 20), 6400);
  assert.equal(estimateCostMicros(null, 20), undefined);
});

test("raises the current user price by 10% and preserves previous order prices", () => {
  const markedUpRateMicros = applyServiceMarkupMicros(196_000);
  assert.equal(markedUpRateMicros, 228_644);
  assert.equal(estimateCostMicros(markedUpRateMicros, 5_000), 1_143_220);
  assert.equal(applyServiceMarkupMicros(196_000, PREVIOUS_SERVICE_PRICE_FACTOR_PPM), 207_858);
  assert.equal(applyServiceMarkupMicros(196_000, LEGACY_SERVICE_PRICE_FACTOR_PPM), 197_960);
  assert.equal(applyServiceMarkupMicros(null), null);
});

test("applies a selected live surcharge to the fixed post-increase price", () => {
  const factorAtFivePercent = getServicePriceFactorPpm(5);
  const factorAtTenPercent = getServicePriceFactorPpm(10);
  assert.equal(factorAtFivePercent, 1_224_878);
  assert.equal(factorAtTenPercent, 1_283_205);
  assert.equal(applyServiceMarkupMicros(196_000, factorAtFivePercent), 240_077);
  assert.equal(applyServiceMarkupMicros(196_000, factorAtTenPercent), 251_509);
});

test("starts the initial Mexico credit cycle on August 22, 2026", () => {
  const window = getCreditWindow(new Date("2026-08-23T06:00:00.000Z"));
  assert.equal(window.periodKey, "2026-08-22");
  assert.equal(window.startsAt.toISOString(), "2026-08-22T06:00:00.000Z");
  assert.equal(window.resetsAt.toISOString(), "2026-09-22T06:00:00.000Z");
  assert.equal(window.isActive, true);
});

test("does not activate credit before the August 22 launch date", () => {
  const window = getCreditWindow(new Date("2026-08-21T18:00:00.000Z"));
  assert.equal(window.periodKey, "2026-08-22");
  assert.equal(window.startsAt.toISOString(), "2026-08-22T06:00:00.000Z");
  assert.equal(window.resetsAt.toISOString(), "2026-09-22T06:00:00.000Z");
  assert.equal(window.isActive, false);
});

test("resets future credit periods on the monthly launch day in Mexico", () => {
  const window = getCreditWindow(new Date("2026-09-15T18:00:00.000Z"));
  assert.equal(window.periodKey, "2026-08-22");
  assert.equal(window.startsAt.toISOString(), "2026-08-22T06:00:00.000Z");
  assert.equal(window.resetsAt.toISOString(), "2026-09-22T06:00:00.000Z");
  assert.equal(window.isActive, true);
});

test("opens the next credit period at midnight on September 22 in Mexico", () => {
  const window = getCreditWindow(new Date("2026-09-22T06:00:00.000Z"));
  assert.equal(window.periodKey, "2026-09-22");
  assert.equal(window.startsAt.toISOString(), "2026-09-22T06:00:00.000Z");
  assert.equal(window.resetsAt.toISOString(), "2026-10-22T06:00:00.000Z");
  assert.equal(window.isActive, true);
});