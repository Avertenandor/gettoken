// init.js - инициализация после загрузки DOM
// Этот файл заменяет все inline скрипты из index.html

document.addEventListener('DOMContentLoaded', () => {
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
});