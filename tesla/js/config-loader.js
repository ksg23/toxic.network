// config-loader.js
// Fetches config/links.json (relative to current path for /tesla subpath).

(function(global){
  // Relative URL so it works when served at /tesla/ on Cloudflare Pages
  const CONFIG_URL = 'config/links.json';
  let current = null;
  const listeners = [];

  function fetchConfig(){
    const url = CONFIG_URL + '?t=' + Date.now();
    return fetch(url, {cache: 'no-store'}).then(r => {
      if(!r.ok) throw new Error('Failed to fetch config');
      return r.json();
    });
  }

  function load(){
    return fetchConfig().then(cfg => {
      const s = JSON.stringify(cfg);
      if(s !== current){
        current = s;
        listeners.forEach(fn => fn(cfg));
      }
      return cfg;
    });
  }

  function onChange(fn){ listeners.push(fn); }

  // Poll periodically for changes
  function startPolling(interval = 5000){
    load().catch(()=>{});
    setInterval(()=>{ load().catch(()=>{}); }, interval);
  }

  global.ConfigLoader = { load, onChange, startPolling };
})(window);
