# Changelog

All notable changes to StackHatch are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## Unreleased

## 1.0.0 - 2026-10-20

First public release: a free, open-source, local-first architecture-map editor that runs entirely in
the browser.

### Added

- **Ways to start:** a blank canvas with no key or network request, a Markdown or text requirements
  file, or a GitHub repository. Public repositories need no token; private repositories use a
  fine-grained, read-only GitHub token.
- **Architecture workspace:** typed nodes and Note nodes you can create, edit, lock, move, and
  connect; manually chosen connection sides that survive moves, auto-layout, reloads, exports, and
  restores; auto-layout that preserves locked positions; custom subtypes.
- **AI assistant (bring your own key):** Anthropic, OpenAI, Google Gemini, and OpenRouter, called
  directly from the browser. Ask questions about the map with streamed answers, attach Markdown or
  text files (up to 200 KB) to messages, compare alternatives for a component, and generate a
  Markdown PRD. AI edits are validated before they are applied, and a failed run keeps the
  previous map.
- **Repository maps:** bounded evidence from the GitHub REST API, the scanned revision recorded with
  the map, partial-scan warnings, and explicit re-scan and replace.
- **Exports and backups:** PNG, SVG, JSON, YAML, and Markdown exports; checksummed per-map and
  full-workspace backups with a preview before an atomic restore.
- **Local-first storage:** maps, chat, repository evidence, and preferences live in IndexedDB in the
  current browser profile. Revisioned writes and cross-tab coordination surface conflicts instead of
  overwriting newer work. Settings shows storage status and can clear all local data.
- **Credentials:** provider keys and the GitHub token stay in session memory by default; remembering
  one on the device is an explicit, reversible choice. Credentials are never included in backups.
- **Interface:** light and dark themes, a mobile-ready layout, keyboard support, and automated
  WCAG 2.2 AA checks. The landing page includes a captioned two-minute product tour.
- **Self-hosting:** a static export served by a digest-pinned Caddy container, with a generated
  Content Security Policy that allows connections only to the app itself, GitHub, and the four AI
  providers.

### Security

- No accounts, server database, analytics, cookies, or StackHatch API. The production host serves
  static first-party assets only.
- GitHub content and imported backups are treated as untrusted input and strictly validated.
