(function(){
  // Лёгкие полифилы для UMD-бандлов, ожидающих Node-подобную среду
  var g = (typeof globalThis!=='undefined') ? globalThis : (typeof window!=='undefined'?window: (typeof self!=='undefined'?self:this));
  if(!g.global) { g.global = g; }
  if(!g.process) { g.process = { env: {} }; }
})();
