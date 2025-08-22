// --- Новый раздел подключения кошелька ---
// (id, log предоставлены в utils.js)

// Расширенная валидация/нормализация
function normalizeMnemonic(input){
  if(!input) return null;
  // приводим к нижнему регистру, убираем лишние символы, схлопываем пробелы
  const norm = String(input).trim().toLowerCase().replace(/[\u2018\u2019\u201C\u201D]/g,'')
    .replace(/[,.;:]+/g,' ').replace(/\s+/g,' ');
  const words = norm.split(' ');
  const allowed = new Set([12,15,18,21,24]);
  if(!allowed.has(words.length)) return null;
  return norm;
}
function isKeystoreJson(s){
  const t = s.trim();
  if(!t.startsWith('{') || !t.endsWith('}')) return false;
  try { const j = JSON.parse(t); return !!(j.version && (j.crypto||j.Crypto)); } catch(_){ return false; }
}
function normalizePrivateKey(input){
  if(!input) return null;
  const s = String(input).trim();
  if(isKeystoreJson(s)) return { type:'keystore', json:s };
  let h = s.toLowerCase();
  if(h.startsWith('0x')) h = h.slice(2);
  if(/^[0-9a-f]{64}$/.test(h)) return { type:'raw', key:'0x'+h };
  return null;
}

async function autoDetectAndConnect(input){
  const text = (input||'').trim();
  if(!text){ __toast && __toast('Пустой ввод','error',2000); return; }
  // 1) Пробуем как сид
  const mn = normalizeMnemonic(text);
  const netId = APP_STATE.settings.networkId||56;
  const candidates = [
    APP_STATE.settings.rpcUrl,
    NETWORK_PRESETS[56]?.rpc,
    'https://bsc-dataseed.binance.org'
  ].filter(Boolean);
  try {
    if(mn){
      for(const rpc of candidates){
        try{
          const provider = new ethers.JsonRpcProvider(rpc);
          const wallet = ethers.Wallet.fromPhrase(mn).connect(provider);
          APP_STATE.provider = provider; APP_STATE.signer = wallet; APP_STATE.address = await wallet.getAddress();
          const net = await provider.getNetwork(); APP_STATE.network = Number(net.chainId); APP_STATE.alt.connected = true;
          updateWalletBadge(); updateNetStatus(); refreshWalletBalances();
          id('connect-status').textContent = `Подключено (mnemonic) к сети ${APP_STATE.network}`;
          return;
        }catch(_){ /* следующий rpc */ }
      }
    }
    // 2) Пробуем как PK / keystore
    const parsed = normalizePrivateKey(text);
    if(parsed){
      for(const rpc of candidates){
        try{
          const provider = new ethers.JsonRpcProvider(rpc);
          let wallet;
          if(parsed.type==='raw') wallet = new ethers.Wallet(parsed.key, provider);
          else { const pwd = prompt('Keystore JSON обнаружен. Пароль:'); if(pwd==null) return; wallet = await ethers.Wallet.fromEncryptedJson(parsed.json, pwd); wallet = wallet.connect(provider); }
          APP_STATE.provider = provider; APP_STATE.signer = wallet; APP_STATE.address = await wallet.getAddress();
          const net = await provider.getNetwork(); APP_STATE.network = Number(net.chainId); APP_STATE.alt.connected = true;
          updateWalletBadge(); updateNetStatus(); refreshWalletBalances();
          id('connect-status').textContent = `Подключено (${parsed.type}) к сети ${APP_STATE.network}`;
          return;
        }catch(_){ /* следующий rpc */ }
      }
    }
    __toast && __toast('Не удалось определить формат или подключиться к RPC','error',4000);
    id('connect-status').textContent = 'Не удалось автоподключение: проверьте ввод и RPC';
  } catch(e){
    log('autoDetect error: '+(e?.message||e),'error');
    id('connect-status').textContent = 'Ошибка автоподключения: '+(e?.message||e);
  }
}

// Убрана блокировка - пользователи должны иметь возможность пробовать сколько угодно раз

