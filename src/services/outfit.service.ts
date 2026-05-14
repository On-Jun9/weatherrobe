import { OutfitRepository, type LogOutfitInput, type UpdateOutfitInput } from "../db/repositories/outfit.repository.js";
import { UserRepository } from "../db/repositories/user.repository.js";
import type { Location, OutfitLog } from "../models/types.js";
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
    let weatherSnapshotId: number | undefined;
    try {
      weatherSnapshotId = (await this.weatherService.getOrFetch(date, location, date < todayIso() ? "historical" : "forecast")).id;
    } catch {
      weatherSnapshotId = undefined;
    }
    return this.outfits.create({
      ...input,
      date,
      timeSlot: input.timeSlot ?? "all_day",
      location,
      weatherSnapshotId
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
