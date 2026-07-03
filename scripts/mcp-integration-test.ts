import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

type CallRecord = { name: string; ok: boolean; result?: unknown; error?: string };
type WeatherSnapshot = {
  id: number; date: string; source: string; target_time?: string;
  min_temp: number; max_temp: number; condition: string; captured_at: string;
};

const EXPECTED_TOOLS = [
  "set_default_location", "get_weather", "record_weather_snapshot", "log_outfit",
  "get_outfit_history", "update_outfit", "delete_outfit", "recommend_outfit",
  "compare_weather_to_history", "watch_weather_changes", "summarize_user_preferences"
];

const records: CallRecord[] = [];
let passed = 0;
let failed = 0;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function structured<T>(result: unknown): T {
  assert(result && typeof result === "object" && "structuredContent" in result,
    `MCP result missing structuredContent. Got: ${JSON.stringify(result).slice(0, 200)}`);
  return (result as { structuredContent: T }).structuredContent;
}

function isToolError(result: unknown): boolean {
  return Boolean(result && typeof result === "object" && "isError" in result && (result as { isError?: boolean }).isError);
}

function errorText(result: unknown): string {
  return (result as { content?: Array<{ text?: string }> }).content?.[0]?.text ?? "";
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

async function check(label: string, fn: () => Promise<void> | void): Promise<void> {
  try {
    await fn();
    console.log(`  ✓ ${label}`);
    passed++;
  } catch (e) {
    console.error(`  ✗ ${label}: ${(e as Error).message}`);
    failed++;
  }
}

async function expectError(client: Client, label: string, args: Parameters<typeof client.callTool>[0], includesText: string): Promise<void> {
  await check(label, async () => {
    const result = await record(label, () => client.callTool(args));
    assert(isToolError(result), `expected isError=true but got: ${JSON.stringify(result).slice(0, 200)}`);
    const text = errorText(result);
    assert(text.includes(includesText), `error text "${text}" does not include "${includesText}"`);
  });
}

async function main(): Promise<void> {
  const weatherrobeHome = mkdtempSync(join(tmpdir(), "weatherrobe-mcp-test-"));
  const artifactDir = join(process.cwd(), "test-artifacts");
  mkdirSync(artifactDir, { recursive: true });

  const client = new Client({ name: "weatherrobe-integration-test", version: "1.0.0" });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ["dist/index.js"],
    cwd: process.cwd(),
    env: { ...process.env, WEATHERROBE_HOME: weatherrobeHome },
    stderr: "pipe"
  });

  await client.connect(transport);

  try {
    // ─── 1. 도구 목록 ───────────────────────────────────────────────────────
    console.log("\n[1] 도구 목록");
    await check("11개 도구 등록됨", async () => {
      const tools = await record("tools/list", () => client.listTools());
      const names = (tools as { tools: Array<{ name: string }> }).tools.map((t) => t.name);
      for (const t of EXPECTED_TOOLS) assert(names.includes(t), `missing: ${t}`);
      assert(names.length === EXPECTED_TOOLS.length, `expected ${EXPECTED_TOOLS.length} tools, got ${names.length}`);
    });

    // ─── 2. 위치 미설정 에러 케이스 ────────────────────────────────────────
    console.log("\n[2] 위치 미설정 에러");
    await expectError(client,
      "get_weather: 위치 없음",
      { name: "get_weather", arguments: { date: "2026-05-20" } },
      "기본 위치"
    );
    await expectError(client,
      "record_weather_snapshot: 위치/좌표 없음",
      { name: "record_weather_snapshot", arguments: { date: "2026-05-20", min_temp: 10, max_temp: 22, condition: "sunny" } },
      "기본 위치"
    );
    await expectError(client,
      "log_outfit: 위치 없음 + 옷 카테고리 없음",
      { name: "log_outfit", arguments: { date: "2026-05-20", comfort_score: 3 } },
      "옷 카테고리"
    );

    // ─── 3. 위치 설정 ───────────────────────────────────────────────────────
    console.log("\n[3] 위치 설정");
    let locationSet = false;
    await check("set_default_location: 서울 강남구", async () => {
      const r = structured<{ location: { name: string; latitude: number; longitude: number } }>(
        await record("set_default_location", () =>
          client.callTool({ name: "set_default_location", arguments: { name: "서울 강남구", latitude: 37.4979, longitude: 127.0276 } })
        )
      );
      assert(r.location.name === "서울 강남구", `wrong name: ${r.location.name}`);
      assert(Math.abs(r.location.latitude - 37.4979) < 0.001, `wrong lat: ${r.location.latitude}`);
      locationSet = true;
    });
    assert(locationSet, "위치 설정 실패 — 이후 테스트 중단 불가");

    // ─── 4. 입력값 검증 에러 케이스 ─────────────────────────────────────────
    console.log("\n[4] 입력값 검증 에러");
    await expectError(client,
      "log_outfit: comfort_score 범위 초과 (6)",
      { name: "log_outfit", arguments: { date: "2026-05-20", tops: ["반팔"], comfort_score: 6 } },
      "Too big"
    );
    await expectError(client,
      "log_outfit: 옷 카테고리 없음 (위치 있음)",
      { name: "log_outfit", arguments: { date: "2026-05-20", comfort_score: 3 } },
      "옷 카테고리"
    );
    await expectError(client,
      "update_outfit: 존재하지 않는 id",
      { name: "update_outfit", arguments: { id: 9999, tops: ["반팔"] } },
      "해당 기록"
    );

    // ─── 5. 날씨 스냅샷 저장 (Append-Only) ──────────────────────────────────
    console.log("\n[5] 날씨 스냅샷 저장");
    let snap18Id = 0;
    let snap20aId = 0;
    let snap20bId = 0;
    let snapBusanId = 0;
    let snap20TargetTimeId = 0;

    await check("record_weather_snapshot: 2026-05-18 기본위치", async () => {
      const r = structured<{ id: number; source: string; saved: boolean }>(
        await record("record_weather_snapshot 2026-05-18", () =>
          client.callTool({
            name: "record_weather_snapshot",
            arguments: { date: "2026-05-18", min_temp: 8, max_temp: 18, morning_temp: 9, afternoon_temp: 17, condition: "sunny", source: "llm" }
          })
        )
      );
      assert(r.saved === true, "saved=false");
      assert(r.source === "llm", `source=${r.source}`);
      snap18Id = r.id;
    });

    await check("record_weather_snapshot: 2026-05-20 첫 번째 (비)", async () => {
      const r = structured<{ id: number; source: string; saved: boolean }>(
        await record("record_weather_snapshot 2026-05-20 rain", () =>
          client.callTool({
            name: "record_weather_snapshot",
            arguments: {
              date: "2026-05-20", min_temp: 11, max_temp: 24,
              morning_temp: 12, afternoon_temp: 23, evening_temp: 18,
              condition: "rain", precipitation_chance: 70, wind_speed: 4.2, source: "llm"
            }
          })
        )
      );
      assert(r.saved === true, "saved=false");
      snap20aId = r.id;
    });

    await check("record_weather_snapshot: 2026-05-20 두 번째 Append-Only (맑음)", async () => {
      const r = structured<{ id: number; source: string; saved: boolean }>(
        await record("record_weather_snapshot 2026-05-20 cloudy (append)", () =>
          client.callTool({
            name: "record_weather_snapshot",
            arguments: {
              date: "2026-05-20", min_temp: 16, max_temp: 27,
              morning_temp: 17, afternoon_temp: 26, evening_temp: 21,
              condition: "cloudy", precipitation_chance: 20, source: "llm"
            }
          })
        )
      );
      assert(r.saved === true, "saved=false");
      assert(r.id !== snap20aId, "append-only 위반: 같은 id 반환됨");
      snap20bId = r.id;
    });

    await check("record_weather_snapshot: target_time 지정", async () => {
      const r = structured<{ id: number; target_time?: string }>(
        await record("record_weather_snapshot with target_time", () =>
          client.callTool({
            name: "record_weather_snapshot",
            arguments: {
              date: "2026-05-20", min_temp: 14, max_temp: 25,
              condition: "partly_cloudy", source: "llm", target_time: "09:00"
            }
          })
        )
      );
      assert(r.target_time === "09:00", `target_time=${r.target_time}`);
      snap20TargetTimeId = r.id;
    });

    await check("record_weather_snapshot: 명시적 좌표 (부산 해운대)", async () => {
      const r = structured<{ id: number; source: string }>(
        await record("record_weather_snapshot explicit coords", () =>
          client.callTool({
            name: "record_weather_snapshot",
            arguments: {
              date: "2026-05-20", location_name: "부산 해운대구",
              latitude: 35.1631, longitude: 129.1635,
              min_temp: 18, max_temp: 28, condition: "sunny", source: "llm"
            }
          })
        )
      );
      assert(r.source === "llm", `source=${r.source}`);
      snapBusanId = r.id;
    });

    // ─── 6. get_weather ────────────────────────────────────────────────────
    console.log("\n[6] get_weather");
    let snap20Snapshots: WeatherSnapshot[] = [];

    await check("get_weather: 2026-05-20 → 스냅샷 3개 (append-only)", async () => {
      const r = structured<{ snapshots: WeatherSnapshot[] }>(
        await record("get_weather 2026-05-20", () =>
          client.callTool({ name: "get_weather", arguments: { date: "2026-05-20" } })
        )
      );
      // snap20aId, snap20bId, snap20TargetTimeId (서울 좌표 기준)
      assert(r.snapshots.length === 3, `expected 3 snapshots, got ${r.snapshots.length}`);
      assert(r.snapshots.every((s) => s.source === "llm"), "source 불일치");
      snap20Snapshots = r.snapshots;
    });

    await check("get_weather: 2026-05-20 target_time 스냅샷 포함", async () => {
      const withTargetTime = snap20Snapshots.find((s) => s.id === snap20TargetTimeId);
      assert(withTargetTime, "target_time 스냅샷 없음");
      assert(withTargetTime!.target_time === "09:00", `target_time=${withTargetTime!.target_time}`);
    });

    await check("get_weather: 2026-05-20 첫 스냅샷 조건 = rain (insert 순서)", async () => {
      const first = snap20Snapshots.find((s) => s.id === snap20aId);
      assert(first, "첫 스냅샷 없음");
      assert(first!.condition === "rain", `condition=${first!.condition}`);
    });

    await check("get_weather: 2026-05-18 → 1개", async () => {
      const r = structured<{ snapshots: WeatherSnapshot[] }>(
        await record("get_weather 2026-05-18", () =>
          client.callTool({ name: "get_weather", arguments: { date: "2026-05-18" } })
        )
      );
      assert(r.snapshots.length === 1, `expected 1, got ${r.snapshots.length}`);
      assert(r.snapshots[0].id === snap18Id, "id 불일치");
    });

    await check("get_weather: 부산 좌표 → 부산 스냅샷만", async () => {
      const r = structured<{ snapshots: WeatherSnapshot[] }>(
        await record("get_weather busan coords", () =>
          client.callTool({ name: "get_weather", arguments: { date: "2026-05-20", latitude: 35.1631, longitude: 129.1635 } })
        )
      );
      assert(r.snapshots.length === 1, `expected 1 busan snapshot, got ${r.snapshots.length}`);
      assert(r.snapshots[0].id === snapBusanId, "부산 snapshot id 불일치");
    });

    await check("get_weather: 미래 날짜 → 빈 배열 (에러 아님)", async () => {
      const r = structured<{ snapshots: WeatherSnapshot[] }>(
        await record("get_weather future empty", () =>
          client.callTool({ name: "get_weather", arguments: { date: "2030-01-01" } })
        )
      );
      assert(Array.isArray(r.snapshots), "snapshots가 배열 아님");
      assert(r.snapshots.length === 0, `expected 0, got ${r.snapshots.length}`);
    });

    // ─── 7. Cold Start 추천 ─────────────────────────────────────────────────
    console.log("\n[7] Cold Start 추천");
    await check("recommend_outfit: 2026-05-18 outfit 없음 → cold_start=true", async () => {
      const r = structured<{ cold_start: boolean; recommendation: Record<string, unknown>; reasons: string[]; weather_forecast: { min_temp: number; max_temp: number } }>(
        await record("recommend_outfit cold start 2026-05-18", () =>
          client.callTool({ name: "recommend_outfit", arguments: { target_date: "2026-05-18" } })
        )
      );
      assert(r.cold_start === true, `cold_start=${r.cold_start}`);
      assert(Object.keys(r.recommendation).length > 0, "recommendation 비어있음");
      assert(r.reasons.length > 0, "reasons 비어있음");
      assert(r.weather_forecast.min_temp === 8, `forecast min_temp=${r.weather_forecast.min_temp}`);
    });

    // ─── 8. Outfit 기록 ────────────────────────────────────────────────────
    console.log("\n[8] Outfit 기록");
    let logId = 0;

    await check("log_outfit: weather_snapshot_id 직접 지정 (첫 스냅샷 = 비)", async () => {
      const r = structured<{ id: number; weather_linked: boolean; weather_context: { condition: string; temp: number; source: string } }>(
        await record("log_outfit with explicit snapshot_id", () =>
          client.callTool({
            name: "log_outfit",
            arguments: {
              date: "2026-05-20", time_slot: "morning",
              tops: ["얇은 긴팔"], bottoms: ["청바지"], accessories: ["우산"],
              comfort_score: 4, felt_cold: false, felt_hot: false,
              feedback_text: "비가 왔지만 우산 덕에 괜찮았다.",
              weather_snapshot_id: snap20aId
            }
          })
        )
      );
      assert(r.weather_linked === true, "weather_linked=false");
      assert(r.weather_context.condition === "rain", `condition=${r.weather_context.condition}`);
      assert(r.weather_context.temp === 12, `morning temp=${r.weather_context.temp} (expected 12)`);
      assert(r.weather_context.source === "llm", `source=${r.weather_context.source}`);
      logId = r.id;
    });

    await check("log_outfit: 자동 weather 연결 (두 번째 기록)", async () => {
      const r = structured<{ id: number; weather_linked: boolean }>(
        await record("log_outfit auto-link", () =>
          client.callTool({
            name: "log_outfit",
            arguments: {
              date: "2026-05-20", time_slot: "afternoon",
              tops: ["반팔"], bottoms: ["면바지"],
              comfort_score: 5, felt_cold: false, felt_hot: false
            }
          })
        )
      );
      assert(r.weather_linked === true, "weather_linked=false (자동 연결 실패)");
    });

    await expectError(client,
      "log_outfit: 존재하지 않는 weather_snapshot_id → 에러",
      { name: "log_outfit", arguments: { date: "2026-05-20", tops: ["반팔"], comfort_score: 3, weather_snapshot_id: 99999 } },
      "스냅샷이 없습니다"
    );

    // ─── 9. Outfit 수정 ────────────────────────────────────────────────────
    console.log("\n[9] Outfit 수정");
    await check("update_outfit: outerwear 추가 + comfort_score 변경", async () => {
      const r = structured<{ id: number; updated_fields: string[] }>(
        await record("update_outfit", () =>
          client.callTool({ name: "update_outfit", arguments: { id: logId, outerwear: ["가벼운 바람막이"], comfort_score: 5 } })
        )
      );
      assert(r.updated_fields.includes("outerwear"), `updated_fields=${r.updated_fields}`);
      assert(r.updated_fields.includes("comfort_score"), `updated_fields=${r.updated_fields}`);
    });

    // ─── 10. History 기반 추천 ──────────────────────────────────────────────
    console.log("\n[10] History 기반 추천");
    await check("recommend_outfit: 2026-05-20 history 있음 → cold_start=false", async () => {
      const r = structured<{ cold_start: boolean; based_on_logs: Array<{ id: number }>; weather_forecast: { condition: string } }>(
        await record("recommend_outfit history based", () =>
          client.callTool({ name: "recommend_outfit", arguments: { target_date: "2026-05-20" } })
        )
      );
      assert(r.cold_start === false, `cold_start=${r.cold_start}`);
      assert(r.based_on_logs.length > 0, "based_on_logs 비어있음");
    });

    // ─── 11. 날씨 비교/변경 감지 ────────────────────────────────────────────
    console.log("\n[11] 날씨 비교 / 변경 감지");
    await check("compare_weather_to_history: 유사도 매칭", async () => {
      const r = structured<{ matches: Array<{ similarity_score: number; weather: { condition: string } }> }>(
        await record("compare_weather_to_history", () =>
          client.callTool({ name: "compare_weather_to_history", arguments: { target_date: "2026-05-20", limit: 5 } })
        )
      );
      assert(r.matches.length >= 1, "matches 없음");
      for (const m of r.matches) {
        assert(m.similarity_score >= 0 && m.similarity_score <= 1, `similarity_score 범위 오류: ${m.similarity_score}`);
      }
      // outfit에 연결된 날씨(rain, precipitation=70)와 현재 best 날씨(precipitation 다름) → precipitation mismatch로 유사도 감소
      const rainOutfit = r.matches.find((m) => m.weather.condition === "rain");
      assert(rainOutfit, "rain 조건 outfit match 없음");
      assert(rainOutfit!.similarity_score < 1, `rain outfit similarity=${rainOutfit!.similarity_score} (best 스냅샷과 달라야 함)`);
    });

    await check("watch_weather_changes: 2개 스냅샷 → 변경 감지", async () => {
      const r = structured<{ changed: boolean; alerts: string[]; previous: unknown; current: unknown }>(
        await record("watch_weather_changes", () =>
          client.callTool({ name: "watch_weather_changes", arguments: { target_date: "2026-05-20", diurnal_threshold: 1 } })
        )
      );
      assert(r.changed === true, "changed=false (스냅샷 2개 있는데 변경 없음?)");
      assert(r.alerts.length > 0, "alerts 비어있음");
      assert(r.previous !== null && r.current !== null, "previous/current null");
    });

    await check("watch_weather_changes: 변화 없는 날짜 → changed=false", async () => {
      // diurnal_threshold=50: 일교차 10도로는 alert 없음. API 없는 환경에서 previous=current (동일 스냅샷).
      const r = structured<{ changed: boolean; current: unknown }>(
        await record("watch_weather_changes no change", () =>
          client.callTool({ name: "watch_weather_changes", arguments: { target_date: "2026-05-18", diurnal_threshold: 50 } })
        )
      );
      assert(r.changed === false, `changed=${r.changed}`);
      assert(r.current !== null, "current 없음");
    });

    // ─── 12. 사용자 선호 요약 ────────────────────────────────────────────────
    console.log("\n[12] 사용자 선호 요약");
    await check("summarize_user_preferences: 기록 있음", async () => {
      const r = structured<{ sample_count: number; sensitivity: Record<string, unknown> }>(
        await record("summarize_user_preferences", () =>
          client.callTool({ name: "summarize_user_preferences", arguments: {} })
        )
      );
      assert(r.sample_count >= 1, `sample_count=${r.sample_count}`);
    });

    // ─── 13. Outfit 기록 조회 ───────────────────────────────────────────────
    console.log("\n[13] Outfit 기록 조회");
    await check("get_outfit_history: 2026-05-20 범위", async () => {
      const r = structured<{ count: number; logs: Array<{ id: number; weather_context?: { condition: string } }> }>(
        await record("get_outfit_history", () =>
          client.callTool({ name: "get_outfit_history", arguments: { start_date: "2026-05-20", end_date: "2026-05-20" } })
        )
      );
      assert(r.count === 2, `count=${r.count} (expected 2)`);
      const logged = r.logs.find((l) => l.id === logId);
      assert(logged, "logId 없음");
      // weather_context는 log 당시 스냅샷 frozen
      assert(logged!.weather_context?.condition === "rain", `frozen condition=${logged!.weather_context?.condition}`);
    });

    await check("get_outfit_history: 빈 날짜 범위", async () => {
      const r = structured<{ count: number; logs: unknown[] }>(
        await record("get_outfit_history empty", () =>
          client.callTool({ name: "get_outfit_history", arguments: { start_date: "2020-01-01", end_date: "2020-01-31" } })
        )
      );
      assert(r.count === 0, `count=${r.count}`);
      assert(r.logs.length === 0, "logs 비어있지 않음");
    });

    // ─── 14. Outfit 삭제 ────────────────────────────────────────────────────
    console.log("\n[14] Outfit 삭제");
    await check("delete_outfit: 존재하는 id → deleted=true", async () => {
      const r = structured<{ deleted: boolean }>(
        await record("delete_outfit existing", () =>
          client.callTool({ name: "delete_outfit", arguments: { id: logId } })
        )
      );
      assert(r.deleted === true, "deleted=false");
    });

    await check("delete_outfit: 이미 삭제된 id → deleted=false (에러 아님)", async () => {
      const r = structured<{ deleted: boolean }>(
        await record("delete_outfit already deleted", () =>
          client.callTool({ name: "delete_outfit", arguments: { id: logId } })
        )
      );
      assert(r.deleted === false, "deleted=true (이미 삭제됐는데)");
    });

  } finally {
    await transport.close();
  }

  const outputPath = join(process.cwd(), "test-artifacts", "mcp-integration-test-output.json");
  writeFileSync(outputPath, JSON.stringify({ weatherrobeHome, records }, null, 2));

  console.log(`\n${"─".repeat(60)}`);
  console.log(`결과: ${passed} passed, ${failed} failed (총 ${passed + failed}개)`);
  console.log(`artifact: ${outputPath}`);

  if (failed > 0) process.exit(1);
}

await main();
