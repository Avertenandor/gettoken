// batch_export.js - экспорт результатов batch операций

window.__exportBatchJson = function() {
  if(!APP_STATE.batch || !APP_STATE.batch.list) {
    console.error('Нет данных для экспорта');
    return;
  }
  
  const exportData = {
    timestamp: new Date().toISOString(),
    token: APP_STATE.token ? APP_STATE.token.address : null,
    network: APP_STATE.network,
    transactions: APP_STATE.batch.list.map(item => ({
      address: item.address,
      status: item.status || 'pending',
      tx: item.tx || null,
      attempts: item.attempts || 0,
      error: item.error || null
    })),
    summary: {
      total: APP_STATE.batch.list.length,
      success: APP_STATE.batch.list.filter(i => i.status === 'success').length,
      failed: APP_STATE.batch.list.filter(i => i.status === 'failed').length,
      pending: APP_STATE.batch.list.filter(i => i.status === 'pending' || i.status === 'queued').length
    }
  };
  
  const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `batch_export_${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  
  if(window.__toast) {
    window.__toast('Batch данные экспортированы', 'info', 3000);
  }
};

// Функция импорта batch списка
window.__importBatchList = function(file) {
  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const data = JSON.parse(e.target.result);
      if(data.transactions && Array.isArray(data.transactions)) {
        const addresses = data.transactions.map(t => t.address).filter(Boolean);
        const textarea = document.getElementById('batch-addresses');
        if(textarea) {
          textarea.value = addresses.join('\n');
          if(window.__toast) {
            window.__toast(`Импортировано ${addresses.length} адресов`, 'info', 3000);
          }
        }
      }
    } catch(err) {
      console.error('Ошибка импорта:', err);
      if(window.__toast) {
        window.__toast('Ошибка импорта файла', 'error', 3000);
      }
    }
  };
  reader.readAsText(file);
};
