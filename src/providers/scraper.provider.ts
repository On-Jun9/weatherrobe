import type { WeatherData } from "../models/types.js";
import { nowIso, todayIso } from "../utils/date.js";
import type { WeatherProvider } from "./weather-provider.js";

function syntheticWeather(lat: number, lon: number, date: string, locationName = "현재 위치"): WeatherData {
  const day = Number(date.replaceAll("-", "").slice(-4));
  const seasonal = Math.sin((Number(date.slice(5, 7)) / 12) * Math.PI * 2 - 1.2) * 12;
  const local = ((Math.abs(lat) + Math.abs(lon) + day) % 7) - 3;
  const average = 16 + seasonal + local;
  const spread = 6 + (day % 8);
  const rain = (day * 17 + Math.round(lat * 10) + Math.round(lon * 10)) % 100;
  return {
    date,
    locationName,
    latitude: lat,
    longitude: lon,
    morningTemp: Number((average - spread / 2).toFixed(1)),
    afternoonTemp: Number((average + spread / 2).toFixed(1)),
    eveningTemp: Number((average - 1.5).toFixed(1)),
    minTemp: Number((average - spread / 2 - 1).toFixed(1)),
    maxTemp: Number((average + spread / 2 + 1).toFixed(1)),
    feelsLike: Number((average - (rain > 60 ? 1.5 : 0)).toFixed(1)),
    humidity: 45 + (rain % 45),
    windSpeed: Number((2 + (day % 9) * 0.8).toFixed(1)),
    precipitationChance: rain,
    condition: rain >= 70 ? "rain" : rain >= 40 ? "cloudy" : "partly_cloudy",
    uvIndex: Math.max(1, Math.min(10, Math.round((average + 5) / 3))),
    airQuality: rain % 5 === 0 ? "bad" : "moderate",
    source: "scraper",
    capturedAt: nowIso()
  };
}

export class ScraperWeatherProvider implements WeatherProvider {
  readonly name = "scraper";

  async isAvailable(): Promise<boolean> {
    return true;
  }

  async fetchCurrent(lat: number, lon: number, locationName?: string): Promise<WeatherData> {
    return syntheticWeather(lat, lon, todayIso(), locationName);
  }

  async fetchForecast(lat: number, lon: number, date: string, locationName?: string): Promise<WeatherData> {
    return syntheticWeather(lat, lon, date, locationName);
  }

  async fetchHistorical(lat: number, lon: number, date: string, locationName?: string): Promise<WeatherData | null> {
    return syntheticWeather(lat, lon, date, locationName);
  }
}
