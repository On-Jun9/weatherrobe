import type { Location } from "../models/types.js";
import { UserRepository } from "../db/repositories/user.repository.js";

export class UserService {
  constructor(private readonly users: UserRepository) {}

  setDefaultLocation(location: Location): Location {
    return this.users.setDefaultLocation(location);
  }

  resolveLocation(input: { latitude?: number; longitude?: number; name?: string } = {}): Location {
    if (input.latitude !== undefined && input.longitude !== undefined) {
      const fallback = this.users.getDefaultLocation();
      return { name: input.name ?? fallback?.name ?? "현재 위치", latitude: input.latitude, longitude: input.longitude };
    }
    const location = this.users.getDefaultLocation();
    if (!location) throw new Error("기본 위치가 설정되지 않았습니다. set_default_location을 먼저 호출하세요.");
    return location;
  }
}
