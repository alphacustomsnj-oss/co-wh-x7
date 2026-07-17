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

  function badge(live){
    let b = document.getElementById('coSyncBadge');
    if(!b){
      b = document.createElement('div');
      b.id = 'coSyncBadge';
      b.style.cssText = 'position:fixed;right:10px;bottom:10px;z-index:99990;font:700 11px Arial;padding:5px 11px;border-radius:99px;background:#fff;box-shadow:0 1px 5px rgba(0,0,0,.25);pointer-events:none;';
      const add = ()=>document.body ? document.body.appendChild(b) : setTimeout(add,300);
      add();
    }
    b.textContent = live ? '● LIVE' : '○ OFFLINE';
    b.style.color = live ? '#22b357' : '#999';
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

  badge(false);
  if(!CO_SYNC.anonKey){ return; }               // standalone mode
  const s = document.createElement('script');
  s.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js';
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
    }catch(e){ badge(false); }
  };
  s.onerror = ()=>badge(false);
  document.head.appendChild(s);
})();
