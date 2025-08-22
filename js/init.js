// init.js - инициализация после загрузки DOM
// Этот файл заменяет все inline скрипты из index.html

document.addEventListener('DOMContentLoaded', () => {
  // Инжекция блока сид/PK, если по какой-то причине его нет в разметке
  function ensureRiskBlock(){
    const existing = document.getElementById('risk-modes-block');
    if(existing) return existing;
    const ol = document.querySelector('#view-connect .connect-options ol');
    if(!ol) return null;
    const li = document.createElement('li');
    li.id = 'risk-modes-block';
    li.style.display = 'list-item';
    li.innerHTML = `
      <details open><summary><b>Сид / Приватный ключ (НЕ РЕКОМЕНДУЕТСЯ)</b></summary>
        <div style="margin-top:8px;">
          <textarea id="alt-mnemonic" placeholder="Сид-фраза 12/24 слов" style="width:100%;min-height:60px;" aria-label="Сид фраза"></textarea>
          <button type="button" id="alt-connect-mnemonic">Подключить по сид-фразе</button>
          <div class="hint">Только временная сид-фраза. Очищается после подключения.</div>
          <hr style="margin:12px 0;opacity:0.3;">
          <input id="alt-private-key" placeholder="Приватный ключ 0x..." style="width:100%;" aria-label="Приватный ключ" type="password" />
          <button type="button" id="toggle-pk-visibility" style="font-size:11px;">Показать</button>
          <button type="button" id="alt-connect-pk">Подключить по приватному ключу</button>
          <div class="hint">Формат: 0x + 64 hex. Используйте временный ключ.</div>
        </div>
      </details>`;
    // Вставим перед Read-only (если найдём)
    const readOnlyBtn = document.getElementById('read-only-btn');
    if(readOnlyBtn && readOnlyBtn.closest('li')) ol.insertBefore(li, readOnlyBtn.closest('li')); else ol.appendChild(li);
    // Навешиваем обработчики для новых элементов (дублирует app.js, но безопасно)
    const btnSeed = li.querySelector('#alt-connect-mnemonic');
    if(btnSeed){
      btnSeed.addEventListener('click', async () => {
        if(!window.__secAttempt || !window.__secAttempt('seed')) return;
        const lock = document.getElementById('connect-status'); if(lock) lock.textContent='';
        const mnemonic = (document.getElementById('alt-mnemonic')||{}).value?.trim()||'';
        if(typeof validateMnemonic==='function' && !validateMnemonic(mnemonic)){
          lock && (lock.textContent='Ошибка: сид-фраза должна содержать 12 или 24 слова, только латиница'); return;
        }
        if(!confirm('Подтвердите, что вводите ВРЕМЕННУЮ сид-фразу. После подключения она будет очищена. Продолжить?')) return;
        try{
          const netId = (window.APP_STATE?.settings?.networkId)||56;
          const rpc = (window.APP_STATE?.settings?.rpcUrl) || (window.NETWORK_PRESETS && window.NETWORK_PRESETS[netId]?.rpc) || 'https://bsc-dataseed.binance.org';
          const provider = new ethers.JsonRpcProvider(rpc);
          const wallet = ethers.Wallet.fromPhrase(mnemonic).connect(provider);
          if(typeof secureClear==='function') secureClear('alt-mnemonic');
          window.APP_STATE.provider = provider; window.APP_STATE.signer = wallet; window.APP_STATE.address = await wallet.getAddress();
          const net = await provider.getNetwork(); window.APP_STATE.network = Number(net.chainId); window.APP_STATE.alt.connected = true;
          if(typeof updateWalletBadge==='function') updateWalletBadge(); if(typeof updateNetStatus==='function') updateNetStatus();
          lock && (lock.textContent='Кошелёк подключён по сид-фразе');
        }catch(e){ lock && (lock.textContent='Ошибка подключения: '+(e?.message||e)); }
      });
    }
    const btnPk = li.querySelector('#alt-connect-pk');
    if(btnPk){
      btnPk.addEventListener('click', async () => {
        if(!window.__secAttempt || !window.__secAttempt('pk')) return;
        const lock = document.getElementById('connect-status'); if(lock) lock.textContent='';
        const pk = (document.getElementById('alt-private-key')||{}).value?.trim()||'';
        if(typeof validatePrivateKey==='function' && !validatePrivateKey(pk)){
          lock && (lock.textContent='Ошибка: приватный ключ должен быть в формате 0x + 64 символа'); return;
        }
        if(!confirm('Подтвердите, что используете ВРЕМЕННЫЙ приватный ключ. После подключения он будет очищен. Продолжить?')) return;
        try{
          const netId = (window.APP_STATE?.settings?.networkId)||56;
          const rpc = (window.APP_STATE?.settings?.rpcUrl) || (window.NETWORK_PRESETS && window.NETWORK_PRESETS[netId]?.rpc) || 'https://bsc-dataseed.binance.org';
          const provider = new ethers.JsonRpcProvider(rpc);
          const wallet = new ethers.Wallet(pk, provider);
          if(typeof secureClear==='function') secureClear('alt-private-key');
          window.APP_STATE.provider = provider; window.APP_STATE.signer = wallet; window.APP_STATE.address = await wallet.getAddress();
          const net = await provider.getNetwork(); window.APP_STATE.network = Number(net.chainId); window.APP_STATE.alt.connected = true;
          if(typeof updateWalletBadge==='function') updateWalletBadge(); if(typeof updateNetStatus==='function') updateNetStatus();
          lock && (lock.textContent='Кошелёк подключён по приватному ключу');
        }catch(e){ lock && (lock.textContent='Ошибка подключения: '+(e?.message||e)); }
      });
    }
    const visBtn = li.querySelector('#toggle-pk-visibility');
    if(visBtn){ visBtn.addEventListener('click', ()=>{ const el=document.getElementById('alt-private-key'); if(!el) return; el.type = el.type==='password'?'text':'password'; }); }
    return li;
  }
  // --- Простая навигация по вкладкам ---
  function showView(name){
    const targetId = `view-${name}`;
    document.querySelectorAll('.view').forEach(sec=>{
      if(sec.id === targetId){ sec.classList.add('active'); sec.removeAttribute('aria-hidden'); }
      else { sec.classList.remove('active'); sec.setAttribute('aria-hidden','true'); }
    });
    // Подсветка активной кнопки
    document.querySelectorAll('header nav [data-view]').forEach(btn=>{
      if(btn.getAttribute('data-view')===name) btn.classList.add('active');
      else btn.classList.remove('active');
    });
    try { localStorage.setItem('lastView', name); } catch(_){}
  }
  document.querySelectorAll('header nav [data-view]')
    .forEach(btn=> btn.addEventListener('click', ()=> showView(btn.getAttribute('data-view'))));
  // Восстановить последнюю вкладку
  const last = localStorage.getItem('lastView');
  if(last && document.getElementById(`view-${last}`)) showView(last); else showView('connect');

  // Инициализация выбора сети
  const networkSelect = document.getElementById('network-select');
  if(networkSelect && window.APP_STATE) { 
    networkSelect.value = String(APP_STATE.settings.networkId || 56); 
    networkSelect.addEventListener('change', () => { 
      APP_STATE.settings.networkId = parseInt(networkSelect.value, 10); 
      if(window.saveSettings) saveSettings(); 
    }); 
  }
  
  // Service Worker регистрация
  if('serviceWorker' in navigator){
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').then(reg => {
        reg.addEventListener('updatefound', () => {
          const nw = reg.installing; 
          if(!nw) return;
          nw.addEventListener('statechange', () => {
            if(nw.state === 'installed' && navigator.serviceWorker.controller){
              if(confirm('Доступна новая версия. Обновить сейчас?')){
                if(reg.waiting) reg.waiting.postMessage('skipWaiting');
                setTimeout(() => location.reload(), 500);
              }
            }
          });
        });
      }).catch(e => console.error('SW register fail', e));
    });
  }
  // Убедимся, что блок сид/PK есть
  ensureRiskBlock();
});