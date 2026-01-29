// app.js - main UI and logic for TeslaDash
(function(){
  // Utilities: cookie-only storage
  const Cookie = {
    set(name, value, days=30){
      const expires = new Date(Date.now() + days*24*60*60*1000).toUTCString();
      // Set SameSite and Secure where possible
      let cookie = encodeURIComponent(name) + '=' + encodeURIComponent(JSON.stringify(value)) + '; expires=' + expires + '; path=/; SameSite=Lax';
      if(location.protocol === 'https:') cookie += '; Secure';
      document.cookie = cookie;
    },
    get(name){
      const v = document.cookie.split('; ').find(row => row.startsWith(encodeURIComponent(name)+'='));
      if(!v) return null;
      try{ return JSON.parse(decodeURIComponent(v.split('=')[1])); } catch(e){return null}
    }
  };

  // Basic URL validation
  function isValidUrl(u){
    try{ const url = new URL(u); return url.protocol === 'http:' || url.protocol === 'https:'; }catch(e){return false}
  }

  // Check if we're returning from a fullscreen redirect
  function checkFullscreenReturn() {
    const params = new URLSearchParams(window.location.search);
    if (params.get('fs') === '1') {
      // Remove the parameter from URL
      window.history.replaceState({}, '', window.location.pathname);
      // Request fullscreen
      setTimeout(() => {
        const el = document.documentElement;
        if (el.requestFullscreen) {
          el.requestFullscreen().catch(err => console.log('Fullscreen denied:', err));
        } else if (el.webkitRequestFullscreen) {
          el.webkitRequestFullscreen();
        } else if (el.msRequestFullscreen) {
          el.msRequestFullscreen();
        }
      }, 100);
    }
  }

  // App state
  let config = {categories:[]};
  let recent = Cookie.get('tesladash_recent') || [];
  let favorites = Cookie.get('tesladash_favs') || {};
  let stats = Cookie.get('tesladash_stats') || {};
  let prefs = Cookie.get('tesladash_prefs') || {dark:true, seen_instructions:false};

  // Elements
  const grid = document.getElementById('grid');
  const categoriesEl = document.getElementById('categories');
  const searchInput = document.getElementById('search');
  const themeToggle = document.getElementById('themeToggle');
  const enableFs = document.getElementById('enableFs');
  const customUrl = document.getElementById('customUrl');
  const openCustom = document.getElementById('openCustom');
  const hideControlsBtn = document.getElementById('hideControlsBtn');

  const tileTpl = document.getElementById('tileTpl');
  // Hide controls logic
  let controlsHidden = false;
  hideControlsBtn.addEventListener('click', () => {
    controlsHidden = !controlsHidden;
    searchInput.style.display = controlsHidden ? 'none' : '';
    themeToggle.style.display = controlsHidden ? 'none' : '';
    enableFs.classList.toggle('hidden', controlsHidden);
    document.querySelector('.custom').classList.toggle('hidden', controlsHidden);
    hideControlsBtn.textContent = controlsHidden ? 'Show Controls' : 'Hide Controls';
  });

  // Rate limiting for redirect clicks (client-side guard)
  const clickLog = [];
  function allowClick(){
    const now = Date.now();
    // keep last 60s
    while(clickLog.length && clickLog[0] < now - 60_000) clickLog.shift();
    if(clickLog.length >= 8) return false; // max 8 redirects per 60s
    clickLog.push(now); return true;
  }

  function saveAll(){
    Cookie.set('tesladash_recent', recent, 30);
    Cookie.set('tesladash_favs', favorites, 365);
    Cookie.set('tesladash_stats', stats, 365);
    Cookie.set('tesladash_prefs', prefs, 365);
  }

  function updateTheme(){
    document.body.classList.toggle('dark', !!prefs.dark);
  }

  function renderCategories(){
    categoriesEl.innerHTML='';
    config.categories.forEach(cat => {
      const btn = document.createElement('button');
      btn.textContent = cat.name;
      btn.onclick = ()=>{ renderGrid(cat.services); };
      categoriesEl.appendChild(btn);
    });
    // show All
    const allBtn = document.createElement('button'); allBtn.textContent='All'; allBtn.onclick=()=>renderGrid(allServices()); categoriesEl.prepend(allBtn);
  }

  function allServices(){
    return config.categories.reduce((acc,c)=> acc.concat(c.services || []), []);
  }

  function renderGrid(services){
    grid.innerHTML = '';
    const q = searchInput.value.trim().toLowerCase();
    const filtered = services.filter(s => {
      if(!q) return true;
      return (s.name || '').toLowerCase().includes(q) || (s.description||'').toLowerCase().includes(q);
    });
    filtered.forEach(s => {
      const node = tileTpl.content.cloneNode(true);
      const tile = node.querySelector('.tile');
      tile.querySelector('.title').textContent = s.name;
      tile.querySelector('.desc').textContent = s.description || '';
      const img = tile.querySelector('.icon');
      
      // Handle missing icons
      if (s.icon) {
        img.src = s.icon;
        img.style.display = 'block';
        img.onerror = function() {
          // If image fails to load, hide it and show initials
          this.style.display = 'none';
          const initials = s.name.split(' ').map(word => word[0]).join('').substring(0, 2).toUpperCase();
          tile.setAttribute('data-initials', initials);
          tile.classList.add('no-icon');
        };
      } else {
        // No icon provided, show initials
        img.style.display = 'none';
        const initials = s.name.split(' ').map(word => word[0]).join('').substring(0, 2).toUpperCase();
        tile.setAttribute('data-initials', initials);
        tile.classList.add('no-icon');
      }
      
      img.alt = s.name + ' logo';
      if(favorites[s.url]) tile.classList.add('favorited');
      tile.onclick = (e) => {
        if(e.target.classList && e.target.classList.contains('fav')){
          // toggle fav
          if(favorites[s.url]) delete favorites[s.url]; else favorites[s.url] = s.name;
          saveAll(); renderGrid(services);
          return;
        }
        openService(s.url, s.name);
      };
      grid.appendChild(node);
    });
  }

  function openService(url, name){
    if(!isValidUrl(url)) { alert('Invalid URL'); return; }
    if(!allowClick()) { alert('Too many redirects — please wait a moment'); return; }
    // store recent and stats
    recent = [ {url,name,time:Date.now()} ].concat(recent).slice(0,20);
    stats[url] = (stats[url]||0) + 1;
    saveAll();

    // build youtube redirect
    const yt = 'https://www.youtube.com/redirect?q=' + encodeURIComponent(url);
    // open in same tab — Tesla browser expects a navigation
    window.location.href = yt;
  }

  // Custom URL handler
  openCustom.addEventListener('click', ()=>{
    const u = customUrl.value.trim();
    if(!isValidUrl(u)){ alert('Please enter a valid URL starting with http(s)://'); return; }
    openService(u, u);
  });

  // Fullscreen enable button — opens a redirect to this app's home to trigger theater mode
  enableFs.addEventListener('click', () => {
    // Use YouTube redirect to trigger Tesla fullscreen mode
    const currentUrl = window.location.origin + window.location.pathname + '?fs=1';
    const yt = 'https://www.youtube.com/redirect?q=' + encodeURIComponent(currentUrl);
    window.location.href = yt;
  });

  // Search
  searchInput.addEventListener('input', ()=> renderGrid(allServices()));

  // Theme
  themeToggle.addEventListener('click', ()=>{ prefs.dark = !prefs.dark; updateTheme(); saveAll(); });

  // Load config using ConfigLoader
  window.ConfigLoader.onChange((cfg)=>{
    config = cfg; renderCategories(); renderGrid(allServices());
  });
  window.ConfigLoader.startPolling(4000);

  // Initialize
  updateTheme();
  checkFullscreenReturn();
  // first load
  window.ConfigLoader.load().catch(()=>{ /* ignore */ });

  // Expose some functions for testing/debugging
  window.TeslaDash = { openService, allServices, getConfig: ()=>config };

})();
