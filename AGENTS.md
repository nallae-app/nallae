# AGENTS.md — 날래(NALLAE) 진행 인수인계

> 이 저장소에서 일하는 AI 에이전트(Codex, Claude 등)가 먼저 읽는 문서다. 기준일 2026-10-21.
> 출시 체크리스트는 [docs/LAUNCH.md](docs/LAUNCH.md), 스토어 자료는 [store/listing.md](store/listing.md).

## 1. 무엇인가
- **날래 — 우리 동네 소식.** 긴급재난문자·기상특보 등 공공데이터가 들어오면 지도에서 해당 시·군·구가 반짝이는 지역 소식 지도.
- 개인이 AI로 만드는 1인 프로젝트. 무료·광고 없음·회원가입 없음·개인정보 수집 없음.
- 웹앱(PWA) → GitHub Pages 배포, Android는 TWA(Trusted Web Activity)로 감싸 Google Play 출시 준비 중.
- **TWA라서 웹만 고치면 앱에 바로 반영된다(스토어 재심사 불필요).** 앱 패키지는 주소·이름·아이콘을 바꿀 때만 다시 만든다.

## 2. 주소·계정
| 항목 | 값 |
|---|---|
| 웹앱 | https://nallae-app.github.io/nallae/ |
| 저장소 | https://github.com/nallae-app/nallae (공개, 조직 `nallae-app`) |
| 루트 사이트 | https://github.com/nallae-app/nallae-app.github.io — `.well-known/assetlinks.json`(TWA 연결)과 `/nallae/`로 이동 페이지만 |
| Android 패키지 | 기존 AAB 및 루트 `assetlinks.json` 값 유지 중. 브랜드 전용 식별자로 변경 검토 중이며, `docs/BRAND_ACCOUNTS.md` 참고. 빌드·연결·Play 등록을 함께 확인하기 전 임의 변경 금지 |
| 공개 연락처 | nallae.app@gmail.com, 공개 운영자명 "날래 개발자" |

## 3. 절대 규칙
1. **실명·소속 회사·개인 메일을 공개 파일, 커밋, 스토어 문구, 로그에 넣지 않는다.** 공개 표기는 "날래 개발자" / nallae.app@gmail.com만.
2. **API 키·토큰을 코드·커밋·로그·채팅에 남기지 않는다.** GitHub Secrets 또는 서버의 `~/nallae.env`에만. 로그를 찍을 때 키가 섞이지 않게 한다.
3. 다음은 git 제외이며 절대 커밋하지 않는다: `android/`(서명 키 `signing.keystore`·`signing-key-info.txt`, aab/apk), `build-src/`(원본 경계 34MB 등), `docs/HANDOFF.md`, `docs/MASTER_HANDOFF.md`(비공개 기획·사업 문서), `web/data/news.json`(수집 산출물), `.env`.
4. 데이터에 명시된 내용만 보여준다. 사건을 추측·창작하지 않는다. 언론사 기사 본문을 수집·재배포하지 않는다.
5. **지명이 '언급'됐다는 이유만으로 그 지역에 찍지 않는다.** 발생 지역/영향 지역/발표 기관을 구분한다. (정책브리핑은 그래서 지도에 안 찍는다 — 5절)
6. 새 API는 공식 문서와 이용 조건(상업 이용, 변경 허용, 출처 표시)을 먼저 확인하고 문제가 있으면 사용자에게 알린다.
7. 기존 기능 삭제·구조 변경은 사용자 승인 후. 작은 단위로 추가하고 테스트한다.
8. 커밋 작성자는 저장소 로컬 설정(`soulret10-ux` noreply)을 그대로 쓴다. 전역 git 설정을 바꾸지 않는다.

