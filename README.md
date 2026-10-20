# 날래 — 나와 동네를 잇다

긴급재난문자, 기상특보, 정책·보도자료가 들어오면 지도에서 그 시·군·구가 "위잉" 반짝이는 지역 소식 지도.
웹앱(PWA)을 GitHub Pages에 올리고, Android는 TWA로 감싸 Google Play에 낸다.

- **출시 체크리스트: [docs/LAUNCH.md](docs/LAUNCH.md)**
- 스토어 문구·그림: [store/](store/)

## 구조

```
web/                 배포되는 웹앱 (GitHub Pages 루트)
  index.html app.js style.css sw.js manifest.webmanifest
  about.html privacy.html doc.css
  data/regions.json  시·군·구/시·도 경계 TopoJSON (빌드 산출물)
  data/news.json     수집기 산출물 (Actions에서 생성, git 제외)
  data/demo-news.json 데모 데이터 (?demo 로 열기)
  vendor/            Leaflet, topojson-client
scripts/
  collect.mjs        소식 수집 → web/data/news.json
  sources/           출처별 수집기 (재난문자, 기상특보, 정책브리핑)
  lib/               지명→코드 변환, 분류 규칙
  build-regions.mjs  행정동 경계 → 시·군·구 경계 (admdongkor 원본은 build-src/에 직접 받아 둔다)
  build-kma-zones.mjs 기상청 특보구역 → 시·군·구 표
  build-icons.mjs  screenshots.mjs  make-demo.mjs
  test/              파서 시험
.github/workflows/deploy.yml  10분마다 수집 + 배포
tools/serve.ps1      개발용 정적 서버
```

## 개발

```powershell
npm install
powershell -ExecutionPolicy Bypass -File tools\serve.ps1   # http://localhost:5173/?demo
node --test "scripts/test/*.test.mjs"
```

실데이터로 수집해 보기 (키는 환경 변수로만, 파일에 쓰지 않는다):

```powershell
$env:SAFETYDATA_KEY="..."; $env:KMA_APIHUB_KEY="..."; $env:DATA_GO_KR_KEY="..."; node scripts/collect.mjs
```

경계 다시 만들기: [admdongkor](https://github.com/vuski/admdongkor) 최신 `HangJeongDong_ver*.geojson`을 `build-src/admdong/`에 넣고 `npm run build:regions`, 이어서 `node scripts/build-kma-zones.mjs` (기상청 `특보구역 코드.csv`는 `build-src/kma/zones.csv`).

## 데이터·라이선스

| 데이터 | 출처 | 조건 |
|---|---|---|
| 행정구역 경계 | 통계청 SGIS → admdongkor 가공 | 공공누리 1유형 + CC BY 4.0 |
| 긴급재난문자 | 행정안전부 재난안전데이터공유플랫폼 | 공공누리 (3유형/4유형 표기 불일치 — LAUNCH.md 참고) |
| 기상특보 | 기상청 API허브 | 공공누리 1유형 |
| 정책뉴스·보도자료 | 문화체육관광부 정책브리핑 | 항목별 KoglType 1유형만 사용 |
