import { mkdirSync } from "node:fs";
import { userInfo } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

export function weatherrobeHome(): string {
  return process.env.WEATHERROBE_HOME ?? join(userInfo().homedir, ".weatherrobe");
}

export function databasePath(): string {
  return process.env.WEATHERROBE_DB_PATH ?? join(weatherrobeHome(), "weatherrobe.db");
}

let sharedDb: DatabaseSync | undefined;

export function getDatabase(): DatabaseSync {
  if (!sharedDb) {
    const dbPath = databasePath();
    mkdirSync(weatherrobeHome(), { recursive: true });
    sharedDb = new DatabaseSync(dbPath);
    sharedDb.exec("PRAGMA foreign_keys = ON");
    process.stderr.write(`[weatherrobe] db: ${dbPath}\n`);
  }
  return sharedDb;
}

export function closeDatabase(): void {
  sharedDb?.close();
  sharedDb = undefined;
}

let spCounter = 0;
export function transaction<T>(db: DatabaseSync, fn: () => T): T {
  const sp = `_tx_${++spCounter}`;
  db.exec(`SAVEPOINT ${sp}`);
  try {
    const result = fn();
    db.exec(`RELEASE ${sp}`);
    return result;
  } catch (e) {
    db.exec(`ROLLBACK TO ${sp}`);
    db.exec(`RELEASE ${sp}`);
    throw e;
  }
}
