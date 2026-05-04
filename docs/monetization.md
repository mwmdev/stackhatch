# StackHatch Monetization Plan

Paid tiers use a server-managed Anthropic key. Users buy access to the tool; the deployment owner pays and manages AI usage centrally.

## Tiers

### Free

| Feature         | Limit       |
| --------------- | ----------- |
| Projects        | 2           |
| Chat messages   | 20/month    |
| Repo scans      | 2/month     |
| Canvas          | Full        |
| Custom subtypes | No          |
| Model           | Sonnet only |
| Export          | No          |

### Pro — $19/mo

| Feature                 | Limit                    |
| ----------------------- | ------------------------ |
| Projects                | Unlimited                |
| Chat messages           | Unlimited                |
| Repo scans              | Unlimited                |
| Canvas                  | Full                     |
| Custom subtypes         | Yes                      |
| Model                   | All                      |
| Export                  | PNG, SVG, JSON, Markdown |
| Architecture versioning | Yes                      |

## Pricing Rationale

- Centralized AI cost control
- Low enough for individual developers
- High enough to cover shared AI usage and Stripe fees

## Natural Upgrade Triggers

Users hit one of these walls naturally:

1. **3rd project** — "I need more than 2"
2. **21st message** — mid-conversation cutoff is painful
3. **Export** — they built something great and can't get it out
4. **Opus** — they want better architecture suggestions

## What to Build

1. **Auth** — OAuth with GitHub (target audience is developers)
2. **Usage counters** — project count, monthly message/scan tallies
3. **Export** — ReactFlow's `toImage()` + JSON serialization
4. **Stripe Checkout** — single plan, monthly billing
