import type { DatabaseSync } from "node:sqlite";
import type { WeatherData, WeatherSnapshot } from "../../models/types.js";
import { transaction } from "../connection.js";

type WeatherRow = {
  id: number;
  date: string;
  location_name: string;
  latitude: number;
  longitude: number;
  morning_temp: number | null;
  afternoon_temp: number | null;
  evening_temp: number | null;
  min_temp: number;
  max_temp: number;
  feels_like: number | null;
  humidity: number | null;
  wind_speed: number | null;
  precipitation_chance: number | null;
  condition: string;
  uv_index: number | null;
  air_quality: string | null;
  source: string;
  target_time: string | null;
  captured_at: string;
};

function map(row: WeatherRow): WeatherSnapshot {
  return {
    id: row.id,
    date: row.date,
    locationName: row.location_name,
    latitude: row.latitude,
    longitude: row.longitude,
    morningTemp: row.morning_temp ?? undefined,
    afternoonTemp: row.afternoon_temp ?? undefined,
    eveningTemp: row.evening_temp ?? undefined,
    minTemp: row.min_temp,
    maxTemp: row.max_temp,
    feelsLike: row.feels_like ?? undefined,
    humidity: row.humidity ?? undefined,
    windSpeed: row.wind_speed ?? undefined,
    precipitationChance: row.precipitation_chance ?? undefined,
    condition: row.condition,
    uvIndex: row.uv_index ?? undefined,
    airQuality: row.air_quality ?? undefined,
    source: row.source,
    targetTime: row.target_time ?? undefined,
    capturedAt: row.captured_at
  };
}

export class WeatherRepository {
  constructor(private readonly db: DatabaseSync) {}

  save(input: WeatherData): WeatherSnapshot {
    return transaction(this.db, () => {
      const result = this.db
        .prepare(
          `INSERT INTO weather_snapshot (
            date, location_name, latitude, longitude, morning_temp, afternoon_temp, evening_temp,
            min_temp, max_temp, feels_like, humidity, wind_speed, precipitation_chance,
            condition, uv_index, air_quality, source, target_time, captured_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          input.date,
          input.locationName,
          input.latitude,
          input.longitude,
          input.morningTemp ?? null,
          input.afternoonTemp ?? null,
          input.eveningTemp ?? null,
          input.minTemp,
          input.maxTemp,
          input.feelsLike ?? null,
          input.humidity ?? null,
          input.windSpeed ?? null,
          input.precipitationChance ?? null,
          input.condition,
          input.uvIndex ?? null,
          input.airQuality ?? null,
          input.source,
          input.targetTime ?? null,
          input.capturedAt
        );
      return this.getById(Number(result.lastInsertRowid))!;
    });
  }

  getBest(date: string, latitude: number, longitude: number): WeatherSnapshot | null {
    const row = this.db
      .prepare(
        `SELECT * FROM weather_snapshot
         WHERE date = ? AND latitude = ? AND longitude = ?
         ORDER BY captured_at DESC, id DESC LIMIT 1`
      )
      .get(date, latitude, longitude) as WeatherRow | undefined;
    return row ? map(row) : null;
  }

  getById(id: number): WeatherSnapshot | null {
    const row = this.db.prepare("SELECT * FROM weather_snapshot WHERE id = ?").get(id) as WeatherRow | undefined;
    return row ? map(row) : null;
  }

  getAllForLocation(latitude: number, longitude: number): WeatherSnapshot[] {
    const rows = this.db
      .prepare("SELECT * FROM weather_snapshot WHERE latitude = ? AND longitude = ? ORDER BY date DESC, captured_at DESC")
      .all(latitude, longitude) as WeatherRow[];
    return rows.map(map);
  }

  getByDate(date: string, latitude: number, longitude: number): WeatherSnapshot[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM weather_snapshot
         WHERE date = ? AND latitude = ? AND longitude = ?
         ORDER BY captured_at DESC, id DESC`
      )
      .all(date, latitude, longitude) as WeatherRow[];
    return rows.map(map);
  }

}
