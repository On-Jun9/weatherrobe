# Weatherrobe

개인 맞춤 날씨 기반 옷차림 추천 MCP 서버입니다. 자연어 파싱은 MCP 클라이언트가 담당하고, 서버는 구조화된 위치/날씨/옷차림/체감 데이터를 처리합니다.

## 실행

```bash
npm install
npm run build
npm run dev
```

MCP 클라이언트에서는 `weatherrobe` 명령 또는 `node dist/index.js`를 stdio 서버로 연결합니다.

## 도구

- `set_default_location`
- `get_weather`
- `log_outfit`
- `get_outfit_history`
- `update_outfit`
- `delete_outfit`
- `recommend_outfit`
- `compare_weather_to_history`
- `watch_weather_changes`
- `summarize_user_preferences`

SQLite 데이터베이스는 기본적으로 `~/.weatherrobe/weatherrobe.db`에 생성됩니다. 테스트나 임시 실행에서는 `WEATHERROBE_HOME` 또는 `WEATHERROBE_DB_PATH`로 경로를 바꿀 수 있습니다.
