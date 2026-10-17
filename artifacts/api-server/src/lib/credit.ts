import { and, eq, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { creditLedgerTable, creditPeriodsTable } from "@workspace/db";

export const MONTHLY_CREDIT_MICROS = 50_000_000;
const MEXICO_TIMEZONE = "America/Mexico_City";
const INITIAL_CYCLE_DATE = "2026-08-22";
const CYCLE_ANCHOR_DAY = 22;

const mexicoDateParts = (date: Date) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: MEXICO_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  return Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value])) as Record<string, string>;
};

const mexicoMidnight = (date: string) => new Date(`${date}T00:00:00-06:00`);

const daysInMonth = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate();

const shiftMonth = (year: number, month: number, amount: number) => {
  const shifted = new Date(Date.UTC(year, month - 1 + amount, 1));
  return { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth() + 1 };
};

const cycleDate = (year: number, month: number) => {
  const day = Math.min(CYCLE_ANCHOR_DAY, daysInMonth(year, month));
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
};

export const getCreditWindow = (now = new Date()) => {
  const { year: rawYear, month: rawMonth, day: rawDay } = mexicoDateParts(now);
  const year = Number(rawYear);
  const month = Number(rawMonth);
  const day = Number(rawDay);
  const initialStart = mexicoMidnight(INITIAL_CYCLE_DATE);
  if (now < initialStart) {
    return {
      periodKey: INITIAL_CYCLE_DATE,
      startsAt: initialStart,
      resetsAt: mexicoMidnight(cycleDate(2026, 9)),
      isActive: false,
    };
  }
  const startsMonth = day >= CYCLE_ANCHOR_DAY ? { year, month } : shiftMonth(year, month, -1);
  const nextMonth = shiftMonth(startsMonth.year, startsMonth.month, 1);
  const startsOn = cycleDate(startsMonth.year, startsMonth.month);
  const periodKey = startsOn;
  const resetsAt = mexicoMidnight(cycleDate(nextMonth.year, nextMonth.month));
  const startsAt = mexicoMidnight(startsOn);
  return { periodKey, startsAt, resetsAt, isActive: now >= startsAt };
};

export const microsToUsd = (micros: number | null | undefined) => micros == null ? null : Number((micros / 1_000_000).toFixed(6));

export const CURRENT_SERVICE_PRICE_FACTOR_BPS = 10_605;
export const LEGACY_SERVICE_PRICE_FACTOR_BPS = 10_100;

export const applyServiceMarkupMicros = (
  providerCostMicros: number | null,
  factorBasisPoints = CURRENT_SERVICE_PRICE_FACTOR_BPS,
) => providerCostMicros == null ? null : Math.ceil((providerCostMicros * factorBasisPoints) / 10_000);

export const decimalToMicros = (value: unknown): number | undefined => {
  if (value == null || value === "") return undefined;
  const normalized = String(value).trim();
  if (!/^\d+(\.\d+)?$/.test(normalized)) return undefined;
  const [whole, fraction = ""] = normalized.split(".");
  const micros = Number(whole) * 1_000_000 + Number((fraction.slice(0, 6)).padEnd(6, "0"));
  return Number.isSafeInteger(micros) && micros >= 0 ? micros : undefined;
};

export const estimateCostMicros = (pricePerThousandMicros: number | null, quantity: number) => {
  if (pricePerThousandMicros == null || !Number.isFinite(pricePerThousandMicros)) return undefined;
  return Math.ceil((pricePerThousandMicros * quantity) / 1_000);
};

export class InsufficientCreditError extends Error {}
export class UnpricedServiceError extends Error {}
export class CreditNotStartedError extends Error {}

export const getOrCreateCreditPeriod = async (tx: any, userId: string) => {
  const window = getCreditWindow();
  if (!window.isActive) throw new CreditNotStartedError();
  await tx.insert(creditPeriodsTable).values({
    id: randomUUID(),
    userId,
    periodKey: window.periodKey,
    allowanceMicros: MONTHLY_CREDIT_MICROS,
    startsAt: window.startsAt,
    resetsAt: window.resetsAt,
  }).onConflictDoNothing();
  const [period] = await tx.select().from(creditPeriodsTable)
    .where(and(eq(creditPeriodsTable.userId, userId), eq(creditPeriodsTable.periodKey, window.periodKey)))
    .for("update");
  return period;
};

export const getCreditBalance = async (tx: any, period: { id: string; allowanceMicros: number }) => {
  const [result] = await tx.select({
    spentMicros: sql<number>`coalesce(sum(${creditLedgerTable.amountMicros}), 0)`,
  }).from(creditLedgerTable).where(eq(creditLedgerTable.periodId, period.id));
  const spentMicros = Number(result?.spentMicros ?? 0);
  return { spentMicros, availableMicros: period.allowanceMicros - spentMicros };
};