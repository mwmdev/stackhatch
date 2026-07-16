# StackHatch

Keep your architecture in view.

StackHatch turns what you already have into a visual architecture map. Start with a blank canvas,
upload requirements, map a public GitHub repository, or reuse a personal template—then inspect the
pieces, ask architecture questions, compare alternatives, and keep the map current as the system
changes.

[Try StackHatch](https://stackhatch.io) · [Support](https://stackhatch.io/support) · [Privacy](https://stackhatch.io/privacy) · [Terms](https://stackhatch.io/terms)

![The StackHatch codebase shown as an architecture map](public/screenshots/architecture-overview-og.png)

## Why it exists

StackHatch is for developers who need to get—or keep—the architecture of a project in their head. It is useful when joining a codebase, taking over an existing project, reviewing an open-source repository, or keeping architectural drift visible during development.

The generated map is an explanation built from bounded repository evidence. It is not a full code audit, and StackHatch marks scans as partial when a repository exceeds its analysis limits.

## How it works

1. Start fresh, upload requirements, map a public GitHub repository, or use a personal template.
2. Inspect components and the relationships between them.
3. Ask questions about flows, boundaries, and decisions.
4. Compare suggested alternatives for a component.
5. Re-scan when the repository changes.

StackHatch is free and bring-your-own-key. AI requests use your Anthropic API key, which is encrypted before storage and never returned to the browser. Anthropic bills usage directly to your account.

## Architecture

- **Next.js and React** provide the public site, authenticated application, and route handlers.
- **React Flow** renders editable and read-only architecture maps.
- **Auth.js** handles GitHub OAuth and application sessions.
- **GitHub's API** provides public repository metadata and bounded source-tree evidence.
- **Anthropic** turns that evidence and the current canvas context into architecture output.
- **Drizzle and SQLite** persist users, settings, personal projects, maps (including Note nodes),
  messages, personal templates, and scan provenance.
- **Docker** packages the standalone Next.js runtime for deployment.

## Local development

Requirements: Node.js 22+, npm 10+, a GitHub OAuth app, and an Anthropic API key for AI features.

```bash
npm ci
cp .env.example .env.local
npm run db:migrate
npm run dev
```

Generate separate values for `NEXTAUTH_SECRET` and `STACKHATCH_ENCRYPTION_KEY`, then configure the GitHub OAuth callback as `http://localhost:3000/api/auth/callback/github`. The complete environment reference is in `.env.example`.

For local UI work without GitHub OAuth, set `STACKHATCH_DEV_AUTH=1`. Never enable the development auth bypass in production.

## Deployment outline

The included Docker image builds Next.js in standalone mode and runs it as a non-root user. For a
single-instance deployment:

1. Copy `.env.example` to a deployment-only environment file and replace every placeholder secret.
2. Mount a persistent volume at `/app/data` for SQLite.
3. Build and start `docker-compose.yml` with `docker compose --env-file .env.local --profile prod
up --build`. StackHatch runs the bundled database migrations before authenticated data access.
4. Put TLS and a reverse proxy in front of port 3000, and set `NEXTAUTH_URL` and
   `NEXT_PUBLIC_SITE_URL` to the public HTTPS origin.
5. Configure both Umami variables before building to enable the launch analytics contract. Compose
   passes them into the client bundle as build arguments; leaving either empty keeps analytics
   disabled without affecting product behavior.

Keep `STACKHATCH_DEV_AUTH=0` in every public environment. Back up the SQLite volume and test
restore procedures according to your own retention policy.

## Quality checks

```bash
npm test
npm run typecheck
npm run lint
npm run build
npm run test:e2e
```

## Architecture evaluation

Launch claim fidelity is tracked with pinned, manually scored public-repository fixtures in
[`evaluations/`](evaluations/README.md). The current fixture records main-component coverage,
unsupported components, and incorrect connections instead of presenting generated maps as verified
source truth.

## Contributing and security

Contributions are welcome; see [CONTRIBUTING.md](CONTRIBUTING.md). Report security issues privately using [SECURITY.md](SECURITY.md).

StackHatch is available under the [MIT License](LICENSE).
