import fs from 'node:fs';
import {iconSvg, ON_DARK} from './logo-mark.mjs';
fs.writeFileSync('web/icons/icon.svg', iconSvg());
fs.writeFileSync('web/icons/icon-maskable.svg', iconSvg({scale:.80,rx:0,bg:'#FFF7E8'}));
fs.writeFileSync('web/icons/icon-dark.svg', iconSvg({colors:ON_DARK}));
// 상단 로고는 build-icons.mjs가 확정된 작은 핀·지도 PNG에서 만든다.
