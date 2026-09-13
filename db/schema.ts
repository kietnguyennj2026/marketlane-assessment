import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

// Every visitor gets an isolated sandbox, with no personal data or signup.
export const sessions = sqliteTable("demo_sessions", {
  id: text("id").primaryKey(),
  createdAt: text("created_at").notNull(),
});
export const inventory = sqliteTable(
  "inventory",
  {
    sessionId: text("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    productId: text("product_id").notNull(),
    stock: integer("stock").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.sessionId, table.productId] }),
    check("stock_nonnegative", sql`${table.stock} >= 0`),
  ],
);
export const orders = sqliteTable(
  "orders",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    requestKey: text("request_key").notNull(),
    fingerprint: text("fingerprint").notNull(),
    status: text("status").notNull(),
    provider: text("provider").notNull(),
    paymentId: text("payment_id"),
    checkoutUrl: text("checkout_url"),
    total: integer("total").notNull(),
    lines: text("lines").notNull(),
    allocations: text("allocations").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("orders_session_request").on(table.sessionId, table.requestKey),
    index("orders_session_created").on(table.sessionId, table.createdAt),
    check(
      "order_status",
      sql`${table.status} IN ('pending','paid','declined','expired')`,
    ),
  ],
);
