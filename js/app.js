// --- Новый раздел подключения кошелька ---
// (id, log предоставлены в utils.js)

function validateMnemonic(mnemonic) {
  const words = mnemonic.trim().split(/\s+/);
  if (words.length !== 12 && words.length !== 24) return false;
  return words.every(w => /^[a-zA-Z]+$/.test(w));
}
function validatePrivateKey(pk) {
  return /^0x[0-9a-fA-F]{64}$/.test(pk.trim());
}

// Подключение через расширение
id('btn-connect') && id('btn-connect').addEventListener('click', connectWallet);

// Подключение по сид-фразе
id('alt-connect-mnemonic') && id('alt-connect-mnemonic').addEventListener('click', async () => {
  const mnemonic = (id('alt-mnemonic')||{}).value?.trim()||'';
  if (!validateMnemonic(mnemonic)) {
    log('Ошибка: сид-фраза должна содержать 12 или 24 слова, только латиница', 'error');
    id('connect-status').textContent = 'Ошибка: сид-фраза должна содержать 12 или 24 слова, только латиница';
    return;
  }
  if (!confirm('Подтвердите, что вводите ВРЕМЕННУЮ сид-фразу. После подключения она будет очищена. Продолжить?')) return;
  try {
    const provider = new ethers.JsonRpcProvider(APP_STATE.settings.rpcUrl || NETWORK_PRESETS[56].rpc);
    const wallet = ethers.Wallet.fromPhrase(mnemonic).connect(provider);
    secureClear('alt-mnemonic');
    APP_STATE.provider = provider;
    APP_STATE.signer = wallet;
    APP_STATE.address = await wallet.getAddress();
    const net = await provider.getNetwork();
    APP_STATE.network = Number(net.chainId);
    APP_STATE.alt.connected = true;
    updateWalletBadge();
    updateNetStatus();
    log('Кошелёк подключён по сид-фразе');
    id('connect-status').textContent = 'Кошелёк подключён по сид-фразе';
  } catch (e) {
    log('Ошибка подключения по сид-фразе: ' + e.message, 'error');
    id('connect-status').textContent = 'Ошибка подключения: ' + e.message;
  }
});

// Подключение по приватному ключу
id('alt-connect-pk') && id('alt-connect-pk').addEventListener('click', async () => {
  const pk = (id('alt-private-key')||{}).value?.trim()||'';
  if (!validatePrivateKey(pk)) {
    log('Ошибка: приватный ключ должен быть в формате 0x + 64 символа', 'error');
    id('connect-status').textContent = 'Ошибка: приватный ключ должен быть в формате 0x + 64 символа';
    return;
  }
  if (!confirm('Подтвердите, что используете ВРЕМЕННЫЙ приватный ключ. После подключения он будет очищен. Продолжить?')) return;
  try {
    const provider = new ethers.JsonRpcProvider(APP_STATE.settings.rpcUrl || NETWORK_PRESETS[56].rpc);
    const wallet = new ethers.Wallet(pk, provider);
    secureClear('alt-private-key');
    APP_STATE.provider = provider;
    APP_STATE.signer = wallet;
    APP_STATE.address = await wallet.getAddress();
    const net = await provider.getNetwork();
    APP_STATE.network = Number(net.chainId);
    APP_STATE.alt.connected = true;
    updateWalletBadge();
    updateNetStatus();
    log('Кошелёк подключён по приватному ключу');
    id('connect-status').textContent = 'Кошелёк подключён по приватному ключу';
  } catch (e) {
    log('Ошибка подключения по приватному ключу: ' + e.message, 'error');
    id('connect-status').textContent = 'Ошибка подключения: ' + e.message;
  }
});