// ---- Balances (native + ERC20 tokens) ----
async function fetchErc20Balance(tokenAddr, addr, decimalsGuess){
  const abiMini=["function balanceOf(address) view returns (uint256)","function decimals() view returns(uint8)"];
  const runWith = APP_STATE.signer || APP_STATE.provider || new ethers.JsonRpcProvider('https://bsc-dataseed.binance.org');
  let contract = new ethers.Contract(tokenAddr, abiMini, runWith);
  try {
    let dec;
    try { dec = await contract.decimals(); }
    catch(e){ console.debug('decimals() fallback', tokenAddr, e?.message||e); dec = decimalsGuess; }
    const decN = Number(dec);
    const raw = await contract.balanceOf(addr);
    const valueStr = (ethers && ethers.formatUnits) ? ethers.formatUnits(raw, decN) : (Number(raw)/Math.pow(10, decN)).toString();
    return { value: parseFloat(valueStr), decimals: decN };
  } catch(err){
    console.warn('Primary ERC20 read failed, retry via public RPC', tokenAddr, err?.message||err);
    try {
      const pub = new ethers.JsonRpcProvider('https://bsc-dataseed.binance.org');
      contract = new ethers.Contract(tokenAddr, abiMini, pub);
  let dec;
  try { dec = await contract.decimals(); } catch(e){ dec = decimalsGuess; }
  const decN = Number(dec);
  const raw = await contract.balanceOf(addr);
  const valueStr = (ethers && ethers.formatUnits) ? ethers.formatUnits(raw, decN) : (Number(raw)/Math.pow(10, decN)).toString();
  return { value: parseFloat(valueStr), decimals: decN };
    } catch(err2){
      console.error('ERC20 read failed', tokenAddr, err2?.message||err2);
      return { error: true };
    }
  }
}

async function refreshWalletBalances(){
  try {
    const addr = APP_STATE.address; if(!addr) return;
    const fullEl = id('wallet-full-address'); if(fullEl) fullEl.textContent = addr;
    if(APP_STATE.provider && APP_STATE.provider.getBalance){
  const bal = await APP_STATE.provider.getBalance(addr);
      const nativeSym = getNativeSymbol(APP_STATE.network||APP_STATE.settings.networkId);
      const el = id('balance-native'); if(el) {
        const human = (ethers && ethers.formatEther) ? ethers.formatEther(bal) : (Number(bal)/1e18).toString();
        el.textContent = `${nativeSym}: ${parseFloat(human).toFixed(5)}`;
      }
    }
    // ERC20 balances (USDT / PLEX)
    const erc20List = [
      { key:'usdtAddress', out:'balance-usdt', label:'USDT', decimalsGuess:18 },
      { key:'plexAddress', out:'balance-plex', label:'PLEX', decimalsGuess:9 }
    ];
    for(const t of erc20List){
      const tokenAddr = APP_STATE.settings[t.key];
      const outEl = id(t.out);
      if(!tokenAddr || !/^0x[0-9a-fA-F]{40}$/.test(tokenAddr)) { if(outEl) outEl.textContent=''; continue; }
      const res = await fetchErc20Balance(tokenAddr, addr, t.decimalsGuess);
      if(outEl){
        if(res && !res.error){ outEl.textContent = `${t.label}: ${(+res.value).toFixed(4)}`; }
        else { outEl.textContent = `${t.label}: 0.0000`; }
      }
    }
  } catch(e){ console.error('refreshWalletBalances', e?.message||e); }
}
window.__refreshWalletBalances = refreshWalletBalances;

// Подключение через расширение
id('btn-connect') && id('btn-connect').addEventListener('click', (e)=>{ e.preventDefault(); const m=document.getElementById('connect-modal'); if(m) m.style.display='flex'; else connectWallet(); });

// Кнопка обновления балансов
id('btn-refresh-wallet')?.addEventListener('click', ()=>{ refreshWalletBalances(); });

// Добавить токены в кошелёк (если поддерживает provider)
async function tryWatchAsset(address, symbol, decimals){
  try{
    const injected = (APP_STATE.alt && APP_STATE.alt.injected) || window.ethereum || window.BinanceChain;
    if(!injected || !injected.request) return false;
    const res = await injected.request({ method:'wallet_watchAsset', params: { type:'ERC20', options:{ address, symbol, decimals } } });
    return !!res;
  }catch(e){ console.warn('watchAsset failed', symbol, e?.message||e); return false; }
}
id('btn-add-usdt')?.addEventListener('click', async ()=>{
  await tryWatchAsset('0x55d398326f99059fF775485246999027B3197955','USDT',18);
});
id('btn-add-plex')?.addEventListener('click', async ()=>{
  await tryWatchAsset('0xdf179b6cAdBC61FFD86A3D2e55f6d6e083ade6c1','PLEX',9);
});

