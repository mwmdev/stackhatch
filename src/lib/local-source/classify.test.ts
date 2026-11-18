import { describe, expect, it } from "vitest";
import { classifyDirectory, classifyFile, languageForPath } from "./classify";

describe("classifyDirectory", () => {
  it("is case-insensitive and ignores ordinary names", () => {
    expect(classifyDirectory("Node_Modules")).toBe("dependency");
    expect(classifyDirectory(".git")).toBe("version-control");
    expect(classifyDirectory("src")).toBeNull();
    expect(classifyDirectory("constructor")).toBeNull();
  });
});

describe("classifyFile", () => {
  it("applies the first matching rule", () => {
    expect(classifyFile("package-lock.json", 10)).toEqual({ excluded: "lockfile" });
    expect(classifyFile(".env", 10)).toEqual({ excluded: "secret" });
    expect(classifyFile("app/.env.production", 10)).toEqual({ excluded: "secret" });
    expect(classifyFile(".env.example", 10)).toEqual({ language: "text" });
    expect(classifyFile("keys/server.pem", 10)).toEqual({ excluded: "secret" });
    expect(classifyFile("config/secrets.yml", 10)).toEqual({ excluded: "secret" });
    expect(classifyFile("dist/app.min.js", 10)).toEqual({ excluded: "minified" });
    expect(classifyFile("app.js.map", 10)).toEqual({ excluded: "generated" });
    expect(classifyFile("logo.png", 10)).toEqual({ excluded: "binary" });
    expect(classifyFile("big.ts", 3 * 1024 * 1024)).toEqual({ excluded: "too-large" });
    expect(classifyFile("notes.weird", 10)).toEqual({ excluded: "unrecognized" });
    expect(classifyFile("a/../b.ts", 10)).toEqual({ excluded: "unsupported-name" });
    expect(classifyFile("x".repeat(513) + ".ts", 10)).toEqual({ excluded: "unsupported-name" });
  });

  it("maps languages", () => {
    expect(languageForPath("a.tsx")).toBe("typescript");
    expect(languageForPath("a.mjs")).toBe("javascript");
    expect(languageForPath("a.phtml")).toBe("php");
    expect(languageForPath("a.pyi")).toBe("python");
    expect(languageForPath("a.rs")).toBe("rust");
    expect(languageForPath("docs/Dockerfile")).toBe("text");
    expect(languageForPath("Dockerfile.dev")).toBe("text");
    expect(languageForPath("a.md")).toBe("text");
    expect(classifyFile("go.mod", 10)).toEqual({ language: "text" });
    expect(classifyFile("prisma/schema.prisma", 10)).toEqual({ language: "text" });
    expect(languageForPath("a.zzz")).toBeNull();
  });
});