// Read-only режим
id('read-only-btn') && id('read-only-btn').addEventListener('click', () => {
  APP_STATE.provider = null;
  APP_STATE.signer = null;
  APP_STATE.address = null;
  APP_STATE.network = null;
  APP_STATE.alt.connected = false;
  updateWalletBadge();
  updateNetStatus();
  log('Режим только просмотра активирован');
  id('connect-status').textContent = 'Режим только просмотра активирован';
});

id('toggle-pk-visibility') && id('toggle-pk-visibility').addEventListener('click', ()=>{ const el=id('alt-private-key'); if(!el) return; el.type= el.type==='password'? 'text':'password'; });
function secureClear(i){ const el=id(i); if(el) el.value=''; }
// ...existing code...

// --- Логика деплоя токена ---
const SOURCE_TEMPLATE = (name, symbol, decimals, supply) => `// SPDX-License-Identifier: MIT\npragma solidity ^0.8.24;\ncontract ${symbol} {\nstring public name = '${name}';\nstring public symbol = '${symbol}';\nuint8 public decimals = ${decimals};\nuint256 public totalSupply;\nmapping(address=>uint256) public balanceOf;\nevent Transfer(address indexed from,address indexed to,uint256 value);\nconstructor(uint256 initialSupply){totalSupply=initialSupply;balanceOf[msg.sender]=initialSupply;emit Transfer(address(0),msg.sender,initialSupply);}\nfunction transfer(address to,uint256 value) external returns(bool){require(balanceOf[msg.sender]>=value,'bal');unchecked{balanceOf[msg.sender]-=value;balanceOf[to]+=value;}emit Transfer(msg.sender,to,value);return true;}\n}`;

let compilerWorker = null;
function ensureCompiler(){
  if(compilerWorker) return compilerWorker;
  compilerWorker = new Worker('./js/compiler.worker.js');
  return compilerWorker;
}

id('token-form')?.addEventListener('submit', async (e)=>{
  e.preventDefault();
  if(!APP_STATE.signer){ log('Сначала подключите кошелёк','error'); return; }
  const name = id('token-name').value.trim();
  const symbol = id('token-symbol').value.trim();
  const decimals = parseInt(id('token-decimals').value,10) || 18;
  const supply = BigInt(id('token-supply').value || '0');
  if(!name || !symbol || supply<=0n){ log('Заполните имя/символ/выпуск','error'); return; }
  const source = SOURCE_TEMPLATE(name, symbol, decimals, supply.toString());
  const w = ensureCompiler();
  const reqId = 'cmp-'+Date.now();
  const status = id('deploy-status'); if(status) status.textContent = 'Компиляция...';
  const result = await new Promise((resolve,reject)=>{
    function handler(ev){ if(ev.data.id===reqId){ w.removeEventListener('message', handler); ev.data.ok? resolve(ev.data.result): reject(new Error(ev.data.error)); } }
    w.addEventListener('message', handler);
    w.postMessage({ id:reqId, cmd:'compile', payload:{ source, optimize:true, version:'v0.8.24+commit.e11b9ed9' } });
  }).catch(e=>{ log('Ошибка компиляции: '+e.message,'error'); return null; });
  if(!result) return;
  if(status) status.textContent = 'Деплой...';
  try {
    const factory = new ethers.ContractFactory(result.abi, result.bytecode, APP_STATE.signer);
    const contract = await factory.deploy();
    await contract.deploymentTransaction().wait();
    APP_STATE.token = { address: contract.target, abi: result.abi, bytecode: result.bytecode, contract, params:{ name, symbol, decimals, supply: supply.toString() } };
    id('token-address').textContent = contract.target;
    const link = id('bscan-link'); if(link){ link.href = `https://bscscan.com/address/${contract.target}`; link.classList.remove('hidden'); }
    id('deployed-info').classList.remove('hidden');
    id('btn-transfer').disabled = false;
    id('btn-approve').disabled = false;
    id('btn-save-passport').disabled = false;
    id('btn-save-project').disabled = false;
    id('verify-btn').disabled = false;
    if(status) status.textContent = 'Токен создан';
    __toast && __toast('Токен создан','info',4000);
    refreshBalance();
  } catch(e){
    log('Ошибка деплоя: '+e.message,'error'); if(status) status.textContent = 'Ошибка деплоя: '+e.message; }
});

