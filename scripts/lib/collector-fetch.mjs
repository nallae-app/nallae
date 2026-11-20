import { setTimeout as delay } from 'node:timers/promises';

const CONNECTION_ERRORS = new Set(['UND_ERR_CONNECT_TIMEOUT','UND_ERR_SOCKET','ECONNRESET','ECONNREFUSED','ENETUNREACH','EHOSTUNREACH','ENOTFOUND','EAI_AGAIN']);
const codeOf = error => error?.cause?.code || error?.code;
function unavailable(host, code = 'COLLECTOR_HOST_UNREACHABLE') {
  // 요청 URL·헤더·인증키는 오류 메시지에도 포함하지 않는다.
  const error = new Error(`공공 API 연결 실패 (${host})`);
  error.code = code;
  return error;
}
export function createCollectorFetch(rawFetch, {failureThreshold=3, cooldownMs=60000, retryDelayMs=300, now=Date.now, wait=(ms,signal)=>delay(ms,undefined,{signal})} = {}) {
  const hosts = new Map();
  return async (input, options = {}) => {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
    const method = String(options.method || input?.method || 'GET').toUpperCase();
    if (!['GET','HEAD'].includes(method)) return rawFetch(input,options);
    const signal = options.signal || input?.signal;
    const state = hosts.get(url.hostname) || {failures:0,openUntil:0};
    hosts.set(url.hostname,state);
    const check = () => {
      signal?.throwIfAborted();
      if (state.openUntil > now()) throw unavailable(url.hostname);
      if (state.openUntil) { state.openUntil=0; state.failures=0; }
    };
    for (let attempt=0; attempt<2; attempt++) {
      check();
      try {
        // 최초 호출자의 signal을 재시도에도 유지한다. 매번 새20초를 만들지 않는다.
        const response = await rawFetch(input, options);
        state.failures=0;state.openUntil=0;
        return response;
      } catch (error) {
        signal?.throwIfAborted();
        const code=codeOf(error);
        if (!CONNECTION_ERRORS.has(code)) throw error;
        state.failures++;
        if (state.failures >= failureThreshold) state.openUntil=now()+cooldownMs;
        if (attempt || state.openUntil > now()) throw unavailable(url.hostname,code);
        await wait(retryDelayMs,signal);
      }
    }
  };
}
