import assert from "node:assert/strict";
import { test } from "node:test";
import { decimalToMicros, estimateCostMicros, getCreditWindow, microsToUsd } from "./credit";

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

test("starts the initial Mexico credit cycle on August 22, 2026", () => {
  const window = getCreditWindow(new Date("2026-08-23T06:00:00.000Z"));
  assert.equal(window.periodKey, "2026-08");
  assert.equal(window.startsAt.toISOString(), "2026-08-22T06:00:00.000Z");
  assert.equal(window.resetsAt.toISOString(), "2026-09-01T06:00:00.000Z");
  assert.equal(window.isActive, true);
});

test("does not activate credit before the August 22 launch date", () => {
  const window = getCreditWindow(new Date("2026-08-21T18:00:00.000Z"));
  assert.equal(window.periodKey, "2026-08");
  assert.equal(window.startsAt.toISOString(), "2026-08-22T06:00:00.000Z");
  assert.equal(window.isActive, false);
});

test("resets future credit periods on the first day of Mexico month", () => {
  const window = getCreditWindow(new Date("2026-09-15T18:00:00.000Z"));
  assert.equal(window.periodKey, "2026-09");
  assert.equal(window.startsAt.toISOString(), "2026-09-01T06:00:00.000Z");
  assert.equal(window.resetsAt.toISOString(), "2026-10-01T06:00:00.000Z");
  assert.equal(window.isActive, true);
});