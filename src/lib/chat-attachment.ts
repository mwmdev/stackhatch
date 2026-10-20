import { isAcceptedRequirementsFile } from "@/lib/requirements-file";

/**
 * A stored string over 1,000,000 characters fails backup validation, and the
 * message and its provider-run record both carry the file. UTF-16 length never
 * exceeds the byte length, so a byte cap also caps characters.
 */
export const MAX_CHAT_ATTACHMENT_BYTES = 200_000;

export interface ChatAttachment {
  name: string;
  content: string;
}

export class ChatAttachmentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ChatAttachmentError";
  }
}

const DEFAULT_ATTACHMENT_REQUEST = "Use the attached file as requirements for this map.";
const OPEN_TAG = '<attached_file name="';
const CLOSE_TAG = "</attached_file>";
// The block always ends the message, so a closing tag inside the file is not the end.
const ATTACHED_MESSAGE =
  /^([\s\S]*?)\n*<attached_file name="([^"\n]*)">\n([\s\S]*)\n<\/attached_file>$/;

// FileReader rather than Blob.text(), which jsdom does not implement.
function readAsText(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

export async function readChatAttachment(file: File): Promise<ChatAttachment> {
  if (!isAcceptedRequirementsFile(file)) {
    throw new ChatAttachmentError("Attach a Markdown (.md) or text (.txt) file.");
  }
  if (file.size > MAX_CHAT_ATTACHMENT_BYTES) {
    throw new ChatAttachmentError("That file is too large. Attach a file no larger than 200 KB.");
  }
  let content: string;
  try {
    content = (await readAsText(file)).trim();
  } catch {
    throw new ChatAttachmentError("The file could not be read. Try another file.");
  }
  if (!content) throw new ChatAttachmentError("That file is empty.");
  return { name: file.name.replace(/["\r\n]/g, "_"), content };
}

/** The message sent to the provider and stored in the thread. */
export function composeAttachedMessage(text: string, attachment: ChatAttachment | null) {
  const message = text.trim();
  if (!attachment) return message;
  return `${message || DEFAULT_ATTACHMENT_REQUEST}\n\n${OPEN_TAG}${attachment.name}">\n${attachment.content}\n${CLOSE_TAG}`;
}

/** Splits a stored message back into what the user typed and the file they attached. */
export function parseAttachedMessage(content: string): {
  text: string;
  attachment: ChatAttachment | null;
} {
  const match = ATTACHED_MESSAGE.exec(content);
  if (!match) return { text: content, attachment: null };
  return { text: match[1], attachment: { name: match[2], content: match[3] } };
}
