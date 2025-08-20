/* batch.worker.js - фоновые batch transfer */

let running = false;
let paused = false;
let tokenContractAddress = null;
let abi = null; // оставлено для потенциальной валидации
let transferAmount = '0';

let queue = [];
let delay = 2500;
let maxRetries = 2;
let startedAt = 0;
let counters = { sent:0, ok:0, err:0 };

self.onmessage = async (e) => {
  const { id, cmd, payload } = e.data;
  try {
    if (cmd === 'init') {
      tokenContractAddress = payload.address;
      abi = payload.abi;
      delay = payload.delay || delay;
      maxRetries = payload.maxRetries || maxRetries;
      transferAmount = payload.amount || '0';
      self.postMessage({ id, ok: true });
    } else if (cmd === 'setQueue') {
      queue = payload.queue.map(a => ({ address: a.address, status: 'queued', attempts: 0 }));
      self.postMessage({ id, ok: true, size: queue.length });
    } else if (cmd === 'start') {
      if (running) throw new Error('already running');
      running = true; paused = false; startedAt = Date.now();
      counters = { sent:0, ok:0, err:0 };
      processLoop();
      self.postMessage({ id, ok: true });
    } else if (cmd === 'pause') { paused = true; self.postMessage({ id, ok: true }); }
    else if (cmd === 'resume') { paused = false; self.postMessage({ id, ok: true }); }
    else if (cmd === 'cancel') { running = false; paused = false; self.postMessage({ id, ok: true }); }
    else if (cmd === 'status') { self.postMessage({ id, ok:true, summary: summarize() }); }
    else {
      throw new Error('Unknown cmd');
    }
  } catch (error) {
    self.postMessage({ id, ok: false, error: error.message });
  }
};

async function processLoop(){
  for (let i=0;i<queue.length;i++){
    if(!running) break;
    const item = queue[i];
    if(item.status === 'success') continue;
    while(paused && running) await sleep(200);
    if(!running) break;
    item.status = 'sending';
    postProgress(i, item);
    const txResult = await requestMainTransfer(item.address, i, transferAmount);
    counters.sent++;
    if (txResult.ok) {
      item.status = 'success';
      item.tx = txResult.txHash; counters.ok++;
    } else {
      item.attempts++;
      if (item.attempts <= maxRetries) {
        item.status = 'retry';
        postProgress(i, item);
        await sleep(delay);
        i--; // повтор текущего индекса
        continue;
      } else {
        item.status = 'error';
        item.error = txResult.error; counters.err++;
      }
    }
    postProgress(i, item);
    await sleep(delay);
  }
  running = false;
  self.postMessage({ id: 'batch-finished', ok: true, summary: summarize() });
}

function summarize(){
  const total = queue.length;
  const success = queue.filter(i=>i.status==='success').length;
  const error = queue.filter(i=>i.status==='error').length;
  const elapsed = (Date.now()-startedAt)/1000;
  const rate = elapsed>0? (success+error)/elapsed : 0;
  let remaining = 0;
  if(total>0){
    const done = success+error;
    const left = total - done;
    remaining = rate>0? left/rate : 0;
  }
  return { total, success, error, elapsed, rate, etaSeconds: remaining, running, paused };
}

function sleep(ms){ return new Promise(r=>setTimeout(r, ms)); }

function postProgress(index, item){
  self.postMessage({ id: 'progress', index, item, summary: summarize() });
}

function requestMainTransfer(address, index, amount){
  return new Promise(resolve => {
    const callId = `transfer-${index}-${Date.now()}`;
    function handler(e){
      const { id, ok, txHash, error } = e.data || {};
      if(id === callId){
        self.removeEventListener('message', handler);
        resolve({ ok, txHash, error });
      }
    }
    self.addEventListener('message', handler);
    self.postMessage({ id: callId, cmd: 'doTransfer', payload: { address, amount } });
  });
}
