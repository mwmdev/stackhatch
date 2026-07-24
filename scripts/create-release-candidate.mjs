import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, relative } from "node:path";

const image = process.env.STACKHATCH_CANDIDATE_IMAGE ?? "stackhatch-static-candidate";
const outputDirectory = "dist-release";
const revision = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const dirty = execFileSync("git", ["status", "--porcelain", "--untracked-files=no"], {
  encoding: "utf8",
}).trim();

if (dirty) throw new Error("Release evidence requires a clean tracked worktree.");

const inspection = JSON.parse(
  execFileSync("docker", ["image", "inspect", image], { encoding: "utf8" })
)[0];
const imageRevision = inspection?.Config?.Labels?.["org.opencontainers.image.revision"];
if (imageRevision !== revision) {
  throw new Error(
    `Candidate image revision ${imageRevision ?? "missing"} does not match ${revision}.`
  );
}

const temporaryDirectory = await mkdtemp(join(tmpdir(), "stackhatch-candidate-"));
const containerName = `stackhatch-evidence-${process.pid}`;
const staticDirectory = join(temporaryDirectory, "srv");
const caddyfile = join(temporaryDirectory, "Caddyfile");
const archive = join(outputDirectory, "stackhatch-static.tar");

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function hashFile(path) {
  return sha256(await readFile(path));
}

async function listFiles(directory) {
  const paths = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) paths.push(...(await listFiles(path)));
    else if (entry.isFile()) paths.push(path);
  }
  return paths.sort();
}

try {
  execFileSync("docker", ["create", "--name", containerName, image], { stdio: "ignore" });
  execFileSync("docker", ["cp", `${containerName}:/srv`, temporaryDirectory]);
  execFileSync("docker", ["cp", `${containerName}:/etc/caddy/Caddyfile`, caddyfile]);
  await mkdir(outputDirectory, { recursive: true });
  execFileSync(
    "tar",
    [
      "--sort=name",
      "--mtime=@0",
      "--owner=0",
      "--group=0",
      "--numeric-owner",
      "-cf",
      archive,
      "-C",
      staticDirectory,
      ".",
    ],
    { stdio: "inherit" }
  );

  const files = await listFiles(staticDirectory);
  const manifest = {
    status: "static-release-ready",
    productionDestructionAuthorized: false,
    sourceRevision: revision,
    image: {
      name: image,
      immutableId: inspection.Id,
      sourceRevision: imageRevision,
    },
    artifact: {
      archive: basename(archive),
      sha256: await hashFile(archive),
      fileCount: files.length,
      treeSha256: sha256(
        (
          await Promise.all(
            files.map(async (path) => `${relative(staticDirectory, path)} ${await hashFile(path)}`)
          )
        ).join("\n")
      ),
    },
    hostPolicy: {
      caddyfileSha256: await hashFile(caddyfile),
      headersSha256: await hashFile(join(staticDirectory, "_headers")),
    },
    generatedAt: new Date().toISOString(),
    note: "This proves a frozen static candidate only. Production cutover and destructive retirement remain separately authorized.",
  };

  await writeFile(
    join(outputDirectory, "candidate-manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`
  );
  console.log(JSON.stringify(manifest, null, 2));
} finally {
  try {
    execFileSync("docker", ["rm", "-f", containerName], { stdio: "ignore" });
  } catch {
    // The container may not have been created.
  }
  await rm(temporaryDirectory, { recursive: true, force: true });
}