## 4. 구조
```
web/                     배포 루트 (Pages)
  index.html app.js style.css sw.js manifest.webmanifest
  about.html privacy.html doc.css      앱 정보·출처 표기 / 개인정보처리방침
  data/regions.json      시·군·구 256 + 시·도 16 TopoJSON (빌드 산출물, 커밋됨)
  data/demo-news.json    데모 데이터 (?demo 로 열기)
  data/news.json         수집 산출물 (git 제외)
  vendor/                Leaflet 1.9.4, topojson-client 3.1.0 (CDN 대신 내장)
  icons/
scripts/
  collect.mjs            출처별 수집 → web/data/news.json (72시간 보관, 최대 600건)
  sources/disaster-sms.mjs   긴급재난문자 (safetydata.go.kr DSSP-IF-00247)
  sources/weather-warning.mjs 기상특보 현황 (apihub.kma.go.kr wrn_now_data.php)
  sources/policy-news.mjs    정책브리핑 (data.go.kr 15095335) — 목록 전용
  lib/regions.mjs        지명 → 시·군·구/시·도 코드 (resolvePlace, findPlacesInText)
  lib/classify.mjs       제목 → 분류 규칙
  data/regions-index.json, data/kma-zones.json  지명 사전, 기상청 특보구역 300개 → 코드
  build-regions.mjs      admdongkor 행정동 경계 → 시·군·구/시·도 (mapshaper)
  build-kma-zones.mjs    특보구역 CSV → kma-zones.json
  make-demo.mjs screenshots.mjs build-icons.mjs probe-its.mjs
  test/sources.test.mjs  파서·지명 시험 (node --test "scripts/test/*.test.mjs")
server/                  국내 수집 서버용 (6절)
.github/workflows/deploy.yml  수집·배포 (COLLECTOR 변수로 모드 선택)
.github/workflows/probe.yml   API 응답 구조 확인용 수동 작업
tools/serve.ps1          로컬 정적 서버 (http://localhost:5173/?demo)
```

### 행정구역
- 경계: admdongkor `ver20261001`(통계청 SGIS, 공공누리 1유형 + CC BY 4.0). **2026-07 전남광주통합특별시(코드 12) 출범, 인천 제물포·영종·서해·검단구 신설**이 반영돼 있다. 시·도 16개가 정상.
- 시·도 코드: 서울11 부산26 대구27 인천28 전남광주12 대전30 울산31 세종36 경기41 강원51 충북43 충남44 전북52 경북47 경남48 제주50.
- 독도는 단순화 과정에서 지워지지 않게 `-explode` 후 단순화한다(build-regions.mjs 주석 참고).
- 전남광주 표시 줄임말: 옛 광주 구는 '광주', 시·군은 '전남' (`properties.short`).

### news.json 항목 스키마 (현재)
```js
{ id, src: 'sms'|'wrn'|'brief', cat: '재난'|'기상'|'사건'|'교통'|'개발'|'행정'|'생활'|'정책',
  title, body?, time /*ISO*/, sgg: ['11440'], sido: ['26'], source, license?, url?,
  level?, kind?, onMap? /*false면 지도에 안 찍음*/ }
```
최상위: `{ updated, sources: { sms|wrn|brief: { ok, count|note, at } }, items }`.
(장기 목표 스키마 — sourceId, kind event/state/place, status, affectedRegions 등 — 는 점진 도입. 현재 코드에 없다.)

