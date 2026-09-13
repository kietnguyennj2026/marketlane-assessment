// Both providers return the same checkout shape. The demo never asks for a card.
export async function createPayment(order, config, fetcher = fetch) {
  if (config.provider !== "stripe") {
    return {
      id: `demo_${order.id}`,
      status: order.outcome === "declined" ? "declined" : "paid",
      url: null,
    };
  }
  if (
    !config.secretKey?.startsWith("sk_test_") ||
    !config.webhookSecret ||
    !config.origin
  ) {
    throw new Error("Stripe test checkout is not configured.");
  }
  const origin = new URL(config.origin);
  if (
    origin.protocol !== "https:" &&
    origin.hostname !== "localhost" &&
    origin.hostname !== "127.0.0.1"
  )
    throw new Error("Stripe needs a trusted HTTPS site URL.");
  const form = new URLSearchParams({
    mode: "payment",
    "payment_method_types[0]": "card",
    success_url: `${origin.origin}/?order=${order.id}`,
    cancel_url: `${origin.origin}/?order=${order.id}`,
    client_reference_id: order.id,
    "metadata[order_id]": order.id,
    expires_at: String(Math.floor(Date.now() / 1000) + 1800),
  });
  order.lines.forEach((line, i) => {
    form.set(`line_items[${i}][price_data][currency]`, "usd");
    form.set(`line_items[${i}][price_data][product_data][name]`, line.name);
    form.set(
      `line_items[${i}][price_data][unit_amount]`,
      String(line.unitPrice),
    );
    form.set(`line_items[${i}][quantity]`, String(line.quantity));
  });
  const response = await fetcher(
    "https://api.stripe.com/v1/checkout/sessions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.secretKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "Idempotency-Key": order.id,
      },
      body: form.toString(),
      signal: AbortSignal.timeout(12000),
    },
  );
  if (!response.ok)
    throw new Error(
      "Stripe is unavailable. Retry the same checkout to recover safely.",
    );
  const result = await response.json();
  if (
    result.livemode !== false ||
    !result.id?.startsWith("cs_test_") ||
    !result.url ||
    new URL(result.url).hostname !== "checkout.stripe.com"
  )
    throw new Error("Unexpected Stripe checkout response.");
  return { id: result.id, status: "pending", url: result.url };
}

export async function verifyStripeEvent(
  rawBody,
  signature,
  secret,
  now = Date.now(),
) {
  if (!secret || !signature) throw new Error("Missing webhook signature.");
  const parts = signature.split(",").map((part) => part.split("="));
  const timestamp = parts.find(([key]) => key === "t")?.[1];
  if (
    !timestamp ||
    !/^\d+$/.test(timestamp) ||
    Math.abs(now / 1000 - Number(timestamp)) > 300
  )
    throw new Error("Expired webhook signature.");
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const message = new TextEncoder().encode(`${timestamp}.${rawBody}`);
  for (const [, digest] of parts.filter(([key]) => key === "v1")) {
    if (!/^[0-9a-f]{64}$/.test(digest)) continue;
    const bytes = new Uint8Array(
      digest.match(/../g).map((byte) => parseInt(byte, 16)),
    );
    if (await crypto.subtle.verify("HMAC", key, bytes, message))
      return JSON.parse(rawBody);
  }
  throw new Error("Invalid webhook signature.");
}
