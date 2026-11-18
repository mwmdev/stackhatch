export type LocalSourceErrorCode = "too-many-entries" | "files-changed" | "selection-too-large";

export class LocalSourceError extends Error {
  constructor(
    readonly code: LocalSourceErrorCode,
    message: string
  ) {
    super(message);
    this.name = "LocalSourceError";
  }
}
