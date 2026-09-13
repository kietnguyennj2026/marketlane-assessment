import { env } from "cloudflare:workers";
import { products } from "./catalog";
import { createPayment, verifyStripeEvent } from "./payments.mjs";
import { InputError, priceCart, requestFingerprint } from "./commerce.mjs";

type Runtime = {
  DB: D1Database;
  PAYMENT_PROVIDER?: string;
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  APP_URL?: string;
};
type OrderRow = {
  id: string;
  session_id: string;
  request_key: string;
  fingerprint: string;
  status: string;
  provider: string;
  payment_id: string | null;
  checkout_url: string | null;
  total: number;
  lines: string;
  allocations: string;
  created_at: string;
};
class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
const runtime = () => env as unknown as Runtime;
const db = () => runtime().DB;
const config = () => ({
  provider: runtime().PAYMENT_PROVIDER === "stripe" ? "stripe" : "demo",
  secretKey: runtime().STRIPE_SECRET_KEY,
  webhookSecret: runtime().STRIPE_WEBHOOK_SECRET,
  origin: runtime().APP_URL,
});
const json = (body: unknown, status = 200, extra: HeadersInit = {}) =>
  Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...extra,
    },
  });
const publicOrder = (row: OrderRow) => ({
  id: row.id,
  status: row.status,
  provider: row.provider,
  checkoutUrl: row.status === "pending" ? row.checkout_url : null,
  total: row.total,
  lines: JSON.parse(row.lines),
  allocations: JSON.parse(row.allocations),
  createdAt: row.created_at,
});

async function sessionId(request: Request) {
  const token = request.headers
    .get("cookie")
    ?.split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith("marketlane_session="))
    ?.split("=")[1];
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const session = await db()
    .prepare("SELECT id FROM demo_sessions WHERE id = ?")
    .bind(token)
    .first();
  return session ? token : null;
}
function assertSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin)
    throw new HttpError(403, "This request must come from the marketplace.");
}
async function readBody(request: Request) {
  if (!request.headers.get("content-type")?.includes("application/json"))
    throw new HttpError(415, "Send JSON content.");
  const raw = await request.text();
  if (raw.length > 10000)
    throw new HttpError(413, "This request is too large.");
  try {
    return JSON.parse(raw);
  } catch {
    throw new HttpError(400, "Invalid JSON.");
  }
}
async function getOrder(id: string) {
  return db()
    .prepare("SELECT * FROM orders WHERE id = ?")
    .bind(id)
    .first<OrderRow>();
}

async function loadSession(request: Request) {
  let id = await sessionId(request);
  let cookie: HeadersInit = {};
  if (!id) {
    id = Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) =>
      b.toString(16).padStart(2, "0"),
    ).join("");
    await db().batch([
      db()
        .prepare("INSERT INTO demo_sessions (id, created_at) VALUES (?, ?)")
        .bind(id, new Date().toISOString()),
      ...products.map((p) =>
        db()
          .prepare(
            "INSERT INTO inventory (session_id, product_id, stock) VALUES (?, ?, ?)",
          )
          .bind(id, p.id, p.stock),
      ),
    ]);
    cookie = {
      "Set-Cookie": `marketlane_session=${id}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800${new URL(request.url).protocol === "https:" ? "; Secure" : ""}`,
    };
  }
  const [stock, orders] = await Promise.all([
    db()
      .prepare("SELECT product_id, stock FROM inventory WHERE session_id = ?")
      .bind(id)
      .all<{ product_id: string; stock: number }>(),
    db()
      .prepare(
        "SELECT * FROM orders WHERE session_id = ? ORDER BY created_at DESC LIMIT 50",
      )
      .bind(id)
      .all<OrderRow>(),
  ]);
  return json(
    {
      provider: config().provider,
      inventory: Object.fromEntries(
        stock.results.map((p) => [p.product_id, p.stock]),
      ),
      orders: orders.results.map(publicOrder),
    },
    200,
    cookie,
  );
}

