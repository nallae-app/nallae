#!/usr/bin/env bash
# 국내 서버에서 10분마다 실행: 최신 코드 받기 → 소식 수집 → data 브랜치에 news.json 올리기 → GitHub에 배포 요청
# 필요한 값은 ~/nallae.env (server/env.example 참고)
set -euo pipefail

REPO_DIR="${REPO_DIR:-$HOME/nallae}"
ENV_FILE="${ENV_FILE:-$HOME/nallae.env}"
set -a; source "$ENV_FILE"; set +a
: "${GH_TOKEN:?GH_TOKEN 없음}" "${GH_REPO:=nallae-app/nallae}"

cd "$REPO_DIR"
# 코드는 항상 main 최신으로 (news.json은 git 제외 파일이라 그대로 남아 이어 쓴다)
git fetch -q origin main && git reset -q --hard origin/main

node scripts/collect.mjs

# data 브랜치: 커밋 하나만 유지 (기록이 쌓이지 않게 매번 덮어쓴다)
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
cp web/data/news.json "$TMP/news.json"
git -C "$TMP" init -q -b data
git -C "$TMP" -c user.name="nallae-collector" -c user.email="nallae.app@gmail.com" add news.json
git -C "$TMP" -c user.name="nallae-collector" -c user.email="nallae.app@gmail.com" commit -q -m "news $(date -u +%FT%TZ)"
git -C "$TMP" push -q --force "https://x-access-token:${GH_TOKEN}@github.com/${GH_REPO}.git" data:data

# 배포 작업 실행 요청 (main의 deploy.yml이 data 브랜치의 news.json을 가져가 배포)
curl -fsS -X POST \
  -H "Authorization: Bearer ${GH_TOKEN}" -H "Accept: application/vnd.github+json" \
  "https://api.github.com/repos/${GH_REPO}/dispatches" \
  -d '{"event_type":"news-updated"}'
echo "$(date '+%F %T') 배포 요청 완료"
