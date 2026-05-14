import type { WeatherData } from "../models/types.js";
import type { WeatherProvider } from "./weather-provider.js";

export class KmaProvider implements WeatherProvider {
  readonly name = "kma";
  private readonly serviceKey = process.env.WEATHERROBE_KMA_SERVICE_KEY;

  async isAvailable(): Promise<boolean> {
    return Boolean(this.serviceKey);
  }

  async fetchCurrent(): Promise<WeatherData> {
    throw new Error("KMA provider requires grid coordinate mapping and is not enabled in this build");
  }

  async fetchForecast(): Promise<WeatherData> {
    throw new Error("KMA provider requires grid coordinate mapping and is not enabled in this build");
  }

  async fetchHistorical(): Promise<WeatherData | null> {
    return null;
  }
}
