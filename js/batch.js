// batch.js - связка UI <-> batch.worker.js
// Реализация без костылей: чёткие состояния, idempotent init, изоляция воркера

(function(){
  const state = {
    worker: null,
    inited: false,
    queue: [],
    summary: null,
    running: false,
    paused: false,
    tokenAddress: () => (APP_STATE.token && APP_STATE.token.address) || null,
    abi: () => (APP_STATE.token && APP_STATE.token.abi) || []
  };
  const LS_KEY = 'batchProgressV1';

  function ensureWorker(){
    if(state.worker) return state.worker;
    state.worker = new Worker('./js/batch.worker.js');
    state.worker.onmessage = handleWorkerMessage;
    return state.worker;
  }

  function handleWorkerMessage(ev){
    const { id, ok, error, summary, index, item } = ev.data || {};
    if(id === 'progress') {
      if(typeof index === 'number') updateRow(index, item);
      if(summary) updateSummary(summary);
  persist();
      return;
    }
    if(id === 'batch-finished') {
      updateSummary(summary);
      state.running = false; state.paused = false;
      refreshButtons();
  persist();
      return;
    }
    if(summary) updateSummary(summary);
    if(!ok && error) log('Batch worker error: '+error,'error');
  }

  function send(cmd, payload){
    return new Promise((resolve,reject)=>{
      const w = ensureWorker();
      const callId = cmd+'-'+Date.now()+Math.random();
      function handler(ev){
        if(ev.data && ev.data.id === callId){
          w.removeEventListener('message', handler);
          ev.data.ok? resolve(ev.data): reject(ev.data.error||'error');
        }
      }
      w.addEventListener('message', handler);
      w.postMessage({ id: callId, cmd, payload });
    });
  }

  // UI helpers
  const tableBody = ()=> document.querySelector('#batch-table tbody');
  function rebuildTable(){
    const tb = tableBody(); if(!tb) return;
    tb.innerHTML = '';
    state.queue.forEach((q,i)=>{
      const tr = document.createElement('tr');
  tr.innerHTML = `<td>${i+1}</td><td class="mono">${q.address}</td><td data-col="status">${q.status||'queued'}</td><td data-col="tx">${q.tx? shortTx(q.tx):''}</td><td data-col="attempts">${q.attempts||0}</td>`;
      tb.appendChild(tr);
    });
  }
  function updateRow(i, item){
    const tb = tableBody(); if(!tb) return;
    const tr = tb.children[i]; if(!tr) return;
    if(item.status) tr.querySelector('[data-col=status]').textContent = item.status;
    if(item.tx) tr.querySelector('[data-col=tx]').textContent = shortTx(item.tx);
    tr.querySelector('[data-col=attempts]').textContent = item.attempts||0;
  }
  function shortTx(h){ return h? h.slice(0,10)+'...'+h.slice(-6):''; }
  function updateSummary(s){
    state.summary = s;
    const el = document.getElementById('batch-status'); if(!el) return;
    el.textContent = `Всего: ${s.total}, success: ${s.success}, error: ${s.error}, elapsed: ${s.elapsed.toFixed(1)}s, rate: ${s.rate.toFixed(2)}/s, ETA: ${s.etaSeconds.toFixed(1)}s`;
  }

  function refreshButtons(){
    id('batch-start').disabled = !state.inited || state.running;
    id('batch-pause').disabled = !state.running || state.paused;
    id('batch-resume').disabled = !state.running || !state.paused;
    id('batch-cancel').disabled = !state.running;
    id('batch-export').disabled = !state.summary;
  }
  function persist(){
    try {
      const data = { queue: state.queue, summary: state.summary, inited: state.inited, token: state.tokenAddress(), ts: Date.now(), concurrency: (id('batch-concurrency')&&id('batch-concurrency').value)||'1' };
      localStorage.setItem(LS_KEY, JSON.stringify(data));
    } catch(_){}
  }
  function restore(){
    try {
      const raw = localStorage.getItem(LS_KEY); if(!raw) return;
      const saved = JSON.parse(raw);
      if(!saved.queue || !Array.isArray(saved.queue)) return;
      if(saved.token && APP_STATE.token && saved.token !== APP_STATE.token.address) return;
      state.queue = saved.queue;
      state.summary = saved.summary;
      state.inited = !!saved.inited;
      if(saved.concurrency && id('batch-concurrency')) id('batch-concurrency').value = saved.concurrency;
      rebuildTable();
      if(state.summary) updateSummary(state.summary);
      refreshButtons();
    } catch(_){}
  }

  // Actions
  id('batch-init')?.addEventListener('click', async ()=>{
    if(!APP_STATE.token || !APP_STATE.token.contract){ log('Сначала создайте или импортируйте токен','error'); return; }
    const listRaw = id('batch-addresses').value.split(/\s+/).map(a=>a.trim()).filter(Boolean);
    const valid = listRaw.filter(a=>/^0x[0-9a-fA-F]{40}$/.test(a));
    if(!valid.length){ log('Нет валидных адресов','error'); return; }
    state.queue = valid.map(a=>({ address:a }));
    rebuildTable();
    try {
  await send('init', { address: state.tokenAddress(), abi: state.abi(), delay: parseInt(id('batch-delay').value,10)||2500, maxRetries: parseInt(id('batch-retries').value,10)||2, amount: id('batch-amount').value||'0', concurrency: parseInt(id('batch-concurrency').value,10)||1 });
      await send('setQueue', { queue: state.queue });
      state.inited = true;
      refreshButtons();
      log('Batch инициализирован');
  persist();
    } catch(e){ log('Ошибка init: '+e,'error'); }
  });

  id('batch-start')?.addEventListener('click', async ()=>{
    try { await send('start', {}); state.running = true; state.paused=false; refreshButtons(); }
    catch(e){ log('Start error: '+e,'error'); }
  });
  id('batch-pause')?.addEventListener('click', async ()=>{ try { await send('pause', {}); state.paused=true; refreshButtons(); }catch(e){ log('Pause error: '+e,'error'); } });
  id('batch-resume')?.addEventListener('click', async ()=>{ try { await send('resume', {}); state.paused=false; refreshButtons(); }catch(e){ log('Resume error: '+e,'error'); } });
  id('batch-cancel')?.addEventListener('click', async ()=>{ try { await send('cancel', {}); state.running=false; state.paused=false; refreshButtons(); }catch(e){ log('Cancel error: '+e,'error'); } });
  id('batch-export')?.addEventListener('click', ()=>{ if(window.__exportBatchJson) window.__exportBatchJson(); });
  window.__exportBatchJson = function(){
    const blob = new Blob([JSON.stringify({ queue: state.queue, summary: state.summary }, null, 2)], { type:'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download='batch_results.json'; a.click();
  };

  restore();

  // Перехват transfer запросов от worker
  // Формат сообщения: { id:'transfer-..', cmd:'doTransfer', payload:{ address, amount }}
  window.addEventListener('message', async (ev)=>{
    const d = ev.data; if(!d || !d.cmd || d.cmd!=='doTransfer') return;
    const { id:callId, payload } = d;
    const res = { id: callId, ok:false };
    try {
      if(!APP_STATE.token.contract) throw new Error('Нет контракта');
      const decimals = await APP_STATE.token.contract.decimals();
      const value = ethers.parseUnits(payload.amount||'0', decimals);
      const tx = await APP_STATE.token.contract.transfer(payload.address, value);
      res.ok = true; res.txHash = tx.hash;
      await tx.wait();
    } catch(e){ res.error = e.message; }
    window.postMessage(res,'*');
  });

})();
