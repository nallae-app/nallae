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
| Android 패키지 | `app.nallae` — 사용자 사용 가능 확인·확정(2026-10-22). 새 서명 AAB/APK 생성 및 루트 TWA 연결 추가 완료. Play 앱 서명 인증서 연결·실기기 검증은 남음. `docs/BRAND_ACCOUNTS.md` 참고 |
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

## 10. 사용자 승인 최신 방향 (2026-10-25)
- 앞으로 제품·UI/UX의 주요 결정과 구현 전후 검토는 root(Codex)·독립 GPT 검토자·실제 Claude의 교차 토론을 유지한다. 사용자 명시 요청이며 의견을 지어내지 않는다. Claude 연결이 없으면 확인 가능한 범위를 밝힌다.
- 중심 목적: 오늘 어디 갈지 막막할 때 방문 이유를 보고 근처 코스를 고른다. 하단 코스/맛집/저장/소식·생활; 소개 문구는 “오늘 어디 갈까, 날래!”로 전환. 기존 소식·생활 기능 유지.
- 실제 방문 제보를 운영자가 검토한 장소/고정 코스와 거리 기반 자동 조합을 구분. 검토는 방문 인증이 아니다. 제보자·평점·추천 수를 창작하지 않는다.
- 자동 코스는 기본 2곳, 선택 3곳·처음 3후보+3개 더 보기. 4곳은 실제 제보 기반만. 개인 전체 코스 별점/후기는 기기 안 기록이며 공개 평균·방문자 수로 표시하지 않는다. 공개 게시판/공유 리뷰 서버는 별도 운영 검증까지 보류한다.
- 제보 초안은 로컬 저장, 메일은 사용자가 직접 전송한다. 개인정보 안내·공개 동의·관계 표시·공개좌표 검토·삭제 대응은 docs/design/COMMUNITY_CONTENT_OPERATIONS.md를 따른다.

## 11. 지삐 브랜드 적용 (2026-11-04)
- 사용자가 별도 디자인 대화의 확정 로고를 읽어 실제 앱에 적용하도록 승인했다. 현재 표시 브랜드는 **지삐**. 헤더 문구는 **우리의 지기, 지삐**, 첫 안내·소개는 **오늘 어디 갈지 모르겠어? / 지삐지기와 함께라면 / 언제나 백전백승**. 합성어에서는 ‘지삐’ 두 글자만 강조한다.
- 최종 확정 원본: `scripts/assets/jippi/final/approved-gpt.png`. GPT에 제작 의뢰해 받은 결과를 사용자가 최종 승인했다. 위의 타일 없는 핀·지도·노란 광선 심벌은 헤더/파비콘, 아래 남색·크림색 타일은 큰 앱 아이콘이다. 다크는 흰 ‘지’+노란 ‘삐’, 라이트는 남색 ‘지’+노란 ‘삐’. 색·글자·비율을 임의로 바꾸지 않는다. 이전 `selected-sheet.png`는 과거 시안이다.
- 재생성: `node scripts/build-jippi-assets.mjs` → `node scripts/build-icons.mjs`. 브랜드 민트색은 사용하지 않는다. 작은 글자/버튼에는 대비를 확보한 진한 주황/밝은 주황을 쓴다.
- 앱 URL·Android 패키지 `app.nallae`·서명·브라우저 저장 키는 유지한다. 공개 운영자명 `날래 개발자`와 공개 메일도 별도 변경 승인 전까지 유지한다.
- 웹/PWA 이름·아이콘 변경과 Android 설치 앱의 런처 이름·아이콘 변경은 별개다. `store/android-icons/`는 새 리소스 준비본이며 Android 프로젝트 소스가 없어 새 AAB 반영·Play 업로드·실기기 업데이트 검증은 미완료다.
- 대화형 AI 검색은 기획 단계다. 이번 브랜드 변경에 구현된 것으로 표시하거나 AI 검색 기능이 있다고 광고하지 않는다.
- 헤더·파비콘에는 GPT 제작본에서 추출한 `final/symbol-light.png`/`final/symbol-dark.png`의 실제 알파 심벌을 쓴다. 직접 다시 그린 SVG나 흰 여백이 남은 비교판 타일로 대체하지 않는다. 원본이 부족하면 GPT에 의뢰해서 받아 적용한다.

