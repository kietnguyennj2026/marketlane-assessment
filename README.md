# Marketlane

A small multi-vendor marketplace prepared by Kiet Nguyen for a time-boxed coding assessment. Six sample products, three independent studios, and one checkout.

**Live demo:** [Open Marketlane](https://marketlane-kiet-demo.vercel.app)

**Source:** [kietnguyennj2026/marketlane-assessment](https://github.com/kietnguyennj2026/marketlane-assessment)

## Review in three minutes

1. Add a ceramic mug and a daily tote to the bag. They belong to different vendors.
2. Open **Bag** and use **Approved payment**. The server creates one order with each vendor's allocation.
3. Open **Vendor studio**. Switch between Forma Studio and Common Goods to see gross sales, the 8% platform fee, earnings, and remaining stock.
4. Try **Declined payment**. The bag stays intact, the order is marked declined, and inventory is restored.
5. Reload the page. Orders and stock persist in the database.

No account or card is needed. Each browser receives its own isolated demo session, so reviewers do not affect one another. Catalog names, studios and prices are fictional; photos are illustrative.

## Run locally

Use Node 22.13+ and npm 10+.

```sh
npm ci
npm run build
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_polite_maggott.sql
npm run dev -- --port 4317
```

Open `http://localhost:4317`. Run the migration once per new local database. It is also applied automatically during Sites deployment. No database account or payment key is needed for local demo mode.

```sh
npm test
npm run typecheck
node tests/http-smoke.mjs http://localhost:4317
```

The HTTP smoke uses a new disposable session. It verifies approval, decline, vendor allocation, tampered prices, stock limits, idempotency, session isolation, and competing checkout requests.

## Small by design

React + TypeScript for the UI, Vinext for the Next.js App Router API, and a Cloudflare Worker with D1 (SQLite) for persistence. Drizzle owns the schema and migrations; application queries use prepared D1 statements.

The public demo uses a small Vercel gateway in `hosting/vercel/`. It forwards to the Worker through a server-only `WORKER_ORIGIN`, validates checkout against `PUBLIC_ORIGIN`, and preserves the session cookie and raw webhook body. The extra hop is a demo hosting choice; the application can also run directly on a Worker domain.

| File | Responsibility |
| --- | --- |
| `app/page.tsx` | Marketplace, bag, order history and vendor studio |
| `lib/catalog.ts` | Six products and three vendors |
| `lib/commerce.mjs` | Cart validation, server-side prices and fee allocation |
| `lib/server.ts` | Session ownership, atomic inventory reservations and order transitions |
| `lib/payments.mjs` | Demo provider, Stripe Checkout adapter and webhook signature verification |
| `db/schema.ts` | Session, inventory and order tables |
| `tests/` | Business-rule tests and an HTTP smoke |

Money is stored in integer cents. The server ignores client prices. An idempotency key identifies a checkout attempt, with a fingerprint to reject a changed bag under the same key. A D1 batch reserves stock and writes the order together; a database constraint prevents overselling even when requests race. Historical orders keep line-item and allocation snapshots so later catalog edits cannot change receipts.

An HTTP-only, SameSite cookie identifies a sandbox. Every order and inventory query is scoped to it. This is demo isolation, not a customer or vendor authentication system. The vendor selector intentionally lets a reviewer inspect all three studios within their own sandbox.

## Payments: what is real and what is simulated

The public demo uses a deterministic payment simulator. It makes no external charge. Orders, stock changes, idempotency, and vendor earnings are real database operations. Earnings are a ledger calculation, not a payout.

A Stripe **test-mode** Checkout adapter and signed webhook endpoint are implemented and covered by mocked API and signature tests. They have **not** been verified against a Stripe account because no sandbox credentials were supplied. The adapter rejects live secret keys and live webhook events.

To enable a dedicated Stripe sandbox, configure the runtime values from `.env.example`: `PAYMENT_PROVIDER=stripe`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and the trusted HTTPS `APP_URL`. For local Wrangler development, put them in the ignored `.dev.vars` file. For hosting, use Sites runtime variables, never client-side variables or Git.

Register `/api/webhooks/stripe` for `checkout.session.completed` and `checkout.session.expired`. A success redirect does not mark an order paid: only a matching, signed webhook can do that. Unpaid sessions expire after 30 minutes; the expiration event releases their stock. A payment API timeout leaves the reservation pending so retrying the same request can recover safely. A production system would also reconcile abandoned reservations and missed webhooks with a scheduled job.

References: [Checkout Sessions](https://docs.stripe.com/api/checkout/sessions/create), [webhook signatures](https://docs.stripe.com/webhooks/signature).

## Deliberately out of scope

Account registration, product CRUD, merchant onboarding, Stripe Connect payouts, refunds, shipping rates, taxes, emails, and any AI feature. The fixed catalog and 8% fee keep the assessment focused on a complete reviewable flow. This is a demonstration, not a production commerce system. Sessions have a 50-order cap; retention cleanup and global abuse controls would be needed for a long-running public service.

## API

| Method | Route | Purpose |
| --- | --- | --- |
| GET | `/api/session` | Create/reopen an isolated sandbox; return stock and its orders |
| POST | `/api/checkout` | Reserve inventory and process a payment; needs same-origin request, session cookie, and `Idempotency-Key` |
| POST | `/api/webhooks/stripe` | Verify and settle Stripe test events when Stripe is enabled |
| GET | `/api/health` | Check Worker and database availability |

`POST /api/checkout` accepts `{"items":[{"productId":"ceramic-mug","quantity":1}],"outcome":"approved"}`. Demo outcomes are `approved` or `declined`. Errors use appropriate 400/401/403/409/429/503 statuses. The response includes an order receipt and, when applicable, a Stripe test checkout URL.

Photo credits and licenses are in [docs/credits.md](docs/credits.md).
