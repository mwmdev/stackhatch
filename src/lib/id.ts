export function createId() {
  return globalThis.crypto.randomUUID();
}
