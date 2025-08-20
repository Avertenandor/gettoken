// toast.js - простая система уведомлений
(function(){
  const containerId = 'toast-container';
  function ensureContainer(){
    let c = document.getElementById(containerId);
    if(!c){ c = document.createElement('div'); c.id = containerId; document.body.appendChild(c); }
    return c;
  }
  function toast(message, type='info', timeout=5000){
    const c = ensureContainer();
    const el = document.createElement('div');
    el.className = 'toast '+type;
    el.innerHTML = `<span>${escapeHtml(message)}</span><span class="close">×</span>`;
    c.appendChild(el);
    const remove = ()=>{ if(el.parentNode){ el.style.opacity='0'; setTimeout(()=>el.remove(), 180); } };
    el.querySelector('.close').addEventListener('click', remove);
    if(timeout>0) setTimeout(remove, timeout);
  }
  function escapeHtml(str){ return str.replace(/[&<>"']/g, s=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;' }[s])); }
  window.__toast = toast;
})();
