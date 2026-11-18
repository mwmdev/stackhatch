import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Blob as NodeBlob } from "node:buffer";
import { describe, expect, it, vi } from "vitest";
import type { ProviderKeyManager } from "@/lib/provider-key";
import { fakeDirectory } from "@/test/fake-directory";
import * as generation from "@/lib/local-source/generation";
import { buildSystemPrompt } from "@/lib/ai/system-prompt";
import type { CustomSubtypesMap } from "@/lib/custom-subtypes";
import SourceReviewDialog from "./SourceReviewDialog";

function setup(
  files: Record<string, string>,
  excluded: string[] = [],
  handle = fakeDirectory(files),
  options: {
    replacesMap?: boolean;
    customSubtypes?: CustomSubtypesMap;
    failSubtypes?: boolean;
  } = {}
) {
  const aiSettings = {
    getAiSelection: vi.fn(async () => ({
      provider: "anthropic" as const,
      model: "claude-haiku-4-5-20251001",
    })),
    getCustomSubtypes: vi.fn(async () => {
      if (options.failSubtypes) throw new Error("unavailable");
      return options.customSubtypes ?? {};
    }),
    selectAiProvider: vi.fn(),
    selectAiModel: vi.fn(async (selection) => selection),
  };
  const onApprove = vi.fn();
  const onCancel = vi.fn();
  const keyManager = {
    getStatus: vi.fn(async (provider) => ({ provider, state: "session", generation: "key" })),
  } as unknown as ProviderKeyManager;
  render(
    <SourceReviewDialog
      source={{ kind: "local", handle }}
      initialExcludedPaths={excluded}
      replacesMap={options.replacesMap ?? false}
      aiSettings={aiSettings}
      keyManager={keyManager}
      onCancel={onCancel}
      onApprove={onApprove}
    />
  );
  return { aiSettings, onApprove, onCancel };
}

function githubSetup(options: { missing?: boolean; remaining?: number } = {}) {
  let token = "";
  const keyManager = {
    getStatus: vi.fn(async (provider: string) => ({
      provider,
      state: provider === "github" && !token ? "absent" : "session",
      generation: "key",
    })),
    getKeyForDispatch: vi.fn(async () => token),
    useSessionKey: vi.fn(async (provider: string, value: string) => {
      token = value;
      return { provider, state: "session", generation: "key" };
    }),
  } as unknown as ProviderKeyManager;
  const githubFetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const authenticated = new Headers(init?.headers).has("Authorization");
    let body: unknown = {};
    let status = 200;
    if (options.missing && url.pathname === "/repos/acme/billing") status = 404;
    else if (url.pathname.endsWith("/languages")) body = { TypeScript: 1 };
    else if (url.pathname.endsWith("/commits/main")) body = { sha: "abc123", commit: { tree: { sha: "root" } } };
    else if (url.pathname.endsWith("/git/trees/root")) body = { tree: [
      { path: "src/server.ts", type: "blob", sha: "server", size: 18 },
      { path: "web/app.tsx", type: "blob", sha: "web", size: 12 },
    ] };
    else if (url.pathname.endsWith("/git/blobs/server")) body = { encoding: "base64", content: btoa("export const x = 1") };
    else if (url.pathname.endsWith("/git/blobs/web")) body = { encoding: "base64", content: btoa("web content") };
    else if (url.pathname === "/rate_limit") body = { resources: { core: { limit: authenticated ? 5000 : 60, remaining: authenticated ? 4999 : (options.remaining ?? 50), reset: 1794989321 } } };
    else body = { default_branch: "main" };
    return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  });
  const onApprove = vi.fn();
  render(<SourceReviewDialog
    source={{ kind: "github", repositoryUrl: options.missing ? "acme/billing" : "acme/app" }}
    initialExcludedPaths={[]}
    replacesMap={false}
    aiSettings={{
      getAiSelection: vi.fn(async () => ({ provider: "anthropic" as const, model: "claude-haiku-4-5-20251001" })),
      getCustomSubtypes: vi.fn(async () => ({})),
      selectAiProvider: vi.fn(),
      selectAiModel: vi.fn(async (selection) => selection),
    }}
    keyManager={keyManager}
    githubFetch={githubFetch as typeof fetch}
    onCancel={vi.fn()}
    onApprove={onApprove}
  />);
  return { githubFetch, onApprove };
}

