// batch_export.js - формирование расширенного JSON отчёта batch
// Формат: { generatedAt, network, tokenAddress, amount, delay, retries, items:[ { address, status, tx, attempts, error, startedAt, finishedAt, latencyMs } ], summary }

(function(){
  window.__exportBatchJson = function(){
    if(!APP_STATE.batch || !APP_STATE.batch.list.length){ alert('Нет данных batch'); return; }
    const now = new Date().toISOString();
    const rows = APP_STATE.batch.list.map(it=>({
      address: it.address,
      status: it.status||'',
      tx: it.tx||'',
      attempts: it.attempts||0,
      error: it.error||'',
      startedAt: it.startedAt||null,
      finishedAt: it.finishedAt||null,
      latencyMs: (it.startedAt && it.finishedAt)? (it.finishedAt - it.startedAt): null
    }));
    const summary = {
      total: rows.length,
      success: rows.filter(r=>r.status==='success').length,
      error: rows.filter(r=>r.status==='error').length
    };
    const meta = {
      generatedAt: now,
      network: APP_STATE.network,
      tokenAddress: APP_STATE.token && APP_STATE.token.address,
      amount: document.getElementById('batch-amount').value || '1',
      delay: document.getElementById('batch-delay').value,
      retries: document.getElementById('batch-retries').value
    };
    const payload = { ...meta, items: rows, summary };
    const blob = new Blob([JSON.stringify(payload,null,2)], {type:'application/json'});
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'batch_report.json'; a.click();
  };
})();
