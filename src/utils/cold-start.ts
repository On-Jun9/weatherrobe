import type { OutfitFields, WeatherData } from "../models/types.js";

export function coldStartOutfit(weather: WeatherData): OutfitFields {
  const average = ((weather.morningTemp ?? weather.minTemp) + (weather.afternoonTemp ?? weather.maxTemp)) / 2;
  if (average >= 28) return { tops: ["반팔"], bottoms: ["반바지", "얇은 바지"], shoes: ["샌들"] };
  if (average >= 23) return { tops: ["반팔", "얇은 긴팔"], bottoms: ["면바지", "청바지"], shoes: ["운동화"] };
  if (average >= 17) return { tops: ["긴팔"], bottoms: ["청바지", "면바지"], outerwear: ["얇은 겉옷"], shoes: ["운동화"] };
  if (average >= 12) return { tops: ["니트", "맨투맨"], bottoms: ["긴 바지"], outerwear: ["자켓", "가디건"], shoes: ["운동화"] };
  if (average >= 5) return { tops: ["기모 상의"], bottoms: ["기모 안감 바지"], outerwear: ["두꺼운 외투"], accessories: ["목도리"], shoes: ["운동화"] };
  return { tops: ["두꺼운 니트"], bottoms: ["기모 바지"], outerwear: ["패딩", "롱코트"], accessories: ["방한용품"], shoes: ["방한화"] };
}

export function weatherRiskAlerts(weather: WeatherData): string[] {
  const alerts: string[] = [];
  const diurnal = weather.maxTemp - weather.minTemp;
  if (diurnal >= 10) alerts.push(`일교차 ${Math.round(diurnal)}도 - 아침/저녁 겉옷 조절 필요`);
  if ((weather.precipitationChance ?? 0) >= 40) alerts.push(`강수확률 ${Math.round(weather.precipitationChance ?? 0)}% - 우산 또는 방수 신발 고려`);
  if ((weather.windSpeed ?? 0) >= 8) alerts.push(`풍속 ${weather.windSpeed}m/s - 체감온도 하락 가능`);
  if ((weather.uvIndex ?? 0) >= 7) alerts.push(`자외선 지수 ${weather.uvIndex} - 모자나 선크림 고려`);
  if (weather.airQuality && !["good", "moderate"].includes(weather.airQuality)) alerts.push(`대기질 ${weather.airQuality} - 마스크 고려`);
  return alerts;
}