async function settleOrder(
  id: string,
  status: "paid" | "declined" | "expired",
) {
  const order = await getOrder(id);
  if (!order || order.status !== "pending") return;
  const statements: D1PreparedStatement[] = [];
  if (status !== "paid") {
    // The status guard and update share one transaction, so stock is restored once.
    for (const line of JSON.parse(order.lines))
      statements.push(
        db()
          .prepare(
            "UPDATE inventory SET stock = stock + ? WHERE session_id = ? AND product_id = ? AND EXISTS (SELECT 1 FROM orders WHERE id = ? AND status = 'pending')",
          )
          .bind(line.quantity, order.session_id, line.productId, id),
      );
  }
  statements.push(
    db()
      .prepare(
        "UPDATE orders SET status = ? WHERE id = ? AND status = 'pending'",
      )
      .bind(status, id),
  );
  await db().batch(statements);
}

async function checkout(request: Request) {
  assertSameOrigin(request);
  const owner = await sessionId(request);
  if (!owner)
    throw new HttpError(401, "Open the marketplace first, then retry.");
  const body = await readBody(request);
  if (!body || typeof body !== "object" || Array.isArray(body))
    throw new HttpError(400, "Send a checkout object.");
  const key = request.headers.get("idempotency-key");
  if (!key || !/^[a-zA-Z0-9_-]{16,80}$/.test(key))
    throw new HttpError(400, "A valid Idempotency-Key is required.");
  if (!["approved", "declined"].includes(body.outcome))
    throw new HttpError(400, "Choose an approved or declined demo payment.");
  const fingerprint = requestFingerprint(body.items, body.outcome);
  let row = await db()
    .prepare("SELECT * FROM orders WHERE session_id = ? AND request_key = ?")
    .bind(owner, key)
    .first<OrderRow>();
  if (row && row.fingerprint !== fingerprint)
    throw new HttpError(
      409,
      "This checkout key belongs to a different bag. Start a new checkout.",
    );
  if (!row) {
    const priced = priceCart(body.items, products);
    const orderCount = await db()
      .prepare("SELECT COUNT(*) AS count FROM orders WHERE session_id = ?")
      .bind(owner)
      .first<{ count: number }>();
    if ((orderCount?.count || 0) >= 50)
      throw new HttpError(429, "This demo has reached its 50-order limit.");
    const inventory = await db()
      .prepare("SELECT product_id, stock FROM inventory WHERE session_id = ?")
      .bind(owner)
      .all<{ product_id: string; stock: number }>();
    for (const line of priced.lines)
      if (
        (inventory.results.find((p) => p.product_id === line.productId)
          ?.stock ?? 0) < line.quantity
      )
        throw new HttpError(
          409,
          `Not enough stock for ${line.name}. Refresh the page to see current stock.`,
        );
    const id = crypto.randomUUID();
    try {
      // D1 batch is atomic. The stock CHECK also catches concurrent checkouts.
      await db().batch([
        db()
          .prepare(
            "INSERT INTO orders (id, session_id, request_key, fingerprint, status, provider, total, lines, allocations, created_at) VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?)",
          )
          .bind(
            id,
            owner,
            key,
            fingerprint,
            config().provider,
            priced.total,
            JSON.stringify(priced.lines),
            JSON.stringify(priced.allocations),
            new Date().toISOString(),
          ),
        ...priced.lines.map((line) =>
          db()
            .prepare(
              "UPDATE inventory SET stock = stock - ? WHERE session_id = ? AND product_id = ?",
            )
            .bind(line.quantity, owner, line.productId),
        ),
      ]);
    } catch (error) {
      // A concurrent retry may have created the same order while we were reading.
      row = await db()
        .prepare(
          "SELECT * FROM orders WHERE session_id = ? AND request_key = ?",
        )
        .bind(owner, key)
        .first<OrderRow>();
      if (!row) {
        if (String(error).includes("stock_nonnegative"))
          throw new HttpError(
            409,
            "Stock changed during checkout. Refresh and try again.",
          );
        throw error;
      }
      if (row.fingerprint !== fingerprint)
        throw new HttpError(
          409,
          "This checkout key belongs to a different bag.",
        );
    }
    row ||= await getOrder(id);
  }
  if (!row) throw new Error("Order was not created.");
  if (
    row.status === "pending" &&
    (!row.payment_id || row.provider === "demo")
  ) {
    // A timeout leaves the reservation pending; the same key recovers the payment.
    const payment = await createPayment(
      { id: row.id, lines: JSON.parse(row.lines), outcome: body.outcome },
      { ...config(), provider: row.provider },
    );
    await db()
      .prepare(
        "UPDATE orders SET payment_id = ?, checkout_url = ? WHERE id = ? AND status = 'pending'",
      )
      .bind(payment.id, payment.url, row.id)
      .run();
    if (payment.status !== "pending")
      await settleOrder(row.id, payment.status as "paid" | "declined");
    row = (await getOrder(row.id))!;
  }
  return json({
    order: publicOrder(row),
    checkoutUrl: row.status === "pending" ? row.checkout_url : null,
  });
}

