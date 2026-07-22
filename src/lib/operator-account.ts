import { deleteAccountById, type AccountDeletionCounts } from "@/lib/account-deletion";
import {
  assertCurrentOperatorSchema,
  openOperatorDatabaseFile,
  requireOperatorPragmas,
  revalidateOperatorDatabase,
  type OperatorDatabase,
} from "@/lib/operator-database";
import { isSqliteBusyError } from "@/lib/sqlite-errors";

export type { OperatorDatabase } from "@/lib/operator-database";
export { assertCurrentOperatorSchema, revalidateOperatorDatabase } from "@/lib/operator-database";

export type AccountSelector = { id: string } | { githubId: string } | { email: string };

export interface AccountPreviewCandidate {
  internalId: string;
  githubId: string;
  email: string | null;
  deletionConfirmation: string;
  counts: AccountDeletionCounts;
}

export interface AccountPreview {
  databaseFingerprint: string;
  confirmationFormat: "DELETE {databaseFingerprint} {internalId}";
  candidates: AccountPreviewCandidate[];
}

export type ManageAccountArgs =
  | { command: "preview"; database: string; selector: AccountSelector }
  | { command: "delete"; database: string; id: string; confirmation: string };

function asOperatorError(error: unknown, action: string): Error {
  if (isSqliteBusyError(error)) {
    return new Error(
      `The database is busy or locked while ${action}. Stop StackHatch and every other SQLite writer, then retry during the maintenance window.`
    );
  }
  return error instanceof Error ? error : new Error(`Unable to ${action}`);
}

export function openOperatorDatabase(databasePath: string): OperatorDatabase {
  return openOperatorDatabaseFile(databasePath, { requireCurrentSchema: true });
}

export function openOperatorMigrationDatabase(databasePath: string): OperatorDatabase {
  return openOperatorDatabaseFile(databasePath, { requireCurrentSchema: false });
}

function redactOpaque(value: string): string {
  const visibleCount = value.length <= 1 ? 0 : value.length >= 5 ? 4 : 1;
  const visible = visibleCount === 0 ? "" : value.slice(-visibleCount);
  return `${"*".repeat(Math.max(3, value.length - visible.length))}${visible}`;
}

function redactEmail(value: string | null): string | null {
  if (!value) return null;
  const at = value.indexOf("@");
  if (at < 1) return "***";
  return `${value[0]}${"*".repeat(Math.max(3, at - 1))}${value.slice(at)}`;
}

interface CandidateRow {
  internalId: string;
  githubId: string;
  email: string | null;
  users: number;
  projects: number;
  messages: number;
  templates: number;
  settings: number;
  projectState: number;
}

function selectorSql(selector: AccountSelector): { clause: string; value: string } {
  if ("id" in selector) return { clause: "u.id = ?", value: selector.id };
  if ("githubId" in selector) return { clause: "u.github_id = ?", value: selector.githubId };
  return { clause: "u.email = ?", value: selector.email };
}

export function previewAccounts(
  operator: OperatorDatabase,
  selector: AccountSelector
): AccountPreview {
  requireOperatorPragmas(operator.db);
  assertCurrentOperatorSchema(operator.db);
  const exact = selectorSql(selector);

  try {
    const rows = operator.db.$client
      .prepare(
        `SELECT
           u.id AS internalId,
           u.github_id AS githubId,
           u.email AS email,
           1 AS users,
           (SELECT COUNT(*) FROM projects p WHERE p.user_id = u.id) AS projects,
           (SELECT COUNT(*) FROM messages m
              INNER JOIN projects p ON p.id = m.project_id
              WHERE p.user_id = u.id) AS messages,
           (SELECT COUNT(*) FROM templates t WHERE t.user_id = u.id) AS templates,
           (SELECT COUNT(*) FROM user_settings s WHERE s.user_id = u.id) AS settings,
           (SELECT COUNT(*) FROM user_project_state ps WHERE ps.user_id = u.id) AS projectState
         FROM users u
         WHERE ${exact.clause}
         ORDER BY u.id`
      )
      .all(exact.value) as CandidateRow[];

    return {
      databaseFingerprint: operator.databaseFingerprint,
      confirmationFormat: "DELETE {databaseFingerprint} {internalId}",
      candidates: rows.map((row) => ({
        internalId: row.internalId,
        githubId: redactOpaque(row.githubId),
        email: redactEmail(row.email),
        deletionConfirmation: buildDeletionConfirmation(
          operator.databaseFingerprint,
          row.internalId
        ),
        counts: {
          users: row.users,
          projects: row.projects,
          messages: row.messages,
          templates: row.templates,
          settings: row.settings,
          projectState: row.projectState,
        },
      })),
    };
  } catch (error) {
    throw asOperatorError(error, "previewing the account");
  }
}

