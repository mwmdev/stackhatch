# Stripe Setup

StackHatch sells two paid public plans: **Builder** at $6/month and **Studio** at $14/month. All tiers use BYOK for AI; Stripe unlocks paid product limits and collaboration features. Free BYOK does not require Stripe.

## Products And Prices

Create two Stripe products with monthly and annual recurring prices:

| Product            | Monthly price | Annual price | Environment variable                                          |
| ------------------ | ------------: | -----------: | ------------------------------------------------------------- |
| StackHatch Builder |      $6/month |     $60/year | `STRIPE_PRICE_STARTER_MONTHLY`, `STRIPE_PRICE_STARTER_ANNUAL` |
| StackHatch Studio  |     $14/month |    $132/year | `STRIPE_PRICE_STUDIO_MONTHLY`, `STRIPE_PRICE_STUDIO_ANNUAL`   |

The app also supports the old `STRIPE_PRICE_PRO_*` and `STRIPE_PRICE_TEAM5_*` variables as fallback names for migration, but new deployments should use the names above.

## Required Environment

```bash
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_STARTER_MONTHLY=price_...
STRIPE_PRICE_STARTER_ANNUAL=price_...
STRIPE_PRICE_STUDIO_MONTHLY=price_...
STRIPE_PRICE_STUDIO_ANNUAL=price_...
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=...
STACKHATCH_ENCRYPTION_KEY=...
```

`STACKHATCH_ENCRYPTION_KEY` is used for BYOK key encryption. If omitted, the app falls back to `NEXTAUTH_SECRET`.

## Webhooks

Send these events to `/api/webhooks/stripe`:

- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.paid`
- `invoice.payment_failed`

Subscription metadata must include:

- `userId`
- `plan`: `starter` or `pro`
- `interval`: `monthly` or `annual`

Stripe Checkout sessions created by the app already include this metadata.
