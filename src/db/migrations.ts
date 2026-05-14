import type { DatabaseSync } from "node:sqlite";

export function migrate(db: DatabaseSync): void {
  const version = db.prepare("PRAGMA user_version").get() as { user_version: number };
  if (version.user_version >= 1) return;
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_profile (
      id INTEGER PRIMARY KEY CHECK(id = 1),
      location_name TEXT NOT NULL,
      latitude REAL NOT NULL,
      longitude REAL NOT NULL,
      preferred_style_notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS user_sensitivity (
      id INTEGER PRIMARY KEY CHECK(id = 1),
      cold_sensitivity REAL NOT NULL DEFAULT 0.5,
      heat_sensitivity REAL NOT NULL DEFAULT 0.5,
      rain_sensitivity REAL NOT NULL DEFAULT 0.5,
      wind_sensitivity REAL NOT NULL DEFAULT 0.5,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS weather_snapshot (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      location_name TEXT NOT NULL,
      latitude REAL NOT NULL,
      longitude REAL NOT NULL,
      morning_temp REAL,
      afternoon_temp REAL,
      evening_temp REAL,
      min_temp REAL NOT NULL,
      max_temp REAL NOT NULL,
      feels_like REAL,
      humidity REAL,
      wind_speed REAL,
      precipitation_chance REAL,
      condition TEXT NOT NULL,
      uv_index REAL,
      air_quality TEXT,
      source TEXT NOT NULL,
      captured_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(date, latitude, longitude, source)
    );
    CREATE INDEX IF NOT EXISTS idx_weather_date_location ON weather_snapshot(date, latitude, longitude);

    CREATE TABLE IF NOT EXISTS outfit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      time_slot TEXT NOT NULL DEFAULT 'all_day',
      location_name TEXT NOT NULL,
      latitude REAL NOT NULL,
      longitude REAL NOT NULL,
      tops TEXT,
      bottoms TEXT,
      outerwear TEXT,
      full_body TEXT,
      innerwear TEXT,
      shoes TEXT,
      accessories TEXT,
      feedback_text TEXT,
      comfort_score INTEGER CHECK(comfort_score BETWEEN 1 AND 5),
      felt_cold INTEGER DEFAULT 0,
      felt_hot INTEGER DEFAULT 0,
      weather_snapshot_id INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (weather_snapshot_id) REFERENCES weather_snapshot(id)
    );
    CREATE INDEX IF NOT EXISTS idx_outfit_date ON outfit_log(date);
    CREATE INDEX IF NOT EXISTS idx_outfit_weather ON outfit_log(weather_snapshot_id);

    CREATE TABLE IF NOT EXISTS outfit_recommendation (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      target_date TEXT NOT NULL,
      location_name TEXT NOT NULL,
      latitude REAL NOT NULL,
      longitude REAL NOT NULL,
      recommendation_data TEXT NOT NULL,
      based_on_log_ids TEXT,
      weather_snapshot_id INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (weather_snapshot_id) REFERENCES weather_snapshot(id)
    );
    CREATE INDEX IF NOT EXISTS idx_recommendation_date ON outfit_recommendation(target_date);

    PRAGMA user_version = 1;
  `);
}