## 5. 데이터 출처 현황
| 출처 | 상태 | 비고 |
|---|---|---|
| 긴급재난문자 | 작동 | 최근 하루·최대 3페이지(하루 호출 ≤432). 실종자 문자는 개인정보 때문에 24시간만 보관. 공공누리 유형 표기 불일치(3/4유형) — 유료화 전 행안부 확인 필요 |
| 기상특보 | 작동 | 예비특보는 '발표', 주의보·경보는 '발효'. 광역시 내 권역(서울동남권 등)은 시·도 전체로 표시 |
| 정책브리핑 | 작동, **목록 전용** | `cat:'정책'`, `onMap:false`. 제목에 지명 있는 1유형만. 표시는 "관련: ○○" |
| ITS 돌발상황·재난상황 | **키 등록(ITS_KEY), 미연동** | `openapi.its.go.kr:9443/eventInfo`, `/disasterInfo`. **GitHub(해외) IP에서 연결 시간 초과** → 국내 서버 필요. 월 1,000건 한도 → 약 45~60분 간격. 국내 IP에서는 정상 응답(XML/JSON) 확인 |
| 지진정보 | 작동 (2026-10-21) | API허브 eqk_now.php. 소식 지도에 진앙 점(24h, 72h까지 흐리게). 국외 '국내영향없음' 제외, 조기경보만 긴급 |
| 전국문화축제 표준데이터 | 작동 | data.go.kr 15013104 → festivals.json, 동네 탐험 '축제' |
| 기상청 초단기실황·단기예보 | 작동 | 15084084. 시·군·구 대표 격자 → weather.json(매시), forecast.json(05·17시). 동네 탐험 '날씨' |
| 오피넷 기름값 | 작동 | OPINET_KEY → fuel.json(3시간). 좌표 KATEC→WGS84(lib/katec.mjs) |
| 식품안심업소(위생등급) | 작동 | 식품안전나라 C004 전체 파일(gzip CSV), FOODSAFETY_KEY → food/<코드>.json(하루). 좌표 없음, 목록 전용. '맛집' 표현 금지 |
| 주차장 | 작동 | 전국주차장정보표준데이터(15012896) + 서울 공영주차장 안내(GetParkInfo, 빈 구 보강) → parking/<코드>.json(하루), 서울 시영 실시간(GetParkingInfo, SEOUL_KEY) → parking-live.json(매번) |
| 생활기상지수 V5 | 응답 확인, 미연동 | LivingWthrIdxServiceV5 getUVIdxV5·getAirDiffusionIdxV5 (V4 아님) |
| 에어코리아 대기질·측정소정보 | 대기질 응답 확인, 측정소정보 키 반영 대기 | 측정소 주소로 시·군·구 매칭 예정. '전국' 조회는 시간 초과 → 시·도별 |
| 태풍 | 목록(typ_lst)만 작동 | 진로 API는 별도 활용신청 필요 |
| 네이버 뉴스 검색 API | **사용 안 함** | 2026-07 신규 가입 종료, 2026-10 약관상 서버 저장·수익화 금지 |
| 지자체 보도자료 | 보류 | 전국 통합 API 없음 |

- GitHub Secrets: `SAFETYDATA_KEY`, `KMA_APIHUB_KEY`, `DATA_GO_KR_KEY`, `ITS_KEY`, `OPINET_KEY`, `FOODSAFETY_KEY`, `SEOUL_KEY`.
- 간격 두는 자료(기름값·예보·식품·주차장)는 직전 배포 파일을 재사용한다. 지금 새로 받으려면 Actions → collect-and-deploy → Run workflow에서 force 체크.
- 주소·좌표가 있는 곳은 카카오맵 공개 링크로 연결(routeLink/addressLink, 키·요금 없음).
- **로고 확정(2026-10-21): 최종2** — 원본 `scripts/assets/logo-final2.png`. `scripts/logo-mark.mjs`가 원본 모양을 내장하며 밝은 화면은 노랑·진회색, 다크모드는 노랑 유지·흰 도로·회색 배경(헤더는 배경 투명). 헤더(`web/icons/logo-header*.png`, 48px용 3배 PNG)/PWA/스토어 아이콘에 적용. 마스크형·Android 전경은 안전 영역 안으로 축소. 재생성: `node scripts/build-icons.mjs`. 실제 알파 PNG `scripts/assets/logo-cutout*.png`를 사용하며 축소 시 배경 제거 필터를 쓰지 않는다. Android 리소스는 `store/android-icons/`에 준비했으나 이 PC에 android/가 없어 패키지 반영·실기기 검증은 미완료. 스토어 대표 이미지 갱신은 별도 필요. 소개문구는 “동네 소식, 날래 왔다오”(날래 강조)로 확정. 공공데이터포털은 계정당 키 1개라 새 데이터도 `DATA_GO_KR_KEY` 하나로 쓴다.
- GitHub Actions에서 가끔 모든 출처가 `fetch failed`로 실패한다(해외 IP 문제로 추정). 수집기에 1회 재시도와 원인 코드 기록이 있다. 국내 서버로 옮기면 해결될 것으로 본다.

