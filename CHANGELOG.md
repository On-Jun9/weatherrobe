# Changelog

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
