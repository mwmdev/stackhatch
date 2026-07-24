# Local-first Production Cutover

This runbook separates a static release from destructive retirement of the former hosted runtime.
Automated work may prepare and verify the candidate. It must not delete production data, backups,
volumes, secrets, OAuth registrations, images, ingress, or retained logs.

## Roles and authority

| Role                | Responsibility                                                     |
| ------------------- | ------------------------------------------------------------------ |
| Release commander   | Owns the stop/go decision and records the final candidate          |
| Deployment operator | Changes traffic and verifies served bytes and headers              |
| Privacy reviewer    | Verifies browser storage, egress, cookies, and absence claims      |
| Data custodian      | Resolves every legacy data, backup, volume, secret, and log target |
| Independent witness | Observes revalidation and each authorized destructive result       |

Before a real cutover, the evidence record must name one human for each role. The same person may
hold multiple operational roles, but the independent witness must be someone other than the person
performing destruction.

## Evidence location

Create a restricted, access-logged evidence directory outside the repository. Record only metadata,
digests, redacted command output, target identifiers, timestamps, and outcomes. Never copy
credentials, database rows, project content, prompts, repository evidence, or provider payloads
into the evidence record.

The release commander records:

| Field                     | Required value                                   |
| ------------------------- | ------------------------------------------------ |
| Change/release ID         | Organization-specific immutable identifier       |
| Source revision           | Full Git commit                                  |
| Static artifact digest    | Digest of the frozen `out/` archive              |
| Host policy digest        | Digest of the generated Caddyfile and `_headers` |
| Container digest          | Immutable image digest, never a mutable tag      |
| Public origin             | Exact HTTPS origin                               |
| Evidence directory        | Restricted path or case identifier               |
| Observation window        | Start and end timestamps; minimum 60 minutes     |
| Named role holders        | All five roles above                             |
| Destruction authorization | Separate approval reference, or `NOT AUTHORIZED` |

## Phase 1: freeze a static candidate

1. Start from a clean, reviewed, committed revision and run `npm ci`.
2. Run `npm test`, `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run build`,
   `npm run test:e2e`, and `npm audit`.
3. Run `npm run release:build` once. It refuses tracked changes, builds
   `stackhatch-static-candidate`, and labels the image with the exact source revision.
4. Run `npm run test:e2e:static`. This serves that exact image with its generated Caddy policy;
   it does not rebuild the candidate.
5. Run `npm run release:manifest`. It verifies the image revision, extracts the frozen files and
   policy, creates a deterministic archive, and writes artifact, `_headers`, Caddyfile, tree, and
   immutable image digests to ignored `dist-release/`.
6. Preserve the manifest and archive in the restricted evidence location. Do not rebuild after
   verification begins. Any source, artifact, policy, or image change creates a new candidate and
   restarts verification.

## Phase 2: preflight the live environment

The deployment operator and data custodian inventory exact provider-specific identifiers, not
patterns or guessed names:

| Target class                         | Evidence required before cutover                                              |
| ------------------------------------ | ----------------------------------------------------------------------------- |
| Active ingress and alternate origins | Hostnames, routes, load balancer/CDN configuration                            |
| Runtime workloads and images         | Workload IDs, image digests, schedulers, restart policies                     |
| Database files                       | Database, WAL, SHM, replicas, managed instances, and consumers                |
| Writable volumes                     | Volume IDs, mount targets, snapshots, and consumers                           |
| Backups                              | Schedules, repositories, object keys/prefixes, snapshots, and retention locks |
| Application secrets                  | Secret-store identifiers and every workload that can read them                |
| OAuth/session capability             | OAuth app ID, callback origins, session signing capability                    |
| Analytics                            | Script/config identifiers, collector destination, retained event store        |
| Application logs                     | Sinks, retention rules, archives, and access paths                            |

Confirm that users had a clear no-migration notice and an opportunity to export work from the
legacy application. Browser-local StackHatch does not import hosted accounts, projects, messages,
templates, preferences, or encrypted keys automatically.

Record a static-only fallback that can restore the exact candidate without restoring the old data
runtime. If direct browser-to-provider CORS fails at the real origin, stop the cutover; do not add a
server proxy as an emergency workaround.

## Phase 3: switch traffic

1. Quiesce the former application and prevent new writes.
2. Capture redacted counts and identifiers needed to prove the inventory, without capturing user
   content.
3. Deploy the exact recorded container digest behind the final HTTPS origin.
4. Remove every alternate route to the old runtime. Keep the old data targets isolated but intact
   while verification runs.
5. Confirm legacy Auth.js cookies receive immediate expiration headers. The static host must not
   create a replacement session cookie.
6. Verify direct refresh and security headers for `/`, `/app`, `/app/maps`, `/project`,
   `/project/new`, `/settings`, `/support`, `/privacy`, `/terms`, and an unknown route.
7. Verify the served static files and host policy match the recorded digests.

## Phase 4: observe and verify

For at least 60 minutes, use fresh, populated, hostile-input, and formerly authenticated browser
profiles to verify:

- the origin serves static files only and unknown paths use the hardened 404;
- blank create, edit, reload, resume, backup, and restore do not contact a provider;
- explicit repository actions contact only `api.github.com`;
- explicit AI actions contact only `api.anthropic.com`;
- provider credentials never appear in backup files, URLs, headers, console output, or host logs;
- no account/session cookie, analytics request, application API, Node process, database consumer,
  writable application mount, runtime secret, or alternate legacy ingress remains active; and
- CSP violations, CORS errors, provider errors, and storage failures match the documented stop/go
  criteria.

Any unexplained egress, mismatched digest, active legacy consumer, lost security header, broken
direct refresh, provider CORS failure, or evidence of credential/content logging is a stop. Restore
the recorded static-only fallback or withdraw traffic while fixing a new candidate.

## Phase 5: separately authorize retirement

Static verification is not destruction authorization. After the observation window, the data
custodian must re-run the exact inventory because targets may have changed. The release commander
then requests approval naming each exact target and the intended operation.

Only after that approval is recorded may the deployment operator retire the listed targets. The
independent witness observes every action and records success, absence verification, timestamp, and
tool identity. Unlisted, ambiguous, newly discovered, or retention-locked targets are skipped and
escalated; authorization is never inferred from a pattern or parent resource.

The authorized retirement must account for the database and WAL/SHM state, replicas, writable
volumes, backup schedules and retained snapshots, legacy images and workloads, application secrets,
OAuth/session capability, analytics configuration and data, alternate ingress, and retained
application logs. Use provider-native recoverable deletion or quarantine first when policy allows.

## Completion criteria

The production cutover is complete only when:

1. the public origin serves the frozen static candidate and recorded host policy;
2. the observation window passed with the documented browser, provider, storage, and egress checks;
3. every authorized legacy target is witnessed absent;
4. no Node runtime, database consumer, writable application mount, runtime secret, OAuth/session
   capability, analytics collector, alternate ingress, or retained application content log remains;
5. evidence contains no credential or user content; and
6. the release commander, privacy reviewer, data custodian, deployment operator, and independent
   witness sign the result.

If destruction is not separately authorized, record the outcome as **static release ready** rather
than **production cutover complete**.
