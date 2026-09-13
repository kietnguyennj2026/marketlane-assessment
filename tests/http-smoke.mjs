import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
const base = process.argv[2] || "http://localhost:4317";
const call = async (path, options = {}) => {
  const response = await fetch(base + path, options);
  const text = await response.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = { error: text };
  }
  return { status: response.status, headers: response.headers, body };
};
const first = await call("/api/session");
assert.equal(first.status, 200);
const cookie = first.headers.get("set-cookie")?.split(";")[0];
assert.ok(cookie);
const session = () => call("/api/session", { headers: { cookie } });
const checkout = (
  items,
  outcome = "approved",
  key = randomUUID(),
  extra = {},
) =>
  call("/api/checkout", {
    method: "POST",
    headers: {
      cookie,
      Origin: base,
      "Content-Type": "application/json",
      "Idempotency-Key": key,
      ...extra,
    },
    body: JSON.stringify({ items, outcome }),
  });
const items = [
  { productId: "ceramic-mug", quantity: 2, price: 1 },
  { productId: "daily-tote", quantity: 1 },
];
const key = randomUUID();
const paid = await checkout(items, "approved", key);
assert.equal(paid.status, 200);
assert.equal(paid.body.order.total, 8800);
assert.equal(paid.body.order.status, "paid");
assert.equal(paid.body.order.allocations.length, 2);
const replay = await checkout(items, "approved", key);
assert.equal(replay.body.order.id, paid.body.order.id);
assert.equal(
  (await session()).body.inventory["ceramic-mug"],
  first.body.inventory["ceramic-mug"] - 2,
);
assert.equal(
  (await checkout([{ productId: "ceramic-mug", quantity: 1 }], "approved", key))
    .status,
  409,
);
const declined = await checkout(
  [{ productId: "desk-lamp", quantity: 1 }],
  "declined",
);
assert.equal(declined.body.order.status, "declined");
assert.equal(
  (await session()).body.inventory["desk-lamp"],
  first.body.inventory["desk-lamp"],
);
assert.equal(
  (await checkout([{ productId: "desk-lamp", quantity: 10 }])).status,
  409,
);
assert.equal(
  (await checkout([{ productId: "desk-lamp", quantity: -1 }])).status,
  400,
);
assert.equal(
  (
    await checkout(items, "approved", randomUUID(), {
      Origin: "https://attacker.example",
    })
  ).status,
  403,
);
assert.equal(
  (await checkout(items, "approved", randomUUID(), { cookie: "" })).status,
  401,
);
const other = await call("/api/session");
assert.equal(other.body.orders.length, 0);
assert.equal(
  other.body.inventory["ceramic-mug"],
  first.body.inventory["ceramic-mug"],
);
// Competing requests must never reserve more than the available stock.
const race = await Promise.all([
  checkout([{ productId: "desk-lamp", quantity: 4 }]),
  checkout([{ productId: "desk-lamp", quantity: 4 }]),
]);
assert.deepEqual(race.map((r) => r.status).sort(), [200, 409]);
assert.equal((await session()).body.inventory["desk-lamp"], 2);
const concurrentKey = randomUUID();
const duplicates = await Promise.all([
  checkout([{ productId: "soap", quantity: 1 }], "approved", concurrentKey),
  checkout([{ productId: "soap", quantity: 1 }], "approved", concurrentKey),
]);
assert.ok(duplicates.every((r) => r.status === 200));
assert.equal(duplicates[0].body.order.id, duplicates[1].body.order.id);
assert.equal(
  (await session()).body.inventory.soap,
  first.body.inventory.soap - 1,
);
assert.equal((await call("/api/health")).body.database, "ok");
console.log(
  "PASS: multi-vendor checkout, server pricing, replay, conflicting key, decline, stock, validation, CSRF, session isolation, concurrent reservations, concurrent replay and health.",
);
