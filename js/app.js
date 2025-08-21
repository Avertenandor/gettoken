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

// Exponential backoff визуализация
function computeLockSeconds(attempts){
  if(attempts<=5) return 0;
  const extra = attempts-5; // 1 => 5s, 2 =>10s, 3=>20s cap 120s
  return Math.min(120, 5 * (2 ** (extra-1)));
}
function showSecurityLock(){
  const lockBox = id('connect-status');
  if(!lockBox) return;
  const attempts = Math.max(APP_STATE.security.seedAttempts, APP_STATE.security.pkAttempts);
  const lock = computeLockSeconds(attempts);
  if(lock>0){
    const until = Date.now()+lock*1000;
    const timer = setInterval(()=>{
      const left = Math.max(0, Math.floor((until-Date.now())/1000));
      lockBox.textContent = left>0? `Блокировка ввода секретов: ${left}s`:'Можно повторить ввод';
      if(left===0){ clearInterval(timer); }
    },1000);
  }
}

// Подключение через расширение
id('btn-connect') && id('btn-connect').addEventListener('click', connectWallet);

// Подключение по сид-фразе
id('alt-connect-mnemonic') && id('alt-connect-mnemonic').addEventListener('click', async () => {
  if(!window.__secAttempt('seed')) return;
  showSecurityLock();
  const mnemonic = (id('alt-mnemonic')||{}).value?.trim()||'';
  if (!validateMnemonic(mnemonic)) {
    log('Ошибка: сид-фраза должна содержать 12 или 24 слова, только латиница', 'error');
    id('connect-status').textContent = 'Ошибка: сид-фраза должна содержать 12 или 24 слова, только латиница';
    return;
  }
  if (!confirm('Подтвердите, что вводите ВРЕМЕННУЮ сид-фразу. После подключения она будет очищена. Продолжить?')) return;
  try {
    const netId = APP_STATE.settings.networkId||56;
    const rpc = APP_STATE.settings.rpcUrl || (NETWORK_PRESETS[netId] && NETWORK_PRESETS[netId].rpc) || NETWORK_PRESETS[56].rpc;
    const provider = new ethers.JsonRpcProvider(rpc);
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
  if(!window.__secAttempt('pk')) return;
  showSecurityLock();
  const pk = (id('alt-private-key')||{}).value?.trim()||'';
  if (!validatePrivateKey(pk)) {
    log('Ошибка: приватный ключ должен быть в формате 0x + 64 символа', 'error');
    id('connect-status').textContent = 'Ошибка: приватный ключ должен быть в формате 0x + 64 символа';
    return;
  }
  if (!confirm('Подтвердите, что используете ВРЕМЕННЫЙ приватный ключ. После подключения он будет очищен. Продолжить?')) return;
  try {
    const netId = APP_STATE.settings.networkId||56;
    const rpc = APP_STATE.settings.rpcUrl || (NETWORK_PRESETS[netId] && NETWORK_PRESETS[netId].rpc) || NETWORK_PRESETS[56].rpc;
    const provider = new ethers.JsonRpcProvider(rpc);
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
// Логгер UI
(function(){
  const orig = { log: console.log, error: console.error };
  const buffer = [];
  function push(type, args){
    const line = `[${new Date().toISOString()}] ${type.toUpperCase()} ${Array.from(args).map(a=> (typeof a==='object'? JSON.stringify(a): a)).join(' ')}`;
    buffer.push({ type, line });
    if(buffer.length>1000) buffer.shift();
    render();
  }
  function render(){
    const out = id('log-output'); if(!out) return;
    const filter = (id('log-filter')||{}).value||'all';
    const visible = buffer.filter(r=> filter==='all' || r.type===filter);
    out.textContent = visible.map(r=>r.line).join('\n');
    const cnt = id('log-count'); if(cnt) cnt.textContent = `Показано ${visible.length} / ${buffer.length}`;
  }
  console.log = function(){ orig.log.apply(console, arguments); push('info', arguments); };
  console.error = function(){ orig.error.apply(console, arguments); push('error', arguments); };
  window.__exportLogs = function(){
    const blob = new Blob([buffer.map(r=>r.line).join('\n')], {type:'text/plain'});
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download='logs.txt'; a.click();
  };
  window.__clearLogs = function(){ buffer.length=0; render(); };
  document.addEventListener('change', e=>{ if(e.target && e.target.id==='log-filter') render(); });
  id('log-clear')?.addEventListener('click', ()=>window.__clearLogs());
  id('log-export')?.addEventListener('click', ()=>window.__exportLogs());
})();
function sanitizeIdentifier(str){
  // Оставляем буквы/цифры/подчёркивания, первая буква не цифра.
  const cleaned = str.replace(/[^A-Za-z0-9_]/g,'');
  return (/^[0-9]/.test(cleaned) ? '_'+cleaned : cleaned) || 'Token';
}
const SOURCE_TEMPLATE = (name, symbol, decimals, supply) => {
  const contractId = sanitizeIdentifier(symbol);
  return `// SPDX-License-Identifier: MIT\npragma solidity ^0.8.24;\n/**\n * Fixed-supply ERC20 minimal implementation (mint all in constructor).\n */\ncontract ${contractId} {\n    string public name = '${name}';\n    string public symbol = '${symbol}';\n    uint8 public decimals = ${decimals};\n    uint256 public totalSupply;\n    mapping(address => uint256) public balanceOf;\n    mapping(address => mapping(address => uint256)) public allowance;\n    event Transfer(address indexed from, address indexed to, uint256 value);\n    event Approval(address indexed owner, address indexed spender, uint256 value);\n    constructor(uint256 initialSupply){\n        totalSupply = initialSupply;\n        balanceOf[msg.sender] = initialSupply;\n        emit Transfer(address(0), msg.sender, initialSupply);\n    }\n    function _transfer(address from, address to, uint256 value) internal {\n        require(to != address(0), 'to=0');\n        uint256 bal = balanceOf[from];\n        require(bal >= value, 'bal');\n        unchecked { balanceOf[from] = bal - value; balanceOf[to] += value; }\n        emit Transfer(from, to, value);\n    }\n    function transfer(address to, uint256 value) external returns (bool){ _transfer(msg.sender, to, value); return true; }\n    function approve(address spender, uint256 value) external returns (bool){ allowance[msg.sender][spender] = value; emit Approval(msg.sender, spender, value); return true; }\n    function transferFrom(address from, address to, uint256 value) external returns (bool){ uint256 a = allowance[from][msg.sender]; require(a >= value, 'allow'); if(a != type(uint256).max){ unchecked { allowance[from][msg.sender] = a - value; } emit Approval(from, msg.sender, allowance[from][msg.sender]); } _transfer(from, to, value); return true; }\n    function increaseAllowance(address spender, uint256 added) external returns (bool){ uint256 cur = allowance[msg.sender][spender]; uint256 nv = cur + added; allowance[msg.sender][spender] = nv; emit Approval(msg.sender, spender, nv); return true; }\n    function decreaseAllowance(address spender, uint256 sub) external returns (bool){ uint256 cur = allowance[msg.sender][spender]; require(cur >= sub, 'under'); uint256 nv = cur - sub; allowance[msg.sender][spender] = nv; emit Approval(msg.sender, spender, nv); return true; }\n}`;
};

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
  if(!/^[A-Za-z0-9_]{1,32}$/.test(symbol)){ log('Недопустимый символ токена (разрешены A-Za-z0-9_)','error'); return; }
  const decimals = parseInt(id('token-decimals').value,10) || 18;
  const supply = BigInt(id('token-supply').value || '0');
  if(!name || !symbol || supply<=0n){ log('Заполните имя/символ/выпуск','error'); return; }
  // Проверка сети (мультичейн)
  if(![56,97,1,11155111].includes(APP_STATE.network||0)){
    log('Неподдерживаемая сеть для деплоя','error'); return;
  }
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
  if(status) status.textContent = 'Оценка газа...';
  try {
    const factory = new ethers.ContractFactory(result.abi, result.bytecode, APP_STATE.signer);
  // initialSupply учитывает decimals + guard переполнения
  const pow = 10n ** BigInt(decimals);
  const MAX = (1n<<256n) - 1n;
  if(supply > MAX / pow){ log('Переполнение: слишком большой выпуск при данных decimals','error'); return; }
  const initialSupply = supply * pow;
    // Оценка газа
    let gasEstimate, feeData; 
    try { gasEstimate = await factory.signer.estimateGas(factory.getDeployTransaction(initialSupply)); } catch(e){ gasEstimate = null; }
    try { feeData = await factory.signer.provider.getFeeData(); } catch(e){ feeData = {}; }
    const gasPrice = feeData.gasPrice || feeData.maxFeePerGas || 0n;
  const costNative = gasEstimate && gasPrice ? Number(gasEstimate * gasPrice) / 1e18 : null;
  const nativeSym = getNativeSymbol(APP_STATE.network);
  if(!confirm(`Подтвердите деплой:\nИмя: ${name}\nСимвол: ${symbol}\nDecimals: ${decimals}\nSupply (читаемый): ${supply}\nSupply (raw): ${initialSupply}\nОценка газа: ${gasEstimate || '—'}\nОжидаемая стоимость (${nativeSym}): ${costNative? costNative.toFixed(6):'—'}`)) { if(status) status.textContent='Отменено пользователем'; return; }
    if(status) status.textContent = 'Деплой...';
    const contract = await factory.deploy(initialSupply);
    const deployTx = contract.deploymentTransaction();
    log('Deploy tx: '+deployTx.hash);
    const explorerBase = (function(net){
      switch(net){
        case 1: return 'https://etherscan.io';
        case 11155111: return 'https://sepolia.etherscan.io';
        case 56: return 'https://bscscan.com';
        case 97: return 'https://testnet.bscscan.com';
        default: return '';
      }
    })(APP_STATE.network);
    const link = id('bscan-link'); if(link && explorerBase){ link.href = `${explorerBase}/tx/${deployTx.hash}`; link.classList.remove('hidden'); link.textContent='Tx'; }
    await deployTx.wait();
    APP_STATE.token = { address: contract.target, abi: result.abi, bytecode: result.bytecode, contract, params:{ name, symbol, decimals, supply: initialSupply.toString() } };
    id('token-address').textContent = contract.target;
  if(link && explorerBase){ link.href = `${explorerBase}/address/${contract.target}`; link.classList.remove('hidden'); link.textContent='Explorer'; }
    id('deployed-info').classList.remove('hidden');
    id('btn-transfer').disabled = false;
    id('btn-approve').disabled = false;
    id('btn-save-passport').disabled = false;
    id('btn-save-project').disabled = false;
    id('verify-btn-manage').disabled = false;
    APP_STATE.token.params.source = source; // сохраняем исходник
    // Кнопки watchAsset / copy если есть элементы в DOM
    const watchBtn = id('watch-asset-btn');
    if(watchBtn){ watchBtn.disabled = false; watchBtn.onclick = async ()=>{
      if(!window.ethereum) return;
      try { await window.ethereum.request({ method:'wallet_watchAsset', params:{ type:'ERC20', options:{ address: contract.target, symbol, decimals } } }); }
      catch(e){ log('watchAsset error: '+e.message,'error'); }
    }; }
    const copyBtn = id('copy-address-btn'); if(copyBtn){ copyBtn.disabled=false; copyBtn.onclick=()=>{ navigator.clipboard.writeText(contract.target).then(()=>{ __toast && __toast('Адрес скопирован','info',2000); }); }; }
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
id('clear-storage')?.addEventListener('click', ()=>{ localStorage.clear(); __toast && __toast('Локальные данные очищены','info',3000); const s=id('settings-status'); if(s) s.textContent='Очищено'; });

// Инициализация полей настроек
document.addEventListener('DOMContentLoaded', ()=>{ if(id('rpc-url')) id('rpc-url').value = APP_STATE.settings.rpcUrl; if(id('api-key')) id('api-key').value = APP_STATE.settings.apiKey; });
// Download ABI / Bytecode
function downloadText(filename, text){ const blob=new Blob([text],{type:'application/json'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=filename; a.click(); }
id('download-abi')?.addEventListener('click', ()=>{ if(!APP_STATE.token || !APP_STATE.token.abi) return; downloadText('abi_'+APP_STATE.token.address+'.json', JSON.stringify(APP_STATE.token.abi, null, 2)); });
id('download-bytecode')?.addEventListener('click', ()=>{ if(!APP_STATE.token || !APP_STATE.token.bytecode) return; downloadText('bytecode_'+APP_STATE.token.address+'.txt', APP_STATE.token.bytecode); });

// Risky modes toggle
document.addEventListener('DOMContentLoaded', ()=>{
  const chk = id('enable-risky-modes');
  const block = id('risk-modes-block');
  if(chk && block){
    const saved = localStorage.getItem('enableRiskModes')==='1';
    chk.checked = saved;
    block.style.display = saved? 'list-item':'none';
    chk.addEventListener('change', ()=>{
      const on = chk.checked; localStorage.setItem('enableRiskModes', on? '1':'0'); block.style.display = on? 'list-item':'none';
    });
  }
});

// Allowance viewer
id('check-allowance')?.addEventListener('click', async ()=>{
  if(!APP_STATE.token.contract || !APP_STATE.address) return;
  const spender = id('allowance-spender').value.trim();
  if(!/^0x[0-9a-fA-F]{40}$/.test(spender)){ log('Неверный spender','error'); return; }
  try {
    const decimals = await APP_STATE.token.contract.decimals();
    const raw = await APP_STATE.token.contract.allowance(APP_STATE.address, spender);
    const val = Number(raw)/ (10 ** decimals);
    const out = id('allowance-value'); if(out) out.textContent = 'Allowance: '+val;
  } catch(e){ log('Ошибка allowance: '+e.message,'error'); }
});
