import { describe, expect, it } from "vitest";
import { sanitizeHtml } from "./sanitize-html";

describe("sanitizeHtml", () => {
  it.each([
    ["https://example.com/docs", "https://example.com/docs"],
    ["http://example.com/docs", "http://example.com/docs"],
    ["docs", "docs"],
    ["/docs", "/docs"],
    ["./docs", "./docs"],
    ["../docs", "../docs"],
    ["?tab=security", "?tab=security"],
    ["#links", "#links"],
    ["  ../docs  ", "../docs"],
  ])("preserves the allowed web destination %j", (href, expected) => {
    const container = document.createElement("div");
    container.innerHTML = sanitizeHtml(`<a href="${href}">docs</a>`);

    const anchor = container.querySelector("a");
    expect(anchor).toHaveAttribute("href", expected);
    expect(anchor).toHaveAttribute("target", "_blank");
    expect(anchor).toHaveAttribute("rel", "noopener noreferrer");
  });

  it.each([
    "",
    "//example.com/docs",
    String.raw`https:\\example.com\docs`,
    String.raw`\javascript:alert(1)`,
    "https://user@example.com/docs",
    "https://user:password@example.com/docs",
    "http://[",
    "javascript:alert(1)",
    "data:text/html,x",
    "vbscript:msgbox(1)",
    "file:///etc/passwd",
    "blob:https://example.com/id",
    "custom:open",
    "java\nscript:alert(1)",
    "java\tscript:alert(1)",
  ])("removes the rejected destination %j", (href) => {
    const container = document.createElement("div");
    const anchor = document.createElement("a");
    anchor.setAttribute("href", href);
    anchor.textContent = "docs";
    container.innerHTML = sanitizeHtml(anchor.outerHTML);

    const sanitizedAnchor = container.querySelector("a");
    expect(sanitizedAnchor).not.toHaveAttribute("href");
    expect(sanitizedAnchor).toHaveAttribute("target", "_blank");
    expect(sanitizedAnchor).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("strips scripts and disallowed attributes while retaining allowed content", () => {
    const sanitized = sanitizeHtml(
      '<script>alert("x")</script><a href="../docs" title="Docs" onclick="steal()" data-secret="x">safe</a>'
    );
    const container = document.createElement("div");
    container.innerHTML = sanitized;

    expect(container.querySelector("script")).not.toBeInTheDocument();
    expect(container).toHaveTextContent('alert("x")safe');
    const anchor = container.querySelector("a");
    expect(anchor).toHaveAttribute("href", "../docs");
    expect(anchor).toHaveAttribute("title", "Docs");
    expect(anchor).not.toHaveAttribute("onclick");
    expect(anchor).not.toHaveAttribute("data-secret");
    expect(anchor).toHaveAttribute("target", "_blank");
    expect(anchor).toHaveAttribute("rel", "noopener noreferrer");
  });
});
