// The gateway gives the Worker app one public origin, including its session cookie.
export async function proxy(request, settings = process.env, send = fetch) {
  const incoming = new URL(request.url);
  // Vercel escapes the captured path once more when inserting it into the query.
  let path;
  try {
    path = "/" + decodeURIComponent(incoming.searchParams.get("__route") ?? incoming.pathname.slice(1));
  } catch {
    return Response.json({ error: "Invalid path." }, { status: 400 });
  }
  incoming.searchParams.delete("__route");
  const fail = (message, status) => Response.json({ error: message }, {
    status, headers: { "Cache-Control": "no-store" },
  });
  if (!["GET", "HEAD", "POST"].includes(request.method)) return fail("Method not allowed.", 405);
  if (!settings.WORKER_ORIGIN || !settings.PUBLIC_ORIGIN) return fail("Demo is being configured.", 503);
  if (request.method === "POST" && path !== "/api/webhooks/stripe" &&
      request.headers.get("origin") !== settings.PUBLIC_ORIGIN) {
    return fail("This request must come from the marketplace.", 403);
  }
  // Only this configured upstream is reachable; query strings cannot select a host.
  const target = new URL(settings.WORKER_ORIGIN);
  target.pathname = path;
  target.search = incoming.search;
  const headers = new Headers();
  for (const name of ["accept", "content-type", "cookie", "idempotency-key", "stripe-signature"]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  if (request.headers.has("origin")) headers.set("origin", target.origin);
  try {
    const upstream = await send(target, {
      method: request.method, headers,
      body: request.method === "POST" ? await request.arrayBuffer() : undefined,
      redirect: "manual", signal: AbortSignal.timeout(20000),
    });
    const responseHeaders = new Headers({ "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
    for (const name of ["content-type", "set-cookie"]) {
      const value = upstream.headers.get(name);
      if (value) responseHeaders.set(name, value);
    }
    const location = upstream.headers.get("location");
    if (location) {
      const redirect = new URL(location, target);
      if (redirect.origin !== target.origin) return fail("Unexpected redirect.", 502);
      responseHeaders.set("location", redirect.pathname + redirect.search);
    }
    return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
  } catch {
    return fail("The service is temporarily unavailable. Please try again.", 502);
  }
}

export default { fetch: (request) => proxy(request) };
