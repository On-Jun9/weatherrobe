import { readFileSync } from "node:fs";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getDatabase } from "./db/connection.js";

const { version } = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
import { migrate } from "./db/migrations.js";
import { OutfitRepository } from "./db/repositories/outfit.repository.js";
import { RecommendationRepository } from "./db/repositories/recommendation.repository.js";
import { UserRepository } from "./db/repositories/user.repository.js";
import { WeatherRepository } from "./db/repositories/weather.repository.js";
import { AlertService } from "./services/alert.service.js";
import { OutfitService } from "./services/outfit.service.js";
import { PreferenceService } from "./services/preference.service.js";
import { RecommendationService } from "./services/recommendation.service.js";
import { UserService } from "./services/user.service.js";
import { WeatherService } from "./services/weather.service.js";
import { registerTools } from "./tools/index.js";

export function createServer(): McpServer {
  const db = getDatabase();
  migrate(db);
  const users = new UserRepository(db);
  const weather = new WeatherRepository(db);
  const outfits = new OutfitRepository(db);
  const recommendations = new RecommendationRepository(db);
  const weatherService = new WeatherService(weather, users);
  const outfitService = new OutfitService(outfits, weatherService, users);
  const recommendationService = new RecommendationService(outfits, recommendations, weatherService, users);
  const alertService = new AlertService(weather, weatherService, users);
  const preferenceService = new PreferenceService(outfits, users);
  const server = new McpServer({ name: "weatherrobe", version });
  registerTools(server, {
    userService: new UserService(users),
    weatherService,
    outfitService,
    recommendationService,
    alertService,
    preferenceService
  });
  return server;
}
