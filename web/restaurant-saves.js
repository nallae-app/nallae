// 식사 홈과 탐색 지도가 하나의 기기 내 식당 저장 목록을 사용한다.
(() => {
  'use strict';
  const key = 'nallae-saved-places-v1';
  const limit = 500;
  const changes = new EventTarget();
  let saved = new Set();

  const validId = id => typeof id === 'string' && id.length > 0 && id.length < 200;
  function read(recover = false) {
    const raw = localStorage.getItem(key);
    if (raw === null) return new Set();
    let ids;
    try { ids = JSON.parse(raw); }
    catch (error) {
      if (!recover) throw error;
      // 손상된 JSON의 원문을 보존한 뒤 마지막으로 읽힌 식별번호에서 이어 쓴다.
      const backupKey = key + '-invalid-json';
      const backup = localStorage.getItem(backupKey);
      if (backup && backup !== raw) throw error;
      if (backup !== raw) localStorage.setItem(backupKey, raw);
      return new Set(saved);
    }
    if (!Array.isArray(ids)) throw Error('식당 저장 형식');
    return new Set(ids.filter(validId));
  }
  function update(next) {
    if (next.size === saved.size && [...next].every(id => saved.has(id))) return;
    saved = next;
    changes.dispatchEvent(new Event('change'));
  }
  function refresh() {
    try { update(read()); }
    catch { /* 잠시 읽을 수 없을 때는 마지막으로 확인한 목록을 보존한다. */ }
  }
  async function setSaved(id, desired) {
    if (!validId(id) || typeof desired !== 'boolean') return {ok:false, saved:saved.has(id), reason:'invalid'};
    function write() {
      const latest = read(true);
      const before = latest.has(id);
      if (before === desired) {
        update(latest);
        return {ok:true, saved:desired};
      }
      if (desired && latest.size >= limit) {
        update(latest);
        return {ok:false, saved:false, reason:'limit'};
      }
      if (desired) latest.add(id); else latest.delete(id);
      localStorage.setItem(key, JSON.stringify([...latest]));
      update(latest);
      return {ok:true, saved:desired};
    }
    try {
      // 탭마다 보관한 스냅샷을 쓰지 않고 잠금을 얻은 뒤 원본을 다시 읽는다.
      return navigator.locks ? await navigator.locks.request(key, write) : write();
    } catch {
      refresh();
      return {ok:false, saved:saved.has(id), reason:'storage'};
    }
  }
  function message(result) {
    if (result.ok) return result.saved ? '이 기기에 식당을 저장했어요.' : '식당 저장을 해제했어요.';
    if (result.reason === 'limit') return '저장한 식당은 최대 500곳까지 모을 수 있어요.';
    if (result.reason === 'invalid') return '식당 정보를 확인할 수 없어요.';
    return '저장 변경을 기기에 반영하지 못했어요. 다시 시도해 주세요.';
  }
  refresh();
  window.addEventListener('storage', event => {
    if (event.key === key || event.key === null) refresh();
  });
  window.addEventListener('pageshow', refresh);
  globalThis.JippiRestaurantSaves = Object.freeze({
    has: id => saved.has(id),
    get size() { return saved.size; },
    setSaved, message,
    subscribe(listener) {
      changes.addEventListener('change', listener);
      return () => changes.removeEventListener('change', listener);
    },
  });
})();
