import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { AlertService } from "../services/alert.service.js";
import type { OutfitService } from "../services/outfit.service.js";
import type { PreferenceService } from "../services/preference.service.js";
import type { RecommendationService } from "../services/recommendation.service.js";
import type { UserService } from "../services/user.service.js";
import type { WeatherService } from "../services/weather.service.js";
import { todayIso } from "../utils/date.js";
import { toolError, toolResult } from "../utils/mcp.js";

type Services = {
  userService: UserService;
  weatherService: WeatherService;
  outfitService: OutfitService;
  recommendationService: RecommendationService;
  alertService: AlertService;
  preferenceService: PreferenceService;
};

const timeSlotSchema = z.enum(["morning", "afternoon", "evening", "all_day"]);
const locationInput = {
  latitude: z.number().optional(),
  longitude: z.number().optional()
};
const outfitFields = {
  tops: z.array(z.string()).optional(),
  bottoms: z.array(z.string()).optional(),
  outerwear: z.array(z.string()).optional(),
  full_body: z.array(z.string()).optional(),
  innerwear: z.array(z.string()).optional(),
  shoes: z.array(z.string()).optional(),
  accessories: z.array(z.string()).optional()
};

function hasOutfitField(value: typeof outfitFields extends infer _ ? Record<string, unknown> : never): boolean {
  return ["tops", "bottoms", "outerwear", "full_body", "innerwear", "shoes", "accessories"].some((key) => Array.isArray(value[key]) && (value[key] as unknown[]).length > 0);
}

function toCamelOutfit(input: Record<string, unknown>) {
  return {
    tops: input.tops as string[] | undefined,
    bottoms: input.bottoms as string[] | undefined,
    outerwear: input.outerwear as string[] | undefined,
    fullBody: input.full_body as string[] | undefined,
    innerwear: input.innerwear as string[] | undefined,
    shoes: input.shoes as string[] | undefined,
    accessories: input.accessories as string[] | undefined
  };
}

function weatherJson(weather: {
  id?: number;
  date: string;
  locationName: string;
  latitude: number;
  longitude: number;
  morningTemp?: number;
  afternoonTemp?: number;
  eveningTemp?: number;
  minTemp: number;
  maxTemp: number;
  feelsLike?: number;
  humidity?: number;
  windSpeed?: number;
  precipitationChance?: number;
  condition: string;
  uvIndex?: number;
  airQuality?: string;
  source?: string;
}) {
  return {
    date: weather.date,
    location: { name: weather.locationName, latitude: weather.latitude, longitude: weather.longitude },
    morning_temp: weather.morningTemp,
    afternoon_temp: weather.afternoonTemp,
    evening_temp: weather.eveningTemp,
    min_temp: weather.minTemp,
    max_temp: weather.maxTemp,
    feels_like: weather.feelsLike,
    humidity: weather.humidity,
    wind_speed: weather.windSpeed,
    precipitation_chance: weather.precipitationChance,
    condition: weather.condition,
    uv_index: weather.uvIndex,
    air_quality: weather.airQuality,
    sources: weather.source ? [weather.source] : undefined
  };
}

function logJson(log: {
  id: number;
  date: string;
  timeSlot: string;
  tops?: string[];
  bottoms?: string[];
  outerwear?: string[];
  fullBody?: string[];
  innerwear?: string[];
  shoes?: string[];
  accessories?: string[];
  comfortScore?: number;
  feltCold: boolean;
  feltHot: boolean;
  feedbackText?: string;
  weather?: unknown;
}) {
  return {
    id: log.id,
    date: log.date,
    time_slot: log.timeSlot,
    tops: log.tops,
    bottoms: log.bottoms,
    outerwear: log.outerwear,
    full_body: log.fullBody,
    innerwear: log.innerwear,
    shoes: log.shoes,
    accessories: log.accessories,
    comfort_score: log.comfortScore,
    felt_cold: log.feltCold,
    felt_hot: log.feltHot,
    feedback_text: log.feedbackText,
    weather: log.weather
  };
}

