const ALLOWED_TAGS = new Set(["a", "b", "i", "em", "strong", "code", "br", "span"]);

const ALLOWED_ATTRS: Record<string, Set<string>> = {
  a: new Set(["href", "title"]),
};

const URL_VALIDATION_BASE = "https://stackhatch.invalid/";

function sanitizeHref(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed || trimmed.includes("\\") || trimmed.startsWith("//")) return null;

  try {
    const parsed = new URL(trimmed, URL_VALIDATION_BASE);
    if (parsed.username || parsed.password) return null;
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return trimmed;
  } catch {
    return null;
  }
}

function sanitizeNode(node: Node, doc: Document): Node | null {
  if (node.nodeType === Node.TEXT_NODE) {
    return doc.createTextNode(node.textContent ?? "");
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return null;

  const el = node as Element;
  const tag = el.tagName.toLowerCase();

  if (!ALLOWED_TAGS.has(tag)) {
    // Unwrap: keep children, drop the tag
    const fragment = doc.createDocumentFragment();
    for (const child of Array.from(el.childNodes)) {
      const cleaned = sanitizeNode(child, doc);
      if (cleaned) fragment.appendChild(cleaned);
    }
    return fragment;
  }

  const newEl = doc.createElement(tag);

  // Copy allowed attributes
  const allowedForTag = ALLOWED_ATTRS[tag];
  if (allowedForTag) {
    for (const attr of Array.from(el.attributes)) {
      if (!allowedForTag.has(attr.name)) continue;
      if (attr.name === "href") {
        const href = sanitizeHref(attr.value);
        if (href !== null) newEl.setAttribute("href", href);
      } else {
        newEl.setAttribute(attr.name, attr.value);
      }
    }
  }

  // Force safe link behavior
  if (tag === "a") {
    newEl.setAttribute("target", "_blank");
    newEl.setAttribute("rel", "noopener noreferrer");
  }

  // Recurse into children
  for (const child of Array.from(el.childNodes)) {
    const cleaned = sanitizeNode(child, doc);
    if (cleaned) newEl.appendChild(cleaned);
  }

  return newEl;
}

export function sanitizeHtml(html: string): string {
  if (!html || !html.includes("<")) return html;

  const parser = new DOMParser();
  const parsed = parser.parseFromString(`<body>${html}</body>`, "text/html");
  const doc = document.implementation.createHTMLDocument("");
  const container = doc.createElement("div");

  for (const child of Array.from(parsed.body.childNodes)) {
    const cleaned = sanitizeNode(child, doc);
    if (cleaned) container.appendChild(cleaned);
  }

  return container.innerHTML;
}

export function containsHtml(text: string): boolean {
  return /<[a-z][\s\S]*>/i.test(text);
}
