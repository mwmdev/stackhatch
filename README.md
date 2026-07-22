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

There are no account roles, administrator pages, or impersonation mode. Each user manages their own
model, theme, and custom node subtypes in Settings. The architecture prompts are checked into the
application and cannot be edited through the product.

## Architecture

- **Next.js and React** provide the public site, authenticated application, and route handlers.
- **React Flow** renders editable and read-only architecture maps.
- **Auth.js** handles GitHub OAuth and application sessions.
- **GitHub's API** provides public repository metadata and bounded source-tree evidence.
- **Anthropic** turns that evidence and the current canvas context into architecture output.
- **Drizzle and SQLite** persist users, per-user settings, personal projects, maps (including Note nodes),
  messages, personal templates, and scan provenance.
- **Docker** packages the standalone Next.js runtime for deployment.

## Local development

Requirements: Node.js 22+, npm 10+, a GitHub OAuth app, and an Anthropic API key for AI features.

```bash
npm ci
cp .env.example .env.local
mkdir -p data && touch data/stackhatch.db
npm run db:migrate:offline -- --database "$PWD/data/stackhatch.db"
npm run dev
```

Generate separate values for `NEXTAUTH_SECRET` and `STACKHATCH_ENCRYPTION_KEY`, then configure the GitHub OAuth callback as `http://localhost:3000/api/auth/callback/github`. The complete environment reference is in `.env.example`.

For local UI work without GitHub OAuth, set `STACKHATCH_DEV_AUTH=1`. Never enable the development auth bypass in production.

## Deployment outline

The included Docker image builds Next.js in standalone mode and runs it as a non-root user. For a
single-instance deployment:

1. Copy `.env.example` to a deployment-only environment file and replace every placeholder secret.
2. Mount a persistent volume at `/app/data` for SQLite.
3. During a maintenance window, stop the application and migrate the mounted database with the
   production migration command described below.
4. Build and start `docker-compose.yml` with `docker compose --env-file .env.local --profile prod
up --build`.
5. Put TLS and a reverse proxy in front of port 3000, and set `NEXTAUTH_URL` and
   `NEXT_PUBLIC_SITE_URL` to the public HTTPS origin.
6. Configure both Umami variables before building to enable the launch analytics contract. Compose
   passes them into the client bundle as build arguments; leaving either empty keeps analytics
   disabled without affecting product behavior.

Keep `STACKHATCH_DEV_AUTH=0` in every public environment. Back up the SQLite volume and test
restore procedures according to your own retention policy.

## Database maintenance and account operations

Production schema changes are an offline operation. Stop every StackHatch process that can access
the database, take and verify a SQLite-consistent backup that includes its WAL state, and run the
migration against an explicit absolute path before starting the application again:

```bash
# From a source checkout
npm run db:migrate:offline -- --database /absolute/path/to/stackhatch.db

# From the production artifact
node operator/migrate-database.cjs --database /absolute/path/to/stackhatch.db
```

For the included Compose deployment, use the `prod` service itself so the commands address the same
`shastack-data` volume as the application. Record the immutable image digest, release owner,
incident approver, backup directory, and command output with the deployment change before starting.

```bash
export BACKUP_DIR="$PWD/backups/stackhatch-$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$BACKUP_DIR"

# Stop traffic, archive the complete stopped SQLite volume, and verify the archive.
docker compose --env-file .env.local --profile prod stop prod
docker compose --env-file .env.local --profile prod run --rm --no-deps --user 0:0 \
  -v "$BACKUP_DIR:/backup" --entrypoint sh prod \
  -c 'tar -C /app/data -czf /backup/shastack-data.tgz .'
tar -tzf "$BACKUP_DIR/shastack-data.tgz" >/dev/null

# Exercise and then migrate the database through the bundled production command.
docker compose --env-file .env.local --profile prod run --rm --no-deps prod \
  node operator/migrate-database.cjs --database /app/data/stackhatch.db
docker compose --env-file .env.local --profile prod up -d prod
```

If post-migration verification fails, keep `prod` stopped. Decide explicitly between forward repair
and restore; never start the old image against the migrated database. To restore the verified volume
archive, keep the service stopped and run:

```bash
docker compose --env-file .env.local --profile prod stop prod
docker compose --env-file .env.local --profile prod run --rm --no-deps --user 0:0 \
  -v "$BACKUP_DIR:/backup:ro" --entrypoint sh prod \
  -c 'find /app/data -mindepth 1 -maxdepth 1 -exec rm -rf {} + && tar -C /app/data -xzf /backup/shastack-data.tgz'
docker compose --env-file .env.local --profile prod up -d prod
```

After either path, confirm `PRAGMA integrity_check` and `PRAGMA foreign_key_check` through the
approved SQLite operations procedure before reopening public traffic. Retain the backup and the
matching pre-migration image until the validation window closes.

Users can permanently delete their own account from Settings. The active SQLite database removes
their account, encrypted key, projects, messages, templates, preferences, and custom subtypes in one
transaction. A later GitHub sign-in creates a fresh account; an old session does not regain access.
SQLite WAL files and backups remain subject to the operator's storage-retention policy.

Rare support operations use the host-authorized account command, not a web administrator account.
The command always requires an explicit database path. Preview an exact account first, then delete
only by the returned internal user ID and a confirmation containing the database fingerprint and
that ID. Preview output is redacted and limited to identity hints, the internal ID, safe owned-record
counts, the database fingerprint, and the confirmation format.

```bash
# From a source checkout
npm run account:manage -- preview --database /absolute/path/to/stackhatch.db --id USER_ID
npm run account:manage -- delete --database /absolute/path/to/stackhatch.db --id USER_ID --confirm 'DELETE FINGERPRINT USER_ID'

# From the production artifact
node operator/manage-account.cjs preview --database /absolute/path/to/stackhatch.db --id USER_ID
node operator/manage-account.cjs delete --database /absolute/path/to/stackhatch.db --id USER_ID --confirm 'DELETE FINGERPRINT USER_ID'
```

Preview accepts exactly one of `--id`, `--github-id`, or `--email`. Substitute the reported
fingerprint and full internal ID when constructing the delete confirmation. Keep the database
offline for the delete step so no web request is using it concurrently.

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
