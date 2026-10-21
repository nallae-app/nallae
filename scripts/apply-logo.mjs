import fs from 'node:fs';
import {iconSvg, ON_DARK} from './logo-mark.mjs';
fs.writeFileSync('web/icons/icon.svg', iconSvg());
fs.writeFileSync('web/icons/icon-maskable.svg', iconSvg({scale:.60,rx:0}));
fs.writeFileSync('web/icons/icon-dark.svg', iconSvg({bg:'#34373B',colors:ON_DARK}));
// 상단 로고(배경 투명)는 build-icons.mjs가 투명 PNG에서 잘라 logo-header*.png로 만든다.
