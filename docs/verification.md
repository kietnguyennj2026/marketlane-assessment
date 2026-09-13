# Verification

Checked on September 12, 2026.

- Thirteen automated tests passed for cart validation, canonical pricing, fees, idempotency fingerprints, the demo provider, the Stripe request adapter, webhook signature verification, and gateway routing/session/origin handling.
- TypeScript and the production Worker build passed locally and in GitHub Actions.
- `tests/http-smoke.mjs` passed against local development and the public deployment. It checks multi-vendor approval, decline, order persistence, stock restoration, duplicate requests, conflicting keys, invalid quantities, session isolation, cross-origin rejection, and concurrent reservations.
- Browser review completed a $60 demo order from Forma Studio and Common Goods. Vendor earnings were $25.76 and $29.44 after fees of $2.24 and $2.56. The bag cleared and stock updated.
- The deployed homepage, favicon and all six product image URLs returned HTTP 200.

No real card was entered or charged. Stripe-specific tests use mocked HTTP responses and signed fixture payloads. A live Stripe sandbox run and real merchant payouts have not been performed. The browser check is not a physical-device acceptance test.
