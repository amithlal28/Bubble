/* ═══════════════════════════════════════════════════════════════════
   STASH DESKTOP — Client-side Router
   Hash-based SPA routing
   ═══════════════════════════════════════════════════════════════════ */

window.BubbleRouter = (() => {
  const routes = {};
  let currentRoute = '';
  let currentParams = {};
  // Bumped on every render(); an in-flight render whose token is no longer the
  // latest bows out instead of painting over a newer view (fixes the laggy
  // "screen switches on its own / ghost click" races, esp. right after a sync).
  let renderToken = 0;
  let isRendering = false;     // a render loop is currently draining pendingJob
  let pendingJob = null;       // the latest {path, params} still to be rendered
  let lastRenderedPath = null; // last view actually painted (for same-view refresh)

  const SPINNER_HTML = `<div style="display: flex; justify-content: center; align-items: center; height: 100%; color: var(--text-secondary);"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="animation: spin 1s linear infinite; margin-right: 12px;"><style>@keyframes spin { 100% { transform: rotate(360deg); } }</style><line x1="12" y1="2" x2="12" y2="6"></line><line x1="12" y1="18" x2="12" y2="22"></line><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"></line><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"></line><line x1="2" y1="12" x2="6" y2="12"></line><line x1="18" y1="12" x2="22" y2="12"></line><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"></line><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"></line></svg> Loading...</div>`;

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

  // Public entry: record the latest requested view and (re)start the drain loop.
  // Only ever one render runs at a time; if newer navigations arrive while one is
  // in flight, only the LATEST is rendered next — intermediate ones are dropped.
  function render(path, params = {}, forceFresh = false) {
    pendingJob = { path, params, forceFresh };
    if (!isRendering) drainRenders();
  }

  async function drainRenders() {
    if (isRendering) return;
    isRendering = true;
    try {
      while (pendingJob) {
        const job = pendingJob;
        pendingJob = null;
        await renderView(job.path, job.params, job.forceFresh);
      }
    } finally {
      isRendering = false;
    }
  }

  async function renderView(path, params = {}, forceFresh = false) {
    const container = document.getElementById('view-container');
    if (!container) return;

    const myToken = ++renderToken;

    // Highlight the destination nav item immediately (cheap, no reflow storm) so
    // the click feels instant even while the view's data is still loading.
    document.querySelectorAll('.nav-item').forEach(item => {
      item.classList.toggle('active', item.dataset.route === path);
    });

    const handler = routes[path];
    if (!handler) {
      container.innerHTML = `<div class="empty-state"><svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg><div class="empty-state-title">Page not found</div><div class="empty-state-text">The page "${path}" doesn't exist.</div></div>`;
      lastRenderedPath = path;
      return;
    }

    // Keep the CURRENT view on-screen (and interactive) instead of flashing a
    // spinner on every click. Only show the spinner if the new view is genuinely
    // slow (>150ms, e.g. a network-bound handler) — fast views never flash.
    // Guards:
    //  - crossView only: a same-route refresh (sync/realtime/search re-type)
    //    updates in place; wiping it to a spinner would kill the live DOM
    //    (e.g. the search input the user is typing in).
    //  - container unchanged: if the handler already painted its own shell
    //    (the search view does this before awaiting results), don't overwrite it.
    const crossView = lastRenderedPath !== path;
    const prevHTML = container.innerHTML;
    let spinnerShown = false;
    const spinnerTimer = crossView ? setTimeout(() => {
      if (myToken !== renderToken || container.innerHTML !== prevHTML) return;
      spinnerShown = true;
      container.innerHTML = SPINNER_HTML;
      container.style.animation = 'none';
      void container.offsetHeight;
      container.style.animation = 'fadeIn 0.25s ease';
    }, 150) : null;

    try {
      await handler(container, params);
      // A newer navigation started while we were awaiting — discard this paint so
      // we don't clobber the newer view (the ghost-click / self-switch bug).
      if (myToken !== renderToken) return;
      if (!spinnerShown) {
        // Painted straight into the live view: add the fade only when the route
        // actually changed, so same-view refreshes don't flicker.
        if (lastRenderedPath !== path) {
          container.style.animation = 'none';
          void container.offsetHeight;
          container.style.animation = 'fadeIn 0.25s ease';
        }
      }
      lastRenderedPath = path;
    } catch (err) {
      if (myToken !== renderToken) return;
      console.error('Route handler error:', err);
      container.innerHTML = `<div class="empty-state"><svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg><div class="empty-state-title" style="color: #ef4444;">Failed to load view</div><div class="empty-state-text">${err.message || 'An unknown error occurred while rendering this page.'}</div><button class="btn btn-primary" style="margin-top: 16px;" onclick="BubbleRouter.navigate('${path}', { force: true })">Retry</button></div>`;
      lastRenderedPath = path;
    } finally {
      clearTimeout(spinnerTimer);
    }
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
