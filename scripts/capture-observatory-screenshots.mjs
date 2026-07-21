import { chromium } from "@playwright/test";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const baseURL = process.env.STACKHATCH_SCREENSHOT_BASE_URL ?? "http://localhost:3101";
const chromiumExecutable =
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ??
  (existsSync("/run/current-system/sw/bin/chromium")
    ? "/run/current-system/sw/bin/chromium"
    : undefined);
const convertExecutable = process.env.IMAGEMAGICK_CONVERT ?? "convert";
const outputDirectory = join(process.cwd(), "public", "screenshots");
const execFileAsync = promisify(execFile);

const architecture = {
  nodes: [
    {
      id: "web-client",
      category: "client",
      subtype: "web-app",
      name: "Customer Portal",
      technology: "Next.js",
      description: "Serves the authenticated customer workspace.",
      reasoning: "Keeps presentation concerns at a clear browser boundary.",
      locked: false,
    },
    {
      id: "app-api",
      category: "api",
      subtype: "rest-api",
      name: "Application API",
      technology: "TypeScript + Fastify",
      description: "Coordinates product workflows and public HTTP contracts.",
      reasoning: "A focused API boundary keeps business rules out of the client.",
      locked: false,
    },
    {
      id: "identity",
      category: "external",
      subtype: "oauth-provider",
      name: "Identity Provider",
      technology: "OpenID Connect",
      description: "Authenticates people and issues short-lived tokens.",
      reasoning: "Managed identity reduces the custom security surface.",
      locked: false,
    },
    {
      id: "event-stream",
      category: "data",
      subtype: "message-queue",
      name: "Event Stream",
      technology: "NATS JetStream",
      description: "Buffers domain events between product services.",
      reasoning: "Durable events keep background work independent from requests.",
      locked: false,
    },
    {
      id: "worker",
      category: "services",
      subtype: "custom",
      name: "Workflow Worker",
      technology: "Node.js",
      description: "Consumes events and executes long-running jobs.",
      reasoning: "Independent workers can scale and retry without blocking the API.",
      locked: false,
    },
    {
      id: "primary-db",
      category: "data",
      subtype: "sql-db",
      name: "Primary Database",
      technology: "PostgreSQL",
      description: "Stores tenant-scoped product records and workflow state.",
      reasoning: "Relational storage protects transactional product data.",
      locked: false,
    },
    {
      id: "observability",
      category: "infrastructure",
      subtype: "monitoring",
      name: "Telemetry Pipeline",
      technology: "OpenTelemetry",
      description: "Collects traces, metrics, and structured logs.",
      reasoning: "Shared telemetry makes service boundaries observable.",
      locked: false,
    },
  ],
  edges: [
    {
      id: "client-to-api",
      source: "web-client",
      target: "app-api",
      connectionType: "http",
      label: "HTTPS",
    },
    {
      id: "client-to-identity",
      source: "web-client",
      target: "identity",
      connectionType: "http",
      label: "OIDC",
    },
    {
      id: "api-to-events",
      source: "app-api",
      target: "event-stream",
      connectionType: "pub-sub",
      label: "Publish events",
    },
    {
      id: "events-to-worker",
      source: "event-stream",
      target: "worker",
      connectionType: "pub-sub",
      label: "Consume work",
    },
    {
      id: "api-to-db",
      source: "app-api",
      target: "primary-db",
      connectionType: "tcp",
      label: "SQL",
    },
    {
      id: "worker-to-db",
      source: "worker",
      target: "primary-db",
      connectionType: "tcp",
      label: "SQL",
    },
    {
      id: "api-to-telemetry",
      source: "app-api",
      target: "observability",
      connectionType: "grpc",
      label: "Traces",
    },
    {
      id: "worker-to-telemetry",
      source: "worker",
      target: "observability",
      connectionType: "grpc",
      label: "Metrics",
    },
  ],
  positions: {
    "web-client": { x: 60, y: 120 },
    "app-api": { x: 370, y: 120 },
    identity: { x: 60, y: 390 },
    "event-stream": { x: 690, y: 120 },
    worker: { x: 990, y: 120 },
    "primary-db": { x: 690, y: 410 },
    observability: { x: 990, y: 410 },
  },
};

async function convert(source, destination, quality) {
  const args = [source, "-strip"];
  if (quality) args.push("-quality", String(quality));
  args.push(destination);
  await execFileAsync(convertExecutable, args);
}

async function preparePage(page, projectId) {
  await page.goto(`${baseURL}/project/${projectId}`, { waitUntil: "networkidle" });
  await page.getByTestId("project-editor-shell").waitFor();
  await page.getByTestId("stack-node-app-api").waitFor();
  await page.addStyleTag({
    content:
      "*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}",
  });
  await page.evaluate(() => document.fonts.ready);
}

const temporaryDirectory = await mkdtemp(join(tmpdir(), "stackhatch-observatory-"));
let browser;
let context;
let page;
let projectId;

try {
  browser = await chromium.launch({ executablePath: chromiumExecutable, headless: true });
  context = await browser.newContext({
    viewport: { width: 1600, height: 1000 },
    deviceScaleFactor: 1,
    locale: "en-US",
  });
  page = await context.newPage();
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
  await page.addInitScript(() => localStorage.setItem("theme", "light"));

  const projectResponse = await page.request.post(`${baseURL}/api/projects`, {
    data: {
      name: "Architecture Overview",
      description: "A synthetic reference architecture for the StackHatch gallery.",
      canvasState: JSON.stringify(architecture),
    },
  });
  if (!projectResponse.ok()) {
    throw new Error(`Unable to create screenshot project: ${projectResponse.status()}`);
  }
  const project = await projectResponse.json();
  projectId = project.id;
  const conversions = [];

  await preparePage(page, projectId);
  await page.getByTestId("stack-node-app-api").click();
  await page.getByTestId("node-detail-panel").waitFor();
  const desktopSource = join(temporaryDirectory, "stackhatch-observatory-desktop.png");
  await page.screenshot({ path: desktopSource });
  conversions.push([desktopSource, join(outputDirectory, "architecture-overview.webp"), 88]);

  await page.setViewportSize({ width: 760, height: 950 });
  await preparePage(page, projectId);
  const mobileSource = join(temporaryDirectory, "stackhatch-observatory-mobile.png");
  await page.screenshot({ path: mobileSource });
  conversions.push([mobileSource, join(outputDirectory, "architecture-overview-mobile.webp"), 88]);

  await page.setViewportSize({ width: 1200, height: 630 });
  await preparePage(page, projectId);
  const openGraphSource = join(temporaryDirectory, "stackhatch-observatory-og.png");
  await page.screenshot({ path: openGraphSource });
  conversions.push([openGraphSource, join(outputDirectory, "architecture-overview-og.png")]);
  await Promise.all(conversions.map((args) => convert(...args)));
} finally {
  if (page && projectId) {
    try {
      await page.request.delete(`${baseURL}/api/projects/${projectId}`);
    } catch {
      // Cleanup continues even if the disposable development server has already stopped.
    }
  }
  try {
    await context?.close();
  } finally {
    try {
      await browser?.close();
    } finally {
      await rm(temporaryDirectory, { recursive: true, force: true });
    }
  }
}
