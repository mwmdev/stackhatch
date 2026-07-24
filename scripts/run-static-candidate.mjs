import { spawn } from "node:child_process";

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

function stop(signal) {
  if (stopping) return;
  stopping = true;
  const cleanup = spawn("docker", ["stop", "--time", "5", container], { stdio: "inherit" });
  cleanup.once("exit", () => {
    if (!child.killed) child.kill(signal);
  });
}

process.once("SIGINT", () => stop("SIGINT"));
process.once("SIGTERM", () => stop("SIGTERM"));

child.once("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exitCode = code ?? 1;
});
