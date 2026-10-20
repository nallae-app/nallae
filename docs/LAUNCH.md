# 날래 출시 체크리스트 (Android, Google Play)

구성: **웹앱(PWA)** → GitHub Pages에 배포, GitHub Actions가 10분마다 소식 수집 → **TWA**(Trusted Web Activity)로 감싸 Play에 올림.

✋ = 직접 해야 하는 일 (계정·결제·본인인증·키 발급) · 🤖 = Claude가 할 수 있는 일

---

## 1단계 — 저장소와 배포 (무료)

- [x] ✋ **개인** GitHub 계정 준비 (회사 계정 X)
- [ ] ✋ 새 저장소 만들기: 이름 `nallae`, **Public** (Private이면 10분 주기 Actions 무료 시간이 부족)
- [ ] 🤖 로컬 git 초기화 + 개인 계정 이름/이메일로 커밋 + 푸시 (푸시 권한은 로그인 필요)
- [ ] ✋ 저장소 Settings → Pages → Source: **GitHub Actions**
- [ ] 🤖 첫 배포 확인: `https://<사용자명>.github.io/nallae/`

> 참고: 공개 저장소의 예약(cron) 실행은 저장소에 60일간 활동이 없으면 GitHub가 멈춘다. 두 달에 한 번은 커밋하거나 Actions 화면에서 다시 켠다.

## 2단계 — 데이터 API 키 (무료, 각 사이트 회원가입 필요)

| 저장소 Secret 이름 | 발급처 | 신청할 API |
|---|---|---|
| `SAFETYDATA_KEY` | [재난안전데이터공유플랫폼](https://www.safetydata.go.kr/disaster-data/view?dataSn=228) | 긴급재난문자 (DSSP-IF-00247) |
| `KMA_APIHUB_KEY` | [기상청 API허브](https://apihub.kma.go.kr/apiList.do?seqApi=10&seqApiSub=288) | 특보현황 (wrn_now_data) |
| `DATA_GO_KR_KEY` | [공공데이터포털](https://www.data.go.kr/data/15095335/openapi.do) | 정책브리핑 정책뉴스 (자동승인) |

- [ ] ✋ 위 3개 키 발급
- [ ] ✋ 저장소 Settings → Secrets and variables → Actions → New repository secret 으로 등록 (키를 채팅에 붙여넣지 말 것)
- [ ] 🤖 실제 응답으로 파서 점검 (응답 형식이 문서와 다르면 `scripts/sources/*`와 테스트 수정)

**이용 조건 확인 필요**
- 긴급재난문자: safetydata.go.kr에는 공공누리 3유형(상업 이용 가능·변경 금지), data.go.kr 목록에는 4유형(상업 이용 금지)으로 서로 다르게 적혀 있다. 무료·광고 없는 지금은 두 조건 모두 맞지만, **유료화 전에 행정안전부 재난정보통신과(044-205-8461)에 확인**한다. 본문은 바꾸지 않고 그대로 보여준다.
- 네이버 뉴스 검색 API는 쓰지 않는다: 2026-07-30 신규 가입 종료, 2026-10-07 약관 개정으로 서버 저장·광고·수익화가 금지됐다.

## 3단계 — 앱 정보 채우기

- [x] 연락 이메일 rehyyn@gmail.com, 운영자 표시 "날래 개발자" 반영
- [ ] ✋ 개인정보처리방침 시행일 정하기 (`web/privacy.html`)
- [ ] ✋ **위치정보법 확인**: 위치를 기기 안에서만 쓰고 수집·전송하지 않지만, 위치기반서비스사업 신고 대상인지 [위치정보지원센터](https://www.lbsc.kr) 또는 방송통신위원회에 문의해 답을 받아둔다.

## 4단계 — Android 패키지 만들기 (TWA)

- [ ] ✋ 패키지 이름 정하기 (한 번 정하면 못 바꿈). 예: `io.github.<사용자명>.nallae`
- [ ] ✋ [PWABuilder](https://www.pwabuilder.com) 에 배포 주소 입력 → Package for stores → **Android** → Google Play
  - Package ID: 위 패키지 이름 / App name: 날래 / Launcher name: 날래
  - Signing key: **New** (PWABuilder가 만들어 줌)
  - 내려받은 zip 안의 **서명 키(.keystore)와 비밀번호 파일은 절대 잃어버리거나 저장소에 올리지 말 것** — 잃으면 앱 업데이트 불가 (Play 앱 서명을 쓰면 '업로드 키'만 재설정 가능)
- [ ] 🤖 zip 안의 `assetlinks.json`을 `web/.well-known/assetlinks.json`으로 넣고 배포 → 앱 상단 주소창이 사라지는지 확인

## 5단계 — Google Play Console

- [ ] ✋ [Play Console](https://play.google.com/console) 개발자 계정 등록 ($25, 1회) + 본인 인증
- [ ] ✋ 앱 만들기 → 무료 앱 / 앱(게임 아님)
- [ ] ✋ 스토어 등록정보 입력 — 문구와 그림은 `store/` 폴더 (`store/listing.md`)
  - 스크린샷은 지금 데모 데이터 화면이다. **실제 데이터가 들어온 뒤 다시 찍어 교체**한다 (`node scripts/screenshots.mjs`를 실데이터 주소로).
- [ ] ✋ 앱 콘텐츠: 개인정보처리방침 URL, 광고 없음, 데이터 보안(수집 없음), 콘텐츠 등급, 타겟층 — 답변 초안은 `store/listing.md`
- [ ] ✋ **비공개 테스트: 테스터 12명 이상이 14일 연속 참여** (2023-11 이후 만든 개인 계정 필수 조건)
  - 테스터 모집용 문구가 필요하면 🤖에게 요청
- [ ] ✋ 14일 뒤 프로덕션 액세스 신청 → 심사 → 출시

## 출시 후

- [ ] 🤖 실데이터 스크린샷 교체
- [ ] 제작기 정리 ("AI로 앱을 만들어 스토어에 올리기까지")
- 다음 기능 후보: 푸시 알림(웹 푸시), 읍·면·동 단위, 관심 지역 여러 곳, 지자체 보도자료(시·군·구별 API 개별 연결)