async function stripeWebhook(request: Request) {
  if (config().provider !== "stripe")
    throw new HttpError(404, "Stripe is not enabled.");
  const raw = await request.text();
  if (raw.length > 100000) throw new HttpError(413, "Payload too large.");
  let event;
  try {
    event = await verifyStripeEvent(
      raw,
      request.headers.get("stripe-signature"),
      runtime().STRIPE_WEBHOOK_SECRET,
    );
  } catch {
    throw new HttpError(400, "Invalid webhook signature.");
  }
  if (event.livemode !== false)
    throw new HttpError(400, "Only Stripe test events are accepted.");
  if (
    !["checkout.session.completed", "checkout.session.expired"].includes(
      event.type,
    )
  )
    return json({ received: true });
  const payment = event.data?.object;
  const order = payment?.metadata?.order_id
    ? await getOrder(payment.metadata.order_id)
    : null;
  if (!order || order.provider !== "stripe")
    throw new HttpError(400, "Unknown order.");
  // Retry if the webhook raced the Checkout Session response.
  if (!order.payment_id)
    throw new HttpError(503, "Payment registration is still pending.");
  if (
    order.payment_id !== payment.id ||
    payment.amount_total !== order.total ||
    payment.currency !== "usd"
  )
    throw new HttpError(400, "Payment does not match the order.");
  if (event.type === "checkout.session.expired")
    await settleOrder(order.id, "expired");
  else if (payment.payment_status === "paid")
    await settleOrder(order.id, "paid");
  return json({ received: true });
}

export async function handleApi(request: Request) {
  try {
    const path = new URL(request.url).pathname;
    if (path === "/api/health" && request.method === "GET") {
      await db().prepare("SELECT 1").first();
      return json({
        status: "ok",
        database: "ok",
        paymentProvider: config().provider,
      });
    }
    if (path === "/api/session" && request.method === "GET")
      return await loadSession(request);
    if (path === "/api/checkout" && request.method === "POST")
      return await checkout(request);
    if (path === "/api/webhooks/stripe" && request.method === "POST")
      return await stripeWebhook(request);
    return json({ error: "Endpoint not found." }, 404);
  } catch (error) {
    if (error instanceof HttpError)
      return json({ error: error.message }, error.status);
    if (error instanceof InputError) return json({ error: error.message }, 400);
    console.error(
      "marketlane_api",
      error instanceof Error ? error.message : "Unknown failure",
    );
    return json(
      {
        error:
          "The service is temporarily unavailable. Your bag is saved. Please try again.",
      },
      503,
    );
  }
}
