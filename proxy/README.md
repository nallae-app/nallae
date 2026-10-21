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
