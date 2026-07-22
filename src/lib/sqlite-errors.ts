export function sqliteErrorCode(error: unknown): string | null {
  if (typeof error !== "object" || error === null || !("code" in error)) return null;
  return String((error as { code?: unknown }).code);
}

export function isSqliteBusyError(error: unknown): boolean {
  const code = sqliteErrorCode(error);
  return code === "SQLITE_BUSY" || code === "SQLITE_LOCKED";
}
