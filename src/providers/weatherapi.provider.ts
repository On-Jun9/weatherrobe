import type { WeatherData } from "../models/types.js";
import { nowIso, todayIso } from "../utils/date.js";
import type { WeatherProvider } from "./weather-provider.js";

export class WeatherApiProvider implements WeatherProvider {
  readonly name = "weatherapi";
  private readonly apiKey = process.env.WEATHERROBE_WEATHERAPI_API_KEY;

  async isAvailable(): Promise<boolean> {
    return Boolean(this.apiKey);
  }

  async fetchCurrent(lat: number, lon: number, locationName?: string): Promise<WeatherData> {
    return this.fetchForecast(lat, lon, todayIso(), locationName);
  }

  async fetchForecast(lat: number, lon: number, date: string, locationName = "현재 위치"): Promise<WeatherData> {
    if (!this.apiKey) throw new Error("WeatherAPI key is not configured");
    const url = new URL("https://api.weatherapi.com/v1/forecast.json");
    url.searchParams.set("key", this.apiKey);
    url.searchParams.set("q", `${lat},${lon}`);
    url.searchParams.set("dt", date);
    url.searchParams.set("aqi", "yes");
    const response = await fetch(url);
    if (!response.ok) throw new Error(`WeatherAPI request failed: ${response.status}`);
    const payload = (await response.json()) as {
      forecast: { forecastday: Array<{ day: { mintemp_c: number; maxtemp_c: number; avgtemp_c: number; avghumidity: number; daily_chance_of_rain: number; uv: number; condition: { text: string } }; hour: Array<{ time: string; temp_c: number; feelslike_c: number; wind_kph: number }> }> };
      current?: { air_quality?: { "us-epa-index"?: number } };
    };
    const day = payload.forecast.forecastday[0];
    const hour = (needle: string) => day.hour.find((item) => item.time.includes(` ${needle}:`));
    const airIndex = payload.current?.air_quality?.["us-epa-index"];
    return {
      date,
      locationName,
      latitude: lat,
      longitude: lon,
      morningTemp: hour("09")?.temp_c,
      afternoonTemp: hour("15")?.temp_c,
      eveningTemp: hour("21")?.temp_c,
      minTemp: day.day.mintemp_c,
      maxTemp: day.day.maxtemp_c,
      feelsLike: hour("09")?.feelslike_c ?? day.day.avgtemp_c,
      humidity: day.day.avghumidity,
      windSpeed: hour("12") ? Number((hour("12")!.wind_kph / 3.6).toFixed(1)) : undefined,
      precipitationChance: day.day.daily_chance_of_rain,
      condition: day.day.condition.text.toLowerCase().replaceAll(" ", "_"),
      uvIndex: day.day.uv,
      airQuality: airIndex && airIndex >= 4 ? "bad" : airIndex ? "moderate" : undefined,
      source: this.name,
      capturedAt: nowIso()
    };
  }

  async fetchHistorical(lat: number, lon: number, date: string, locationName?: string): Promise<WeatherData | null> {
    return this.fetchForecast(lat, lon, date, locationName);
  }
}
