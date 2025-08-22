// batch.worker.js - воркер для batch transfers
// Обрабатывает очередь транзакций в фоне с retry логикой

const state = {
  queue: [],
  config: {
    address: null,
    abi: null,
    delay: 2500,
    maxRetries: 2,
    amount: '0',
    concurrency: 1
  },
  running: false,
  paused: false,
  startTime: 0,
  processed: 0
};

// Обработчик входящих сообщений
self.onmessage = async (e) => {
  const { id, cmd, payload } = e.data;
  
  try {
    switch(cmd) {
      case 'init':
        state.config = { ...state.config, ...payload };
        self.postMessage({ id, ok: true });
        break;
        
      case 'setQueue':
        state.queue = payload.queue.map(item => ({
          ...item,
          status: 'queued',
          attempts: 0,
          tx: null,
          error: null
        }));
        self.postMessage({ id, ok: true });
        break;
        
      case 'start':
        if(!state.running) {
          state.running = true;
          state.paused = false;
          state.startTime = Date.now();
          state.processed = 0;
          processQueue();
        }
        self.postMessage({ id, ok: true });
        break;
        
      case 'pause':
        state.paused = true;
        self.postMessage({ id, ok: true });
        break;
        
      case 'resume':
        state.paused = false;
        if(state.running) processQueue();
        self.postMessage({ id, ok: true });
        break;
        
      case 'cancel':
        state.running = false;
        state.paused = false;
        self.postMessage({ id, ok: true });
        break;
        
      default:
        throw new Error('Unknown command: ' + cmd);
    }
  } catch(error) {
    self.postMessage({ id, ok: false, error: error.message });
  }
};

async function processQueue() {
  if(!state.running || state.paused) return;
  
  const pending = state.queue.filter(item => 
    item.status === 'queued' || 
    (item.status === 'error' && item.attempts < state.config.maxRetries)
  );
  
  if(pending.length === 0) {
    // Завершение
    const summary = getSummary();
    self.postMessage({ 
      id: 'batch-finished', 
      summary 
    });
    state.running = false;
    return;
  }
  
  // Обработка с учётом concurrency
  const batch = pending.slice(0, state.config.concurrency);
  
  await Promise.all(batch.map(async (item) => {
    const index = state.queue.indexOf(item);
    await processItem(index);
  }));
  
  // Задержка перед следующей итерацией
  if(state.config.delay > 0) {
    await new Promise(r => setTimeout(r, state.config.delay));
  }
  
  // Рекурсивный вызов для следующей порции
  processQueue();
}

async function processItem(index) {
  const item = state.queue[index];
  if(!item) return;
  
  item.status = 'processing';
  item.attempts++;
  sendProgress(index, item);
  
  try {
    // Отправляем запрос на transfer в основной поток
    const result = await requestTransfer(item.address, state.config.amount);
    
    item.status = 'success';
    item.tx = result.txHash;
    state.processed++;
    
  } catch(error) {
    item.error = error.message;
    
    if(item.attempts >= state.config.maxRetries) {
      item.status = 'failed';
    } else {
      item.status = 'error';
    }
  }
  
  sendProgress(index, item);
}

function requestTransfer(address, amount) {
  return new Promise((resolve, reject) => {
    const reqId = 'transfer-' + Date.now() + Math.random();
    
    function handler(e) {
      if(e.data && e.data.id === reqId) {
        self.removeEventListener('message', handler);
        if(e.data.ok) {
          resolve(e.data);
        } else {
          reject(new Error(e.data.error || 'Transfer failed'));
        }
      }
    }
    
    self.addEventListener('message', handler);
    
    // Отправляем запрос в основной поток через postMessage к window
    self.postMessage({
      id: reqId,
      cmd: 'doTransfer',
      payload: { address, amount }
    });
    
    // Таймаут 30 секунд
    setTimeout(() => {
      self.removeEventListener('message', handler);
      reject(new Error('Transfer timeout'));
    }, 30000);
  });
}

function sendProgress(index, item) {
  self.postMessage({
    id: 'progress',
    index,
    item,
    summary: getSummary()
  });
}

function getSummary() {
  const total = state.queue.length;
  const success = state.queue.filter(i => i.status === 'success').length;
  const error = state.queue.filter(i => i.status === 'failed').length;
  const elapsed = (Date.now() - state.startTime) / 1000;
  const rate = state.processed / (elapsed || 1);
  const remaining = total - success - error;
  const etaSeconds = remaining / (rate || 0.1);
  
  return {
    total,
    success,
    error,
    elapsed,
    rate,
    etaSeconds,
    processed: state.processed
  };
}
