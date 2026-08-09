/* ═══════════════════════════════════════════════════════════════════
   STASH DESKTOP — Client-side Router
   Hash-based SPA routing
   ═══════════════════════════════════════════════════════════════════ */

window.BubbleRouter = (() => {
  const routes = {};
  let currentRoute = '';
  let currentParams = {};

  function register(path, handler) {
    routes[path] = handler;
  }

  function buildHash(path, params) {
    let h = path;
    if (params.id) h += '/' + encodeURIComponent(params.id);
    const qp = Object.entries(params)
      .filter(([k]) => k !== 'id' && k !== 'force' && params[k] !== undefined && params[k] !== '')
      .map(([k, v]) => k + '=' + encodeURIComponent(v));
    if (qp.length) h += '?' + qp.join('&');
    return h;
  }

  function parseHash(raw) {
    const [pathPart, queryPart] = raw.split('?');
    const [path, ...paramParts] = pathPart.split('/');
    const params = {};
    if (paramParts.length) params.id = decodeURIComponent(paramParts.join('/'));
    if (queryPart) {
      for (const pair of queryPart.split('&')) {
        const eq = pair.indexOf('=');
        if (eq < 0) continue;
        const k = decodeURIComponent(pair.slice(0, eq));
        const v = decodeURIComponent(pair.slice(eq + 1));
        params[k] = v;
      }
    }
    return { path, params };
  }

  function navigate(path, params = {}) {
    const destHash = buildHash(path, params);
    const currentHash = window.location.hash.replace(/^#/, '');
    if (destHash === currentHash && !params.force) return;

    if (window.location.hash.replace(/^#/, '') === destHash) {
      const { path: p, params: pr } = parseHash(destHash);
      currentRoute = p;
      currentParams = pr;
      render(p, pr, true);
    } else {
      window.location.hash = '#' + destHash;
    }
  }

  function render(path, params = {}, forceFresh = false) {
    const container = document.getElementById('view-container');
    if (!container) return;

    document.querySelectorAll('.nav-item').forEach(item => {
      item.classList.toggle('active', item.dataset.route === path);
    });

    const handler = routes[path];
    if (!handler) {
      container.innerHTML = `<div class="empty-state"><svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg><div class="empty-state-title">Page not found</div><div class="empty-state-text">The page "${path}" doesn't exist.</div></div>`;
      return;
    }

    container.innerHTML = '';
    container.style.animation = 'none';
    void container.offsetHeight;
    container.style.animation = 'fadeIn 0.25s ease';
    handler(container, params);
  }

  function init() {
    window.addEventListener('hashchange', () => {
      const hash = window.location.hash.replace(/^#/, '') || 'home';
      const { path, params } = parseHash(hash);
      const isDifferent = (path !== currentRoute) || (params.id !== currentParams.id) || (params.filter !== currentParams.filter);
      currentRoute = path;
      currentParams = params;
      render(path, params, isDifferent);
    });

    document.querySelectorAll('.nav-item[data-route]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        // If element has inline onclick or custom filter, don't double-navigate
        if (btn.hasAttribute('onclick')) return;
        navigate(btn.dataset.route);
      });
    });

    const hash = window.location.hash.replace(/^#/, '') || 'home';
    const { path, params } = parseHash(hash);
    currentRoute = path;
    currentParams = params;
    render(path, params, true);
  }

  function getCurrentRoute() { return currentRoute; }
  function getCurrentParams() { return { ...currentParams }; }

  return { register, navigate, init, getCurrentRoute, getCurrentParams };
})();
