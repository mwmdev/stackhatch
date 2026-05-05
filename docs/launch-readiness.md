# StackHatch Launch Readiness Brief

## SaaS Opportunity

### Product Concept

StackHatch is an architecture workspace that turns public repositories, product briefs, and early requirements into editable system diagrams, tradeoff notes, and handoff artifacts.

### Target Customer

Technical founders, freelance developers, and small product or devtool teams that need to explain architecture choices before implementation hardens.

### Core Problem

Early teams lose time and confidence when architecture decisions live across code, chat, whiteboards, and partial docs. The cost shows up as unclear handoffs, slow investor or customer review, and avoidable rewrites.

### Current Alternatives

Manual diagrams, README notes, ad hoc whiteboards, generic diagramming tools, architecture review meetings, and custom docs written after the fact.

### Value Proposition

StackHatch shortens the path from real input to shareable architecture: repo or PRD in, editable map and reasoning out.

### Initial Market Wedge

Solo founders and small technical teams validating a new SaaS, devtool, or client product where architecture clarity affects speed, credibility, and implementation cost.

### Key Risks and Unknowns

The strongest remaining assumptions are willingness to pay for repeated architecture handoffs, whether repository analysis is accurate enough for public launch expectations, and which acquisition channel reliably reaches technical founders.

## MVP and Activation

### Primary Use Case

A user creates one architecture project from a public repository or short PRD, reviews the generated map, asks the assistant for tradeoffs, and exports or shares the result.

### Must-Have Product Capabilities

- Public landing page with specific customer positioning and pricing paths.
- Fast signed-in activation through repo analysis, requirements upload, or blank project.
- BYOK AI path across free and paid plans.
- Billing, plan limits, settings, team workspaces, comments, and admin support tools.
- Trust surface with support, privacy, and terms pages.

### Activation Event

The first meaningful activation event is a user creating a real project from a repo, PRD, or blank canvas and reaching the architecture workspace.

### North Star Metric

Weekly decision-ready architecture maps created from real project inputs.

## Pricing and Conversion

### Model

Tiered SaaS pricing with BYOK on every plan. Paid plans scale by project limits, repository scans, exports, and collaboration.

### Conversion Triggers

- Users outgrow the free project limit.
- Users need PNG, SVG, Markdown, or PRD exports.
- Teams need comments, templates, and shared workspaces.

### Pricing Validation Plan

Ask early users whether Builder is an easy personal expense and whether Studio is justified by team review, comments, and export handoffs. Track which limit or feature produces the first upgrade click.

## Go-to-Market

### Initial Motion

Product-led self-serve with founder-led outreach to technical founders, freelance builders, and devtool teams.

### Acquisition Channels to Test

- Short technical teardown posts using public repos.
- Founder-led outreach offering a free architecture assessment.
- Launch community posts focused on repo-to-architecture examples.
- Comparison content against manual diagramming and generic whiteboards.

### 30-Day Experiment

Create 20 public architecture teardown examples, send 100 targeted outreach messages to technical founders, and measure landing-page signup rate, first-project activation rate, and upgrade intent.

## Retention and Customer Success

### Retention Hooks

Projects become more valuable as diagrams, comments, tradeoff notes, templates, and exports accumulate around recurring architecture decisions.

### Risk Signals

No AI key, no first project created, project created but no follow-up chat or export, and repeated limit errors without upgrade.

### Intervention Strategy

Use the dashboard activation panel, support page, and plan-limit prompts to route users toward the next value-producing action.

## Technical Launch Notes

The app already includes Next.js, authentication, encrypted BYOK settings, Stripe billing routes, usage limits, team collaboration, comments, admin support tooling, tests, and migrations. This launch pass added a more operational dashboard, trust pages, focused landing-page positioning, safer requirements uploads, and clearer metadata.
