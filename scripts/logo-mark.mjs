// 날래 로고(A안): '나' 해(빛줄기) + 도로로 그린 'ㄹ' + 세로 도로와 만나는 T자 교차로 'ㅐ' → '날래'.
// 원본 시안(2026-10-21) 좌표를 그대로 옮긴 1040×900 좌표계. 아이콘·헤더·스토어 그래픽이 모두 이 도형을 쓴다.
// detail=false면 아주 작은 크기용으로 흰 차선을 뺀다.
export const MARK_BOX = { x: 45, y: 30, w: 962, h: 845 }; // 도형이 실제로 차지하는 영역

// 원본처럼 각진 도로: 꺾이는 곳은 바깥만 둥글게(stroke-linejoin round), 안쪽은 거의 직각
const ROAD = 'M430,322 H600 Q615,322 615,337 V457 Q615,472 600,472 H135 Q120,472 120,487 V700 Q120,715 135,715 H895';

export function markSvg({ road = '#1F6A4A', lane = '#BDE3C6', line = '#FFFFFF', sun = '#F7A928', sunIn = '#FFFFFF', glyph = '#D2680F', detail = true } = {}) {
  return `
  <rect x="785" y="512" width="222" height="360" rx="18" fill="${road}"/>
  <path d="${ROAD}" fill="none" stroke="${road}" stroke-width="150" stroke-linejoin="round"/>
  <rect x="858" y="512" width="74" height="360" fill="${lane}"/>
  <path d="${ROAD}" fill="none" stroke="${lane}" stroke-width="78" stroke-linejoin="round"/>
  ${detail ? `<g stroke="${line}" fill="none" stroke-linecap="round">
    <path d="${ROAD.replace(/H895$/, 'H845')}" stroke-width="9" stroke-dasharray="48 42" stroke-linejoin="round"/>
    <path d="M895,528 V858" stroke-width="9" stroke-dasharray="48 42"/>
    <path d="M865,522 V636 M865,794 V862 M925,522 V862" stroke-width="5"/>
  </g>` : ''}
  <g stroke="${sun}" stroke-width="42" stroke-linecap="round">
    <line x1="192" y1="127" x2="240" y2="165"/>
    <line x1="303" y1="45" x2="331" y2="98"/>
  </g>
  <circle cx="420" cy="265" r="150" fill="${sun}"/>
  <circle cx="420" cy="265" r="112" fill="${sunIn}"/>
  <g fill="none" stroke="${glyph}" stroke-width="31" stroke-linecap="round" stroke-linejoin="round">
    <path d="M372,214 V300 H425"/>
    <path d="M458,204 V330 M458,268 H497"/>
  </g>`;
}

/** 정사각 아이콘. 도형 너비를 size의 scale 비율로, 배경 rx는 둥근 모서리(마스크형은 0) */
export function iconSvg({ size = 512, scale = 0.8, rx = 112, bg = '#1F6A4A', detail = true, colors = {} } = {}) {
  const k = (size * scale) / MARK_BOX.w;
  const tx = size / 2 - (MARK_BOX.x + MARK_BOX.w / 2) * k;
  const ty = size / 2 - (MARK_BOX.y + MARK_BOX.h / 2) * k;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${rx}" fill="${bg}"/>
  <g transform="translate(${tx.toFixed(2)} ${ty.toFixed(2)}) scale(${k.toFixed(4)})">${markSvg({ detail, ...colors })}</g>
</svg>`;
}

// 짙은 초록 바탕용 색 (원본 A-3: 도로 테두리를 밝은 초록, 차선을 더 밝게)
export const ON_DARK = { road: '#A9D6B5', lane: '#E3F3E7', line: '#FFFFFF' };
