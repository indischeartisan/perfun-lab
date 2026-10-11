# RajaOngkir Shipping Foundation (Phase 5B)

Phase 5B prepares server-only RajaOngkir Shipping Cost integration. It does not alter customer checkout, order totals, DOKU, or fulfillment behavior.

## Fail-closed state

- `private.shipping_feature_settings.enabled` defaults to `false`.
- The configured Perfun origin is stored as address text only and remains `inactive`; its RajaOngkir destination ID is deliberately `NULL`.
- `shipping-quote` rejects while the feature is disabled, origin is inactive, the address has no verified destination, weights are invalid, or RajaOngkir returns no valid service. It never returns a Rp0 fallback.
- No public table grants expose API keys, provider cache, quote internals, or destination binding writes.

## Before Phase 5C

1. Search and manually verify the official RajaOngkir destination ID for the configured origin.
2. An authenticated Admin calls `admin_activate_shipping_origin(destination_id, provider_label)` with that verified result. This does not enable customer checkout.
3. Confirm the separate Shipping Cost sandbox/base URL and quota with RajaOngkir. Do not assume the Shipping Delivery sandbox is the Shipping Cost sandbox.
4. Set Edge Function secrets only: `RAJAONGKIR_SHIPPING_COST_API_KEY`, `RAJAONGKIR_SHIPPING_COST_BASE_URL`, `SHIPPING_ENVIRONMENT`, and `SHIPPING_ALLOWED_ORIGINS`.
5. Run sandbox Edge Function tests with a non-production key. Only an Admin can enable the feature via `admin_set_shipping_feature_enabled`; keep it off until Phase 5C is implemented and verified.
6. Phase 5C must modify the checkout transaction to lock/revalidate a selected `shipping_quotes` record before it writes `orders.shipping`, `orders.grand_total`, and a shipping snapshot. It must also bind selected courier/service to fulfillment.

## Package profile v1

| Product | Weight |
| --- | ---: |
| 10ml | 300 g |
| 30ml | 500 g |
| Play Set 3x10ml | 500 g |
| Packaging per order | 200 g |

The server calculates `sum(product_weight * quantity) + 200`; browser-supplied weights are ignored. Profile version is included in every stored quote.

## Operational limits

The Edge Functions require a customer JWT. Database-backed limits are 20 destination searches and 5 quote attempts per customer per minute. Destination results cache for one hour; rate responses cache for five minutes; selected quotes expire after ten minutes. Provider calls use a ten-second timeout, at most one retry for a transient upstream/network error, and normalize responses before cache/storage.
