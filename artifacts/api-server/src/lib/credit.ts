import { and, eq, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { creditLedgerTable, creditPeriodsTable } from "@workspace/db";

export const MONTHLY_CREDIT_MICROS = 50_000_000;
const MEXICO_TIMEZONE = "America/Mexico_City";
const INITIAL_CYCLE_DATE = "2026-08-22";

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

export const getCreditWindow = (now = new Date()) => {
  const { year, month } = mexicoDateParts(now);
  const periodKey = `${year}-${month}`;
  const startsOn = periodKey === "2026-08" ? INITIAL_CYCLE_DATE : `${periodKey}-01`;
  const resetsAt = periodKey === "2026-08"
    ? mexicoMidnight("2026-09-01")
    : mexicoMidnight(`${Number(month) === 12 ? Number(year) + 1 : year}-${String(Number(month) === 12 ? 1 : Number(month) + 1).padStart(2, "0")}-01`);
  const startsAt = mexicoMidnight(startsOn);
  return { periodKey, startsAt, resetsAt, isActive: now >= startsAt };
};

export const microsToUsd = (micros: number | null | undefined) => micros == null ? null : Number((micros / 1_000_000).toFixed(6));

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