// init.js - инициализация после загрузки DOM
// Этот файл заменяет все inline скрипты из index.html

document.addEventListener('DOMContentLoaded', () => {
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
});