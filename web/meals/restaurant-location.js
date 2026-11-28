(() => {
  const fixMaxAge = 60_000;
  const positionTimeout = 10_000;
  const displayLifetime = 5 * 60_000;

  function create(browser, onChange) {
    let state = { status: 'idle', point: null };
    let visible = false;
    let visit = 0;
    let attempt = 0;
    let timer;
    let permission;

    function publish(status, point = null) {
      clearTimeout(timer);
      if (state.status === status && state.point === point) return;
      state = { status, point };
      onChange(state);
    }

    function request() {
      if (!visible || state.status === 'locating') return;
      // Explicit requests call the browser inside the original user gesture.
      const id = ++attempt;
      const finish = (status, point) => {
        if (!visible || attempt !== id || state.status !== 'locating') return;
        publish(status, point);
        if (status === 'ready' && state.status === 'ready' && attempt === id) {
          timer = setTimeout(() => publish('expired'), displayLifetime);
        }
      };
      const provider = browser.geolocation;
      if (!provider?.getCurrentPosition) {
        publish('unavailable');
        return;
      }
      publish('locating', state.point);
      // The native timeout need not include waiting for a permission decision.
      const decisionWindow = permission?.state === 'granted' ? 2_000 : 50_000;
      timer = setTimeout(() => finish('timeout'), positionTimeout + decisionWindow);
      try {
        provider.getCurrentPosition(position => {
          const lat = position?.coords?.latitude, lon = position?.coords?.longitude;
          const age = Date.now() - position?.timestamp;
          if (!Number.isFinite(lat) || Math.abs(lat) > 90 ||
              !Number.isFinite(lon) || Math.abs(lon) > 180 ||
              !Number.isFinite(age) || age < -fixMaxAge || age > fixMaxAge) {
            finish('unavailable');
            return;
          }
          finish('ready', { lat, lon });
        }, error => {
          const status = error?.code === 1 ? 'denied' : error?.code === 3 ? 'timeout' : 'unavailable';
          finish(status);
        }, { enableHighAccuracy: false, maximumAge: fixMaxAge, timeout: positionTimeout });
      } catch {
        finish('unavailable');
      }
    }

    function permissionChanged(event) {
      if (!visible || !permission || (event && event.target !== permission)) return;
      if (permission.state === 'granted') {
        if (state.status !== 'ready') request();
      } else {
        ++attempt;
        publish(permission.state === 'denied' ? 'denied' : 'idle');
      }
    }

    async function activate() {
      if (visible) return;
      visible = true;
      const id = ++visit;
      if (!browser.geolocation) {
        publish('unavailable');
        return;
      }
      try {
        const result = await browser.permissions?.query({ name: 'geolocation' });
        if (!result || !visible || id !== visit) return;
        permission = result;
        permission.addEventListener?.('change', permissionChanged);
        if (state.status === 'idle') permissionChanged();
      } catch {
        // Browsers without a geolocation permission query still support a tap to locate.
      }
    }

    function deactivate() {
      visible = false;
      ++visit;
      ++attempt;
      permission?.removeEventListener?.('change', permissionChanged);
      permission = null;
      publish('idle');
    }

    return { activate, request, deactivate, getState: () => state };
  }

  globalThis.JippiRestaurantLocation = Object.freeze({ create });
})();
