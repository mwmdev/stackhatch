# StackHatch Feature Ideas by Tier

StackHatch should keep BYOK available on every plan. Paid tiers should not monetize
AI token usage directly; they should monetize the workflow around turning architecture
conversations into reusable, shareable, team-ready engineering artifacts.

## Positioning

Every plan uses the customer's Anthropic key. Free is for proving StackHatch works on
real projects. Paid plans add higher limits, professional exports, collaboration, and
governance.

## Tier Strategy

| Tier | Target buyer | Core reason to upgrade |
| --- | --- | --- |
| Free | Curious solo developer | Evaluate StackHatch on real projects without a trial clock |
| Builder | Solo founder, freelancer, indie developer | Produce and share professional architecture artifacts repeatedly |
| Studio | Small product or engineering team | Turn diagrams into shared architecture decisions and handoff docs |
| Enterprise | Security, platform, or procurement buyer | Add governance, deployment flexibility, and company controls |

## Free

Free should be useful enough to build trust, but limited enough that repeated use
naturally pushes users toward Builder.

Suggested features:

- Bring your own Anthropic key
- 2 active projects
- 2 repository scans per month
- Basic architecture chat
- Manual canvas editing
- JSON export
- Basic share link or local handoff

Upgrade triggers:

- User needs a third active project
- User wants image or document exports
- User wants to scan more than a couple repositories
- User wants to keep multiple client or product architectures organized

## Builder

Builder should be the solo professional plan. The buyer is not paying for AI calls;
they are paying for project room, better artifacts, and faster client or stakeholder
handoff.

Suggested features:

- Bring your own Anthropic key
- 10 to 25 active projects
- 25 to 50 repository scans per month
- PNG, SVG, PDF, JSON, and Markdown exports
- Architecture alternatives and stack swaps
- Diagram version history
- Shareable read-only links
- Export branding controls
- Saved personal prompt preferences

Upgrade triggers:

- User wants comments or feedback from other people
- User wants reusable architecture templates
- User wants PRD, RFC, or decision-record output
- User is using StackHatch for team planning instead of personal drafting

## Studio

Studio should be the small-team workflow plan. Its value is collaboration, reusable
process, decision capture, and higher operational limits.

Suggested features:

- Bring your own Anthropic key
- Unlimited or high active project limit
- 150 or more repository scans per month
- Team workspaces
- Comments and mentions
- Reusable team templates
- PRD, RFC, and architecture decision record exports
- Decision history and diagram version comparison
- Roles and permissions
- Custom node subtype system
- Shared team prompt and style settings
- Private team share links

Upgrade triggers:

- User needs admin controls, SSO, audit logs, or procurement support
- User wants deployment or data-residency guarantees
- User needs organization-wide usage reporting

## Enterprise

Enterprise should wait until there is real pull from companies. It should not be the
primary early monetization path, but the product should leave room for it.

Suggested features:

- SAML SSO
- SCIM directory sync
- Audit logs
- Organization-level admin controls
- Centralized workspace and member management
- Usage reporting
- Custom legal, invoicing, and procurement support
- Self-hosted, VPC, or private cloud deployment options
- Dedicated support and onboarding

## Recommended Gating Principles

- Do not gate model access if the user brings their own Anthropic key.
- Do not gate basic AI chat behind paid plans.
- Gate artifacts, collaboration, limits, history, governance, and workflow depth.
- Make the first paid upgrade happen when the user wants to share or reuse output.
- Make the team upgrade happen when architecture becomes a group decision.

## Suggested Pricing Hypothesis

| Tier | Monthly | Annual positioning |
| --- | ---: | --- |
| Free | $0 | Always free |
| Builder | $6 to $9/mo | Two months free annually |
| Studio | $15 to $25/mo | Two months free annually |
| Enterprise | Custom | Annual contract |

The current Builder and Studio prices are intentionally accessible. If conversion is
healthy and support burden stays low, keep them. If Studio becomes a serious team
workflow product, move it closer to the $20 to $25 range before adding an Enterprise
sales motion.
