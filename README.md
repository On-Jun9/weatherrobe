# Weatherrobe

현재 버전: `1.4.0`

개인 맞춤 날씨 기반 옷차림 추천 MCP 서버입니다. 자연어 파싱은 MCP 클라이언트가 담당하고, 서버는 구조화된 위치/날씨/옷차림/체감 데이터를 처리합니다.

## 요구 사항

- Node.js 22 이상
- npm
- MCP stdio를 지원하는 클라이언트

SQLite 데이터베이스는 기본적으로 `~/.weatherrobe/weatherrobe.db`에 생성됩니다. 테스트나 임시 실행에서는 `WEATHERROBE_HOME` 또는 `WEATHERROBE_DB_PATH`로 경로를 바꿀 수 있습니다.

## 설치와 빌드

```bash
cd <repo-path>
npm ci
npm run build
```

> **참고:** `.npmrc`에 `ignore-scripts=true`가 설정되어 있어 설치 시 lifecycle script가 실행되지 않습니다. 만약 특정 패키지가 postinstall을 필요로 하는 경우 `npm rebuild <패키지명>`으로 개별 실행할 수 있습니다.

## 기존 설치 업데이트

기존에 `weatherrobe`를 쓰고 있었다면 소스 디렉터리에서 다시 빌드한 뒤 MCP 클라이언트를 재시작하면 됩니다.

```bash
cd <repo-path>
npm ci
npm run build
```

Claude Desktop 같은 MCP 클라이언트가 이미 아래 파일을 바라보고 있다면 설정 JSON은 바꾸지 않아도 됩니다.

```text
<repo-path>/dist/index.js
```

`1.1.0` 업데이트는 DB를 자동 마이그레이션합니다. 서버 시작 시 기존 `~/.weatherrobe/weatherrobe.db`의 `PRAGMA user_version`이 `1`이면 `outfit_log.weather_context` 컬럼을 추가하고 `user_version = 2`로 올립니다.

기존 기록은 삭제되지 않습니다. 기존 기록은 `weather_context`가 비어 있을 수 있고, 이 경우 추천/유사도/성향 계산은 기존처럼 연결된 `weather_snapshot`을 fallback으로 사용합니다. 새로 기록하는 옷차림부터는 `time_slot` 기준 날씨 컨텍스트가 고정 저장됩니다.

### 1.2.0 변경사항

- **outputSchema 정밀화**: 모든 도구의 응답 스키마를 실제 반환 구조에 맞게 명시. `tools/list`에서 클라이언트가 응답 구조를 정확히 파악 가능.
- **명시적 트랜잭션**: 모든 DB 쓰기에 SAVEPOINT 기반 명시적 트랜잭션 적용. `node:sqlite` `DatabaseSync` 환경에서 쓰기 미반영 문제 방지.
- **서버 버전 동기화**: `package.json` 버전을 자동 읽어 MCP 서버 정보에 반영.
- **쓰기 검증**: `set_default_location` 쓰기 후 read-back 검증 추가.
- **진단 로깅**: 서버 시작 시 실제 DB 경로를 stderr로 출력.
- **Breaking**: `summarize_user_preferences` 응답의 `sensitivity` 필드가 camelCase에서 snake_case로 변경 (`coldSensitivity` → `cold_sensitivity`).

### 1.2.1 변경사항

- **홈 디렉토리 해석 수정**: `os.homedir()` → `os.userInfo().homedir`로 변경. MCP 호스트(Hermes 등)가 `HOME` 환경변수를 재설정해도 시스템 passwd에서 실제 홈 디렉토리를 사용하여 올바른 DB 경로(`~/.weatherrobe/weatherrobe.db`)에 접근.

### 1.4.0 변경사항

- **`get_weather` 단건 → 리스트 반환**: 이제 `{ snapshots: [] }` 배열로 반환. 외부 API 자동 조회 제거 — DB에 저장된 데이터만 반환. LLM 클라이언트가 목록에서 원하는 snapshot을 선택하는 방식으로 변경.
- **`weather_snapshot` append only**: `UNIQUE(date, latitude, longitude, source)` constraint 제거. 같은 날짜/위치/source라도 매번 새 행 삽입. 체감 등록 시점의 날씨가 영구적으로 보존됨.
- **`weather_snapshot.target_time` 컬럼 추가**: 이 스냅샷이 나타내는 시각(HH:MM). 예: "09:00" = 9시 기준 날씨. `record_weather_snapshot` 호출 시 선택적으로 지정.
- **`log_outfit`에 `weather_snapshot_id` 파라미터 추가**: `get_weather`로 조회한 snapshot의 id를 직접 지정 가능. 미지정 시 기존 자동 매칭 유지.
- **마이그레이션 v3/v4**: `weather_snapshot` 테이블 재생성(UNIQUE 제거), `target_time` 컬럼 추가. 기존 DB 자동 업그레이드.
- **Breaking**: `get_weather` 응답 구조 변경 (`단건 객체` → `{ snapshots: [...] }`). `weatherOutputSchema`에 `id`, `source`, `captured_at` 추가, `sources[]` 제거.

