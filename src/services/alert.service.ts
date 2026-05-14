import { UserRepository } from "../db/repositories/user.repository.js";
import { WeatherRepository } from "../db/repositories/weather.repository.js";
import type { Location } from "../models/types.js";
import { tomorrowIso } from "../utils/date.js";
import { UserService } from "./user.service.js";
import { WeatherService } from "./weather.service.js";

export class AlertService {
  private readonly userService: UserService;

  constructor(
    private readonly weatherRepository: WeatherRepository,
    private readonly weatherService: WeatherService,
    users: UserRepository
  ) {
    this.userService = new UserService(users);
  }

  async watchWeatherChanges(input: {
    targetDate?: string;
    latitude?: number;
    longitude?: number;
    precipitationThreshold?: number;
    temperatureDropThreshold?: number;
    windThreshold?: number;
    diurnalThreshold?: number;
  }) {
    const targetDate = input.targetDate ?? tomorrowIso();
    const location: Location = this.userService.resolveLocation(input);
    const previous = this.weatherRepository.getBest(targetDate, location.latitude, location.longitude);
    const current = await this.weatherService.refreshForecast(targetDate, location);
    const alerts: string[] = [];
    const precipitationThreshold = input.precipitationThreshold ?? 30;
    const temperatureDropThreshold = input.temperatureDropThreshold ?? 4;
    const windThreshold = input.windThreshold ?? 8;
    const diurnalThreshold = input.diurnalThreshold ?? 10;
    if (previous && (current.precipitationChance ?? 0) - (previous.precipitationChance ?? 0) >= precipitationThreshold) {
      alerts.push(`강수확률이 ${previous.precipitationChance ?? 0}%에서 ${current.precipitationChance ?? 0}%로 상승했습니다.`);
    }
    if (previous && previous.minTemp - current.minTemp >= temperatureDropThreshold) {
      alerts.push(`예상 최저기온이 ${previous.minTemp}도에서 ${current.minTemp}도로 낮아졌습니다.`);
    }
    if ((current.windSpeed ?? 0) >= windThreshold) alerts.push(`풍속 ${current.windSpeed}m/s로 강풍 대비가 필요합니다.`);
    if (current.maxTemp - current.minTemp >= diurnalThreshold) alerts.push(`일교차가 ${Math.round(current.maxTemp - current.minTemp)}도입니다.`);
    if (!previous && ((current.precipitationChance ?? 0) >= 40 || current.maxTemp - current.minTemp >= diurnalThreshold)) {
      alerts.push("새 예보 기준으로 행동이 필요한 날씨 변화 후보가 있습니다.");
    }
    return {
      targetDate,
      location,
      changed: alerts.length > 0,
      alerts,
      previous,
      current
    };
  }
}
