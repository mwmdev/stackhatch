import { describe, expect, it } from "vitest";
import { AI_PROVIDERS } from "../src/lib/ai/providers.ts";
import {
  CONNECT_ORIGINS,
  validateDockerfileBaseImages,
  validateEnvironmentIgnoreFiles,
} from "./static-policy.mjs";
import {
  SECRET_VALUE_PATTERNS,
  validateDeployment,
  validateHeaders,
  validateSecurityPolicy,
} from "./static-policy-checks.mjs";
import { createContentSecurityPolicy, createHeadersFile } from "./static-policy.mjs";

const VALID_ENVIRONMENT_POLICY = `
# env files
.env
.env.*
!.env.example
!.env.local.example
`;

const DIGEST = "a".repeat(64);
const VALID_DOCKERFILE = `
FROM node:22-alpine@sha256:${DIGEST} AS builder
FROM caddy:2.10.0-alpine@sha256:${DIGEST} AS runner
`;

describe("validateEnvironmentIgnoreFiles", () => {
  it("accepts deny-by-default policies with only the documented examples", () => {
    expect(
      validateEnvironmentIgnoreFiles(VALID_ENVIRONMENT_POLICY, VALID_ENVIRONMENT_POLICY)
    ).toEqual([]);
  });

  it("rejects the old repository .env.local-only policy", () => {
    expect(
      validateEnvironmentIgnoreFiles(".env.local\n.env*.local\n", VALID_ENVIRONMENT_POLICY)
    ).toEqual(["Repository ignore policy does not deny environment secrets."]);
  });

  it("rejects the old Docker context .env.local-only policy", () => {
    expect(validateEnvironmentIgnoreFiles(VALID_ENVIRONMENT_POLICY, ".env.local\n")).toEqual([
      "Docker context ignore policy does not deny environment secrets.",
    ]);
  });

  it("rejects additional environment-file exceptions", () => {
    const policy = `${VALID_ENVIRONMENT_POLICY}!.env.production\n`;
    expect(validateEnvironmentIgnoreFiles(policy, VALID_ENVIRONMENT_POLICY)).toEqual([
      "Repository ignore policy does not deny environment secrets.",
    ]);
  });
});

describe("validateDockerfileBaseImages", () => {
  it("accepts exactly one tagged and digest-pinned builder and runner", () => {
    expect(validateDockerfileBaseImages(VALID_DOCKERFILE)).toEqual([]);
  });

  it.each([
    [
      `FROM node:22-alpine AS builder\nFROM caddy:2.10.0-alpine@sha256:${DIGEST} AS runner`,
      "Builder base image is not pinned by digest.",
    ],
    [
      `FROM node@sha256:${DIGEST} AS builder\nFROM caddy:2.10.0-alpine@sha256:${DIGEST} AS runner`,
      "Builder base image is not pinned by digest.",
    ],
    [
      `FROM node:22-alpine@sha256:${"A".repeat(64)} AS builder\nFROM caddy:2.10.0-alpine@sha256:${DIGEST} AS runner`,
      "Builder base image is not pinned by digest.",
    ],
    [
      `FROM node:22-alpine@sha256:${"a".repeat(63)} AS builder\nFROM caddy:2.10.0-alpine@sha256:${DIGEST} AS runner`,
      "Builder base image is not pinned by digest.",
    ],
    [
      `FROM caddy:2.10.0-alpine@sha256:${DIGEST} AS runner`,
      "Builder base image is not pinned by digest.",
    ],
    [
      `FROM node:22-alpine@sha256:${DIGEST} AS builder`,
      "Production Caddy base image is not pinned by digest.",
    ],
    [
      `FROM node:22-alpine@sha256:${DIGEST} AS builder\nFROM caddy:2.10.0-alpine AS runner`,
      "Production Caddy base image is not pinned by digest.",
    ],
    [
      `FROM node:22-alpine@sha256:${DIGEST} AS builder\nFROM caddy@sha256:${DIGEST} AS runner`,
      "Production Caddy base image is not pinned by digest.",
    ],
    [
      `FROM node:22-alpine@sha256:${DIGEST} AS builder\nFROM node:22-alpine@sha256:${DIGEST} AS builder\nFROM caddy:2.10.0-alpine@sha256:${DIGEST} AS runner`,
      "Builder base image is not pinned by digest.",
    ],
  ])("rejects an invalid Docker stage", (dockerfile, expectedError) => {
    expect(validateDockerfileBaseImages(dockerfile)).toContain(expectedError);
  });
});

const HASH = `'sha256-${"A".repeat(43)}='`;
const POLICY = createContentSecurityPolicy([HASH]);

