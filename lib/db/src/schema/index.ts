import { boolean, index, integer, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

export const usersTable = pgTable("amd_users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sessionsTable = pgTable("amd_sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  userIdIdx: index("amd_sessions_user_id_idx").on(table.userId),
}));

export const servicesTable = pgTable("amd_services", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  platform: text("platform").notNull(),
  contentType: text("content_type").notNull(),
  description: text("description").notNull(),
  minQuantity: integer("min_quantity").notNull(),
  maxQuantity: integer("max_quantity").notNull(),
  supportsRefill: boolean("supports_refill").notNull().default(false),
  estimatedTime: text("estimated_time").notNull(),
  providerServiceId: text("provider_service_id"),
  pricePerThousandMicros: integer("price_per_thousand_micros"),
});

export const ordersTable = pgTable("amd_orders", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => usersTable.id),
  serviceId: text("service_id").notNull().references(() => servicesTable.id),
  link: text("link").notNull(),
  quantity: integer("quantity").notNull(),
  status: text("status").notNull().default("En proceso"),
  progress: integer("progress").notNull().default(0),
  startCount: integer("start_count"),
  remains: integer("remains"),
  providerOrderId: text("provider_order_id"),
  requestId: text("request_id"),
  creditPeriodId: text("credit_period_id"),
  costMicros: integer("cost_micros"),
  refillAvailable: boolean("refill_available").notNull().default(false),
  firstSyncedAt: timestamp("first_synced_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  userCreatedIdx: index("amd_orders_user_created_idx").on(table.userId, table.createdAt),
  providerOrderIdx: index("amd_orders_provider_order_idx").on(table.providerOrderId),
  userRequestIdx: uniqueIndex("amd_orders_user_request_idx").on(table.userId, table.requestId),
}));

export const creditPeriodsTable = pgTable("amd_credit_periods", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  periodKey: text("period_key").notNull(),
  allowanceMicros: integer("allowance_micros").notNull(),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  resetsAt: timestamp("resets_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  userPeriodIdx: uniqueIndex("amd_credit_periods_user_period_idx").on(table.userId, table.periodKey),
}));

export const creditLedgerTable = pgTable("amd_credit_ledger", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  periodId: text("period_id").notNull().references(() => creditPeriodsTable.id, { onDelete: "cascade" }),
  orderId: text("order_id").references(() => ordersTable.id, { onDelete: "set null" }),
  kind: text("kind").notNull(),
  amountMicros: integer("amount_micros").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  periodCreatedIdx: index("amd_credit_ledger_period_created_idx").on(table.periodId, table.createdAt),
  orderIdx: index("amd_credit_ledger_order_idx").on(table.orderId),
}));

export const orderStatusEventsTable = pgTable("amd_order_status_events", {
  id: text("id").primaryKey(),
  orderId: text("order_id").notNull().references(() => ordersTable.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  status: text("status").notNull(),
  recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  orderRecordedIdx: index("amd_order_status_events_order_recorded_idx").on(table.orderId, table.recordedAt),
}));

export type User = typeof usersTable.$inferSelect;
export type Session = typeof sessionsTable.$inferSelect;
export type Service = typeof servicesTable.$inferSelect;
export type Order = typeof ordersTable.$inferSelect;