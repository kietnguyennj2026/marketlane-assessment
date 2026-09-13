import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import {
  normalizeCart,
  priceCart,
  requestFingerprint,
} from "../lib/commerce.mjs";
import { createPayment, verifyStripeEvent } from "../lib/payments.mjs";

const catalog = [
  { id: "mug", name: "Mug", vendorId: "a", price: 2800 },
  { id: "tote", name: "Tote", vendorId: "b", price: 3200 },
];
test("server prices override browser prices and split vendor earnings", () => {
  const result = priceCart(
    [
      { productId: "mug", quantity: 2, price: 1, vendorId: "attacker" },
      { productId: "tote", quantity: 1 },
    ],
    catalog,
  );
  assert.equal(result.total, 8800);
  assert.deepEqual(result.allocations, [
    { vendorId: "a", gross: 5600, fee: 448, net: 5152 },
    { vendorId: "b", gross: 3200, fee: 256, net: 2944 },
  ]);
  assert.equal(
    result.allocations.reduce((sum, a) => sum + a.fee + a.net, 0),
    result.total,
  );
});
test("duplicate lines are merged before quantity limits are checked", () => {
  assert.deepEqual(
    normalizeCart([
      { productId: "mug", quantity: 2 },
      { productId: "mug", quantity: 3 },
    ]),
    [{ productId: "mug", quantity: 5 }],
  );
  assert.throws(() =>
    normalizeCart([
      { productId: "mug", quantity: 6 },
      { productId: "mug", quantity: 6 },
    ]),
  );
});
test("empty, invalid, fractional and oversized quantities are rejected", () => {
  for (const input of [
    null,
    [],
    [{ productId: "mug", quantity: 0 }],
    [{ productId: "mug", quantity: -1 }],
    [{ productId: "mug", quantity: 1.5 }],
    [{ productId: "mug", quantity: "2" }],
    [{ productId: "mug", quantity: 11 }],
  ])
    assert.throws(() => normalizeCart(input));
  assert.throws(() =>
    priceCart([{ productId: "unknown", quantity: 1 }], catalog),
  );
});
test("fees round per vendor without losing cents", () => {
  const result = priceCart(
    [{ productId: "odd", quantity: 1 }],
    [{ id: "odd", name: "Odd", vendorId: "a", price: 999 }],
  );
  assert.deepEqual(result.allocations[0], {
    vendorId: "a",
    gross: 999,
    fee: 80,
    net: 919,
  });
});
test("idempotency fingerprint ignores cart order but includes outcome", () => {
  const a = [
    { productId: "mug", quantity: 1 },
    { productId: "tote", quantity: 2 },
  ];
  assert.equal(
    requestFingerprint(a, "approved"),
    requestFingerprint([...a].reverse(), "approved"),
  );
  assert.notEqual(
    requestFingerprint(a, "approved"),
    requestFingerprint(a, "declined"),
  );
});
test("demo approval and decline do not make network requests", async () => {
  const unexpectedFetch = () => {
    throw new Error("Demo called the network");
  };
  assert.equal(
    (
      await createPayment(
        { id: "order-1", outcome: "approved" },
        { provider: "demo" },
        unexpectedFetch,
      )
    ).status,
    "paid",
  );
  assert.equal(
    (
      await createPayment(
        { id: "order-2", outcome: "declined" },
        { provider: "demo" },
        unexpectedFetch,
      )
    ).status,
    "declined",
  );
});
test("Stripe adapter sends canonical prices and an idempotency key", async () => {
  const order = {
    id: "order-3",
    lines: [{ name: "Mug", unitPrice: 2800, quantity: 2 }],
  };
  const result = await createPayment(
    order,
    {
      provider: "stripe",
      secretKey: "sk_test_fixture",
      webhookSecret: "whsec_fixture",
      origin: "https://example.com",
    },
    async (url, options) => {
      assert.equal(url, "https://api.stripe.com/v1/checkout/sessions");
      assert.equal(options.headers["Idempotency-Key"], "order-3");
      const body = new URLSearchParams(options.body);
      assert.equal(body.get("line_items[0][price_data][unit_amount]"), "2800");
      assert.equal(body.get("line_items[0][quantity]"), "2");
      assert.equal(body.get("metadata[order_id]"), "order-3");
      return Response.json({
        id: "cs_test_123",
        livemode: false,
        url: "https://checkout.stripe.com/c/pay/cs_test_123",
      });
    },
  );
  assert.equal(result.status, "pending");
});
test("Stripe fails closed on a live key or untrusted response", async () => {
  await assert.rejects(
    createPayment(
      { id: "x" },
      {
        provider: "stripe",
        secretKey: "sk_live_fixture",
        webhookSecret: "whsec_fixture",
        origin: "https://example.com",
      },
    ),
  );
  await assert.rejects(
    createPayment(
      { id: "x", lines: [] },
      {
        provider: "stripe",
        secretKey: "sk_test_fixture",
        webhookSecret: "whsec_fixture",
        origin: "https://example.com",
      },
      async () => Response.json({ livemode: true }),
    ),
  );
});
test("webhook signature checks raw bytes, timestamp and signature rotation", async () => {
  const now = 1800000000000,
    timestamp = now / 1000,
    secret = "whsec_unit_test";
  const raw = JSON.stringify({ id: "evt_test", livemode: false });
  const digest = createHmac("sha256", secret)
    .update(`${timestamp}.${raw}`)
    .digest("hex");
  assert.equal(
    (
      await verifyStripeEvent(
        raw,
        `t=${timestamp},v1=invalid,v1=${digest}`,
        secret,
        now,
      )
    ).id,
    "evt_test",
  );
  await assert.rejects(
    verifyStripeEvent(raw + " ", `t=${timestamp},v1=${digest}`, secret, now),
  );
  await assert.rejects(
    verifyStripeEvent(raw, `t=${timestamp},v1=${digest}`, secret, now + 301000),
  );
  await assert.rejects(verifyStripeEvent(raw, "t=NaN,v1=123", secret, now));
});