### 설치 아이콘·헤더 후속 검수 (2026-11-07)
- `docs/design/JIPPI_ICON_QA_20261107.md`에 실제 Claude·독립 GPT·Codex의 반론과 반영 기록이 있다. 원본은 보존하고 iOS/PWA 설치 PNG만 불투명 합성한다. iOS는 전용180px `apple-touch-icon-jippi-v1.png`를 참조한다. 헤더 심벌의 투명도와 설치 아이콘의 불투명도를 혼동하지 않는다.
- Android 컬러 전경은 .56, 다른 원본을 쓰는 단색은 .46. 108dp 중66dp 안전 원에서 핵심 그림을 검증하고 장식 타일·약한 그림자와 구분한다. 임의 배경 제거 필터나 재도안으로 원본을 바꾸지 않는다.
- 헤더의 작은 카드 배경은 제거했다. 헤더 전체를 글자 끝까지 불투명하게 보호하고 하단16px에서만 지도 쪽으로 사라지게 한다. 좁은 폭의 버튼 이름은 보조기기에 유지한다.
- 이 PC에서 기존 Android 프로젝트·업로드 키를 발견했다. Git 제외 `android/jippi-20261107/`의1.0.1/code2 후속으로, 삼단 검수한1.0.2/code3을 `android/jippi-icons-20261107/`에서 빌드·서명 검증하고 Alpha에 업로드했다. 최신 스토어 이미지와 함께 Google 검토 전송을 요청해 ‘검토 중인 변경사항’ 상태를 확인했다. 설치·심사 완료 여부는 별도 확인하며 원본 패키지·키를 덮지 않는다.


## 출시 전 사용성·설치 아이콘 후속 (2026-11-14)
- 사용자는 부캉이를 코스·맛집을 포함한 모든 화면에 유지하라고 확인했다. 기능 삭제·숨김은 사전 확인한다.
- 설치 아이콘의 바깥 흰 매트·중첩 타일을 제거한다. 승인 원본과 헤더 심벌은 보존하고, glyph 픽셀·상대 비율을 유지한 채 타일 안쪽 배경만 끝까지 연장한다. iOS URL은 `apple-touch-icon-v2.png`, SW는 v77이다.
- Android 컬러 전경은 배경을 채운 704px 캔버스를 432px로 균일 축소한 준비 자산이다. 과거 .56 타일 전경과 구분한다. 66dp 안전 원 검사를 통과했으며 단색은 .46을 유지한다. 실제 AAB 반영·실기기 확인은 별도다.
- 코스의 ‘외출 전에’는 최신 2시간 실황과 한국 날짜의 오늘 등록 축제(선택 동네·맞닿은 동네)를 확인한다. 오래됨·실패는 현재 상태로 단정하지 않는다.
- 저장 코스에서 ‘이번엔 여기’를 지정하면 다음 실행의 코스 화면에서 바로 꺼낸다. `nallae-next-plan-v1`에는 코스 ID만 저장한다. 기존 저장·개인 후기는 보존한다.
- 최초 코스는 인덱스·식당·좌표 3종만 기다리고 무관한 생활 자료를 기다리지 않는다. 자료 요청에는 제한시간, 갱신 JSON에는 네트워크 우선·캐시 복귀를 적용한다. 정적 지도 경계는 캐시 우선이다.
- 실제 Console에서 프로덕션 액세스 승인과 Alpha 1.0.2/code3을 확인했다. 출시 체크리스트의 최신 상태를 우선하며 과거 ‘신원 심사 중·14일 대기’ 기록을 현재 상태로 단정하지 않는다.
- Codex·독립 GPT가 기능·코드 사후 검토를 수행했다. 실제 Claude는 1차 아이콘/SW 수정안과 한도 초기화 후 최종 제품 설명 검토에 응답했다. 코드를 직접 읽거나 이미지를 봤다는 주장은 하지 않는다. 새 서명 키를 만들자는 의견은 기존 앱 연속성에 맞지 않아 채택하지 않았다. 기존 설치 아이콘 캐시·느린 요청·저장값 소실 대응 의견을 검수했다.

