# Public repository architecture evaluation

This launch fixture exercises StackHatch's real bounded GitHub analyzer and production architecture
prompt against two public repositories with inspectable architectures. The generated result is then
reviewed manually against source at the exact recorded commit.

## 14 July 2026 result

| Repository              | Analysis | Main-component coverage | Unsupported components | Incorrect connections |
| ----------------------- | -------- | ----------------------: | ---------------------: | --------------------: |
| `pocketbase/pocketbase` | complete |              7/7 (100%) |                   0/13 |                  7/15 |
| `umami-software/umami`  | partial  |              8/8 (100%) |                   1/11 |                  2/10 |
| **Combined**            | —        |        **15/15 (100%)** |               **1/24** |              **9/25** |

The fixture supports the intentionally narrow launch claim that StackHatch provides a generated
visual overview of the main pieces. It does not support a claim of source-verification or exact
dependency/protocol accuracy. The product therefore keeps every map editable and labels generated
repository maps as “not verified source truth.”

The most common remaining error is representing in-process relationships with a network protocol
when the current edge vocabulary has no in-process connection type. PocketBase also exposed an SSE
versus WebSocket error. Umami exposed one unsupported object-storage inference from an ambiguous
`storage.ts` filename. Those misses are recorded rather than hidden so future analyzer changes can
be compared against the same revisions.

## Reproduce

```bash
ANTHROPIC_API_KEY=... npm run eval:repositories
```

The command prints raw model output for review and never logs the key. Set
`STACKHATCH_EVAL_MODEL` to one of the application's supported model IDs to compare a different
model. Manual scoring lives in [`public-repositories.json`](./public-repositories.json).

## Review method

1. Run the analyzer with its production tree, README, evidence-file, character, and timeout limits.
2. Generate a map with the production system prompt and a low-effort model budget.
3. Pin the repository default-branch commit and record complete/partial analysis status.
4. Compare expected main deployable components with generated components.
5. Inspect every questionable component and relationship in the pinned public source.
6. Record unsupported components and incorrect connections separately; do not count a clearly
   labelled optional component as unsupported when code/configuration evidence exists.

Manual checks for this fixture included PocketBase's pinned
[`apis/realtime.go`](https://github.com/pocketbase/pocketbase/blob/089ca8ae412a1dbe29d2ae90d74f3866429d9c52/apis/realtime.go),
Umami's pinned
[`src/lib/storage.ts`](https://github.com/umami-software/umami/blob/af1b6c6efcadd65136a9ec3db6b8ec20962a8a69/src/lib/storage.ts),
and Umami's pinned
[`src/lib/clickhouse.ts`](https://github.com/umami-software/umami/blob/af1b6c6efcadd65136a9ec3db6b8ec20962a8a69/src/lib/clickhouse.ts).
