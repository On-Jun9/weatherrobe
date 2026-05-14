import type { WeatherData } from "../models/types.js";

export interface WeatherProvider {
  name: string;
  fetchCurrent(lat: number, lon: number, locationName?: string): Promise<WeatherData>;
  fetchForecast(lat: number, lon: number, date: string, locationName?: string): Promise<WeatherData>;
  fetchHistorical(lat: number, lon: number, date: string, locationName?: string): Promise<WeatherData | null>;
  isAvailable(): Promise<boolean>;
}
