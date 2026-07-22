import { migrateDatabaseOffline, parseOfflineMigrationArgs } from "@/lib/operator-migration";

const help = `StackHatch offline database migration

Stop the app and verify a SQLite-consistent backup before running:
  migrate-database --database /absolute/path
`;

if (process.argv.slice(2).some((argument) => argument === "--help" || argument === "-h")) {
  process.stdout.write(help);
  process.exitCode = 0;
} else {
  try {
    const { database } = parseOfflineMigrationArgs(process.argv.slice(2));
    const result = migrateDatabaseOffline(database);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Offline migration failed";
    process.stderr.write(`Offline migration failed: ${message}\n`);
    process.exitCode = 1;
  }
}
