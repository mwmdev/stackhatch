# StackHatch Features

StackHatch is free to use. There are no product tiers, subscriptions, feature gates, or project
quotas. Every signed-in user brings their own Anthropic API key for AI features, and Anthropic
bills that usage directly to the user.

## Architecture Workflow

- Start fresh with a blank canvas, upload a Markdown or text requirements file, map a public GitHub
  repository, or reuse a personal template.
- Use architecture chat to generate and revise a system map.
- Add and edit architecture nodes, Note nodes, descriptions, locks, and typed connections manually.
- Compare technology alternatives without losing the current decision.
- Export diagrams as PNG, SVG, JSON, or YAML and generate a Markdown PRD.

Blank canvases and manual editing do not require an Anthropic key. Repository analysis, chat,
alternatives, and PRD generation do.

## Personal Workspace

- Create personal projects that are accessible only to the account owner.
- Place Note nodes directly on the architecture map to keep decisions beside the system they
  describe.
- Save personal projects as reusable templates and start new personal projects from them.

Note nodes are canvas content and are saved, exported, and templated with the rest of the map.
StackHatch does not maintain a separate private Notes panel.

## Account Settings

- Anthropic API keys are encrypted at rest, used only on the server, and never returned to the
  browser.
- Each user selects their preferred supported Claude model.
- Theme preferences follow the user across sessions.
- Each user can add personal node subtypes to the built-in map vocabulary. Retired personal subtype
  values remain visible on existing nodes until the user replaces them.
- Users can permanently delete their account and active application data from Settings. Signing in
  with GitHub again creates a fresh account; an old session cannot recover the deleted account.

StackHatch has no account roles, administrator page, or impersonation mode. Architecture prompts are
immutable, reviewed application source rather than editable product settings. Rare account lookup
and deletion operations are available only to a host-authorized operator using the explicit-path
command-line tool.

Account deletion removes the user's records from the active SQLite database in one transaction.
SQLite WAL files and backups follow the operator's configured storage-retention lifecycle.
