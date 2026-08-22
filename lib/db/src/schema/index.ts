import { boolean, index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

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
  refillAvailable: boolean("refill_available").notNull().default(false),
  lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  userCreatedIdx: index("amd_orders_user_created_idx").on(table.userId, table.createdAt),
  providerOrderIdx: index("amd_orders_provider_order_idx").on(table.providerOrderId),
}));

export type User = typeof usersTable.$inferSelect;
export type Session = typeof sessionsTable.$inferSelect;
export type Service = typeof servicesTable.$inferSelect;
export type Order = typeof ordersTable.$inferSelect;