/* ═══════════════════════════════════════════════════════════════════
   STASH DESKTOP — Settings Manager
   ═══════════════════════════════════════════════════════════════════ */
window.BubbleSettings = (() => {
  let cache = {};
  async function load() { cache = await BubbleDB.getAllSettings(); return cache; }
  async function get(key) { return cache[key] || await BubbleDB.getSetting(key); }
  async function set(key, value) { cache[key] = value; await BubbleDB.setSetting(key, value); }
  function getCache() { return cache; }
  return { load, get, set, getCache };
})();
