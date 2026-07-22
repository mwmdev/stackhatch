import { executeManageAccount } from "@/lib/operator-account";

const help = `StackHatch account operator

Preview by exactly one identifier:
  manage-account preview --database /absolute/path --id USER_ID
  manage-account preview --database /absolute/path --github-id GITHUB_ID
  manage-account preview --database /absolute/path --email EMAIL

Delete only by internal ID using the exact database-bound phrase from preview:
  manage-account delete --database /absolute/path --id USER_ID --confirm 'DELETE FINGERPRINT USER_ID'
`;

if (process.argv.slice(2).some((argument) => argument === "--help" || argument === "-h")) {
  process.stdout.write(help);
  process.exitCode = 0;
} else {
  try {
    const result = executeManageAccount(process.argv.slice(2));
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Account operation failed";
    process.stderr.write(`Account operation failed: ${message}\n`);
    process.exitCode = 1;
  }
}