describe("independent static security verification", () => {
  it("accepts a constrained generated CSP and rejects unsafe script and connection sources", () => {
    expect(validateSecurityPolicy(POLICY)).toEqual([]);
    expect(
      validateSecurityPolicy(POLICY.replace("script-src 'self'", "script-src 'self' 'unsafe-eval'"))
    ).toContain("CSP script-src must contain only 'self' and sha256 hashes.");
    expect(
      validateSecurityPolicy(POLICY.replace("script-src 'self'", "script-src 'self' *"))
    ).toContain("CSP script-src must contain only 'self' and sha256 hashes.");
    expect(
      validateSecurityPolicy(POLICY.replace("default-src 'none'", "default-src 'self'"))
    ).toContain("CSP default-src must be 'none'.");
    expect(
      validateSecurityPolicy(POLICY.replace("frame-ancestors 'none'", "frame-ancestors 'self'"))
    ).toContain("CSP frame-ancestors must be 'none'.");
    expect(validateSecurityPolicy(POLICY.replace("https://api.openai.com", "https:"))).toContain(
      "CSP connect-src must contain exactly self, GitHub's API and the supported AI provider API origins."
    );
    expect(
      validateSecurityPolicy(POLICY.replace("connect-src 'self'", "connect-src 'self' 'self'"))
    ).toContain(
      "CSP connect-src must contain exactly self, GitHub's API and the supported AI provider API origins."
    );
  });

  it.each([
    "default-src",
    "script-src-attr",
    "object-src",
    "base-uri",
    "form-action",
    "frame-ancestors",
    "frame-src",
  ])("requires %s to deny all sources", (directive) => {
    expect(
      validateSecurityPolicy(POLICY.replace(`${directive} 'none'`, `${directive} 'self'`))
    ).toContain(`CSP ${directive} must be 'none'.`);
  });

  it("checks both static header routes and Caddy ordinary/error responses", () => {
    const headers = createHeadersFile(POLICY);
    const caddy = `header {
 Content-Security-Policy "${POLICY}"
 Strict-Transport-Security "max-age=63072000; includeSubDomains"
 X-Content-Type-Options "nosniff"
 X-Frame-Options "DENY"
 Referrer-Policy "no-referrer"
}
handle_errors {
 header {
  Content-Security-Policy "${POLICY}"
  Strict-Transport-Security "max-age=63072000; includeSubDomains"
  X-Content-Type-Options "nosniff"
  X-Frame-Options "DENY"
  Referrer-Policy "no-referrer"
 }
}`;
    expect(validateHeaders(headers, caddy)).toEqual([]);
    expect(
      validateHeaders(
        headers.replace("  X-Frame-Options: DENY", "  X-Frame-Options: SAMEORIGIN"),
        caddy
      )
    ).toContain("/*: missing or invalid X-Frame-Options.");
    expect(
      validateHeaders(
        headers,
        caddy.replace('Referrer-Policy "no-referrer"', 'Referrer-Policy "origin"')
      )
    ).toContain("Caddy header block 1: missing or invalid Referrer-Policy.");
    expect(
      validateHeaders(
        headers.replaceAll(
          "  Strict-Transport-Security: max-age=63072000; includeSubDomains\n",
          ""
        ),
        caddy
      )
    ).toContain("/*: missing or invalid Strict-Transport-Security.");
  });

  it("rejects security header removal on immutable assets and Caddy errors", () => {
    const headers = createHeadersFile(POLICY);
    const caddy = `header {
 Content-Security-Policy "${POLICY}"
 Strict-Transport-Security "max-age=63072000; includeSubDomains"
 X-Content-Type-Options "nosniff"
 X-Frame-Options "DENY"
 Referrer-Policy "no-referrer"
}
handle_errors {
 header {
  Content-Security-Policy "${POLICY}"
  Strict-Transport-Security "max-age=63072000; includeSubDomains"
  X-Content-Type-Options "nosniff"
  X-Frame-Options "DENY"
  Referrer-Policy "no-referrer"
 }
}`;
    const assetHeaders = headers.replace(
      /(\/_next\/static\/\*[\s\S]*?)  X-Content-Type-Options: nosniff/,
      "$1  X-Content-Type-Options: bogus"
    );
    expect(validateHeaders(assetHeaders, caddy)).toContain(
      "/_next/static/*: missing or invalid X-Content-Type-Options."
    );
    const errorCaddy = caddy.replace(
      '  Strict-Transport-Security "max-age=63072000; includeSubDomains"',
      '  Strict-Transport-Security "max-age=0"'
    );
    expect(validateHeaders(headers, errorCaddy)).toContain(
      "Caddy header block 2: missing or invalid Strict-Transport-Security."
    );
  });

  it("rejects a root runtime user or missing production isolation", () => {
    const compose = `services:\n  prod:\n    read_only: true\n    security_opt:\n      - no-new-privileges:true\n    cap_drop:\n      - ALL\n`;
    expect(validateDeployment(`${VALID_DOCKERFILE}\nUSER stackhatch\n`, compose)).toEqual([]);
    expect(validateDeployment(`${VALID_DOCKERFILE}\nUSER root\n`, compose)).toContain(
      "Production Dockerfile runner must use a non-root USER."
    );
    expect(
      validateDeployment(
        `${VALID_DOCKERFILE}\nUSER stackhatch\n`,
        compose.replace("      - ALL", "      - NET_ADMIN")
      )
    ).toContain("Production Compose service must drop ALL capabilities.");
    expect(
      validateDeployment(
        `${VALID_DOCKERFILE}\nUSER stackhatch\n`,
        compose.replace("no-new-privileges:true", "no-new-privileges:false")
      )
    ).toContain("Production Compose service must set no-new-privileges.");
  });

  it.each([
    "sk-ant-abcdefghijklmnop",
    "sk-proj-abcdefghijklmnopqrstuvwx",
    "sk-svcacct-abcdefghijklmnopqrstuvwx",
    "sk-or-v1-0123456789abcdef0123456789abcdef",
    "AIzaSyA1234567890abcdefghijklmnopqrstuv",
    "ghp_abcdefghijklmnopqrstuvwxyz",
    "github_pat_abcdefghijklmnopqrstuvwxyz",
    "AKIAABCDEFGHIJKLMNOP",
    "-----BEGIN PRIVATE KEY-----",
  ])("recognizes a secret value even without its environment variable name: %s", (value) => {
    expect(SECRET_VALUE_PATTERNS.some(([pattern]) => pattern.test(value))).toBe(true);
  });

  it("allows connections to exactly the registered AI provider origins", () => {
    const aiOrigins = CONNECT_ORIGINS.filter(
      (origin) => origin !== "'self'" && origin !== "https://api.github.com"
    );
    expect([...aiOrigins].sort()).toEqual(
      Object.values(AI_PROVIDERS)
        .map((provider) => provider.origin)
        .sort()
    );
  });
});
