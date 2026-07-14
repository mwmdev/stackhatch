# StackHatch Features

StackHatch is free to use. There are no product tiers, subscriptions, feature gates, project
quotas, or team seat limits. Every signed-in user brings their own Anthropic API key for AI
features, and Anthropic bills that usage directly to the user.

## Architecture Workflow

- Start from a public GitHub repository, a Markdown or text PRD, or a blank canvas.
- Use architecture chat to generate and revise a system map.
- Add and edit nodes, descriptions, notes, locks, and typed connections manually.
- Compare technology alternatives without losing the current decision.
- Export diagrams as PNG, SVG, JSON, or YAML and generate a Markdown PRD.

Blank canvases and manual editing do not require an Anthropic key. Repository analysis, chat,
alternatives, and PRD generation do.

## Teams

- Create unlimited team workspaces and invite members.
- Keep personal projects private or create projects in a team workspace.
- Comment on shared projects and attach discussion to individual nodes.
- Save team projects as reusable templates and create new team projects from them.

Each collaborator uses their own Anthropic API key when they invoke an AI action in a shared
project.

## Account Settings

- Anthropic API keys are encrypted at rest, used only on the server, and never returned to the
  browser.
- Each user selects their preferred supported Claude model.
- Theme preferences follow the user across sessions.

Administrators can manage users, impersonate an account for support, customize shared AI prompts,
and add node subtypes. The only account roles are `user` and `admin`.
