# Local-first Verification Record

This record maps the privacy product contract to named automated evidence. It describes the
static-release-ready gate; it does not claim that a production cutover or legacy-data retirement
has occurred.

## Requirement traceability

| Contract area                   | Requirements | Primary automated evidence                                                                                                                                                                                                                   |
| ------------------------------- | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Static and operator boundary    | R1-R6        | `scripts/verify-static-output.mjs`; `src/app/layout.test.tsx`; `e2e/smoke.test.ts` (“public app is accountless…” and “static candidate serves hardened direct routes…”); the container inspection in the release gate                        |
| Browser vault and portable data | R7-R12       | `src/lib/vault/indexed-db.test.ts`, `repository.test.ts`, `coordination.test.ts`, `backup.test.ts`, `clear.test.ts`, `storage-status.test.ts`; `src/lib/canvas-persistence.test.ts`; `e2e/new-project.test.ts`; `e2e/personal-tools.test.ts` |
| BYOK credential lifecycle       | R13-R17      | `src/lib/provider-key.test.ts`; `src/app/settings/settings-page.test.tsx`; `e2e/tierless-byok.test.ts`; backup exclusion in `e2e/personal-tools.test.ts`                                                                                     |
| Direct provider actions         | R18-R23      | `src/lib/ai/browser-client.test.ts`, `provider-run.test.ts`, `provider-errors.test.ts`; `src/lib/github-analyzer.test.ts`; `src/components/chat/ChatSidebar.test.tsx`; `e2e/full-flow.test.ts`; `e2e/error-paths.test.ts`                    |
| Accountless product flows       | R24-R29      | `src/lib/project-start.test.ts`; `src/components/projects/ProjectStartWorkspace.test.tsx`; `src/components/AllMapsPage.test.tsx`; page tests under `src/app`; all Playwright user-flow suites                                                |
| Clean static reset              | R30, R32-R33 | Static verifier; dependency audit; Docker image inspection; `e2e/smoke.test.ts`; `e2e/launch-experience.test.ts`; `README.md`, `SECURITY.md`, and the cutover runbook                                                                        |
| Witnessed legacy retirement     | R31          | Human-gated phases 2–5 of `docs/operations/local-first-cutover.md`; deliberately not executed or claimed by this record                                                                                                                      |

The six key flows F1–F6 are exercised respectively by the smoke/new-project, new-project,
full-flow/tierless-BYOK, full-flow repository, personal-tools backup, and personal-tools clear
scenarios.

## Acceptance-example traceability

| Examples  | Named evidence                                                                                                                                                                                     |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AE1       | `e2e/smoke.test.ts` browser-vault scenario; `e2e/new-project.test.ts`; `src/lib/project-resume.test.ts`                                                                                            |
| AE2–AE3   | `src/lib/provider-key.test.ts`; `e2e/tierless-byok.test.ts`                                                                                                                                        |
| AE4–AE5   | `e2e/smoke.test.ts`; `e2e/full-flow.test.ts` interview scenario                                                                                                                                    |
| AE6       | GitHub rate-limit cases in `src/lib/github-analyzer.test.ts` and recovery UI in `src/components/chat/ChatSidebar.test.tsx`                                                                         |
| AE7–AE10  | `src/lib/vault/backup.test.ts`; `src/lib/vault/clear.test.ts`; both `e2e/personal-tools.test.ts` scenarios; static and retired-route checks in `e2e/smoke.test.ts` and `e2e/tierless-byok.test.ts` |
| AE11–AE12 | `src/lib/vault/indexed-db.test.ts`, `coordination.test.ts`, `storage-status.test.ts`; conflict UI in `src/app/project/page.test.tsx`                                                               |
| AE13      | cancellation, stale-revision, and invalid-output cases in `src/lib/ai/provider-run.test.ts` and `browser-client.test.ts`; browser failure recovery in `e2e/error-paths.test.ts`                    |
| AE14      | repository provider-gate scenario in `e2e/full-flow.test.ts`; `src/lib/github-analyzer.test.ts`; `src/components/chat/ChatSidebar.test.tsx`                                                        |
| AE15      | hostile, future-format, checksum, reference, and resource-limit cases in `src/lib/vault/backup.test.ts`; import UI in `src/components/settings/DeviceDataSettings.test.tsx`                        |
| AE16      | unknown identifier scenario in `e2e/error-paths.test.ts`; `src/app/project/page.test.tsx`                                                                                                          |
| AE17      | both provider-gate scenarios in `e2e/full-flow.test.ts`; first-action disclosure cases in `src/components/chat/ChatSidebar.test.tsx`                                                               |

## Release gate

Run the quality gates on the intended clean revision, then freeze one image:

```bash
npm ci
npm test
npm run typecheck
npm run lint
npm run format:check
npm run build
npm run test:e2e
npm audit
npm run release:build
npm run test:e2e:static
npm run release:manifest
```

`release:build` refuses a dirty tracked worktree and labels the image with the exact Git revision.
`release:manifest` rejects a revision mismatch, extracts the already-built static files and host
policy, creates a deterministic archive, and records SHA-256 digests under ignored
`dist-release/`. Do not rebuild the image after the static Playwright gate begins.

The candidate result is **static release ready**. A production claim additionally requires the
named people, restricted evidence location, exact live inventory, 60-minute observation window,
separate destructive authorization, and witnessed absence evidence defined in the cutover runbook.