export function buildDeletionConfirmation(databaseFingerprint: string, internalId: string) {
  return `DELETE ${databaseFingerprint} ${internalId}`;
}

export function deleteOperatorAccount(
  operator: OperatorDatabase,
  internalId: string,
  confirmation: string
) {
  const expected = buildDeletionConfirmation(operator.databaseFingerprint, internalId);
  if (confirmation !== expected) {
    throw new Error(
      "The confirmation does not exactly match the selected database fingerprint and internal user ID"
    );
  }

  const preview = previewAccounts(operator, { id: internalId });
  if (preview.candidates.length === 0) {
    throw new Error(`No user exists for internal ID ${internalId}`);
  }
  // Revalidate as close as possible to the destructive transaction so preview work cannot widen
  // the confirmation window for an in-place database replacement.
  revalidateOperatorDatabase(operator);

  try {
    const result = deleteAccountById(operator.db, internalId);
    if (!result.deleted) {
      throw new Error(`No user exists for internal ID ${internalId}`);
    }
    return {
      databaseFingerprint: operator.databaseFingerprint,
      internalId,
      deleted: true as const,
      counts: result.counts,
    };
  } catch (error) {
    throw asOperatorError(error, "deleting the account");
  }
}

function parseOptions(args: string[]) {
  const options = new Map<string, string>();
  for (let index = 0; index < args.length; index += 2) {
    const option = args[index];
    const value = args[index + 1];
    if (!option?.startsWith("--")) throw new Error(`Unexpected argument: ${option ?? ""}`);
    if (!["--database", "--id", "--github-id", "--email", "--confirm"].includes(option)) {
      throw new Error(`Unknown option: ${option}`);
    }
    if (value === undefined || value.startsWith("--"))
      throw new Error(`${option} requires a value`);
    if (options.has(option)) throw new Error(`${option} may be provided only once`);
    options.set(option, value);
  }
  return options;
}

export function parseManageAccountArgs(args: string[]): ManageAccountArgs {
  const [command, ...rest] = args;
  if (command !== "preview" && command !== "delete") {
    throw new Error("Expected account command: preview or delete");
  }
  const options = parseOptions(rest);
  const database = options.get("--database");
  if (!database) throw new Error("--database is required");

  if (command === "delete") {
    const id = options.get("--id");
    if (!id || options.has("--github-id") || options.has("--email")) {
      throw new Error("delete requires --id and does not accept --github-id or --email");
    }
    const confirmation = options.get("--confirm");
    if (!confirmation) throw new Error("delete requires --confirm");
    return { command, database, id, confirmation };
  }

  if (options.has("--confirm")) throw new Error("preview does not accept --confirm");
  const selectors = [
    options.has("--id") ? ({ id: options.get("--id")! } as const) : null,
    options.has("--github-id") ? ({ githubId: options.get("--github-id")! } as const) : null,
    options.has("--email") ? ({ email: options.get("--email")! } as const) : null,
  ].filter((selector): selector is AccountSelector => selector !== null);
  if (selectors.length !== 1) {
    throw new Error("preview requires exactly one of --id, --github-id, or --email");
  }
  return { command, database, selector: selectors[0] };
}

export function executeManageAccount(args: string[]) {
  const parsed = parseManageAccountArgs(args);
  const operator = openOperatorDatabase(parsed.database);
  try {
    if (parsed.command === "preview") return previewAccounts(operator, parsed.selector);
    return deleteOperatorAccount(operator, parsed.id, parsed.confirmation);
  } finally {
    operator.close();
  }
}