async function refreshBalance(){
  const bal = await fetchTokenBalance();
  if(bal!=null){ const el = id('token-balance'); if(el) el.textContent = 'Баланс: '+bal; }
}
id('refresh-balance')?.addEventListener('click', refreshBalance);

// Transfer
id('btn-transfer')?.addEventListener('click', async ()=>{
  if(!APP_STATE.token.contract) return; const to=id('transfer-to').value.trim(); const amount = id('transfer-amount').value.trim();
  if(!/^0x[0-9a-fA-F]{40}$/.test(to)){ log('Неверный адрес получателя','error'); return; }
  try {
    const decimals = await APP_STATE.token.contract.decimals();
    const value = ethers.parseUnits(amount, decimals);
    const tx = await APP_STATE.token.contract.transfer(to, value);
    log('Transfer tx: '+tx.hash); __toast && __toast('Transfer отправлен','info',3000);
    await tx.wait(); refreshBalance();
  } catch(e){ log('Ошибка transfer: '+e.message,'error'); }
});

// Approve
id('btn-approve')?.addEventListener('click', async ()=>{
  if(!APP_STATE.token.contract) return; const sp=id('approve-spender').value.trim(); const amount = id('approve-amount').value.trim();
  if(!/^0x[0-9a-fA-F]{40}$/.test(sp)){ log('Неверныйspender','error'); return; }
  try {
    const decimals = await APP_STATE.token.contract.decimals();
    const value = ethers.parseUnits(amount, decimals);
    const tx = await APP_STATE.token.contract.approve(sp, value);
    log('Approve tx: '+tx.hash); __toast && __toast('Approve отправлен','info',3000);
    await tx.wait();
  } catch(e){ log('Ошибка approve: '+e.message,'error'); }
});

// Passport export/import
id('btn-save-passport')?.addEventListener('click', ()=>{ window.__exportPassport && window.__exportPassport(); });
id('btn-import-passport')?.addEventListener('click', ()=>{ id('import-passport-file').click(); });
id('import-passport-file')?.addEventListener('change', (e)=>{ const f=e.target.files[0]; if(f && window.__importPassport) window.__importPassport(f); });

// Project save/list
id('btn-save-project')?.addEventListener('click', ()=>{ window.__saveProject && window.__saveProject(); });
id('btn-list-projects')?.addEventListener('click', async ()=>{ if(!window.__listProjects) return; const list = await window.__listProjects(); const box=id('projects-list'); if(box) box.textContent = list.map(p=>p.id).join(', ')||'Нет проектов'; });
id('btn-load-project')?.addEventListener('click', async ()=>{ const addr = prompt('Введите адрес контракта'); if(!addr) return; try { await window.__loadProject(addr); refreshBalance(); __toast && __toast('Проект загружен','info',3000); } catch(e){ log('Ошибка загрузки: '+e,'error'); } });

// Disconnect
id('btn-disconnect')?.addEventListener('click', ()=>{ disconnectWallet(); secureClear('alt-mnemonic'); secureClear('alt-private-key'); __toast && __toast('Отключено','info',2000); });

// Settings save
id('save-settings')?.addEventListener('click', ()=>{ APP_STATE.settings.rpcUrl = id('rpc-url').value.trim(); APP_STATE.settings.apiKey = id('api-key').value.trim(); saveSettings(); const s=id('settings-status'); if(s) s.textContent='Сохранено'; });

// Инициализация полей настроек
document.addEventListener('DOMContentLoaded', ()=>{ if(id('rpc-url')) id('rpc-url').value = APP_STATE.settings.rpcUrl; if(id('api-key')) id('api-key').value = APP_STATE.settings.apiKey; });
