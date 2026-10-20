import { describe, expect, it } from "vitest";
import {
  ChatAttachmentError,
  composeAttachedMessage,
  MAX_CHAT_ATTACHMENT_BYTES,
  parseAttachedMessage,
  readChatAttachment,
} from "./chat-attachment";

describe("attached messages", () => {
  it("returns the typed text and the file untouched, even when the file contains the closing tag", () => {
    const content = "# PRD\n\nUse </attached_file> as a delimiter?\n\n- Local first";
    const message = composeAttachedMessage("Draft a map", { name: "prd.md", content });

    expect(parseAttachedMessage(message)).toEqual({
      text: "Draft a map",
      attachment: { name: "prd.md", content },
    });
  });

  it("asks for the map to be built from the file when no text was typed", () => {
    const message = composeAttachedMessage("  ", { name: "prd.md", content: "# PRD" });

    expect(parseAttachedMessage(message).text).toMatch(/requirements/);
  });

  it("leaves a message without a file alone", () => {
    expect(composeAttachedMessage("  Hello ", null)).toBe("Hello");
    expect(parseAttachedMessage("Hello")).toEqual({ text: "Hello", attachment: null });
  });
});

describe("readChatAttachment", () => {
  it("reads a text file and keeps quotes and line breaks out of its name", async () => {
    const file = new File(["# PRD\n"], 'my "prd".md', { type: "text/markdown" });

    await expect(readChatAttachment(file)).resolves.toEqual({
      name: "my _prd_.md",
      content: "# PRD",
    });
  });

  it.each([
    ["a file type that is not Markdown or text", new File(["x"], "prd.pdf")],
    ["a file over the size limit", new File(["x".repeat(MAX_CHAT_ATTACHMENT_BYTES + 1)], "prd.md")],
    ["an empty file", new File(["  \n"], "prd.md")],
  ])("rejects %s", async (_label, file) => {
    await expect(readChatAttachment(file)).rejects.toBeInstanceOf(ChatAttachmentError);
  });

  it("accepts a file exactly at the size limit", async () => {
    const file = new File(["x".repeat(MAX_CHAT_ATTACHMENT_BYTES)], "prd.txt");

    await expect(readChatAttachment(file)).resolves.toMatchObject({ name: "prd.txt" });
  });
});
