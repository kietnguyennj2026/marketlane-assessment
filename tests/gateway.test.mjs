import test from "node:test";
import assert from "node:assert/strict";
import { proxy } from "../hosting/vercel/api/index.mjs";

const settings = { PUBLIC_ORIGIN: "https://demo.example", WORKER_ORIGIN: "https://worker.example" };
test("gateway decodes captured asset paths without allowing a different upstream host", async () => {
  for (const [route, path] of [["products%252Fmug.jpg", "/products/mug.jpg"], ["%252Fother.example", "//other.example"]]) {
    await proxy(new Request("https://demo.example/api/index?__route=" + route), settings, async (target) => {
      assert.equal(target.origin, settings.WORKER_ORIGIN);
      assert.equal(target.pathname, path);
      return new Response("asset");
    });
  }
});
test("gateway rejects cross-origin checkout before contacting the Worker", async () => {
  let contacted = false;
  const response = await proxy(new Request("https://demo.example/api/checkout", {
    method: "POST", headers: { origin: "https://other.example" }, body: "{}",
  }), settings, () => { contacted = true; });
  assert.equal(response.status, 403);
  assert.equal(contacted, false);
});
test("gateway keeps session and idempotency headers, but drops private upstream headers", async () => {
  const response = await proxy(new Request("https://demo.example/api/index?__route=api/checkout", {
    method: "POST", body: "{}",
    headers: { origin: settings.PUBLIC_ORIGIN, cookie: "marketlane_session=abc", "idempotency-key": "checkout-example" },
  }), settings, async (target, options) => {
    assert.equal(target.href, "https://worker.example/api/checkout");
    assert.equal(options.headers.get("origin"), settings.WORKER_ORIGIN);
    assert.equal(options.headers.get("cookie"), "marketlane_session=abc");
    assert.equal(options.headers.get("idempotency-key"), "checkout-example");
    return Response.json({ ok: true }, { headers: { "Set-Cookie": "marketlane_session=abc; HttpOnly", "X-Upstream": "private" } });
  });
  assert.equal(response.headers.get("x-upstream"), null);
  assert.match(response.headers.get("set-cookie"), /HttpOnly/);
  assert.deepEqual(await response.json(), { ok: true });
});
test("gateway forwards signed webhook bytes unchanged without requiring a browser origin", async () => {
  const body = '{ "event": "test", "spacing": true }';
  const response = await proxy(new Request("https://demo.example/api/webhooks/stripe", {
    method: "POST", headers: { "stripe-signature": "test-signature" }, body,
  }), settings, async (_, options) => {
    assert.equal(new TextDecoder().decode(options.body), body);
    assert.equal(options.headers.get("stripe-signature"), "test-signature");
    return Response.json({ received: true });
  });
  assert.equal(response.status, 200);
});
