export const ACCEPTED_REQUIREMENT_FILES = [".md", ".txt"];
export const MAX_REQUIREMENTS_FILE_BYTES = 1_000_000;
export const MAX_REQUIREMENTS_CHARACTERS = 1_000_000;

export function isAcceptedRequirementsFile(file: File) {
  const name = file.name.toLowerCase();
  return ACCEPTED_REQUIREMENT_FILES.some((extension) => name.endsWith(extension));
}