## 6. 진행 중: 국내 수집 서버 (Oracle Cloud 무료, 서울 리전)
- 사용자가 Oracle Cloud Always Free 가입 진행 중(홈 리전 서울 필수).
- 준비된 것: `server/setup.sh`(Node 22, clone, systemd 10분 타이머), `server/run.sh`(main 최신화 → collect → `data` 브랜치에 news.json 단일 커밋 강제 푸시 → `repository_dispatch: news-updated`), `server/env.example`.
- `deploy.yml`: 저장소 변수 `COLLECTOR=server`면 예약 실행을 건너뛰고 `data` 브랜치의 news.json으로 배포. 변수가 없으면 지금처럼 Actions가 직접 수집.
- 남은 일: VM 생성 → setup.sh → `~/nallae.env`에 키 + **fine-grained PAT**(nallae-app/nallae 하나, Contents 읽기·쓰기) → run.sh 시험 → `COLLECTOR=server` 설정 → ITS 출처(`scripts/sources/its.mjs`) 추가(호출 간격은 출처별로 따로 제한).
- ITS 이벤트는 좌표 한 점이라 지도에 **점 마커** 기능이 새로 필요하다(지금은 시·군·구 면만 반짝임).

## 7. 출시(Google Play) 진행 상황
- 공개 브랜드와 계정 소유자는 별개다. 공개 표기는 "날래 개발자" / nallae.app@gmail.com을 유지한다. Play의 개인 계정 법적 이름 공개 요건은 별도이며 완전 익명을 보장하지 않는다. 계정·패키지 정리 현황은 `docs/BRAND_ACCOUNTS.md` 참고.
- 개발자 계정(개인, 개발자명 비실명) 생성·등록비 결제 완료. Android 기기 확인 완료.
- **신원 확인 Google 심사 중**(주소 증빙: 90일 내 공과금·카드·은행 명세서·임대계약서만 허용, 주민등록등본 불가). 전화번호 인증은 그 뒤.
- 남은 일: 앱 만들기 → 비공개 테스트에 `android/pkg/*.aab` 업로드(Play 앱 서명 사용) → **Play 앱 서명 키 SHA-256을 루트 저장소 assetlinks.json에 추가** → 안드로이드 테스터 12명 × 14일 → 프로덕션 신청.
- 실데이터 스크린샷 교체(`node scripts/screenshots.mjs`, 지금 store/ 이미지는 데모).
- 개인정보처리방침 시행일 확정, 위치정보법 신고 대상 여부 문의(위치는 기기 안에서만 처리).

## 8. 다음 기능 순서 (합의된 우선순위, 2026-10-21 갱신)
0. 디자인 1단계 마감(A안 + 꿀색 로고, 지명 라벨, 말풍선 정리) — 브랜치 design/stage-1
1. 관심 지역(최대 5곳, 기기 안 저장, 그중 하나를 시작 화면으로 지정 가능 — 기본은 전국) + 출처별 최신성 표시 + 발효 중 특보 지도 유지 + 데이터 없는 분류 칩 숨김
2. 모바일 시트 3단계 끌기
3. 국내 서버 + ITS 교통 돌발정보(1주 비노출 수집 후 판단, 점 마커)
4. 전국문화축제(장소 보기)
5. 에어코리아 대기질, 단기·초단기예보(상태 레이어), 선택형 알림(별도 결정)
- 디자인·방향 토론과 결정 기록: docs/discussion/ROADMAP_DEBATE.md, 디자인 요청서: docs/design/DESIGN_BRIEF.md
- 장소(MAP)·광고 등 확장은 출시·이용자 검증 뒤. 날래는 공식 재난 알림을 대체하지 않는 2차 정보 서비스로 소개한다.

## 9. 개발 방법
```powershell
npm install
powershell -ExecutionPolicy Bypass -File tools\serve.ps1     # http://localhost:5173/?demo  (&debug, &near=11440, &open)
node --test "scripts/test/*.test.mjs"
node scripts/make-demo.mjs
```
- Windows 개발 PC(Node는 `C:\Program Files\nodejs`). gh CLI 활성 계정은 개인 계정 — 다른 계정으로 작업하지 않는다.
- 웹 코드를 바꾸면 `web/sw.js`의 `VERSION`을 올려 캐시를 갱신한다.
- 배포 확인: `gh run list -R nallae-app/nallae`, 결과물 `https://nallae-app.github.io/nallae/data/news.json`.
