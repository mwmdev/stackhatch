import { execFileSync } from "node:child_process";

const image = process.env.STACKHATCH_CANDIDATE_IMAGE ?? "stackhatch-static-candidate";
const revision = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const dirty = execFileSync("git", ["status", "--porcelain", "--untracked-files=no"], {
  encoding: "utf8",
}).trim();

if (dirty) {
  throw new Error("Commit tracked changes before freezing a static candidate.");
}

execFileSync(
  "docker",
  [
    "build",
    "--target",
    "runner",
    "--label",
    `org.opencontainers.image.revision=${revision}`,
    "--tag",
    image,
    ".",
  ],
  { stdio: "inherit" }
);

console.log(`Frozen ${image} from ${revision}. Do not rebuild after verification begins.`);
