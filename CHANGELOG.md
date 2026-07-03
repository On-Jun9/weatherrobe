# Changelog

## 1.4.1

- `record_weather_snapshot` 응답에 `target_time` 반환 추가.
- `log_outfit`에서 존재하지 않는 `weather_snapshot_id`를 지정하면 자동 매칭으로 넘어가지 않고 도구 에러를 반환하도록 수정.
- MCP 통합 테스트를 현재 API 기준으로 재작성 (`33` cases).

## 1.4.0

- `get_weather` 응답을 단건 날씨 객체에서 `{ snapshots: [...] }` 목록 구조로 변경.
- `get_weather`에서 외부 API 자동 조회를 제거하고, 저장된 DB 스냅샷만 반환하도록 변경.
- `weather_snapshot` 저장을 append-only로 변경. 같은 날짜/위치/source라도 매번 새 행을 저장.
- `weather_snapshot.target_time` 컬럼 추가.
- `log_outfit`에 `weather_snapshot_id` 직접 지정 입력 추가.
- DB 마이그레이션을 `PRAGMA user_version = 4`까지 확장.

## 1.3.0

- 운영 Provider 체인에서 합성 데이터 fallback을 제거.
- API 키가 없거나 Provider가 실패하면 가짜 날씨를 저장하지 않음. Provider가 필요한 추천/변경 감지 경로에서는 명확한 에러를 반환.
- LLM/MCP 클라이언트가 확인한 날씨를 `record_weather_snapshot`으로 저장하는 플로우를 기본 사용 방식으로 정리.

## 1.2.1

- MCP 호스트가 `HOME`을 덮어써도 올바른 사용자 홈을 사용하도록 DB 경로 계산을 `os.userInfo().homedir` 기준으로 수정.

## 1.2.0

- 모든 MCP 도구 outputSchema를 실제 반환 구조에 맞게 정밀화.
- 모든 DB 쓰기를 SAVEPOINT 기반 명시적 트랜잭션으로 감쌈.
- `set_default_location` 쓰기 후 read-back 검증 추가.
- MCP 서버 버전을 `package.json`에서 읽어 동기화.
- `summarize_user_preferences` 응답을 snake_case로 통일.

## 1.1.1

- `.npmrc` 추가: `ignore-scripts`, `strict-ssl`, `save-exact`, `audit` 활성화.
- 의존성 버전을 정확히 고정 (`^` 범위 제거).
- `.gitignore`에 `.env.*`, `*.sqlite`, `*.sqlite3` 패턴 추가.
- `package.json`에 `engines` 필드 추가 (Node.js 22 이상 명시).
- README에 `npm ci` 사용 권장 및 `ignore-scripts` 안내 추가.

## 1.1.0

- `log_outfit` 기록 시 `time_slot` 기준 날씨 컨텍스트를 `outfit_log.weather_context`에 고정 저장합니다.
- 같은 날짜의 `weather_snapshot`이 나중에 갱신되어도 기존 체감 기록은 당시 온도/상태/강수/바람 컨텍스트를 유지합니다.
- 추천, 유사도 비교, 사용자 성향 요약은 `weather_context`가 있는 기록에서는 이 값을 우선 사용합니다.
- DB 마이그레이션을 `PRAGMA user_version = 2`로 올렸습니다.

업데이트 영향:

- 하위 호환입니다.
- 기존 데이터 삭제는 없습니다.
- 기존 `outfit_log` 행의 `weather_context`는 비어 있을 수 있으며, 이 경우 기존 `weather_snapshot` 연결을 fallback으로 사용합니다.
- MCP 클라이언트 설정이 `dist/index.js`를 직접 가리키고 있다면 `npm run build` 후 클라이언트 재시작만 필요합니다.

검증:

- `npm run typecheck`
- `npm test`
- `npm run test:mcp` (`21` MCP cases)

## 1.0.0

- 로컬 MCP stdio 서버 초기 구현.
- SQLite 저장소, 날씨 스냅샷, 옷차림 기록, 추천, 유사도 비교, 예보 변경 감지, 사용자 성향 요약 구현.
- `record_weather_snapshot`으로 LLM/클라이언트가 조회한 구조화 날씨 저장 지원.