- 2026-11-14 최신 Android 백업 확보: 11월 7일 소스·1.0.2/code3 서명이 Console 업로드 키와 일치했다. 원본과 별도인 `android/jippi-icons-20261114/`에서 1.0.3/code4를 만들었다. ABH 2.7.4, Maven Central, 새 adaptive/night/legacy 아이콘 적용. 서명 검증·lint 오류 0·지원 기기 감소 0. Alpha와 데이터 보안/건강 선언을 함께 검토 전송했다. 실기기 미연결로 업데이트·런처·TWA 실행은 확인 전이며 프로덕션 첫 출시는 보류한다. 실제 Claude 설명 검토도 이 잔여 확인을 지적했다.

- Android 외곽 사진 후속: 실제 1.0.2/1.0.3 AAB 전경을 동일 OS 마스크로 비교해 1.0.3의 이중 타일 제거를 검증했다. 색상 전경의 alpha255·마스크 외곽 흰 매트0 회귀시험 추가로 전체128개 통과.
- Console 최신 상태: 조직 계정 요구로 기존 제출이 거부됐다. 건강 신고의 의료 범주 두 가지를 넓게 선택할 때 계정 요건을 함께 검토하지 못했다. `기타`에 약국·응급실 공공 주소/전화/등록시간과 일반 재난정보를 명시하고 진단·치료·응급처치 교육·예약·건강기록·개인 건강자료·실시간 병상을 제공하지 않음을 밝혀 Alpha/code4·데이터보안과 재전송했다. none으로 숨기거나 기능을 임의 삭제하지 않았다. 기타가 조직 요건 면제라는 근거는 없으며 Google 승인 전이다. GPT/Claude 의견 차이도 남기고 전체 합의라고 보고하지 않는다.

## 출시 전 추가 교차 검토 마감 (2026-11-14, 웹 v78)
- 실제 Claude의 공개 코드 읽기 검토·독립 GPT·Codex의 수정/사후 검토를 반복했다. 승인된 기능과 부캉이는 유지한다.
- 주차 실황은 관측/수집이 모두 30분 이내인 경우만 최근 빈자리로 쓴다. 지난 관측은 날짜·시각과 확인 필요로 보존하며 지도 여유/혼잡·빈자리 필터의 현재값으로 쓰지 않는다.
- 첫 방문에서 워커가 아직 제어하지 않아도 공개 JSON 본문 수신을 12초로 제한한다. 지역 코스/약국/식품/주차 요청은 실패·재시도로 복구한다.
- 늦은 GPS 성공/오류가 새 요청·수동 선택한 동네를 덮지 않으며 권한 거부와 시간 초과를 구분한다.
- 모바일 출발점 선택은 목록을 다시 올리거나 화면을 바꿔 취소할 수 있다. Esc도 유지한다.
- 저장 성공·해제·한도 초과 안내를 구분하고, 다시 그린 저장 버튼/저장 탭으로 초점을 복구한다.
- 식당 목록 수신 실패 때 저장 ID를 없애거나 0곳이라고 표시하지 않는다. 미확인 수와 목록 재시도를 제공한다.
- 앱 껍데기 교체 때 이전 정상 JSON을 이관한다. 저장공간 오류면 원본을 보존하고 가장 최신 own-cache부터 복구한다. 다른 앱·미래 설치 캐시는 삭제하지 않는다.
- 회귀시험 전체 146개 통과. 실제 인앱 로컬 신규 origin에서 저장 후 초점 유지, 오래된 주차 안내, 터치 출발점 취소를 확인했다. 실패/중단/캐시 이관은 실제 함수·워커 VM 시험으로 재현했다.

