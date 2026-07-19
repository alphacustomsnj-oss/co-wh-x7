/* C&O live-sync — shared module. Loads supabase-js, exposes window.coSync:
   push(table,row)      upsert with offline queue + auto-flush
   insert(table,row)    insert with offline queue
   on(table,cb)         realtime INSERT/UPDATE subscription
   fetch(table,opts)    simple select
   A floating ●LIVE / ○OFFLINE badge shows connection state. */
window.CO_SYNC = {
  url: 'https://klwiainwuybsnjqtjtxv.supabase.co',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtsd2lhaW53dXlic25qcXRqdHh2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQwODQxMzMsImV4cCI6MjA5OTY2MDEzM30.5esjnd2x-sv4h14DhdlGGIJT-i6B9EvjBXbHkQ8ZNhE'
};
(function(){
  const Q_KEY = 'co_sync_queue';
  const api = {
    ready:false, client:null, _cbs:[],
    onReady(f){ this.ready ? f() : this._cbs.push(f); },
    push(table,row){ op({kind:'upsert',table,row}); },
    insert(table,row){ op({kind:'insert',table,row}); },
    on(table,cb){
      this.onReady(()=>{
        api.client.channel('ch_'+table+'_'+Math.random().toString(36).slice(2,7))
          .on('postgres_changes',{event:'*',schema:'public',table},p=>{ if(p.new) cb(p.new, p.eventType); })
          .subscribe();
      });
    },
    async fetch(table,{order,limit,since}={}){
      if(!this.ready) return [];
      let q = this.client.from(table).select('*');
      if(since) q = q.gte('created_at', since);
      if(order) q = q.order(order,{ascending:false});
      if(limit) q = q.limit(limit);
      const {data,error} = await q;
      return error ? [] : (data||[]);
    }
  };
  window.coSync = api;

  let _badgeEl = null;   // module-level ref: every badge() call hits the SAME element (kills the double-pill race)
  function badge(live){
    if(!_badgeEl){
      _badgeEl = document.createElement('div');
      _badgeEl.id = 'coSyncBadge';
      _badgeEl.style.cssText = 'position:fixed;right:10px;bottom:10px;z-index:99990;font:700 11px Arial;padding:5px 11px;border-radius:99px;background:#fff;box-shadow:0 1px 5px rgba(0,0,0,.25);pointer-events:auto;cursor:pointer;';
      _badgeEl.title='Tap for sync self-test';
      _badgeEl.onclick=()=>window.coSyncSelfTest && coSyncSelfTest();
      const add = ()=>{
        if(document.body){
          document.querySelectorAll('#coSyncBadge').forEach(e=>{ if(e!==_badgeEl) e.remove(); });  // nuke any strays
          document.body.appendChild(_badgeEl);
        } else setTimeout(add,300);
      };
      add();
    }
    _badgeEl.textContent = live ? '\u25cf LIVE' : '\u25cb OFFLINE';
    _badgeEl.style.color = live ? '#22b357' : '#999';
  }

  function queue(o){
    try{
      const q = JSON.parse(localStorage.getItem(Q_KEY)||'[]');
      q.push(o);
      localStorage.setItem(Q_KEY, JSON.stringify(q.slice(-500)));
    }catch(_){}
  }
  async function exec(o){
    const t = api.client.from(o.table);
    const {error} = o.kind==='insert' ? await t.insert(o.row) : await t.upsert(o.row);
    return !error;
  }
  async function op(o){
    if(!api.ready){ queue(o); return; }
    if(!(await exec(o).catch(()=>false))) queue(o);
  }
  async function flush(){
    if(!api.ready) return;
    let q;
    try{ q = JSON.parse(localStorage.getItem(Q_KEY)||'[]'); }catch(_){ q = []; }
    if(!q.length) return;
    const rest = [];
    for(const o of q){ if(!(await exec(o).catch(()=>false))) rest.push(o); }
    localStorage.setItem(Q_KEY, JSON.stringify(rest));
  }


  // ---- SELF-TEST v1 (Jul 17 2026) — click the badge to run ----
  window.coSyncSelfTest = async function(){
    const rows=[];
    const add=(ok,label,detail)=>rows.push((ok===true?'✅':ok===false?'❌':'⚠️')+' '+label+(detail?' — '+detail:''));
    add(null,'App',location.pathname.split('/').slice(-2).join('/')+' · '+(navigator.onLine?'browser online':'BROWSER OFFLINE'));
    add(null,'Sync-config','loaded (SELFTEST v3)');
    // service worker + caches
    try{
      const reg=await navigator.serviceWorker.getRegistration();
      const keys=await caches.keys();
      add(null,'Service worker',(reg&&reg.active?'active':'none')+' · caches: '+(keys.join(', ')||'none'));
    }catch(e){ add(null,'Service worker','n/a'); }
    // local library file reachable on server?
    try{
      const r=await fetch('../shared/supabase.js',{method:'HEAD',cache:'no-store'});
      add(r.ok,'Local supabase.js on server','HTTP '+r.status+(r.ok?'':' ← STALE DEPLOY: rebuild GitHub Pages'));
    }catch(e){ add(false,'Local supabase.js on server',e.message); }
    // library actually loaded in this page?
    const lib=!!(window.supabase&&window.supabase.createClient);
    add(lib,'Library loaded in page',lib?'createClient OK':'not loaded → hard refresh (Ctrl+Shift+R)');
    add(api.ready,'coSync client ready',api.ready?'yes':'no');
    // database REST ping
    try{
      const r=await fetch(CO_SYNC.url+'/rest/v1/inventory?select=number&limit=1',{cache:'no-store',
        headers:{apikey:CO_SYNC.anonKey,Authorization:'Bearer '+CO_SYNC.anonKey}});
      add(r.ok,'Supabase database','HTTP '+r.status);
    }catch(e){ add(false,'Supabase database',e.message+' ← blocked by extension/firewall?'); }
    // queued offline ops
    let q=[]; try{ q=JSON.parse(localStorage.getItem(Q_KEY)||'[]'); }catch(_){ }
    add(q.length===0?null:false,'Offline queue',q.length+' pending ops');
    // render popup
    let el=document.getElementById('coSyncTest');
    if(el) el.remove();
    el=document.createElement('div');
    el.id='coSyncTest';
    el.style.cssText='position:fixed;right:10px;bottom:44px;z-index:99999;background:#1c1c1e;color:#fff;font:12px/1.7 Menlo,Consolas,monospace;padding:14px 16px;border-radius:12px;box-shadow:0 4px 18px rgba(0,0,0,.4);max-width:340px;white-space:pre-wrap;word-break:break-word;';
    el.textContent=rows.join('\n');
    const x=document.createElement('div');
    x.textContent='✕ close';
    x.style.cssText='margin-top:8px;color:#f0a500;cursor:pointer;font-weight:700;';
    x.onclick=()=>el.remove();
    el.appendChild(x);
    document.body.appendChild(el);
  };

  badge(false);
  if(!CO_SYNC.anonKey){ return; }               // standalone mode
  // The library ships INSIDE this bundle (shared/supabase.js) so no ad-blocker,
  // firewall, or dead CDN can take the sync down. CDN kept as a fallback only.
  const s = document.createElement('script');
  s.src = '../shared/supabase.js';
  const cdnFallback = ()=>{
    const c = document.createElement('script');
    c.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js';
    c.onload = s.onload;
    c.onerror = ()=>badge(false);
    document.head.appendChild(c);
  };
  s.onload = function(){
    try{
      api.client = window.supabase.createClient(CO_SYNC.url, CO_SYNC.anonKey);
      api.ready = true;
      badge(true);
      api._cbs.splice(0).forEach(f=>{ try{f();}catch(_){} });
      flush();
      setInterval(flush, 20000);
      addEventListener('online', ()=>{ badge(true); flush(); });
      addEventListener('offline', ()=>badge(false));
      setInterval(()=>badge(api.ready && navigator.onLine), 10000);   // self-healing badge
    }catch(e){ badge(false); }
  };
  s.onerror = cdnFallback;
  document.head.appendChild(s);
})();
