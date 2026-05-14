import { UserRepository } from "../db/repositories/user.repository.js";
import { WeatherRepository } from "../db/repositories/weather.repository.js";
import type { Location, WeatherSnapshot } from "../models/types.js";
import { KmaProvider } from "../providers/kma.provider.js";
import { OpenWeatherProvider } from "../providers/openweather.provider.js";
import { ScraperWeatherProvider } from "../providers/scraper.provider.js";
import { WeatherApiProvider } from "../providers/weatherapi.provider.js";
import type { WeatherProvider } from "../providers/weather-provider.js";
import { todayIso } from "../utils/date.js";
import { UserService } from "./user.service.js";

export class WeatherService {
  private readonly providers: WeatherProvider[];
  private readonly userService: UserService;

  constructor(
    private readonly weatherRepository: WeatherRepository,
    users: UserRepository,
    providers?: WeatherProvider[]
  ) {
    this.userService = new UserService(users);
    this.providers = providers ?? [new OpenWeatherProvider(), new WeatherApiProvider(), new KmaProvider(), new ScraperWeatherProvider()];
  }

  async getWeather(input: { date?: string; latitude?: number; longitude?: number; name?: string }): Promise<WeatherSnapshot> {
    const date = input.date ?? todayIso();
    const location = this.userService.resolveLocation(input);
    return this.getOrFetch(date, location, date < todayIso() ? "historical" : "forecast");
  }

  recordSnapshot(input: {
    date: string;
    location: Location;
    morningTemp?: number;
    afternoonTemp?: number;
    eveningTemp?: number;
    minTemp: number;
    maxTemp: number;
    feelsLike?: number;
    humidity?: number;
    windSpeed?: number;
    precipitationChance?: number;
    condition: string;
    uvIndex?: number;
    airQuality?: string;
    source?: string;
  }): WeatherSnapshot {
    return this.weatherRepository.save({
      date: input.date,
      locationName: input.location.name,
      latitude: input.location.latitude,
      longitude: input.location.longitude,
      morningTemp: input.morningTemp,
      afternoonTemp: input.afternoonTemp,
      eveningTemp: input.eveningTemp,
      minTemp: input.minTemp,
      maxTemp: input.maxTemp,
      feelsLike: input.feelsLike,
      humidity: input.humidity,
      windSpeed: input.windSpeed,
      precipitationChance: input.precipitationChance,
      condition: input.condition,
      uvIndex: input.uvIndex,
      airQuality: input.airQuality,
      source: input.source ?? "llm",
      capturedAt: new Date().toISOString()
    });
  }

  async getOrFetch(date: string, location: Location, mode: "forecast" | "historical" = "forecast"): Promise<WeatherSnapshot> {
    const existing = this.weatherRepository.getBest(date, location.latitude, location.longitude);
    if (existing) return existing;
    return this.fetchAndStore(date, location, mode);
  }

  async refreshForecast(date: string, location: Location): Promise<WeatherSnapshot> {
    return this.fetchAndStore(date, location, "forecast");
  }

  private async fetchAndStore(date: string, location: Location, mode: "forecast" | "historical"): Promise<WeatherSnapshot> {
    const snapshots: WeatherSnapshot[] = [];
    for (const provider of this.providers) {
      if (!(await provider.isAvailable())) continue;
      try {
        const data = mode === "historical"
          ? await provider.fetchHistorical(location.latitude, location.longitude, date, location.name)
          : await provider.fetchForecast(location.latitude, location.longitude, date, location.name);
        if (data) snapshots.push(this.weatherRepository.save(data));
      } catch {
        continue;
      }
    }
    const best = this.weatherRepository.getBest(date, location.latitude, location.longitude);
    if (!best) throw new Error("사용 가능한 날씨 제공자가 없습니다. API 키를 설정하거나 네트워크 연결을 확인하세요.");
    return best;
  }

  getStoredWeather(date: string, location: Location): WeatherSnapshot | null {
    return this.weatherRepository.getBest(date, location.latitude, location.longitude);
  }
}