- 최신 출시 결과: Console 제출 #9(Alpha 1.0.3/code4 + 데이터 보안 + 건강 기타 상세 설명)가 2026-11-14 14:32(KST) 출시됨으로 반영됐다. 앞선 조직 계정 요구 거부 기록과 이 최신 결과를 구분한다. 프로덕션 code4 초안은 출시 준비됨 미리보기 후 저장했으며 미전송 1건, 공개 출시 전이다. 실데이터 휴대전화 스크린샷 5장(432×864)을 별도 준비했고 기존 자산은 보존했다.
- Android 사전 검수 환경: 공식 API36/Google APIs arm64 Pixel8 가상기기를 설치·부팅하고 기존 1.0.2 APK를 설치했다. 실제 화면 조작 도구가 Qt 창에서 반복 시간 초과되어 런처/업데이트/TWA 실행은 확인 전이다. 사용자가 ADB UI 검수를 명시 승인하기 전에는 ADB 터치·화면촬영을 실행하지 않는다. 설치/패키지 확인은 개발 CLI로만 수행했다.
- Android 경고 검토: ABH2.7.4 LauncherActivity는 이미 WindowCompat.enableEdgeToEdge를 적용한다. WebView fallback의 bar-color API는 API34 이하 조건이며 현 fallbackType은 customtabs다. 경고 제거만을 위해 호환 코드를 삭제하지 않는다. sw600 이상 태블릿 방향 설정 변경은 실제 검수 후 필요분만 판단한다.

## Android ADB 검수·백업 정리 완료 (2026-11-14)
- 사용자 명시 승인으로 생성한 가상기기에서만 ADB 화면 조작·촬영을 수행했다. API36/Chrome133, 로컬 업로드키 서명 APK 1.0.2→1.0.3 업데이트 후 최초 설치시각·저장 코스·이번엔 여기 유지, 실제 런처 흰 고리 제거, 주소창 없는 TWA, 다크 대화상자·키보드 버튼 접근을 확인했다. 사용하지 않은 후기·별점은 기록하지 않았다.
- 넓은 세로 화면은 정상이나 가로는 portrait letterbox가 남았다. 실제 Play 서명·OneUI·최신 Chrome·실물 태블릿 검증 완료로 확대하지 않는다. 시험 설정은 원복했다. 독립 GPT는 실제 증거 6장을 검토해 새 출시차단 결함을 찾지 못했다.
- 키 관련 백업 3개 항목을 android/백업원본/에 순수 이동했다. 1,709개 파일, 189,842,968bytes의 전후 SHA-256이 모두 일치한다. .정리기록/Android-백업원본-이동-20261114/에 대응표·검증·수정 목록을 남겼다. 개인 서명/감사 도구의 경로만 갱신하고 키 내용은 열거나 출력하지 않았다. Android 전체 Git 제외를 유지한다.

## 2026-11-14 18:56 최신 준비·전송 결과
- Android **1.0.4/code5**: 기존 업로드 인증서 유지. API26 초과 휴대전화는 세로, sw600 이상은 런타임 TWA Intent에 any를 전달한다. 메타데이터 리소스만 바꾸는 최초안은 실제 가상기기에서 실패해 채택하지 않았다. 최종안은 ABH2.7.4의 provider/session/token/lifecycle 경로를 유지하고 launch 직전 orientation만 설정한다.
- API36/Chrome133 가상기기에서 태블릿 가로 콜드 시작·세로 전환·가로 재회전, 휴대전화 세로 유지, code3→4→5 업데이트와 저장1/이번엔여기 유지 확인. 양쪽 세로 letterbox 해소. phone AVD 노치의 DISPLAY_CUTOUT 안전 여백과 구분한다. 실제 태블릿/OEM/Play서명설치 검증 한계는 유지한다.
- 웹 **v80**, 코드6903ae1 배포 성공·공개 app.js/style.css/sw.js 해시 일치. 회색 기본 버튼2개를 기존 보조 버튼 스타일로 통일했다. 명시 화면/분류 변경은 panel/feed를 함께 초기화하며, 소식↔생활 복귀는 화면별 읽던 위치를 보존한다. 자동/주차 갱신·저장 후 초점 복원은 유지한다. 실제 Android에서 코스 아래→날씨 첫 지역·기온 표시를 재검증했다.
- 자동시험 **150개 통과**, Android compile/lint/assemble/bundle 및 기존 인증서·APK/AAB 서명 검증 통과. 독립 GPT는 코드/실제 증거를, 실제 Claude는 공개 diff와 구현 설명을 검토했다. Claude가 직접 native 화면을 봤다는 주장은 하지 않는다.
- 실제 Android 스토어 화면4장을 **1080×1920**으로 촬영해 코스/맛집/날씨/소식 순서로 저장했다. 432×768 준비본과 비율이 맞지 않았던 과거 준비본은 보존하되 최종 업로드본과 구분한다.
- Console **제출 #10, 2026-11-14 18:56 KST**, 프로덕션1.0.4·Alpha1.0.4·휴대전화 스크린샷3건 **검토 중** 확인. 기존 프로덕션code4초안은 최신code5초안으로 대체됐으며 이전 버전을 공개 전송하지 않았다. 관리형 게시를 켜 승인과 공개 시점을 분리했다. 새code5승인/실제공개 완료를 뜻하지 않는다.

