# StackHatch Features

StackHatch is free, open source, accountless, and bring-your-own-key. The supported app is a static
site: the browser owns the workspace and contacts external providers only for explicit actions.

## Ways to start

- Start with a blank, editable architecture canvas without a provider key or network request.
- Upload a Markdown or text requirements file and approve an Anthropic request to generate a map.
- Enter a public GitHub repository, approve the GitHub scan, review bounded evidence, then approve
  the separate Anthropic generation step.
- Reuse a template saved in the current browser profile.

Private GitHub repositories are not supported. Repository analysis records the public revision and
marks partial evidence when limits or provider responses prevent a complete bounded scan.

## Architecture workspace

- Create, edit, lock, move, and connect typed architecture nodes and Note nodes.
- Auto-layout the canvas while preserving locked positions.
- Ask contextual architecture questions and stream answers directly from Anthropic.
- Compare alternatives for a selected component without replacing the current decision.
- Re-scan public repository evidence and explicitly replace a repository-backed map.
- Export PNG, SVG, JSON, YAML, or a Markdown PRD.

Generated output is an explanation to review, not a full code or security audit.

## Device workspace

- Projects, chat, repository evidence, personal templates, custom subtypes, theme, model choice, and
  resume state are stored in IndexedDB in the current browser profile.
- Revisioned writes and cross-tab coordination surface conflicts instead of silently overwriting
  newer work.
- Settings reports storage availability and provides project backup, full backup, restore, and
  clear-all controls.
- Clearing site data, losing a browser profile, or using short-lived private browsing can remove
  work. There is no server copy or cross-device sync.

## Provider credentials

- Blank editing and ordinary exports need no provider key.
- An Anthropic key stays in memory for the browser session by default.
- Remembering a key is an explicit device-local choice; forgetting it clears both active and durable
  copies.
- Provider credentials are never included in project or full-vault backups.
- Each provider action shows what will be sent before the first request.

## Network and hosting

- The application sets no account/session cookie and emits no product analytics.
- Public repository actions call `https://api.github.com` directly.
- AI actions call `https://api.anthropic.com` directly.
- The production host serves static first-party assets only.
- Generated CSP hashes authorize only the exact inline scripts in the exported pages; the host policy
  denies other connection, frame, form, object, and remote executable destinations.

Self-hosted forks can change this boundary. A fork that adds analytics, a proxy, remote assets, or
server storage must document its own behavior rather than relying on StackHatch's privacy claims.
