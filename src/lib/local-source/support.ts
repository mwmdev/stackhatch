/** True in a browser that can read a user-picked local folder. */
export function isLocalSourceSupported(): boolean {
  return typeof window !== "undefined" && typeof window.showDirectoryPicker === "function";
}
