# 날래 출시 체크리스트 (Android, Google Play)

구성: **웹앱(PWA)** → GitHub Pages에 배포, GitHub Actions가 10분마다 소식 수집 → **TWA**(Trusted Web Activity)로 감싸 Play에 올림.

✋ = 직접 해야 하는 일 (계정·결제·본인인증·키 발급) · 🤖 = Claude가 할 수 있는 일

---

## 1단계 — 저장소와 배포 (무료)

- [x] ✋ 개인 GitHub 계정 + 조직 `nallae-app` (공개 주소에 개인 아이디가 드러나지 않게)
- [x] ✋ 새 저장소 만들기: 이름 `nallae`, **Public** (Private이면 10분 주기 Actions 무료 시간이 부족)
- [x] 🤖 로컬 git 초기화 + 개인 계정 이름/이메일로 커밋 + 푸시 (푸시 권한은 로그인 필요)
- [x] ✋ 저장소 Settings → Pages → Source: **GitHub Actions**
- [x] 🤖 첫 배포 확인: https://nallae-app.github.io/nallae/

> 참고: 공개 저장소의 예약(cron) 실행은 저장소에 60일간 활동이 없으면 GitHub가 멈춘다. 두 달에 한 번은 커밋하거나 Actions 화면에서 다시 켠다.

## 2단계 — 데이터 API 키 (무료, 각 사이트 회원가입 필요)

| 저장소 Secret 이름 | 발급처 | 신청할 API |
|---|---|---|
| `SAFETYDATA_KEY` | [재난안전데이터공유플랫폼](https://www.safetydata.go.kr/disaster-data/view?dataSn=228) | 긴급재난문자 (DSSP-IF-00247) |
| `KMA_APIHUB_KEY` | [기상청 API허브](https://apihub.kma.go.kr/apiList.do?seqApi=10&seqApiSub=288) | 특보현황 (wrn_now_data) |
| `DATA_GO_KR_KEY` | [공공데이터포털](https://www.data.go.kr/data/15095335/openapi.do) | 정책브리핑 정책뉴스 (자동승인) |

- [x] ✋ 위 3개 키 발급
- [x] ✋ 저장소 Settings → Secrets and variables → Actions → New repository secret 으로 등록 (키를 채팅에 붙여넣지 말 것)
- [x] 🤖 실제 응답으로 파서 점검 (응답 형식이 문서와 다르면 `scripts/sources/*`와 테스트 수정)

**이용 조건 확인 필요**
- 긴급재난문자: safetydata.go.kr에는 공공누리 3유형(상업 이용 가능·변경 금지), data.go.kr 목록에는 4유형(상업 이용 금지)으로 서로 다르게 적혀 있다. 무료·광고 없는 지금은 두 조건 모두 맞지만, **유료화 전에 행정안전부 재난정보통신과(044-205-8461)에 확인**한다. 본문은 바꾸지 않고 그대로 보여준다.
- 네이버 뉴스 검색 API는 쓰지 않는다: 2026-07-30 신규 가입 종료, 2026-10-07 약관 개정으로 서버 저장·광고·수익화가 금지됐다.

## 3단계 — 앱 정보 채우기

- [x] 공개 연락 이메일 nallae.app@gmail.com (브랜드 계정), 운영자 표시 "날래 개발자" 반영
- [ ] ✋ 개인정보처리방침 시행일 정하기 (`web/privacy.html`)
- [ ] ✋ **위치정보법 확인**: 위치를 기기 안에서만 쓰고 수집·전송하지 않지만, 위치기반서비스사업 신고 대상인지 [위치정보지원센터](https://www.lbsc.kr) 또는 방송통신위원회에 문의해 답을 받아둔다.

## 4단계 — Android 패키지 만들기 (TWA)

- [x] 패키지 이름 **app.nallae**: 사용자 사용 가능 확인 후 확정(2026-10-22). 공식 PWABuilder에서 버전 1.0.0/code 1, target SDK 36, min SDK 24 새 AAB/APK·새 서명 키·소스 생성. 로컬 `android/app-nallae-20261022/package/` 보관(Git 제외). AAB 내부 패키지·서명·파일 해시와 루트 TWA 연결 공개 반영 확인. Play 앱 서명 인증서 연결 및 실기기 검증은 별도.
- [x] PWABuilder로 패키지 생성 (2026-10-20). 결과물은 `android/`(git 제외): `.aab`(Play 업로드용), `.apk`(휴대폰 직접 설치 시험용), `signing.keystore` + `signing-key-info.txt`
  - **서명 키와 비밀번호 파일은 개인 클라우드·USB에 따로 백업.** 잃으면 업데이트 불가
- [x] `assetlinks.json`을 조직 루트 저장소 [nallae-app/nallae-app.github.io](https://github.com/nallae-app/nallae-app.github.io)의 `.well-known/`에 배포 (TWA는 도메인 맨 위에서만 찾는다)
- [ ] 🤖 **Play Console에 처음 업로드한 뒤**: 설정 → 앱 무결성 → **앱 서명 키 SHA-256**을 `assetlinks.json`에 추가 (Play가 앱을 자기 키로 다시 서명하기 때문. 안 하면 스토어에서 받은 앱 위에 주소창이 보인다)

## 5단계 — Google Play Console

- [x] ✋ [Play Console](https://play.google.com/console) 개발자 계정 등록 (2026-10-20, 개인 계정, 개발자 이름 비실명) — 본인 인증 진행
- [x] Android 기기 확인 완료 / [ ] 신원 확인(Google 심사 중, 주소 증빙 서류 필요) / [ ] 전화번호 인증(신원 확인 후)
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
