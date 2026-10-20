import { execFileSync } from "node:child_process";

export default function removeStaticCandidateContainer() {
  const port = Number(process.env.PLAYWRIGHT_TEST_PORT) || 3099;
  const container = `stackhatch-playwright-${port}`;

  try {
    execFileSync("docker", ["rm", "-f", container], { stdio: "ignore" });
  } catch {
    // The foreground container may have already exited and removed itself.
  }
}
