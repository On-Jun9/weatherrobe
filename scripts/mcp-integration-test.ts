import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

type CallRecord = {
  name: string;
  ok: boolean;
  result?: unknown;
  error?: string;
};

const expectedTools = [
  "set_default_location",
  "get_weather",
  "record_weather_snapshot",
  "log_outfit",
  "get_outfit_history",
  "update_outfit",
  "delete_outfit",
  "recommend_outfit",
  "compare_weather_to_history",
  "watch_weather_changes",
  "summarize_user_preferences"
];

const records: CallRecord[] = [];

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function structured<T extends Record<string, unknown>>(result: unknown): T {
  assert(result && typeof result === "object" && "structuredContent" in result, "MCP result is missing structuredContent");
  return (result as { structuredContent: T }).structuredContent;
}

function isToolError(result: unknown): boolean {
  return Boolean(result && typeof result === "object" && "isError" in result && (result as { isError?: boolean }).isError);
}

async function record<T>(name: string, fn: () => Promise<T>): Promise<T> {
  try {
    const result = await fn();
    records.push({ name, ok: true, result });
    return result;
  } catch (error) {
    records.push({ name, ok: false, error: (error as Error).message });
    throw error;
  }
}

async function expectToolError(name: string, fn: () => Promise<unknown>, includes: string): Promise<void> {
  const result = await record(name, fn);
  assert(isToolError(result), `${name} expected tool execution error`);
  const content = (result as { content?: Array<{ text?: string }> }).content?.[0]?.text ?? "";
  assert(content.includes(includes), `${name} wrong tool error: ${content}`);
}

