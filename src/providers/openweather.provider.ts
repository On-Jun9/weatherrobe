import type { WeatherData } from "../models/types.js";
import { nowIso, todayIso } from "../utils/date.js";
import type { WeatherProvider } from "./weather-provider.js";

export class OpenWeatherProvider implements WeatherProvider {
  readonly name = "openweather";
  private readonly apiKey = process.env.WEATHERROBE_OPENWEATHER_API_KEY;

  async isAvailable(): Promise<boolean> {
    return Boolean(this.apiKey);
  }

  async fetchCurrent(lat: number, lon: number, locationName?: string): Promise<WeatherData> {
    return this.fetchForecast(lat, lon, todayIso(), locationName);
  }

  async fetchForecast(lat: number, lon: number, date: string, locationName = "현재 위치"): Promise<WeatherData> {
    if (!this.apiKey) throw new Error("OpenWeather API key is not configured");
    const url = new URL("https://api.openweathermap.org/data/2.5/forecast");
    url.searchParams.set("lat", String(lat));
    url.searchParams.set("lon", String(lon));
    url.searchParams.set("appid", this.apiKey);
    url.searchParams.set("units", "metric");
    const response = await fetch(url);
    if (!response.ok) throw new Error(`OpenWeather request failed: ${response.status}`);
    const payload = (await response.json()) as {
      list: Array<{ dt_txt: string; main: { temp: number; temp_min: number; temp_max: number; feels_like: number; humidity: number }; weather: Array<{ main: string }>; wind: { speed: number }; pop?: number }>;
    };
    const items = payload.list.filter((item) => item.dt_txt.startsWith(date));
    const selected = items.length ? items : payload.list.slice(0, 8);
    const temps = selected.map((item) => item.main.temp);
    const at = (hour: string) => selected.find((item) => item.dt_txt.includes(` ${hour}:`))?.main.temp;
    return {
      date,
      locationName,
      latitude: lat,
      longitude: lon,
      morningTemp: at("09") ?? temps[0],
      afternoonTemp: at("15") ?? temps[Math.floor(temps.length / 2)],
      eveningTemp: at("21") ?? temps.at(-1),
      minTemp: Math.min(...selected.map((item) => item.main.temp_min)),
      maxTemp: Math.max(...selected.map((item) => item.main.temp_max)),
      feelsLike: selected[0]?.main.feels_like,
      humidity: selected[0]?.main.humidity,
      windSpeed: selected[0]?.wind.speed,
      precipitationChance: Math.round(Math.max(...selected.map((item) => item.pop ?? 0)) * 100),
      condition: selected[0]?.weather[0]?.main.toLowerCase() ?? "unknown",
      source: this.name,
      capturedAt: nowIso()
    };
  }

  async fetchHistorical(): Promise<WeatherData | null> {
    return null;
  }
}
