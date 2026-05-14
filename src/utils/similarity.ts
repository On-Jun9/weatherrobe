import type { UserSensitivity, WeatherSnapshot } from "../models/types.js";

type WeightedValue = {
  a?: number;
  b?: number;
  weight: number;
  scale: number;
};

function season(date: string): number {
  const month = Number(date.slice(5, 7));
  if ([12, 1, 2].includes(month)) return 0;
  if ([3, 4, 5].includes(month)) return 1;
  if ([6, 7, 8].includes(month)) return 2;
  return 3;
}

export function weatherSimilarityScore(target: WeatherSnapshot, past: WeatherSnapshot, sensitivity?: UserSensitivity): number {
  const coldBoost = sensitivity ? 1 + (sensitivity.coldSensitivity - 0.5) * 0.5 : 1;
  const heatBoost = sensitivity ? 1 + (sensitivity.heatSensitivity - 0.5) * 0.5 : 1;
  const rainBoost = sensitivity ? 1 + (sensitivity.rainSensitivity - 0.5) * 0.7 : 1;
  const windBoost = sensitivity ? 1 + (sensitivity.windSensitivity - 0.5) * 0.7 : 1;
  const targetAverage = (target.minTemp + target.maxTemp) / 2;
  const pastAverage = (past.minTemp + past.maxTemp) / 2;
  const values: WeightedValue[] = [
    { a: targetAverage, b: pastAverage, weight: 1.7, scale: 20 },
    { a: target.minTemp, b: past.minTemp, weight: 1.6 * coldBoost, scale: 20 },
    { a: target.maxTemp, b: past.maxTemp, weight: 1.6 * heatBoost, scale: 20 },
    { a: target.morningTemp, b: past.morningTemp, weight: 1.1 * coldBoost, scale: 18 },
    { a: target.afternoonTemp, b: past.afternoonTemp, weight: 1.1 * heatBoost, scale: 18 },
    { a: target.maxTemp - target.minTemp, b: past.maxTemp - past.minTemp, weight: 1.0, scale: 16 },
    { a: target.precipitationChance ?? 0, b: past.precipitationChance ?? 0, weight: 1.0 * rainBoost, scale: 100 },
    { a: target.humidity, b: past.humidity, weight: 0.5, scale: 100 },
    { a: target.windSpeed, b: past.windSpeed, weight: 0.6 * windBoost, scale: 15 },
    { a: season(target.date), b: season(past.date), weight: 0.8, scale: 3 }
  ];
  let distance = 0;
  let weightTotal = 0;
  for (const item of values) {
    if (item.a === undefined || item.b === undefined) continue;
    const normalized = (item.a - item.b) / item.scale;
    distance += item.weight * normalized * normalized;
    weightTotal += item.weight;
  }
  const precipitationMismatch = Number((target.precipitationChance ?? 0) >= 40) !== Number((past.precipitationChance ?? 0) >= 40);
  if (precipitationMismatch) distance += 0.7 * rainBoost;
  const rms = Math.sqrt(distance / Math.max(weightTotal, 1));
  return Number(Math.max(0, 1 - rms).toFixed(4));
}
