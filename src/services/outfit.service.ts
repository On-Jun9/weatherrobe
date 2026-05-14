import { OutfitRepository, type LogOutfitInput, type UpdateOutfitInput } from "../db/repositories/outfit.repository.js";
import { UserRepository } from "../db/repositories/user.repository.js";
import type { Location, OutfitLog, TimeSlot, WeatherContext, WeatherSnapshot } from "../models/types.js";
import { todayIso } from "../utils/date.js";
import { UserService } from "./user.service.js";
import { WeatherService } from "./weather.service.js";

export class OutfitService {
  private readonly userService: UserService;

  constructor(
    private readonly outfits: OutfitRepository,
    private readonly weatherService: WeatherService,
    users: UserRepository
  ) {
    this.userService = new UserService(users);
  }

  async log(input: Omit<LogOutfitInput, "date" | "timeSlot" | "location"> & { date?: string; timeSlot?: LogOutfitInput["timeSlot"]; latitude?: number; longitude?: number }): Promise<OutfitLog> {
    const date = input.date ?? todayIso();
    const location = this.userService.resolveLocation(input);
    const timeSlot = input.timeSlot ?? "all_day";
    let weatherSnapshotId: number | undefined;
    let weatherContext: WeatherContext | undefined;
    try {
      const weather = await this.weatherService.getOrFetch(date, location, date < todayIso() ? "historical" : "forecast");
      weatherSnapshotId = weather.id;
      weatherContext = weatherContextForSlot(weather, timeSlot);
    } catch {
      weatherSnapshotId = undefined;
    }
    return this.outfits.create({
      ...input,
      date,
      timeSlot,
      location,
      weatherSnapshotId,
      weatherContext
    });
  }

  history(startDate: string, endDate: string, location?: Location): OutfitLog[] {
    return this.outfits.list(startDate, endDate, location);
  }

  update(input: UpdateOutfitInput) {
    return this.outfits.update(input);
  }

  delete(id: number): boolean {
    return this.outfits.delete(id);
  }
}

function weatherContextForSlot(weather: WeatherSnapshot, timeSlot: TimeSlot): WeatherContext {
  const tempBySlot: Record<TimeSlot, number | undefined> = {
    morning: weather.morningTemp,
    afternoon: weather.afternoonTemp,
    evening: weather.eveningTemp,
    all_day: weather.feelsLike ?? (weather.minTemp + weather.maxTemp) / 2
  };
  return {
    timeSlot,
    temp: tempBySlot[timeSlot] ?? weather.feelsLike ?? (weather.minTemp + weather.maxTemp) / 2,
    minTemp: weather.minTemp,
    maxTemp: weather.maxTemp,
    feelsLike: weather.feelsLike,
    humidity: weather.humidity,
    windSpeed: weather.windSpeed,
    precipitationChance: weather.precipitationChance,
    condition: weather.condition,
    source: weather.source,
    capturedAt: weather.capturedAt
  };
}
