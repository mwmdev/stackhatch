import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  DEVICE_RECORD_ID,
  VAULT_META_ID,
  VAULT_SCHEMA_VERSION,
  VAULT_STORE_NAMES,
  type VaultDevicePreferencesRecord,
  type VaultProjectRecord,
  type VaultProviderRunRecord,
} from "./schema";

describe("vault schema", () => {
  it("defines only account-free stores and singleton device records", () => {
    expect(VAULT_SCHEMA_VERSION).toBe(2);
    expect(VAULT_STORE_NAMES).toEqual([
      "meta",
      "projects",
      "messages",
      "templates",
      "preferences",
      "resume",
      "repositoryEvidence",
      "repositoryProvenance",
      "providerRuns",
    ]);
    expect(VAULT_STORE_NAMES).not.toContain("users");
    expect(DEVICE_RECORD_ID).toBe("device");
    expect(VAULT_META_ID).toBe("vault");
  });

  it("keeps project, preference, and provider-draft roots free of ownership and credentials", () => {
    const project: VaultProjectRecord = {
      id: "project-1",
      name: "Local map",
      description: null,
      repoUrl: null,
      canvasState: null,
      revision: 1,
      createdAt: 1,
      updatedAt: 1,
    };
    const preferences: VaultDevicePreferencesRecord = {
      id: DEVICE_RECORD_ID,
      model: "claude-sonnet-5",
      theme: "system",
      customSubtypes: {},
      editorDisplay: {},
      revision: 1,
      createdAt: 1,
      updatedAt: 1,
    };
    const providerRun: VaultProviderRunRecord = {
      id: "run-1",
      projectId: project.id,
      kind: "chat",
      status: "draft",
      prompt: "Retry this request",
      model: null,
      requestId: null,
      errorCode: null,
      expectedProjectRevision: 1,
      expectedVaultGeneration: "generation-1",
      revision: 1,
      createdAt: 1,
      updatedAt: 1,
    };

    for (const record of [project, preferences, providerRun]) {
      expect(Object.keys(record)).not.toEqual(
        expect.arrayContaining([
          "user",
          "users",
          "userId",
          "profile",
          "anthropicApiKey",
          "providerCredentials",
        ])
      );
    }
    expect(providerRun).not.toHaveProperty("stream");
    expect(providerRun).not.toHaveProperty("partialOutput");
  });

  it("keeps the vault layer independent from UI, server database, auth, and provider modules", () => {
    const vaultFiles = [
      "schema.ts",
      "indexed-db.ts",
      "repository.ts",
      "coordination.ts",
      "storage-status.ts",
    ];
    let schemaSource = "";

    for (const filename of vaultFiles) {
      const source = readFileSync(fileURLToPath(new URL(filename, import.meta.url)), "utf8");
      if (filename === "schema.ts") schemaSource = source;
      expect(source).not.toMatch(
        /from\s+["']@\/(?:app|components|db|lib\/ai|lib\/auth|lib\/secrets)(?:\/|["'])/
      );
    }

    expect(schemaSource).not.toMatch(
      /\b(?:user|users|userId|profile|anthropicApiKey|providerCredentials)\s*[?:]/
    );
  });
});
