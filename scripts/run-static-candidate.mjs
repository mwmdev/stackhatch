import { execFileSync, spawn } from "node:child_process";

const port = Number(process.argv[2] ?? 3099);
if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  throw new Error("Pass a valid local port to run-static-candidate.mjs");
}

const image = process.env.STACKHATCH_CANDIDATE_IMAGE ?? "stackhatch-static-candidate";
const container = `stackhatch-playwright-${process.pid}`;
let stopping = false;

const child = spawn(
  "docker",
  [
    "run",
    "--rm",
    "--name",
    container,
    "--read-only",
    "--cap-drop=ALL",
    "--security-opt=no-new-privileges:true",
    "-p",
    `127.0.0.1:${port}:3000`,
    image,
  ],
  { stdio: "inherit" }
);

function removeContainer() {
  try {
    execFileSync("docker", ["rm", "-f", container], { stdio: "ignore" });
  } catch {
    // The foreground container may have already exited and removed itself.
  }
}

function stop() {
  if (stopping) return;
  stopping = true;
  removeContainer();
  process.exit(0);
}

process.once("SIGHUP", stop);
process.once("SIGINT", stop);
process.once("SIGTERM", stop);
process.once("exit", removeContainer);

child.once("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exitCode = code ?? 1;
});
