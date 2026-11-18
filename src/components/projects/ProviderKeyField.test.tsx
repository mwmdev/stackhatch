import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { AiProviderId } from "@/lib/ai/providers";
import type { ProviderKeyManager, ProviderKeyStatus } from "@/lib/provider-key";
import ProviderKeyField from "./ProviderKeyField";

function setup(
  keys: Partial<Record<AiProviderId, ProviderKeyStatus["state"]>>,
  options: { selectFails?: boolean } = {}
) {
  const keyManager = {
    getStatus: vi.fn(async (provider: AiProviderId) => ({
      provider,
      state: keys[provider] ?? "absent",
      generation: "g",
    })),
    useSessionKey: vi.fn(async (provider: AiProviderId) => ({
      provider,
      state: "session",
      generation: "g2",
    })),
  } as unknown as ProviderKeyManager;
  const aiSettings = {
    getAiSelection: vi.fn(async () => ({ provider: "anthropic" as const, model: "m" })),
    selectAiProvider: vi.fn(async (provider: AiProviderId) => {
      if (options.selectFails) throw new Error("denied");
      return { provider, model: "m" };
    }),
  };
  const onReady = vi.fn();
  render(<ProviderKeyField keyManager={keyManager} aiSettings={aiSettings} onReady={onReady} />);
  return { aiSettings, keyManager, onReady };
}

