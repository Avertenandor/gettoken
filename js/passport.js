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
    document.getElementById('token-address').textContent = data.address;
    document.getElementById('bscan-link').href = `https://bscscan.com/address/${data.address}`;
    document.getElementById('deployed-info').classList.remove('hidden');
    document.getElementById('btn-verify').disabled = !APP_STATE.token.bytecode; // если есть bytecode можно верифицировать
    document.getElementById('btn-save-passport').disabled = false;
    document.getElementById('btn-save-project').disabled = false;
  }
  if(window.__saveProject){ window.__saveProject(); }
  log('Импортирован паспорт токена '+data.address);
}

window.__exportPassport = exportTokenPassport;
window.__importPassport = importTokenPassport;