### 1.3.0 변경사항

- **scraper fallback 제거**: Weather Provider 체인에서 합성 데이터 생성기(`ScraperWeatherProvider`)를 제거. API 키 미설정 + DB에 날씨 없을 때 가짜 데이터가 자동 저장되던 문제 해결. 이제 날씨 데이터가 없으면 명확한 에러를 반환하며, LLM 클라이언트가 `record_weather_snapshot`으로 직접 입력해야 함.

개발 중 직접 실행하려면 다음을 사용합니다.

```bash
npm run dev
```

## MCP 등록

MCP 클라이언트에서는 빌드된 `dist/index.js`를 stdio 서버로 연결합니다.

Claude Desktop 예시:

```json
{
  "mcpServers": {
    "weatherrobe": {
      "command": "<node-path>",
      "args": [
        "<repo-path>/dist/index.js"
      ],
      "env": {
        "WEATHERROBE_HOME": "<weatherrobe-data-dir>"
      }
    }
  }
}
```

macOS에서 Claude Desktop 설정 파일은 보통 다음 위치에 있습니다.

```text
~/Library/Application Support/Claude/claude_desktop_config.json
```

설정 후 MCP 클라이언트를 완전히 재시작합니다.

## 첫 사용 순서

1. 기본 위치를 설정합니다.

```json
{
  "tool": "set_default_location",
  "arguments": {
    "name": "서울 강남구",
    "latitude": 37.4979,
    "longitude": 127.0276
  }
}
```

2. 클라이언트나 LLM이 직접 조회한 날씨가 있으면 구조화해서 저장합니다.

```json
{
  "tool": "record_weather_snapshot",
  "arguments": {
    "date": "2026-05-20",
    "min_temp": 11,
    "max_temp": 24,
    "morning_temp": 12,
    "afternoon_temp": 23,
    "condition": "rain",
    "precipitation_chance": 70,
    "source": "llm"
  }
}
```

3. 옷차림과 체감 피드백을 기록합니다.

```json
{
  "tool": "log_outfit",
  "arguments": {
    "date": "2026-05-20",
    "time_slot": "morning",
    "tops": ["얇은 긴팔"],
    "bottoms": ["청바지"],
    "accessories": ["우산"],
    "comfort_score": 4,
    "felt_cold": false,
    "felt_hot": false,
    "feedback_text": "비가 와서 우산이 필요했다."
  }
}
```

4. 추천을 요청합니다.

```json
{
  "tool": "recommend_outfit",
  "arguments": {
    "target_date": "2026-05-20"
  }
}
```

## 도구

- `set_default_location`
- `get_weather`
- `record_weather_snapshot`
- `log_outfit`
- `get_outfit_history`
- `update_outfit`
- `delete_outfit`
- `recommend_outfit`
- `compare_weather_to_history`
- `watch_weather_changes`
- `summarize_user_preferences`

## 검증

일반 검증:

```bash
npm run typecheck
npm test
npm run build
```

실제 MCP stdio 서버를 띄워 `tools/list`와 `tools/call`을 검증하려면:

```bash
npm run test:mcp
```

성공하면 다음과 비슷한 출력이 나옵니다.

```text
MCP_INTEGRATION_TEST_PASS cases=21 artifact=.../test-artifacts/mcp-integration-test-output.json
```

## 설계 경계

- MCP 서버는 자연어를 파싱하지 않습니다.
- LLM 클라이언트가 사용자 문장이나 외부 날씨 조회 결과를 구조화한 뒤 도구를 호출합니다.
- 서버는 구조화된 데이터 저장, 조회, 추천, 유사도 비교, 알림 후보 생성을 담당합니다.
- 원격 서버가 아니라 로컬 MCP 플러그인으로 동작합니다.
