# StackHatch Monetization Plan

StackHatch uses a three-tier SaaS ladder built for developer adoption:

- **Free BYOK**: useful enough to trust the product, with the user's own Anthropic key.
- **Builder — $6/mo**: BYOK with practical solo-developer limits and export formats.
- **Studio — $14/mo**: BYOK team-ready architecture workflow with collaboration and richer exports.

## Tiers

| Feature            | Free BYOK          | Builder — $6/mo    | Studio — $14/mo              |
| ------------------ | ------------------ | ------------------ | ---------------------------- |
| AI billing         | User Anthropic key | User Anthropic key | User Anthropic key           |
| Projects           | 2                  | 10                 | Unlimited                    |
| Chat messages      | BYOK               | BYOK               | BYOK                         |
| Repo scans         | 2/month            | 25/month           | 150/month                    |
| Models             | Sonnet             | Sonnet             | Sonnet 4, Opus 4, Opus 4.1   |
| Exports            | JSON               | PNG, SVG, JSON     | PNG, SVG, JSON, Markdown/PRD |
| Alternatives       | No                 | Yes                | Yes                          |
| Custom subtypes    | No                 | No                 | Yes                          |
| Team workspaces    | No                 | No                 | Yes                          |
| Comments/templates | No                 | No                 | Yes                          |

Annual billing gives two months free:

- Builder: $5/mo billed annually ($60/year)
- Studio: $11/mo billed annually ($132/year)

## Conversion Strategy

BYOK avoids a dead trial and keeps AI costs tied to each user's Anthropic account. Developers can evaluate StackHatch on real projects without the app owner paying AI costs. The first natural upgrade is convenience around more projects, more scans, and export formats.

Builder is priced as an impulse-friendly developer tool subscription. It targets solo founders, freelancers, and engineers who need architecture artifacts repeatedly but are not yet collaborating with a team.

Studio is the startup tier. It unlocks the features that make architecture diagrams useful inside a company: comments, team workspaces, reusable templates, PRD export, custom subtypes, and access to stronger models.

## Natural Upgrade Triggers

1. **No BYOK key**: users add their Anthropic key in Settings before using AI workflows.
2. **3rd project**: free users outgrow evaluation.
3. **Export moment**: Builder unlocks image exports when a diagram is ready to share.
4. **Team handoff**: Studio unlocks comments, templates, and Markdown/PRD output.
5. **Model depth**: Studio exposes Opus for more demanding architecture decisions.

## Operational Notes

- User-provided Anthropic keys are encrypted before storage and never returned to the browser.
- Paid plans rely on Stripe webhooks as the subscription source of truth.
- Keep API responses for gated features actionable with `{ error, upgradeRequired, upgradeUrl }`.
