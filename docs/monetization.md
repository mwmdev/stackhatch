# StackHatch Monetization Plan

Two tiers, both BYOK (Bring Your Own Key). Zero marginal cost per user — they pay Anthropic directly. We sell the tool, not the AI.

## Tiers

### Free

| Feature | Limit |
|---------|-------|
| API key | **Required** |
| Projects | 2 |
| Chat messages | 30/month |
| Repo scans | 2/month |
| Canvas | Full |
| Custom subtypes | No |
| Model | Sonnet only |
| Export | No |

### Pro — $9/mo

| Feature | Limit |
|---------|-------|
| API key | Required |
| Projects | Unlimited |
| Chat messages | Unlimited |
| Repo scans | Unlimited |
| Canvas | Full |
| Custom subtypes | Yes |
| Model | All |
| Export | PNG, SVG, JSON, Markdown |
| Architecture versioning | Yes |

## Pricing Rationale

- Zero marginal cost per user (they pay Anthropic directly)
- Low enough to be an impulse buy
- High enough to filter out non-serious users
- Clean price point — "less than a lunch"

## Natural Upgrade Triggers

Users hit one of these walls naturally:

1. **3rd project** — "I need more than 2"
2. **31st message** — mid-conversation cutoff is painful
3. **Export** — they built something great and can't get it out
4. **Opus** — they want better architecture suggestions

## What to Build

1. **Auth** — OAuth with GitHub (target audience is developers)
2. **Usage counters** — project count, monthly message/scan tallies
3. **Export** — ReactFlow's `toImage()` + JSON serialization
4. **Stripe Checkout** — single plan, monthly billing
