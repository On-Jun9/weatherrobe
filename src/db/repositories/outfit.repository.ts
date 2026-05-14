import type { DatabaseSync } from "node:sqlite";
import type { Location, OutfitFields, OutfitLog, TimeSlot, WeatherContext } from "../../models/types.js";
import { WeatherRepository } from "./weather.repository.js";

const outfitKeys = ["tops", "bottoms", "outerwear", "fullBody", "innerwear", "shoes", "accessories"] as const;
const columnByKey = {
  tops: "tops",
  bottoms: "bottoms",
  outerwear: "outerwear",
  fullBody: "full_body",
  innerwear: "innerwear",
  shoes: "shoes",
  accessories: "accessories"
} as const;

type OutfitRow = {
  id: number;
  date: string;
  time_slot: TimeSlot;
  location_name: string;
  latitude: number;
  longitude: number;
  tops: string | null;
  bottoms: string | null;
  outerwear: string | null;
  full_body: string | null;
  innerwear: string | null;
  shoes: string | null;
  accessories: string | null;
  feedback_text: string | null;
  comfort_score: number | null;
  felt_cold: number;
  felt_hot: number;
  weather_context: string | null;
  weather_snapshot_id: number | null;
  created_at: string;
  updated_at: string;
};

export type LogOutfitInput = OutfitFields & {
  date: string;
  timeSlot: TimeSlot;
  location: Location;
  feedbackText?: string;
  comfortScore?: number;
  feltCold?: boolean;
  feltHot?: boolean;
  weatherSnapshotId?: number;
  weatherContext?: WeatherContext;
};

export type UpdateOutfitInput = OutfitFields & {
  id: number;
  timeSlot?: TimeSlot;
  feedbackText?: string;
  comfortScore?: number;
  feltCold?: boolean;
  feltHot?: boolean;
};

function parseArray(value: string | null): string[] | undefined {
  if (!value) return undefined;
  const parsed = JSON.parse(value) as string[];
  return parsed.length ? parsed : undefined;
}

function encodeArray(value: string[] | undefined): string | null {
  return value ? JSON.stringify(value) : null;
}

function parseWeatherContext(value: string | null): WeatherContext | undefined {
  return value ? (JSON.parse(value) as WeatherContext) : undefined;
}

function map(row: OutfitRow): OutfitLog {
  return {
    id: row.id,
    date: row.date,
    timeSlot: row.time_slot,
    locationName: row.location_name,
    latitude: row.latitude,
    longitude: row.longitude,
    tops: parseArray(row.tops),
    bottoms: parseArray(row.bottoms),
    outerwear: parseArray(row.outerwear),
    fullBody: parseArray(row.full_body),
    innerwear: parseArray(row.innerwear),
    shoes: parseArray(row.shoes),
    accessories: parseArray(row.accessories),
    feedbackText: row.feedback_text ?? undefined,
    comfortScore: row.comfort_score ?? undefined,
    feltCold: Boolean(row.felt_cold),
    feltHot: Boolean(row.felt_hot),
    weatherSnapshotId: row.weather_snapshot_id ?? undefined,
    weatherContext: parseWeatherContext(row.weather_context),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export class OutfitRepository {
  private readonly weatherRepository: WeatherRepository;

  constructor(private readonly db: DatabaseSync) {
    this.weatherRepository = new WeatherRepository(db);
  }

  create(input: LogOutfitInput): OutfitLog {
    const result = this.db
      .prepare(
        `INSERT INTO outfit_log (
          date, time_slot, location_name, latitude, longitude,
          tops, bottoms, outerwear, full_body, innerwear, shoes, accessories,
          feedback_text, comfort_score, felt_cold, felt_hot, weather_context, weather_snapshot_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        input.date,
        input.timeSlot,
        input.location.name,
        input.location.latitude,
        input.location.longitude,
        encodeArray(input.tops),
        encodeArray(input.bottoms),
        encodeArray(input.outerwear),
        encodeArray(input.fullBody),
        encodeArray(input.innerwear),
        encodeArray(input.shoes),
        encodeArray(input.accessories),
        input.feedbackText ?? null,
        input.comfortScore ?? null,
        input.feltCold ? 1 : 0,
        input.feltHot ? 1 : 0,
        input.weatherContext ? JSON.stringify(input.weatherContext) : null,
        input.weatherSnapshotId ?? null
      );
    return this.get(Number(result.lastInsertRowid))!;
  }

  get(id: number): OutfitLog | null {
    const row = this.db.prepare("SELECT * FROM outfit_log WHERE id = ?").get(id) as OutfitRow | undefined;
    return row ? this.withWeather(map(row)) : null;
  }

  list(startDate: string, endDate: string, location?: Location): OutfitLog[] {
    const rows = location
      ? (this.db
          .prepare(
            `SELECT * FROM outfit_log
             WHERE date BETWEEN ? AND ? AND latitude = ? AND longitude = ?
             ORDER BY date DESC, id DESC`
          )
          .all(startDate, endDate, location.latitude, location.longitude) as OutfitRow[])
      : (this.db.prepare("SELECT * FROM outfit_log WHERE date BETWEEN ? AND ? ORDER BY date DESC, id DESC").all(startDate, endDate) as OutfitRow[]);
    return rows.map((row) => this.withWeather(map(row)));
  }

  allWithWeather(location: Location): OutfitLog[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM outfit_log
         WHERE latitude = ? AND longitude = ? AND weather_snapshot_id IS NOT NULL
         ORDER BY date DESC, id DESC`
      )
      .all(location.latitude, location.longitude) as OutfitRow[];
    return rows.map((row) => this.withWeather(map(row))).filter((log) => Boolean(log.weather));
  }

  update(input: UpdateOutfitInput): { log: OutfitLog | null; updatedFields: string[] } {
    const existing = this.get(input.id);
    if (!existing) return { log: null, updatedFields: [] };
    const sets: string[] = [];
    const values: unknown[] = [];
    for (const key of outfitKeys) {
      if (input[key] !== undefined) {
        sets.push(`${columnByKey[key]} = ?`);
        values.push(encodeArray(input[key]));
      }
    }
    const scalarFields: Array<[keyof UpdateOutfitInput, string, (value: unknown) => unknown]> = [
      ["timeSlot", "time_slot", (value) => value],
      ["feedbackText", "feedback_text", (value) => value],
      ["comfortScore", "comfort_score", (value) => value],
      ["feltCold", "felt_cold", (value) => (value ? 1 : 0)],
      ["feltHot", "felt_hot", (value) => (value ? 1 : 0)]
    ];
    for (const [key, column, convert] of scalarFields) {
      if (input[key] !== undefined) {
        sets.push(`${column} = ?`);
        values.push(convert(input[key]));
      }
    }
    if (sets.length === 0) return { log: existing, updatedFields: [] };
    sets.push("updated_at = datetime('now')");
    this.db.prepare(`UPDATE outfit_log SET ${sets.join(", ")} WHERE id = ?`).run(...(values as never[]), input.id);
    const updatedFields = sets.filter((field) => !field.startsWith("updated_at")).map((field) => field.split(" = ")[0]);
    return { log: this.get(input.id), updatedFields };
  }

  delete(id: number): boolean {
    return this.db.prepare("DELETE FROM outfit_log WHERE id = ?").run(id).changes > 0;
  }

  private withWeather(log: OutfitLog): OutfitLog {
    if (!log.weatherSnapshotId) return { ...log, weather: null };
    return { ...log, weather: this.weatherRepository.getById(log.weatherSnapshotId) };
  }
}
