// passport.js - экспорт/импорт паспорта токена
// Паспорт: { address, abi, bytecode(optional), params, chainId, createdAt }

function exportTokenPassport(){
  if(!APP_STATE.token || !APP_STATE.token.address) { alert('Нет токена'); return; }
  const passport = {
    address: APP_STATE.token.address,
    abi: APP_STATE.token.abi,
    bytecode: APP_STATE.token.bytecode,
    params: APP_STATE.token.params,
    chainId: APP_STATE.network,
    createdAt: new Date().toISOString()
  };
  const blob = new Blob([JSON.stringify(passport, null, 2)], {type:'application/json'});
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `token_passport_${passport.address}.json`; a.click();
}

async function importTokenPassport(file){
  const text = await file.text();
  let data; try{ data = JSON.parse(text); }catch(e){ alert('Некорректный JSON'); return; }
  if(!data.address || !data.abi){ alert('Отсутствуют ключевые поля'); return; }
  const providerOrSigner = APP_STATE.signer || APP_STATE.provider;
  const contract = new ethers.Contract(data.address, data.abi, providerOrSigner);
  APP_STATE.token = { address: data.address, abi: data.abi, bytecode: data.bytecode||null, contract, params: data.params||null };
  if(APP_STATE.token.contract){
    const addrEl = document.getElementById('token-address'); if(addrEl) addrEl.textContent = data.address;
    const base = (typeof getExplorerBase==='function') ? getExplorerBase(data.chainId || APP_STATE.network) : '';
    const link = document.getElementById('bscan-link'); if(link){ link.href = base? `${base}/address/${data.address}`:'#'; link.classList.remove('hidden'); }
    document.getElementById('deployed-info')?.classList.remove('hidden');
    const tBtn = document.getElementById('btn-transfer'); if(tBtn) tBtn.disabled=false;
    const aBtn = document.getElementById('btn-approve'); if(aBtn) aBtn.disabled=false;
    const vBtn = document.getElementById('verify-btn-manage'); if(vBtn) vBtn.disabled = !APP_STATE.token.bytecode;
    const spBtn = document.getElementById('btn-save-passport'); if(spBtn) spBtn.disabled=false;
    const prBtn = document.getElementById('btn-save-project'); if(prBtn) prBtn.disabled=false;
    const dlAbi = document.getElementById('download-abi-btn'); if(dlAbi) dlAbi.disabled = !APP_STATE.token.abi;
    const dlByte = document.getElementById('download-bytecode-btn'); if(dlByte) dlByte.disabled = !APP_STATE.token.bytecode;
  }
  if(window.__saveProject){ window.__saveProject(); }
  log('Импортирован паспорт токена '+data.address);
}

window.__exportPassport = exportTokenPassport;
window.__importPassport = importTokenPassport;
