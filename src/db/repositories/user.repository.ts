import type { DatabaseSync } from "node:sqlite";
import type { Location, UserSensitivity } from "../../models/types.js";

type ProfileRow = {
  location_name: string;
  latitude: number;
  longitude: number;
  preferred_style_notes: string | null;
};

type SensitivityRow = {
  cold_sensitivity: number;
  heat_sensitivity: number;
  rain_sensitivity: number;
  wind_sensitivity: number;
  updated_at: string;
};

export class UserRepository {
  constructor(private readonly db: DatabaseSync) {}

  setDefaultLocation(location: Location): Location {
    this.db
      .prepare(
        `INSERT INTO user_profile (id, location_name, latitude, longitude, updated_at)
         VALUES (1, ?, ?, ?, datetime('now'))
         ON CONFLICT(id) DO UPDATE SET
           location_name = excluded.location_name,
           latitude = excluded.latitude,
           longitude = excluded.longitude,
           updated_at = datetime('now')`
      )
      .run(location.name, location.latitude, location.longitude);
    this.ensureSensitivity();
    return location;
  }

  getDefaultLocation(): Location | null {
    const row = this.db.prepare("SELECT location_name, latitude, longitude, preferred_style_notes FROM user_profile WHERE id = 1").get() as ProfileRow | undefined;
    return row ? { name: row.location_name, latitude: row.latitude, longitude: row.longitude } : null;
  }

  ensureSensitivity(): UserSensitivity {
    this.db.prepare("INSERT OR IGNORE INTO user_sensitivity (id) VALUES (1)").run();
    return this.getSensitivity();
  }

  getSensitivity(): UserSensitivity {
    const row = this.db.prepare("SELECT * FROM user_sensitivity WHERE id = 1").get() as SensitivityRow | undefined;
    if (!row) return this.ensureSensitivity();
    return {
      coldSensitivity: row.cold_sensitivity,
      heatSensitivity: row.heat_sensitivity,
      rainSensitivity: row.rain_sensitivity,
      windSensitivity: row.wind_sensitivity,
      updatedAt: row.updated_at
    };
  }

  updateSensitivity(input: Omit<UserSensitivity, "updatedAt">): UserSensitivity {
    this.db
      .prepare(
        `INSERT INTO user_sensitivity (id, cold_sensitivity, heat_sensitivity, rain_sensitivity, wind_sensitivity, updated_at)
         VALUES (1, ?, ?, ?, ?, datetime('now'))
         ON CONFLICT(id) DO UPDATE SET
           cold_sensitivity = excluded.cold_sensitivity,
           heat_sensitivity = excluded.heat_sensitivity,
           rain_sensitivity = excluded.rain_sensitivity,
           wind_sensitivity = excluded.wind_sensitivity,
           updated_at = datetime('now')`
      )
      .run(input.coldSensitivity, input.heatSensitivity, input.rainSensitivity, input.windSensitivity);
    return this.getSensitivity();
  }
}