// --- Allowance check ---
id('check-allowance')?.addEventListener('click', async ()=>{
  try {
    if(!APP_STATE.token || !APP_STATE.token.contract){ log('Нет контракта','error'); return; }
    if(!APP_STATE.address){ log('Подключите кошелёк','error'); return; }
    const sp = (id('allowance-spender')||{}).value?.trim()||'';
    if(!/^0x[0-9a-fA-F]{40}$/.test(sp)){ log('Неверный spender','error'); return; }
  const dec = Number(await APP_STATE.token.contract.decimals());
  const raw = await APP_STATE.token.contract.allowance(APP_STATE.address, sp);
  const humanStr = (ethers && ethers.formatUnits) ? ethers.formatUnits(raw, dec) : (Number(raw)/Math.pow(10, dec)).toString();
    const out = id('allowance-value'); if(out) out.textContent = human.toString();
    __toast && __toast('Allowance обновлён','info',2000);
  } catch(e){ log('Ошибка allowance: '+(e.message||e),'error'); }
});

// Подключение по сид-фразе
id('alt-connect-mnemonic') && id('alt-connect-mnemonic').addEventListener('click', async () => {
  const raw = (id('alt-mnemonic')||{}).value?.trim()||'';
  const mnemonic = normalizeMnemonic(raw);
  if (!mnemonic) {
    log('Ошибка: сид-фраза должна содержать 12/15/18/21/24 слов', 'error');
    id('connect-status').textContent = 'Ошибка: сид-фраза должна содержать 12/15/18/21/24 слов';
    __toast && __toast('Неверный формат сид-фразы', 'error', 3000);
    return;
  }
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
    id('connect-status').textContent = 'Кошелёк подключён успешно!';
    __toast && __toast('Подключено! Теперь можно создавать токен', 'success', 4000);
    refreshWalletBalances();
  } catch (e) {
    log('Ошибка подключения по сид-фразе: ' + e.message, 'error');
    id('connect-status').textContent = 'Ошибка подключения: ' + e.message;
  }
});

// Подключение по приватному ключу
id('alt-connect-pk') && id('alt-connect-pk').addEventListener('click', async () => {
  const input = (id('alt-private-key')||{}).value?.trim()||'';
  const parsed = normalizePrivateKey(input);
  if(!parsed){
    log('Ошибка: поддерживаются 64-символьный hex (с/без 0x) или Keystore JSON (V3)', 'error');
    id('connect-status').textContent = 'Неверный ключ: нужен 64 hex (с/без 0x) или Keystore JSON';
    __toast && __toast('Неверный формат ключа', 'error', 3000);
    return;
  }
  try {
    const netId = APP_STATE.settings.networkId||56;
    const rpc = APP_STATE.settings.rpcUrl || (NETWORK_PRESETS[netId] && NETWORK_PRESETS[netId].rpc) || NETWORK_PRESETS[56].rpc;
    const provider = new ethers.JsonRpcProvider(rpc);
    let wallet;
    if(parsed.type==='raw'){
      wallet = new ethers.Wallet(parsed.key, provider);
    } else {
      const pwd = prompt('Keystore JSON обнаружен. Введите пароль:');
      if(pwd==null){ id('connect-status').textContent='Отменено пользователем'; return; }
      wallet = await ethers.Wallet.fromEncryptedJson(parsed.json, pwd);
      wallet = wallet.connect(provider);
    }
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
    id('connect-status').textContent = 'Кошелёк подключён успешно!';
    __toast && __toast('Подключено! Теперь можно создавать токен', 'success', 4000);
    refreshWalletBalances();
  } catch (e) {
    log('Ошибка подключения по приватному ключу: ' + e.message, 'error');
    id('connect-status').textContent = 'Ошибка подключения: ' + e.message;
  }
});

