import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

export function weatherrobeHome(): string {
  return process.env.WEATHERROBE_HOME ?? join(homedir(), ".weatherrobe");
}

export function databasePath(): string {
  return process.env.WEATHERROBE_DB_PATH ?? join(weatherrobeHome(), "weatherrobe.db");
}

let sharedDb: DatabaseSync | undefined;

export function getDatabase(): DatabaseSync {
  if (!sharedDb) {
    mkdirSync(weatherrobeHome(), { recursive: true });
    sharedDb = new DatabaseSync(databasePath());
    sharedDb.exec("PRAGMA foreign_keys = ON");
  }
  return sharedDb;
}

export function closeDatabase(): void {
  sharedDb?.close();
  sharedDb = undefined;
}
