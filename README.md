# Weatherrobe

현재 버전: `1.1.0`

개인 맞춤 날씨 기반 옷차림 추천 MCP 서버입니다. 자연어 파싱은 MCP 클라이언트가 담당하고, 서버는 구조화된 위치/날씨/옷차림/체감 데이터를 처리합니다.

## 요구 사항

- Node.js 22 이상
- npm
- MCP stdio를 지원하는 클라이언트

SQLite 데이터베이스는 기본적으로 `~/.weatherrobe/weatherrobe.db`에 생성됩니다. 테스트나 임시 실행에서는 `WEATHERROBE_HOME` 또는 `WEATHERROBE_DB_PATH`로 경로를 바꿀 수 있습니다.

## 설치와 빌드

```bash
cd <repo-path>
npm install
npm run build
```

## 기존 설치 업데이트

기존에 `weatherrobe`를 쓰고 있었다면 소스 디렉터리에서 다시 빌드한 뒤 MCP 클라이언트를 재시작하면 됩니다.

```bash
cd <repo-path>
npm install
npm run build
```

Claude Desktop 같은 MCP 클라이언트가 이미 아래 파일을 바라보고 있다면 설정 JSON은 바꾸지 않아도 됩니다.

```text
<repo-path>/dist/index.js
```

`1.1.0` 업데이트는 DB를 자동 마이그레이션합니다. 서버 시작 시 기존 `~/.weatherrobe/weatherrobe.db`의 `PRAGMA user_version`이 `1`이면 `outfit_log.weather_context` 컬럼을 추가하고 `user_version = 2`로 올립니다.

기존 기록은 삭제되지 않습니다. 기존 기록은 `weather_context`가 비어 있을 수 있고, 이 경우 추천/유사도/성향 계산은 기존처럼 연결된 `weather_snapshot`을 fallback으로 사용합니다. 새로 기록하는 옷차림부터는 `time_slot` 기준 날씨 컨텍스트가 고정 저장됩니다.

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
