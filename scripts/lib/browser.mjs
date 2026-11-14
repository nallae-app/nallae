// 로컬 검수 도구가 Windows와 macOS에서 같은 Chrome 설치를 찾는다.
import fs from 'node:fs';
export function browserPath() {
  const candidates = [process.env.CHROME_PATH, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'];
  const found = candidates.find(p => p && fs.existsSync(p));
  if (!found) throw new Error('Chrome을 설치하거나 CHROME_PATH에 브라우저 실행 파일을 지정하세요.');
  return found;
}
