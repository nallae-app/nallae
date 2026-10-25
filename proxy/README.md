# 국내 대리 호출 함수 (Vercel, 서울 리전 icn1)

ITS(openapi.its.go.kr:9443)는 GitHub Actions(해외) IP에서 연결 시간 초과가 난다. 수집기는 GitHub에서 그대로 돌리고, ITS 호출만 이 함수를 거친다.

```
GitHub Actions(collect.mjs) ──x-nallae-token──▶ Vercel 함수(icn1, 서울) ──ITS_KEY──▶ ITS
```

## 배포
1. vercel.com 에 GitHub 계정으로 가입 → New Project → 저장소 `nallae-app/nallae` 선택
2. **Root Directory: `proxy`**, Framework: Other
3. Environment Variables: `ITS_KEY`(ITS 인증키), `PROXY_TOKEN`(임의의 긴 문자열)
4. 배포 후 주소(예: `https://nallae-proxy.vercel.app`)와 같은 `PROXY_TOKEN`을 GitHub Secrets에 `ITS_PROXY_URL`, `ITS_PROXY_TOKEN`으로 등록
5. 확인: 응답 헤더 `x-proxy-region`이 `icn1`이어야 한다

## 원칙
- 키는 함수 환경 변수에만. 응답·로그에 키를 남기지 않는다.
- 토큰 없는 요청은 401. 허용 서비스는 `event`, `disaster`뿐(열린 프록시 금지).

## 주유소 반경 조회 (2026-10-25)

- `api/fuel.js`는 별도 공개 조회 기능이다. ITS 토큰을 웹에 노출하지 않는다.
- **필수 서버 설정:** Vercel `nallae/nallae-proxy` → Settings → Environment Variables → `OPINET_KEY`를 Production에 등록하고 최신 배포를 Redeploy한다. 기존 GitHub Secrets의 같은 이름 변수는 Vercel로 자동 복사되지 않는다. 키는 코드·채팅·로그에 넣지 않는다.
- 상태: `GET /api/fuel?health=1` → `configured`는 키 설정 유무만 확인한다. 키가 없으면 실제 조회는 503 `not-configured`다. 2026-10-25 사용자가 Production 키 등록·재배포 완료 후 실조회까지 성공했다.
- 요청: `POST /api/fuel`, JSON `{lat,lon,radius:5000|10000|15000,product:'B027'|'D047'}`. GPS 좌표는 URL에 넣거나 앱 로그에 기록하지 않는다. GPS 조회는 웹 화면에서 사용자가 위치 전달을 직접 선택한 뒤 시작한다.
- 오피넷 `aroundAll.do`를 가격과 무관하게 조회한다. 현재 키는 `certkey`가 아니라 **`code`**로 정상 응답했다. 5km=1원, 10km=9원, 15km=25원의 5km 조회를 합쳐 ID 중복과 원래 반경 밖을 제거한다. 한 원이라도 조회 실패하면 전체 완료로 반환하지 않는다.
- 좌표 변환은 수집기와 같은 모듈을 사용한다. 캐시는 인스턴스 메모리에 30분, 요청 좌표 자체 대신 HMAC 식별자를 쓰고 공개 주유소 응답만 보관한다. 정렬 변경은 웹의 같은 목록에서 처리하므로 재조회하지 않는다.
- 인스턴스별 1일 70회 호출 예산과 최대 3개 동시 호출 제한을 둔다. 인스턴스 재시작·다중 인스턴스에서 공유되는 전역 한도 보장은 아니므로, 이용량 증가 시 공용 저장소와 공급자 한도 상향이 필요하다. 평균 통계 수집은 6시간마다 17회로 줄여 주변 조회 호출 여유를 확보한다.
- 빈 OIL은 실제 0곳과 인증·한도 오류가 같아 전국 평균 정상 응답으로 한 번 더 확인한다. 확인 실패 시 0곳으로 포장하지 않는다.
- 최종 실제 확인: `node scripts/verify-nearby-fuel.mjs --live --all-radii`. 공개 문서의 예시 지점으로만 검사하며 키·위치 원문을 출력하지 않는다.

### 인증 호환성 확인 (2026-10-25)
- 사용자가 Production 키 등록·재배포를 완료했고 공개 상태는 `configured:true`다. 그러나 최초 실조회는 `empty-response`였다.
- 같은 시각 GitHub의 기존 키는 거리순·가격순 모두 55곳 정상 응답했다. Vercel에 등록한 값과 기존 키가 같은지는 확인되지 않았으며, 원인을 키 오류로 단정하지 않는다.
- 복사 시 생긴 앞뒤 공백·줄바꿈은 서버에서 제거한다. `code` 조회와 평균 검증이 모두 비면 공식 문서의 `certkey` 방식으로 한 번 전환한다. 성공한 방식과 캐시는 분리해 재사용하고, 두 방식 모두 검증 실패하면 계속 실패를 표시한다. 키·길이·해시는 공개하지 않는다.
- 수정 배포 `2fc4546` 후 공식 예시 지점 실조회 성공: 5km 55곳(1,839~2,548원), 10km 189곳(1,820~2,548원), 15km 409곳(1,815~2,549원). 등록된 키는 사용 가능하다. 공백 처리와 인증 파라미터 전환 중 어느 처리가 원인이었는지는 별도 노출하지 않아 단정하지 않는다.
- 노원 공개 고정 지점 실조회: 5km 44곳(1,823~1,894원). 모든 좌표의 직선거리를 재계산해 5km 이내, 중복 없음, 거리순 응답을 확인했다. `node scripts/verify-nearby-fuel.mjs --live --nowon`으로 같은 검사를 수행한다. 가격·건수는 해당 검증 시점 값이다.
- 배포된 웹의 app.js·nearby-fuel.js·sw.js가 로컬 최종본과 일치했고 캐시 버전은 v62다. 정렬과 비싼 근처 주유소 유지, 지도·목록 일치는 자동 테스트로 검증했다. 실기기 터치 검증은 수행하지 않았다.