describe("ProviderKeyField", () => {
  it("does not persist or report ready when the select merely changes", async () => {
    const { aiSettings, onReady } = setup({ openai: "remembered" });
    await screen.findByLabelText("Anthropic API key");

    fireEvent.change(screen.getByLabelText("AI provider"), { target: { value: "openai" } });

    await screen.findByRole("button", { name: "Use OpenAI" });
    expect(aiSettings.selectAiProvider).not.toHaveBeenCalled();
    expect(onReady).not.toHaveBeenCalled();
  });

  it("commits the provider and reports ready on an explicit Use action", async () => {
    const { aiSettings, onReady } = setup({ openai: "remembered" });
    await screen.findByLabelText("Anthropic API key");
    fireEvent.change(screen.getByLabelText("AI provider"), { target: { value: "openai" } });

    fireEvent.click(await screen.findByRole("button", { name: "Use OpenAI" }));

    await waitFor(() =>
      expect(onReady).toHaveBeenCalledWith(
        expect.objectContaining({ provider: "openai", state: "remembered" })
      )
    );
    expect(aiSettings.selectAiProvider).toHaveBeenCalledWith("openai");
  });

  it("retargets the key form to a provider without a key", async () => {
    setup({});
    await screen.findByLabelText("Anthropic API key");

    fireEvent.change(screen.getByLabelText("AI provider"), { target: { value: "gemini" } });

    const input = await screen.findByLabelText("Google Gemini API key");
    expect(input).toHaveAttribute("placeholder", "AQ.…");
  });

  it("keeps the typed key and marks the select when the provider cannot be saved", async () => {
    const { keyManager, onReady } = setup({}, { selectFails: true });
    await screen.findByLabelText("Anthropic API key");
    fireEvent.change(screen.getByLabelText("AI provider"), { target: { value: "openai" } });
    const input = await screen.findByLabelText("OpenAI API key");
    fireEvent.change(input, { target: { value: "sk-test-1234567890" } });

    fireEvent.click(screen.getByRole("button", { name: "Use key" }));

    const alert = await screen.findByRole("alert");
    const select = screen.getByLabelText("AI provider");
    expect(select).toHaveAttribute("aria-invalid", "true");
    expect(select).toHaveAttribute("aria-describedby", alert.id);
    expect(screen.getByLabelText("OpenAI API key")).toHaveValue("sk-test-1234567890");
    expect(screen.getByLabelText("OpenAI API key")).not.toHaveAttribute("aria-invalid");
    expect(keyManager.useSessionKey).not.toHaveBeenCalled();
    expect(onReady).not.toHaveBeenCalled();
  });

  it("saves a hosted provider key without resetting the host's selected model", async () => {
    let selection = { provider: "openai" as AiProviderId, model: "custom-model" };
    const aiSettings = {
      getAiSelection: vi.fn(async () => selection),
      selectAiProvider: vi.fn(async (provider: AiProviderId) => {
        selection = { provider, model: "default-model" };
        return selection;
      }),
    };
    const keyManager = {
      getStatus: vi.fn(async (provider: AiProviderId) => ({
        provider,
        state: "absent",
        generation: "",
      })),
      useSessionKey: vi.fn(async (provider: AiProviderId) => ({
        provider,
        state: "session",
        generation: "g",
      })),
    } as unknown as ProviderKeyManager;
    const onReady = vi.fn();
    render(
      <ProviderKeyField
        provider="openai"
        keyManager={keyManager}
        aiSettings={aiSettings}
        onReady={onReady}
      />
    );

    fireEvent.change(await screen.findByLabelText("OpenAI API key"), {
      target: { value: "sk-test-1234567890" },
    });
    expect(screen.queryByLabelText("AI provider")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Use key" }));

    await waitFor(() =>
      expect(onReady).toHaveBeenCalledWith(
        expect.objectContaining({ provider: "openai", state: "session" })
      )
    );
    expect(aiSettings.selectAiProvider).not.toHaveBeenCalled();
    expect(selection).toEqual({ provider: "openai", model: "custom-model" });
    expect(screen.queryByLabelText("OpenAI API key")).not.toBeInTheDocument();
  });

  it("refreshes the fixed provider without carrying input or stale save results across a switch", async () => {
    const { promise: savedKey, resolve: finishSave } = Promise.withResolvers<ProviderKeyStatus>();
    const keyManager = {
      getStatus: vi.fn(async (provider: AiProviderId) => ({
        provider,
        state: provider === "gemini" ? "remembered" : "absent",
        generation: "g",
      })),
      useSessionKey: vi.fn(() => savedKey),
    } as unknown as ProviderKeyManager;
    const aiSettings = {
      getAiSelection: vi.fn(async () => ({ provider: "anthropic" as const, model: "m" })),
      selectAiProvider: vi.fn(async (provider: AiProviderId) => ({ provider, model: "m" })),
    };
    const onReady = vi.fn();
    const { rerender } = render(
      <ProviderKeyField
        provider="openai"
        keyManager={keyManager}
        aiSettings={aiSettings}
        onReady={onReady}
      />
    );
    fireEvent.change(await screen.findByLabelText("OpenAI API key"), {
      target: { value: "sk-test-1234567890" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Use key" }));
    await waitFor(() => expect(keyManager.useSessionKey).toHaveBeenCalled());

    rerender(
      <ProviderKeyField
        provider="gemini"
        keyManager={keyManager}
        aiSettings={aiSettings}
        onReady={onReady}
      />
    );
    await waitFor(() =>
      expect(onReady).toHaveBeenCalledWith(
        expect.objectContaining({ provider: "gemini", state: "remembered" })
      )
    );
    expect(screen.queryByLabelText("Google Gemini API key")).not.toBeInTheDocument();
    finishSave({ provider: "openai", state: "session", generation: "g2" });
    rerender(
      <ProviderKeyField
        provider="anthropic"
        keyManager={keyManager}
        aiSettings={aiSettings}
        onReady={onReady}
      />
    );
    expect(await screen.findByLabelText("Anthropic API key")).toHaveValue("");
    expect(onReady).not.toHaveBeenCalledWith(expect.objectContaining({ provider: "openai" }));
    expect(keyManager.getStatus).toHaveBeenCalledWith("gemini");
  });

  it("does not report a late key save after the provider field is unmounted", async () => {
    const { promise, resolve } = Promise.withResolvers<ProviderKeyStatus>();
    const keyManager = {
      getStatus: vi.fn(async (provider: AiProviderId) => ({
        provider,
        state: provider === "gemini" ? "remembered" : "absent",
        generation: "g",
      })),
      useSessionKey: vi.fn(() => promise),
    } as unknown as ProviderKeyManager;
    const onReady = vi.fn();
    const { rerender } = render(
      <ProviderKeyField key="openai" provider="openai" keyManager={keyManager} onReady={onReady} />
    );
    fireEvent.change(await screen.findByLabelText("OpenAI API key"), {
      target: { value: "sk-test-1234567890" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Use key" }));
    await waitFor(() => expect(keyManager.useSessionKey).toHaveBeenCalledOnce());
    rerender(
      <ProviderKeyField key="gemini" provider="gemini" keyManager={keyManager} onReady={onReady} />
    );
    await waitFor(() =>
      expect(onReady).toHaveBeenCalledWith(expect.objectContaining({ provider: "gemini" }))
    );
    await act(async () => resolve({ provider: "openai", state: "session", generation: "late" }));
    expect(onReady).not.toHaveBeenCalledWith(expect.objectContaining({ provider: "openai" }));
    expect(screen.queryByLabelText("Google Gemini API key")).not.toBeInTheDocument();
  });
});
