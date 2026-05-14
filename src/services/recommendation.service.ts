import { OutfitRepository } from "../db/repositories/outfit.repository.js";
import { RecommendationRepository } from "../db/repositories/recommendation.repository.js";
import { UserRepository } from "../db/repositories/user.repository.js";
import type { Location, OutfitFields, OutfitLog, SimilarLog, WeatherSnapshot } from "../models/types.js";
import { coldStartOutfit, weatherRiskAlerts } from "../utils/cold-start.js";
import { tomorrowIso } from "../utils/date.js";
import { weatherSimilarityScore } from "../utils/similarity.js";
import { UserService } from "./user.service.js";
import { WeatherService } from "./weather.service.js";

function mergeOutfit(base: OutfitFields, patch: OutfitFields): OutfitFields {
  return {
    tops: patch.tops ?? base.tops,
    bottoms: patch.bottoms ?? base.bottoms,
    outerwear: patch.outerwear ?? base.outerwear,
    fullBody: patch.fullBody ?? base.fullBody,
    innerwear: patch.innerwear ?? base.innerwear,
    shoes: patch.shoes ?? base.shoes,
    accessories: patch.accessories ?? base.accessories
  };
}

function addUnique(values: string[] | undefined, item: string): string[] {
  return values?.includes(item) ? values : [...(values ?? []), item];
}

function weatherForComfortLog(log: OutfitLog): WeatherSnapshot | null {
  if (!log.weatherContext) return log.weather ?? null;
  const context = log.weatherContext;
  return {
    id: log.weatherSnapshotId ?? 0,
    date: log.date,
    locationName: log.locationName,
    latitude: log.latitude,
    longitude: log.longitude,
    morningTemp: context.timeSlot === "morning" ? context.temp : undefined,
    afternoonTemp: context.timeSlot === "afternoon" ? context.temp : undefined,
    eveningTemp: context.timeSlot === "evening" ? context.temp : undefined,
    minTemp: context.minTemp ?? context.temp ?? 0,
    maxTemp: context.maxTemp ?? context.temp ?? 0,
    feelsLike: context.feelsLike ?? context.temp,
    humidity: context.humidity,
    windSpeed: context.windSpeed,
    precipitationChance: context.precipitationChance,
    condition: context.condition,
    source: context.source,
    capturedAt: context.capturedAt
  };
}

export class RecommendationService {
  private readonly userService: UserService;

  constructor(
    private readonly outfits: OutfitRepository,
    private readonly recommendations: RecommendationRepository,
    private readonly weatherService: WeatherService,
    private readonly users: UserRepository
  ) {
    this.userService = new UserService(users);
  }

  async compareWeatherToHistory(input: { targetDate?: string; latitude?: number; longitude?: number; limit?: number }): Promise<{ targetWeather: WeatherSnapshot; matches: SimilarLog[] }> {
    const targetDate = input.targetDate ?? tomorrowIso();
    const location = this.userService.resolveLocation(input);
    const targetWeather = await this.weatherService.getOrFetch(targetDate, location);
    const sensitivity = this.users.getSensitivity();
    const matches = this.outfits
      .allWithWeather(location)
      .map((log) => {
        const weather = weatherForComfortLog(log);
        return weather ? { log, weather, similarityScore: weatherSimilarityScore(targetWeather, weather, sensitivity) } : null;
      })
      .filter((match): match is SimilarLog => Boolean(match))
      .sort((a, b) => b.similarityScore - a.similarityScore)
      .slice(0, input.limit ?? 5);
    return { targetWeather, matches };
  }

  async recommend(input: { targetDate?: string; latitude?: number; longitude?: number }) {
    const targetDate = input.targetDate ?? tomorrowIso();
    const location = this.userService.resolveLocation(input);
    const { targetWeather, matches } = await this.compareWeatherToHistory({ ...input, targetDate, limit: 3 });
    const primary = matches[0];
    let recommendation: OutfitFields;
    const reasons: string[] = [
      `${location.name} ${targetDate} 날씨: 최저 ${targetWeather.minTemp}도, 최고 ${targetWeather.maxTemp}도, 상태 ${targetWeather.condition}`
    ];
    const riskAlerts = weatherRiskAlerts(targetWeather);
    let coldStart = true;
    if (primary && primary.similarityScore >= 0.55) {
      coldStart = false;
      recommendation = mergeOutfit(coldStartOutfit(targetWeather), primary.log);
      reasons.push(`${primary.log.date} 기록과 유사도 ${primary.similarityScore}로 가장 비슷합니다.`);
      if (primary.log.feltCold) {
        recommendation.outerwear = addUnique(recommendation.outerwear, "가벼운 추가 겉옷");
        reasons.push("비슷한 날 춥다고 기록되어 레이어를 한 단계 보강했습니다.");
      }
      if (primary.log.feltHot) {
        recommendation.outerwear = recommendation.outerwear?.filter((item) => !item.includes("두꺼운"));
        reasons.push("비슷한 날 덥다고 기록되어 두꺼운 레이어를 줄였습니다.");
      }
      if ((targetWeather.precipitationChance ?? 0) >= 40) {
        recommendation.accessories = addUnique(recommendation.accessories, "접이식 우산");
      }
    } else {
      recommendation = coldStartOutfit(targetWeather);
      reasons.push("충분히 유사한 과거 기록이 없어 기온 구간별 기본 룰셋을 적용했습니다.");
    }
    const recommendationData = {
      ...recommendation,
      reasons,
      riskAlerts,
      coldStart
    };
    const id = this.recommendations.create({
      targetDate,
      location,
      recommendationData,
      basedOnLogIds: matches.map((match) => match.log.id),
      weatherSnapshotId: targetWeather.id
    });
    return {
      id,
      targetDate,
      weatherForecast: targetWeather,
      recommendation,
      reasons,
      riskAlerts,
      basedOnLogs: matches.map((match) => ({ id: match.log.id, date: match.log.date, similarityScore: match.similarityScore })),
      coldStart
    };
  }
}
