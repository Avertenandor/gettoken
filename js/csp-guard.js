(function(){
  try {
    if(top !== self){
      try { top.location = self.location; }
      catch(_){ window.open(self.location, '_top'); }
    }
  } catch(_){ /* ignore */ }
})();
