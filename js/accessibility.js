(function(){
  const btnFont = document.getElementById('btn-font');
  const btnGuide = document.getElementById('btn-guide');
  const root = document.documentElement;

  // Крупный шрифт: запоминаем в localStorage
  const KEY = 'pm_big_font';
  function applyFont(big){
    root.style.setProperty('--base-font-size', big ? '18px' : '16px');
    document.body.classList.toggle('big-font', !!big);
  }
  try{ applyFont(localStorage.getItem(KEY)==='1'); }catch(_){/* noop */}

  if(btnFont){
    btnFont.addEventListener('click', ()=>{
      const big = !document.body.classList.contains('big-font');
      applyFont(big);
      try{ localStorage.setItem(KEY, big?'1':'0'); }catch(_){/* noop */}
    });
  }

  // Переход к инструкции
  if(btnGuide){
    btnGuide.addEventListener('click', ()=>{
      const el = document.getElementById('usage-guide');
      if(el){ el.scrollIntoView({behavior:'smooth'}); }
    });
  }
})();