export function registerTools(server: McpServer, services: Services): void {
  server.registerTool(
    "set_default_location",
    {
      description: "사용자의 기본 위치를 설정합니다. 날씨 조회, 기록, 추천 시 위치를 생략하면 이 위치가 사용됩니다.",
      inputSchema: z.object({ name: z.string(), latitude: z.number(), longitude: z.number() }),
      outputSchema: z.object({ location: z.object({ name: z.string(), latitude: z.number(), longitude: z.number() }) })
    },
    async (args) => {
      const location = services.userService.setDefaultLocation(args);
      return toolResult({ location });
    }
  );

  server.registerTool(
    "get_weather",
    {
      description: "특정 위치와 날짜의 날씨 정보를 조회합니다. 위치 생략 시 기본 위치, 날짜 생략 시 오늘.",
      inputSchema: z.object({ date: z.string().optional(), ...locationInput }),
      outputSchema: z.object({ date: z.string() }).passthrough()
    },
    async (args) => {
      try {
        return toolResult(weatherJson(await services.weatherService.getWeather(args)));
      } catch (error) {
        return toolError((error as Error).message);
      }
    }
  );

  server.registerTool(
    "record_weather_snapshot",
    {
      description: "LLM 클라이언트가 외부에서 조회한 구조화 날씨 데이터를 저장합니다. 위치 생략 시 기본 위치를 사용합니다.",
      inputSchema: z.object({
        date: z.string(),
        location_name: z.string().optional(),
        ...locationInput,
        morning_temp: z.number().optional(),
        afternoon_temp: z.number().optional(),
        evening_temp: z.number().optional(),
        min_temp: z.number(),
        max_temp: z.number(),
        feels_like: z.number().optional(),
        humidity: z.number().optional(),
        wind_speed: z.number().optional(),
        precipitation_chance: z.number().optional(),
        condition: z.string(),
        uv_index: z.number().optional(),
        air_quality: z.string().optional(),
        source: z.string().optional()
      }),
      outputSchema: z.object({
        id: z.number(),
        date: z.string(),
        location: z.object({ name: z.string(), latitude: z.number(), longitude: z.number() }),
        source: z.string(),
        saved: z.boolean()
      })
    },
    async (args) => {
      try {
        const location = services.userService.resolveLocation({ name: args.location_name, latitude: args.latitude, longitude: args.longitude });
        const snapshot = services.weatherService.recordSnapshot({
          date: args.date,
          location,
          morningTemp: args.morning_temp,
          afternoonTemp: args.afternoon_temp,
          eveningTemp: args.evening_temp,
          minTemp: args.min_temp,
          maxTemp: args.max_temp,
          feelsLike: args.feels_like,
          humidity: args.humidity,
          windSpeed: args.wind_speed,
          precipitationChance: args.precipitation_chance,
          condition: args.condition,
          uvIndex: args.uv_index,
          airQuality: args.air_quality,
          source: args.source
        });
        return toolResult({
          id: snapshot.id,
          date: snapshot.date,
          location: { name: snapshot.locationName, latitude: snapshot.latitude, longitude: snapshot.longitude },
          source: snapshot.source,
          saved: true
        });
      } catch (error) {
        return toolError((error as Error).message);
      }
    }
  );

  server.registerTool(
    "log_outfit",
    {
      description: "옷차림과 체감 피드백을 기록합니다. 구조화된 카테고리별 입력을 받으며, 자연어 파싱은 LLM 클라이언트가 담당합니다.",
      inputSchema: z
        .object({
          date: z.string().optional(),
          time_slot: timeSlotSchema.optional(),
          ...locationInput,
          ...outfitFields,
          comfort_score: z.number().int().min(1).max(5).optional(),
          felt_cold: z.boolean().optional(),
          felt_hot: z.boolean().optional(),
          feedback_text: z.string().optional()
        })
        .refine(hasOutfitField, { message: "옷 카테고리 중 최소 1개는 필요합니다." }),
      outputSchema: z.object({ id: z.number(), date: z.string(), time_slot: z.string(), weather_linked: z.boolean() }).passthrough()
    },
    async (args) => {
      try {
        const log = await services.outfitService.log({
          ...toCamelOutfit(args),
          date: args.date,
          timeSlot: args.time_slot,
          latitude: args.latitude,
          longitude: args.longitude,
          comfortScore: args.comfort_score,
          feltCold: args.felt_cold,
          feltHot: args.felt_hot,
          feedbackText: args.feedback_text
        });
        return toolResult({
          id: log.id,
          date: log.date,
          time_slot: log.timeSlot,
          weather_linked: Boolean(log.weatherSnapshotId),
          weather_summary: log.weather
            ? { morning_temp: log.weather.morningTemp, afternoon_temp: log.weather.afternoonTemp, condition: log.weather.condition }
            : undefined
        });
      } catch (error) {
        return toolError((error as Error).message);
      }
    }
  );

  server.registerTool(
    "get_outfit_history",
    {
      description: "기간별 옷차림 기록을 조회합니다. 날씨 데이터가 연결된 기록은 날씨 정보도 함께 반환합니다.",
      inputSchema: z.object({ start_date: z.string(), end_date: z.string().optional(), ...locationInput }),
      outputSchema: z.object({ count: z.number(), logs: z.array(z.object({}).passthrough()) })
    },
    async (args) => {
      try {
        const location = services.userService.resolveLocation(args);
        const logs = services.outfitService.history(args.start_date, args.end_date ?? todayIso(), location).map((log) => logJson({ ...log, weather: log.weather ? weatherJson(log.weather) : null }));
        return toolResult({ count: logs.length, logs });
      } catch (error) {
        return toolError((error as Error).message);
      }
    }
  );

  server.registerTool(
    "update_outfit",
    {
      description: "기존 옷차림 기록을 수정합니다. 전달한 필드만 업데이트됩니다.",
      inputSchema: z.object({
        id: z.number().int(),
        time_slot: timeSlotSchema.optional(),
        ...outfitFields,
        comfort_score: z.number().int().min(1).max(5).optional(),
        felt_cold: z.boolean().optional(),
        felt_hot: z.boolean().optional(),
        feedback_text: z.string().optional()
      }),
      outputSchema: z.object({ id: z.number(), updated_fields: z.array(z.string()), updated_at: z.string() })
    },
    async (args) => {
      const result = services.outfitService.update({
        id: args.id,
        ...toCamelOutfit(args),
        timeSlot: args.time_slot,
        comfortScore: args.comfort_score,
        feltCold: args.felt_cold,
        feltHot: args.felt_hot,
        feedbackText: args.feedback_text
      });
      if (!result.log) return toolError(`해당 기록을 찾을 수 없습니다. id: ${args.id}`);
      return toolResult({ id: result.log.id, updated_fields: result.updatedFields, updated_at: result.log.updatedAt });
    }
  );

  server.registerTool(
    "delete_outfit",
    {
      description: "옷차림 기록을 삭제합니다.",
      inputSchema: z.object({ id: z.number().int() }),
      outputSchema: z.object({ id: z.number(), deleted: z.boolean() })
    },
    async (args) => toolResult({ id: args.id, deleted: services.outfitService.delete(args.id) })
  );

  server.registerTool(
    "recommend_outfit",
    {
      description: "대상 날짜의 날씨 예보와 과거 기록을 비교해 옷차림을 추천합니다. 기록이 없으면 기온 구간별 기본 룰셋으로 추천합니다.",
      inputSchema: z.object({ target_date: z.string().optional(), ...locationInput }),
      outputSchema: z.object({ id: z.number(), target_date: z.string(), recommendation: z.object({}).passthrough(), reasons: z.array(z.string()), cold_start: z.boolean() }).passthrough()
    },
    async (args) => {
      try {
        const result = await services.recommendationService.recommend({ targetDate: args.target_date, latitude: args.latitude, longitude: args.longitude });
        return toolResult({
          id: result.id,
          target_date: result.targetDate,
          weather_forecast: weatherJson(result.weatherForecast),
          recommendation: {
            tops: result.recommendation.tops,
            bottoms: result.recommendation.bottoms,
            outerwear: result.recommendation.outerwear,
            full_body: result.recommendation.fullBody,
            innerwear: result.recommendation.innerwear,
            shoes: result.recommendation.shoes,
            accessories: result.recommendation.accessories
          },
          reasons: result.reasons,
          risk_alerts: result.riskAlerts,
          based_on_logs: result.basedOnLogs.map((log) => ({ id: log.id, date: log.date, similarity_score: log.similarityScore })),
          cold_start: result.coldStart
        });
      } catch (error) {
        return toolError((error as Error).message);
      }
    }
  );

  server.registerTool(
    "compare_weather_to_history",
    {
      description: "대상 날짜의 날씨와 과거 기록의 날씨 유사도를 비교합니다.",
      inputSchema: z.object({ target_date: z.string().optional(), ...locationInput, limit: z.number().int().min(1).max(20).optional() }),
      outputSchema: z.object({ target_date: z.string(), matches: z.array(z.object({}).passthrough()) }).passthrough()
    },
    async (args) => {
      try {
        const result = await services.recommendationService.compareWeatherToHistory({ targetDate: args.target_date, latitude: args.latitude, longitude: args.longitude, limit: args.limit });
        return toolResult({
          target_date: result.targetWeather.date,
          target_weather: weatherJson(result.targetWeather),
          matches: result.matches.map((match) => ({
            log: logJson(match.log),
            weather: weatherJson(match.weather),
            similarity_score: match.similarityScore
          }))
        });
      } catch (error) {
        return toolError((error as Error).message);
      }
    }
  );

  server.registerTool(
    "watch_weather_changes",
    {
      description: "예보 변경을 감지하고 비, 기온 급락, 강풍, 큰 일교차 등 알림 후보를 반환합니다.",
      inputSchema: z.object({
        target_date: z.string().optional(),
        ...locationInput,
        precipitation_threshold: z.number().optional(),
        temperature_drop_threshold: z.number().optional(),
        wind_threshold: z.number().optional(),
        diurnal_threshold: z.number().optional()
      }),
      outputSchema: z.object({ target_date: z.string(), changed: z.boolean(), alerts: z.array(z.string()) }).passthrough()
    },
    async (args) => {
      try {
        const result = await services.alertService.watchWeatherChanges({
          targetDate: args.target_date,
          latitude: args.latitude,
          longitude: args.longitude,
          precipitationThreshold: args.precipitation_threshold,
          temperatureDropThreshold: args.temperature_drop_threshold,
          windThreshold: args.wind_threshold,
          diurnalThreshold: args.diurnal_threshold
        });
        return toolResult({
          target_date: result.targetDate,
          location: result.location,
          changed: result.changed,
          alerts: result.alerts,
          previous: result.previous ? weatherJson(result.previous) : null,
          current: weatherJson(result.current)
        });
      } catch (error) {
        return toolError((error as Error).message);
      }
    }
  );

  server.registerTool(
    "summarize_user_preferences",
    {
      description: "누적 기록을 기반으로 사용자의 체감 성향을 자동 추정하고 요약합니다.",
      inputSchema: z.object({}),
      outputSchema: z.object({ sensitivity: z.object({}).passthrough(), summary: z.string(), sample_count: z.number() })
    },
    async () => toolResult(services.preferenceService.summarize())
  );
}