async function main(): Promise<void> {
  const weatherrobeHome = mkdtempSync(join(tmpdir(), "weatherrobe-mcp-suite-"));
  const artifactDir = join(process.cwd(), "test-artifacts");
  mkdirSync(artifactDir, { recursive: true });
  const client = new Client({ name: "weatherrobe-mcp-integration-test", version: "1.0.0" });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ["dist/index.js"],
    cwd: process.cwd(),
    env: { ...process.env, WEATHERROBE_HOME: weatherrobeHome },
    stderr: "pipe"
  });

  await client.connect(transport);
  try {
    const tools = await record("tools/list", () => client.listTools());
    const toolNames = (tools as { tools: Array<{ name: string }> }).tools.map((tool) => tool.name);
    assert(toolNames.length === expectedTools.length, `expected ${expectedTools.length} tools, got ${toolNames.length}`);
    for (const tool of expectedTools) assert(toolNames.includes(tool), `missing MCP tool: ${tool}`);

    await expectToolError("get_weather without default location", () => client.callTool({ name: "get_weather", arguments: { date: "2026-05-20" } }), "기본 위치");
    await expectToolError("record_weather_snapshot without default or coords", () => client.callTool({ name: "record_weather_snapshot", arguments: { date: "2026-05-20", min_temp: 11, max_temp: 24, condition: "rain" } }), "기본 위치");
    await expectToolError("log_outfit without clothing category", () => client.callTool({ name: "log_outfit", arguments: { date: "2026-05-20", comfort_score: 3 } }), "옷 카테고리");
    await expectToolError("log_outfit invalid comfort score", () => client.callTool({ name: "log_outfit", arguments: { date: "2026-05-20", tops: ["반팔"], comfort_score: 6 } }), "Too big");

    const explicitWeather = structured<{ id: number; source: string }>(
      await record("record_weather_snapshot with explicit coords", () =>
        client.callTool({
          name: "record_weather_snapshot",
          arguments: {
            date: "2026-05-19",
            location_name: "부산 해운대구",
            latitude: 35.1631,
            longitude: 129.1635,
            min_temp: 18,
            max_temp: 25,
            condition: "cloudy",
            source: "llm"
          }
        })
      )
    );
    assert(explicitWeather.source === "llm", "explicit weather source should be llm");

    const coldStartLocation = structured<{ location: { name: string } }>(
      await record("set_default_location", () => client.callTool({ name: "set_default_location", arguments: { name: "서울 강남구", latitude: 37.4979, longitude: 127.0276 } }))
    );
    assert(coldStartLocation.location.name === "서울 강남구", "default location was not set");

    const coldStart = structured<{ cold_start: boolean; recommendation: Record<string, unknown> }>(
      await record("recommend_outfit cold start", () => client.callTool({ name: "recommend_outfit", arguments: { target_date: "2026-05-18" } }))
    );
    assert(coldStart.cold_start === true, "recommend_outfit should cold start with no matching history");
    assert(Object.keys(coldStart.recommendation).length > 0, "cold start recommendation is empty");

    const savedWeather = structured<{ id: number; source: string; saved: boolean }>(
      await record("record_weather_snapshot default location", () =>
        client.callTool({
          name: "record_weather_snapshot",
          arguments: {
            date: "2026-05-20",
            min_temp: 11,
            max_temp: 24,
            morning_temp: 12,
            afternoon_temp: 23,
            evening_temp: 18,
            condition: "rain",
            precipitation_chance: 70,
            wind_speed: 4.2,
            source: "llm"
          }
        })
      )
    );
    assert(savedWeather.saved === true && savedWeather.source === "llm", "LLM weather snapshot was not saved");

    const weather = structured<{ sources: string[] }>(
      await record("get_weather uses saved LLM snapshot", () => client.callTool({ name: "get_weather", arguments: { date: "2026-05-20" } }))
    );
    assert(weather.sources?.[0] === "llm", "get_weather did not return saved LLM snapshot");

    const log = structured<{ id: number; weather_linked: boolean; weather_context: { time_slot: string; temp: number; condition: string; source: string } }>(
      await record("log_outfit linked to saved weather", () =>
        client.callTool({
          name: "log_outfit",
          arguments: {
            date: "2026-05-20",
            time_slot: "morning",
            tops: ["얇은 긴팔"],
            bottoms: ["청바지"],
            accessories: ["우산"],
            comfort_score: 4,
            felt_cold: false,
            felt_hot: false,
            feedback_text: "비가 와서 우산이 필요했다."
          }
        })
      )
    );
    assert(log.weather_linked === true, "log_outfit did not link to saved weather");
    assert(log.weather_context.time_slot === "morning", "log_outfit did not freeze the requested time slot");
    assert(log.weather_context.temp === 12, "log_outfit did not freeze morning weather temperature");
    assert(log.weather_context.source === "llm", "log_outfit weather context should keep source attribution");

    await record("record_weather_snapshot updated after comfort log", () =>
      client.callTool({
        name: "record_weather_snapshot",
        arguments: {
          date: "2026-05-20",
          min_temp: 16,
          max_temp: 27,
          morning_temp: 17,
          afternoon_temp: 26,
          evening_temp: 21,
          condition: "cloudy",
          precipitation_chance: 20,
          source: "llm"
        }
      })
    );

    const updated = structured<{ updated_fields: string[] }>(
      await record("update_outfit", () => client.callTool({ name: "update_outfit", arguments: { id: log.id, outerwear: ["가벼운 바람막이"], comfort_score: 5 } }))
    );
    assert(updated.updated_fields.includes("outerwear"), "update_outfit did not report outerwear update");
    await expectToolError("update_outfit missing id", () => client.callTool({ name: "update_outfit", arguments: { id: 9999, tops: ["반팔"] } }), "해당 기록");

    const recommendation = structured<{ cold_start: boolean; weather_forecast: { sources: string[] }; based_on_logs: Array<{ id: number }> }>(
      await record("recommend_outfit history based", () => client.callTool({ name: "recommend_outfit", arguments: { target_date: "2026-05-20" } }))
    );
    assert(recommendation.cold_start === false, "recommend_outfit should use history");
    assert(recommendation.weather_forecast.sources[0] === "llm", "recommend_outfit did not use LLM weather");
    assert(recommendation.based_on_logs.some((item) => item.id === log.id), "recommend_outfit did not reference logged outfit");

    const compare = structured<{ matches: Array<{ similarity_score: number; weather: { morning_temp?: number; condition?: string } }> }>(
      await record("compare_weather_to_history", () => client.callTool({ name: "compare_weather_to_history", arguments: { target_date: "2026-05-20", limit: 3 } }))
    );
    assert(compare.matches.length >= 1, "compare_weather_to_history returned no matches");
    assert(compare.matches[0].weather.morning_temp === 12, "compare_weather_to_history should compare against frozen comfort weather");
    assert(compare.matches[0].weather.condition === "rain", "compare_weather_to_history should keep frozen comfort condition");
    assert(compare.matches[0].similarity_score < 1, "compare_weather_to_history should not treat updated forecast as the original comfort weather");

    const alert = structured<{ changed: boolean; alerts: string[]; previous: unknown; current: unknown }>(
      await record("watch_weather_changes", () => client.callTool({ name: "watch_weather_changes", arguments: { target_date: "2026-05-20", diurnal_threshold: 1 } }))
    );
    assert(alert.changed === true, "watch_weather_changes should produce at least a diurnal alert");
    assert(alert.alerts.length > 0, "watch_weather_changes returned no alert messages");
    assert(alert.previous && alert.current, "watch_weather_changes should return previous and current weather snapshots");

    const preferences = structured<{ sample_count: number; sensitivity: { coldSensitivity?: number } }>(
      await record("summarize_user_preferences", () => client.callTool({ name: "summarize_user_preferences", arguments: {} }))
    );
    assert(preferences.sample_count >= 1, "summarize_user_preferences did not count logs");

    const history = structured<{ count: number; logs: Array<{ id: number; weather?: { sources?: string[] } }> }>(
      await record("get_outfit_history", () => client.callTool({ name: "get_outfit_history", arguments: { start_date: "2026-05-20", end_date: "2026-05-20" } }))
    );
    assert(history.count === 1, "get_outfit_history should return one log");
    assert(history.logs[0]?.weather?.sources?.[0], "get_outfit_history should include linked weather");
    assert((history.logs[0] as { weather_context?: { temp?: number; condition?: string } }).weather_context?.temp === 12, "history should preserve original comfort weather temp");
    assert((history.logs[0] as { weather_context?: { temp?: number; condition?: string } }).weather_context?.condition === "rain", "history should preserve original comfort weather condition");

    const deleted = structured<{ deleted: boolean }>(
      await record("delete_outfit existing", () => client.callTool({ name: "delete_outfit", arguments: { id: log.id } }))
    );
    assert(deleted.deleted === true, "delete_outfit should delete existing log");
    const deletedAgain = structured<{ deleted: boolean }>(
      await record("delete_outfit missing", () => client.callTool({ name: "delete_outfit", arguments: { id: log.id } }))
    );
    assert(deletedAgain.deleted === false, "delete_outfit should return false for missing log");
  } finally {
    await transport.close();
  }

  const outputPath = join(artifactDir, "mcp-integration-test-output.json");
  writeFileSync(outputPath, JSON.stringify({ weatherrobeHome, records }, null, 2));
  const failed = records.filter((recordItem) => !recordItem.ok);
  assert(failed.length === 0, `${failed.length} MCP case(s) failed; see ${outputPath}`);
  console.log(`MCP_INTEGRATION_TEST_PASS cases=${records.length} artifact=${outputPath}`);
}

await main();
