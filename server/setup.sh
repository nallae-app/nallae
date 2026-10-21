#!/usr/bin/env bash
# Oracle Cloud(우분투) 무료 서버 첫 설정. 한 번만 실행한다.
#   curl -fsSL https://raw.githubusercontent.com/nallae-app/nallae/main/server/setup.sh | bash
set -euo pipefail

# Node.js 22 + git
if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 22 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs git
fi

# 코드 받기
[ -d "$HOME/nallae/.git" ] || git clone -q https://github.com/nallae-app/nallae.git "$HOME/nallae"

# 비밀값 파일 (값은 직접 채운다)
if [ ! -f "$HOME/nallae.env" ]; then
  cp "$HOME/nallae/server/env.example" "$HOME/nallae.env"
  chmod 600 "$HOME/nallae.env"
  echo "→ $HOME/nallae.env 에 키를 채워 넣으세요: nano ~/nallae.env"
fi

# 10분마다 실행 (systemd 타이머)
sudo tee /etc/systemd/system/nallae-collect.service >/dev/null <<EOF
[Unit]
Description=nallae collect and publish
After=network-online.target

[Service]
Type=oneshot
User=$USER
ExecStart=/usr/bin/bash $HOME/nallae/server/run.sh
TimeoutStartSec=300
EOF
sudo tee /etc/systemd/system/nallae-collect.timer >/dev/null <<'EOF'
[Unit]
Description=run nallae collect every 10 minutes

[Timer]
OnBootSec=2min
OnUnitActiveSec=10min
Persistent=true

[Install]
WantedBy=timers.target
EOF
sudo systemctl daemon-reload
echo "설정 완료. 키를 채운 뒤: sudo systemctl enable --now nallae-collect.timer"
echo "한 번 시험: bash ~/nallae/server/run.sh   /  기록 보기: journalctl -u nallae-collect -n 50"
