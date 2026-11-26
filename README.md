# 지삐 — 오늘 어디 갈까

가까운 데이트 코스를 고르고 맛집·놀거리·일상 날씨와 생활 정보를 확인하는 지도 앱입니다. 웹앱(PWA)과 Android TWA에서 같은 서비스를 제공합니다.

- 국내 코스·맛집·놀거리, 기기 안 저장·개인 후기
- 준비된 일본·중국 여행 코스와 선택형 상세지도
- 일반 날씨 실황·오늘/내일 예보, 축제·주유소·주차장·식품안심업소
- 문화·교통·지역 개발 등 일반 생활 소식의 제목·공식 원문 링크

개인이 운영하며 정부기관의 공식 앱이나 대행 서비스가 아닙니다. 자료별 출처와 이용 조건은 [앱 정보](https://nallae-app.github.io/nallae/about.html), 외부 서비스·기기 저장 안내는 [개인정보처리방침](https://nallae-app.github.io/nallae/privacy.html)에서 확인할 수 있습니다.

## 개발

Node.js 22 이상에서 실행합니다.

```sh
npm ci
node --test 'scripts/test/*.test.mjs'
node scripts/make-demo.mjs
```

정적 서버의 루트는 `web/`입니다. `?demo`는 예시 자료이며 실제 운영 자료와 구분됩니다. 배포는 GitHub Pages의 `collect-and-deploy` workflow가 수행합니다.

## 구조

- `web/`: 공개 앱과 정적 장소 자료
- `scripts/`: 일반 생활 자료 수집·배포 범위 검증·회귀시험
- `server/`, `proxy/`: 수집 및 선택형 주유소 조회 도구
- `.github/workflows/`: 수집·시험·Pages 배포

이전 기능의 개발 이력은 저장소 기록에 남아 있지만 현재 앱 기능과 구분합니다. 공개 배포물은 `scripts/sanitize-published-data.mjs`에서 현재 서비스 범위를 검증합니다. 비밀 키와 Android 서명·빌드 산출물은 커밋하지 않습니다.

## 데이터와 지도

행정구역 경계는 통계청 SGIS와 [admdongkor](https://github.com/vuski/admdongkor) 자료(공공누리 제1유형·CC BY 4.0)를 사용합니다. 지도/사진/장소별 추가 출처·이용 조건은 앱 정보와 각 자산의 LICENSE 파일에 보존합니다.

공개 연락처: nallae.app@gmail.com / 날래 개발자
