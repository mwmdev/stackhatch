import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
});