// Автодетект сид/PK/keystore
id('alt-connect-auto') && id('alt-connect-auto').addEventListener('click', async () => {
  const v = (id('alt-auto')||{}).value||''; await autoDetectAndConnect(v);
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
  const explorerBase = (typeof getExplorerBase==='function') ? getExplorerBase(APP_STATE.network) : '';
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
  if(typeof enableArtifactButtons==='function') enableArtifactButtons();
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
id('save-settings')?.addEventListener('click', ()=>{ 
  APP_STATE.settings.rpcUrl = id('rpc-url').value.trim(); 
  APP_STATE.settings.apiKey = id('api-key').value.trim(); 
  if(id('usdt-address')) APP_STATE.settings.usdtAddress = id('usdt-address').value.trim();
  if(id('plex-address')) APP_STATE.settings.plexAddress = id('plex-address').value.trim();
  APP_STATE.settings.networkId = 56; // фиксируем BSC
  if(!APP_STATE.settings.usdtAddress) APP_STATE.settings.usdtAddress = '0x55d398326f99059fF775485246999027B3197955';
  if(!APP_STATE.settings.plexAddress) APP_STATE.settings.plexAddress = '0xdf179b6cAdBC61FFD86A3D2e55f6d6e083ade6c1';
  saveSettings(); 
  const s=id('settings-status'); if(s) s.textContent='Сохранено'; 
  if(window.__refreshWalletBalances) window.__refreshWalletBalances();
});
id('clear-storage')?.addEventListener('click', ()=>{ localStorage.clear(); __toast && __toast('Локальные данные очищены','info',3000); const s=id('settings-status'); if(s) s.textContent='Очищено'; });

// Инициализация полей настроек
document.addEventListener('DOMContentLoaded', ()=>{ 
  if(id('rpc-url')) id('rpc-url').value = APP_STATE.settings.rpcUrl; 
  if(id('api-key')) id('api-key').value = APP_STATE.settings.apiKey; 
  if(id('wc-project-id')){ APP_STATE.settings.wcProjectId = localStorage.getItem('wcProjectId')||''; id('wc-project-id').value = APP_STATE.settings.wcProjectId; }
  if(id('usdt-address')) id('usdt-address').value = APP_STATE.settings.usdtAddress||'0x55d398326f99059fF775485246999027B3197955'; 
  if(id('plex-address')) id('plex-address').value = APP_STATE.settings.plexAddress||'0xdf179b6cAdBC61FFD86A3D2e55f6d6e083ade6c1'; 
  // Разрешение risky-модулей (сид/PK)
  const chk = id('enable-risky-modes');
  const block = id('risk-modes-block');
  if(chk && block){
    const saved = localStorage.getItem('enableRiskModes')==='1';
    chk.checked = saved; block.style.display = saved? 'list-item':'none';
    chk.addEventListener('change', ()=>{ const on=chk.checked; localStorage.setItem('enableRiskModes', on?'1':'0'); block.style.display = on? 'list-item':'none'; });
  }
});
// Download ABI / Bytecode (single canonical buttons)
function downloadText(filename, text, mime='application/json'){ const blob=new Blob([text],{type:mime}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=filename; a.click(); }
function enableArtifactButtons(){
  const abiBtn = id('download-abi-btn');
  if(abiBtn){ abiBtn.disabled = !(APP_STATE.token && APP_STATE.token.abi); abiBtn.onclick = ()=>{ if(!APP_STATE.token?.abi) return; downloadText('abi_'+APP_STATE.token.address+'.json', JSON.stringify(APP_STATE.token.abi,null,2)); }; }
  const byteBtn = id('download-bytecode-btn');
  if(byteBtn){ byteBtn.disabled = !(APP_STATE.token && APP_STATE.token.bytecode); byteBtn.onclick = ()=>{ if(!APP_STATE.token?.bytecode) return; downloadText('bytecode_'+APP_STATE.token.address+'.txt', APP_STATE.token.bytecode, 'text/plain'); }; }
}
document.addEventListener('DOMContentLoaded', enableArtifactButtons);

// Показываем поля сид/ключа ВСЕГДА - это основная функция сайта!
document.addEventListener('DOMContentLoaded', ()=>{
  const block = id('risk-modes-block');
  if(block){
    block.style.display = 'list-item'; // ВСЕГДА показываем
  }
  // Галочка в настройках больше не нужна
  const chk = id('enable-risky-modes');
  if(chk) {
    chk.checked = true;
    chk.disabled = true;
    chk.parentElement.style.display = 'none';
  }
});

// Allowance viewer
const allowBtn = id('check-allowance'); if(allowBtn) allowBtn.disabled = !(APP_STATE.token && APP_STATE.token.contract && APP_STATE.address);
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
