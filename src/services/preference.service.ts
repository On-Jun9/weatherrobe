import { OutfitRepository } from "../db/repositories/outfit.repository.js";
import { UserRepository } from "../db/repositories/user.repository.js";

function clamp(value: number): number {
  return Math.max(0, Math.min(1, Number(value.toFixed(2))));
}

export class PreferenceService {
  constructor(
    private readonly outfits: OutfitRepository,
    private readonly users: UserRepository
  ) {}

  summarize() {
    const location = this.users.getDefaultLocation();
    const logs = location ? this.outfits.allWithWeather(location) : [];
    const coldLogs = logs.filter((log) => log.feltCold);
    const hotLogs = logs.filter((log) => log.feltHot);
    const rainDiscomfort = logs.filter((log) => (log.weather?.precipitationChance ?? 0) >= 40 && (log.comfortScore ?? 5) <= 2);
    const windDiscomfort = logs.filter((log) => (log.weather?.windSpeed ?? 0) >= 7 && (log.comfortScore ?? 5) <= 2);
    const denominator = Math.max(logs.length, 1);
    const sensitivity = this.users.updateSensitivity({
      coldSensitivity: clamp(0.5 + coldLogs.length / denominator / 2),
      heatSensitivity: clamp(0.5 + hotLogs.length / denominator / 2),
      rainSensitivity: clamp(0.5 + rainDiscomfort.length / denominator / 2),
      windSensitivity: clamp(0.5 + windDiscomfort.length / denominator / 2)
    });
    const summary = logs.length
      ? `총 ${logs.length}개 기록 기준으로 추위 ${sensitivity.coldSensitivity}, 더위 ${sensitivity.heatSensitivity}, 비 ${sensitivity.rainSensitivity}, 바람 ${sensitivity.windSensitivity} 민감도로 추정했습니다.`
      : "아직 기록이 없어 기본 민감도 0.5를 유지합니다.";
    return { sensitivity, summary, sample_count: logs.length };
  }
}