describe("GitHub source review", () => {
  it("blocks over-quota selections and relists after adding a token", async () => {
    const { githubFetch } = githubSetup({ remaining: 1 });
    expect(await screen.findByText(/This selection needs 2 GitHub requests/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Generate map" })).toBeDisabled();
    fireEvent.change(await screen.findByLabelText("GitHub token"), { target: { value: "github_pat_private" } });
    fireEvent.click(screen.getByRole("button", { name: "Use token" }));
    expect(await screen.findByText(/4999 of 5000 GitHub requests/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Generate map" })).toBeEnabled();
    expect(githubFetch.mock.calls.some(([, init]) => new Headers(init?.headers).get("Authorization") === "Bearer github_pat_private")).toBe(true);
  });

  it("offers a token when the repository cannot be read", async () => {
    githubSetup({ missing: true });
    expect(await screen.findByText(/StackHatch can't read acme\/billing/)).toBeInTheDocument();
    expect(await screen.findByLabelText("GitHub token")).toBeInTheDocument();
  });

  it("approves selected source text and repository provenance", async () => {
    vi.stubGlobal("Blob", NodeBlob);
    try {
      const { onApprove } = githubSetup();
      await screen.findByText(/Reads 2 files from GitHub/);
      fireEvent.click(screen.getByRole("checkbox", { name: /web/i }));
      fireEvent.click(screen.getByRole("button", { name: "Generate map" }));
      await waitFor(() => expect(onApprove).toHaveBeenCalledOnce());
      expect(onApprove).toHaveBeenCalledWith(expect.objectContaining({
        repository: { repositoryUrl: "https://github.com/acme/app", commitSha: "abc123", excludedPaths: ["web"], analysisStatus: "complete", warning: null },
        generation: expect.objectContaining({ context: expect.stringContaining("export const x = 1") }),
      }));
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("SourceReviewDialog", () => {
  it("reports a folder permission failure instead of an empty selection", async () => {
    const handle = fakeDirectory({});
    handle.entries = () => {
      throw new DOMException("Permission lost", "NotAllowedError");
    };
    setup({}, [], handle);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "StackHatch could not read that folder. Check the browser's permission and try again."
    );
    expect(screen.queryByRole("button", { name: "Generate map" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeEnabled();
  });

  it("blocks a selection beyond the model context and lowers the estimate when a folder is unchecked", async () => {
    const { aiSettings, onApprove } = setup({
      "engine/big.ts": "x".repeat(760_000),
      "src/app.ts": "export {};",
    });
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Claude Haiku 4.5 accepts up to 192,000 input tokens"
    );
    expect(screen.getByRole("button", { name: "Generate map" })).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox", { name: "engine/" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Generate map" })).toBeEnabled());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Generate map" }));
    await waitFor(() => expect(onApprove).toHaveBeenCalledOnce());
    expect(aiSettings.selectAiModel).toHaveBeenCalledWith({
      provider: "anthropic",
      model: "claude-haiku-4-5-20251001",
    });
    expect(aiSettings.selectAiModel.mock.invocationCallOrder[0]).toBeLessThan(
      onApprove.mock.invocationCallOrder[0]
    );
    expect(onApprove).toHaveBeenCalledWith(
      expect.objectContaining({
        excludedPaths: ["engine"],
        generation: expect.objectContaining({ citablePaths: ["src/app.ts"] }),
      })
    );
  });

  it("keeps approval disabled when all folders are excluded", async () => {
    setup({ "src/app.ts": "export {};" }, ["src"]);
    expect(await screen.findByText("Nothing selected.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Generate map" })).toBeDisabled();
  });

  it("keeps the dialog open if the selected files all contain likely secrets", async () => {
    const { onApprove } = setup({ "src/key.ts": "-----BEGIN RSA PRIVATE KEY-----" });
    const button = await screen.findByRole("button", { name: "Generate map" });
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(button);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "None of the selected files could be sent."
    );
    expect(onApprove).not.toHaveBeenCalled();
  });

  it("blocks a known model entered with trailing spaces", async () => {
    setup({ "engine/big.ts": "x".repeat(760_000) });
    await screen.findByRole("group", { name: "Folders" });
    fireEvent.change(screen.getByLabelText("Model"), { target: { value: "other" } });
    fireEvent.change(screen.getByLabelText("Model ID"), {
      target: { value: "claude-haiku-4-5-20251001 " },
    });
    expect(await screen.findByText(/Claude Haiku 4.5 accepts up to/)).toBeVisible();
    expect(screen.getByRole("button", { name: "Generate map" })).toBeDisabled();
  });

  it("estimates and pins the loaded custom subtype snapshot", async () => {
    const subtypes: CustomSubtypesMap = {
      services: [{ slug: "special-worker", displayName: "Special worker", icon: "Server" }],
    };
    const estimate = vi.spyOn(generation, "estimateLocalGeneration");
    const { onApprove } = setup({ "src/app.ts": "export {};" }, [], undefined, {
      customSubtypes: subtypes,
    });
    const button = await screen.findByRole("button", { name: "Generate map" });
    await waitFor(() => expect(button).toBeEnabled());
    expect(estimate).toHaveBeenCalledWith(
      expect.objectContaining({
        systemPromptCharacters: buildSystemPrompt(subtypes, { includeNoteNodes: true }).length,
      })
    );
    fireEvent.click(button);
    await waitFor(() =>
      expect(onApprove).toHaveBeenCalledWith(
        expect.objectContaining({
          generation: expect.objectContaining({
            customSubtypes: subtypes,
            selection: { provider: "anthropic", model: "claude-haiku-4-5-20251001" },
          }),
        })
      )
    );
    estimate.mockRestore();
  });

  it("does not approve when subtype settings cannot be read", async () => {
    setup({ "src/app.ts": "export {};" }, [], undefined, { failSubtypes: true });
    expect(await screen.findByText(/Could not load AI settings/)).toBeVisible();
    expect(screen.getByRole("button", { name: "Generate map" })).toBeDisabled();
  });

  it("preserves absent exclusions and blocks more than the allowed count", async () => {
    setup(
      { "src/app.ts": "export {};" },
      Array.from({ length: 5001 }, (_, i) => `gone-${i}`)
    );
    expect(await screen.findByText(/Too many excluded folders/)).toBeVisible();
    expect(screen.getByRole("button", { name: "Generate map" })).toBeDisabled();
  });

  it("blocks the preparation budget even for a custom model", async () => {
    const files = Object.fromEntries(
      Array.from({ length: 9 }, (_, i) => [`src/${i}.ts`, "x".repeat(2_000_000)])
    );
    setup(files);
    await screen.findByRole("group", { name: "Folders" });
    fireEvent.change(screen.getByLabelText("Model"), { target: { value: "other" } });
    fireEvent.change(screen.getByLabelText("Model ID"), { target: { value: "custom-model" } });
    expect(await screen.findByText(/16 MiB preparation budget/)).toBeVisible();
    expect(screen.getByRole("button", { name: "Generate map" })).toBeDisabled();
  });

  it("reports uncapped skipped directories and unreadable entries", async () => {
    const files = Object.fromEntries(
      Array.from({ length: 1001 }, (_, i) => [`dir${i}/node_modules/package.js`, "x"])
    );
    files["unreadable.ts"] = "x";
    const handle = fakeDirectory(files);
    const original = handle.entries.bind(handle);
    handle.entries = async function* (): AsyncGenerator<[string, FileSystemHandle], undefined> {
      for await (const [name, entry] of original()) {
        if (name === "unreadable.ts") {
          (entry as FileSystemFileHandle).getFile = async () => {
            throw new DOMException("Permission denied", "NotAllowedError");
          };
        }
        yield [name, entry];
      }
    };
    setup({}, [], handle);
    expect(await screen.findByText(/Skipped: 1001 folders/)).toBeVisible();
    expect(screen.getByText(/1 unreadable entry was not included/)).toBeVisible();
  });

  it("warns that replacing the map also replaces the Assistant conversation", async () => {
    setup({ "src/app.ts": "export {};" }, [], undefined, { replacesMap: true });
    expect(
      await screen.findByText(/also replaces the existing Assistant conversation/)
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Replace map" })).toBeInTheDocument();
  });

  it("refreshes changed files and requires a new approval", async () => {
    let reads = 0;
    const handle = fakeDirectory({ "app.ts": "x" });
    const original = handle.entries.bind(handle);
    handle.entries = async function* (): AsyncGenerator<[string, FileSystemHandle], undefined> {
      for await (const [name, entry] of original()) {
        if (entry.kind === "file") {
          const file = entry as FileSystemFileHandle;
          const getFile = file.getFile.bind(file);
          file.getFile = async () => {
            reads++;
            if (reads === 2) return new File(["changed"], name);
            return getFile();
          };
        }
        yield [name, entry];
      }
    };
    const { onApprove } = setup({}, [], handle);
    const button = await screen.findByRole("button", { name: "Generate map" });
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(button);
    expect(await screen.findByText(/Review the refreshed folder and approve again/)).toBeVisible();
    expect(onApprove).not.toHaveBeenCalled();
  });
});
