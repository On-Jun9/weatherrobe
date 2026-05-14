import type { DatabaseSync } from "node:sqlite";
import type { Location, RecommendationData } from "../../models/types.js";

export class RecommendationRepository {
  constructor(private readonly db: DatabaseSync) {}

  create(input: {
    targetDate: string;
    location: Location;
    recommendationData: RecommendationData;
    basedOnLogIds: number[];
    weatherSnapshotId?: number;
  }): number {
    const result = this.db
      .prepare(
        `INSERT INTO outfit_recommendation (
          target_date, location_name, latitude, longitude, recommendation_data, based_on_log_ids, weather_snapshot_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        input.targetDate,
        input.location.name,
        input.location.latitude,
        input.location.longitude,
        JSON.stringify(input.recommendationData),
        JSON.stringify(input.basedOnLogIds),
        input.weatherSnapshotId ?? null
      );
    return Number(result.lastInsertRowid);
  }
}
