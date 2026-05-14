import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { migrate } from "../db/migrations.js";
import { OutfitRepository } from "../db/repositories/outfit.repository.js";
import { RecommendationRepository } from "../db/repositories/recommendation.repository.js";
import { UserRepository } from "../db/repositories/user.repository.js";
import { WeatherRepository } from "../db/repositories/weather.repository.js";
import { ScraperWeatherProvider } from "../providers/scraper.provider.js";
import { AlertService } from "./alert.service.js";
import { OutfitService } from "./outfit.service.js";
import { PreferenceService } from "./preference.service.js";
import { RecommendationService } from "./recommendation.service.js";
import { UserService } from "./user.service.js";
import { WeatherService } from "./weather.service.js";

describe("Weatherrobe MVP services", () => {
  let db: DatabaseSync;
  let users: UserRepository;
  let weather: WeatherRepository;
  let outfits: OutfitRepository;
  let userService: UserService;
  let weatherService: WeatherService;
  let outfitService: OutfitService;
  let recommendationService: RecommendationService;
  let alertService: AlertService;
  let preferenceService: PreferenceService;

  beforeEach(() => {
    db = new DatabaseSync(":memory:");
    db.exec("PRAGMA foreign_keys = ON");
    migrate(db);
    users = new UserRepository(db);
    weather = new WeatherRepository(db);
    outfits = new OutfitRepository(db);
    userService = new UserService(users);
    weatherService = new WeatherService(weather, users, [new ScraperWeatherProvider()]);
    outfitService = new OutfitService(outfits, weatherService, users);
    recommendationService = new RecommendationService(outfits, new RecommendationRepository(db), weatherService, users);
    alertService = new AlertService(weather, weatherService, users);
    preferenceService = new PreferenceService(outfits, users);
  });

  afterEach(() => {
    db.close();
  });

  it("sets a default location and fetches deterministic weather", async () => {
    userService.setDefaultLocation({ name: "서울 강남구", latitude: 37.4979, longitude: 127.0276 });
    const snapshot = await weatherService.getWeather({ date: "2026-05-14" });
    expect(snapshot.locationName).toBe("서울 강남구");
    expect(snapshot.minTemp).toBeLessThan(snapshot.maxTemp);
    expect(snapshot.source).toBe("scraper");
  });

  it("records weather supplied by an LLM client and reuses it for outfit logs", async () => {
    const location = userService.setDefaultLocation({ name: "서울 강남구", latitude: 37.4979, longitude: 127.0276 });
    const snapshot = weatherService.recordSnapshot({
      date: "2026-05-20",
      location,
      morningTemp: 12,
      afternoonTemp: 23,
      minTemp: 11,
      maxTemp: 24,
      precipitationChance: 70,
      condition: "rain",
      source: "llm"
    });
    expect(snapshot.source).toBe("llm");
    const log = await outfitService.log({ date: "2026-05-20", tops: ["긴팔"], accessories: ["우산"] });
    expect(log.weatherSnapshotId).toBe(snapshot.id);
    expect(log.weather?.condition).toBe("rain");
  });

  it("freezes slot-specific weather context when logging comfort feedback", async () => {
    const location = userService.setDefaultLocation({ name: "서울 강남구", latitude: 37.4979, longitude: 127.0276 });
    const first = weatherService.recordSnapshot({
      date: "2026-05-21",
      location,
      morningTemp: 8,
      afternoonTemp: 24,
      eveningTemp: 17,
      minTemp: 7,
      maxTemp: 25,
      precipitationChance: 10,
      condition: "sunny",
      source: "llm"
    });
    const log = await outfitService.log({ date: "2026-05-21", timeSlot: "morning", tops: ["반팔"], feltCold: true, comfortScore: 2 });
    expect(log.weatherSnapshotId).toBe(first.id);
    expect(log.weatherContext?.timeSlot).toBe("morning");
    expect(log.weatherContext?.temp).toBe(8);

    weatherService.recordSnapshot({
      date: "2026-05-21",
      location,
      morningTemp: 15,
      afternoonTemp: 26,
      eveningTemp: 20,
      minTemp: 14,
      maxTemp: 27,
      condition: "cloudy",
      source: "llm"
    });
    const history = outfitService.history("2026-05-21", "2026-05-21", location);
    expect(history[0].weather?.morningTemp).toBe(15);
    expect(history[0].weatherContext?.temp).toBe(8);
    expect(history[0].weatherContext?.condition).toBe("sunny");
  });

  it("logs outfits with weather linkage and returns history", async () => {
    userService.setDefaultLocation({ name: "서울 강남구", latitude: 37.4979, longitude: 127.0276 });
    const log = await outfitService.log({
      date: "2026-04-18",
      timeSlot: "morning",
      tops: ["반팔", "얇은 셔츠"],
      bottoms: ["청바지"],
      comfortScore: 3,
      feltCold: true,
      feedbackText: "아침에는 추웠고 오후에는 괜찮았다."
    });
    expect(log.weatherSnapshotId).toBeTypeOf("number");
    const history = outfitService.history("2026-04-01", "2026-04-30");
    expect(history).toHaveLength(1);
    expect(history[0].weather?.condition).toBeTruthy();
  });

  it("updates and deletes outfit logs", async () => {
    userService.setDefaultLocation({ name: "서울 강남구", latitude: 37.4979, longitude: 127.0276 });
    const log = await outfitService.log({ date: "2026-05-01", tops: ["긴팔"] });
    const updated = outfitService.update({ id: log.id, tops: ["얇은 긴팔"], comfortScore: 5, feltHot: false });
    expect(updated.log?.tops).toEqual(["얇은 긴팔"]);
    expect(updated.updatedFields).toContain("tops");
    expect(outfitService.delete(log.id)).toBe(true);
    expect(outfitService.history("2026-05-01", "2026-05-01")).toHaveLength(0);
  });

  it("recommends from similar history instead of cold start when data is available", async () => {
    userService.setDefaultLocation({ name: "서울 강남구", latitude: 37.4979, longitude: 127.0276 });
    await outfitService.log({
      date: "2026-05-13",
      tops: ["반팔"],
      bottoms: ["청바지"],
      outerwear: ["얇은 셔츠"],
      feltCold: true,
      comfortScore: 3
    });
    const result = await recommendationService.recommend({ targetDate: "2026-05-14" });
    expect(result.id).toBeGreaterThan(0);
    expect(result.reasons.length).toBeGreaterThan(1);
    expect(result.riskAlerts).toEqual(expect.any(Array));
    expect(result.basedOnLogs[0]?.id).toBeGreaterThan(0);
  });

  it("creates weather change candidates and summarizes sensitivity", async () => {
    userService.setDefaultLocation({ name: "서울 강남구", latitude: 37.4979, longitude: 127.0276 });
    await outfitService.log({ date: "2026-05-10", tops: ["반팔"], feltCold: true, comfortScore: 2 });
    const alerts = await alertService.watchWeatherChanges({ targetDate: "2026-05-14", diurnalThreshold: 1 });
    expect(alerts.changed).toBe(true);
    expect(alerts.alerts.length).toBeGreaterThan(0);
    const summary = preferenceService.summarize();
    expect(summary.sample_count).toBe(1);
    expect(summary.sensitivity.coldSensitivity).toBeGreaterThan(0.5);
  });
});
