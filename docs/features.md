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

Administrators can manage users, impersonate an account for support, customize application-wide AI
prompts, and add node subtypes. The only account roles are `user` and `admin`.