## 일본·중국 여행 시작판 (2026-11-14)

- 사용자 승인에 따라 현지어 저배율 지도, 확대 시 한국어 병기와 여행 데이트 코스를 추가했다. `web/overseas-map.js`, `web/overseas-courses.js`, `web/data/overseas-courses.json`을 사용한다. 실제 범위는 오사카·교토·상하이의 12장소·6조합이며 전역 제공으로 광고하지 않는다.
- 국내 선택·코스·저장·이번엔 여기·소식·생활과 부캉이를 유지한다. 여행 저장은 `jippi-overseas-plans-v1` 별도 키를 쓰고 카탈로그에서 빠진 식별번호도 임의 삭제하지 않는다. 상세지도는 선택해서 켜고, 끄거나 국내로 돌아오면 요청과 GL을 종료한다.
- 한국어 이름이 없는 벡터는 현지어로 대체한다. 외부 물 이름·국경선은 숨기며 기존 한국·독도 한글 표시는 유지한다. Amap은 제품 허가 조건이 불명확해 추가하지 않았다. 좌표는 대표 위치이며 입구·보행 안내가 아니다.
- 실제 삼단 검토 기록은 `docs/design/OVERSEAS_PILOT.md`에 있다. 관측한 Android Emulator+SwiftShader의 렌더링 실패는 기본 지도로 대체한다. 브라우저 상세지도 성공과 가상기기 대체 성공을 새 상세지도의 실폰 검수로 혼동하지 않는다. 최신 Play 제출11(20:31 KST)은 검토 중이다.

### 아이폰 홈 화면 갱신 보완 (v84)
- HTML 탐색은 본문 수신까지4초 제한의 네트워크 우선, 오프라인은 canonical HTML 캐시다. 자체 JS/CSS의 URL 쿼리, SW precache, index data-app-version, data/app-release.json의 버전을 함께 맞춘다.
- release-update.js는 복귀 시 새 버전을 점검하고 사용자 적용 버튼만 제공한다. 강제 재시작·저장 초기화는 하지 않는다. 버전이 붙은 JS/CSS 캐시 적중을 미래 서버 코드로 뒤에서 덮지 않는다.
- 여행 직접 진입은 `?travel=1&appv=84`이며 시작 관심 지역 뒤에 적용한다. 기존 아이폰 문서는 최초 재실행이 한두 번 필요할 수 있으며, 실물 갱신을 확인하지 않았다면 완료라고 단정하지 않는다.


### v85 국내 중심·지명 동기화 (2026-11-14)
- 확정 지삐 심벌·워드마크·글꼴 자산은 유지한다. 사용자 UI 전면 재설계 승인은 재브랜딩 승인이 아니다.
- v84의 여행 직접 링크 설명은 변경됐다. `?travel=1`도 첫 화면은 한국 지도와 국내 동네 선택이다. 넓은 동아시아 개요는 여행 화면에서 ‘지도에서 도시 고르기’를 직접 눌렀을 때만 표시한다.
- 해외 큰 알약을 없애고 가시 영역 중심·배율에 맞는 작은 단일 탐색 버튼으로 유도한다. 실제 좌표 도시 라벨과 화면 이동 버튼을 혼동하지 않는다.
- 국내 지명은 Leaflet Marker가 이동/확대를 처리한다. 동작 중 전체 라벨 위치/겹침 재계산을 되살리지 않는다.
- 원래 소개·제보·상세 조건은 펼침/선택 창에 보존하고, 외출 요약·여행 탐색은 코스 목록 뒤에 둔다. 삼단 검토/한계는 docs/design/OVERSEAS_PILOT.md v85 기록 참고.
