// Упрощённая версия + встроенные резервные API ключи.

const BUILTIN_KEYS = {
  bsc: ['Z','Z','3','R','S','B','Z','P','M','A','P','K','4','F','V','1','H','U','V','W','E','9','X','1','3','G','9','A','C','J','W','P','J','X'], // пример: склеивается и не показывается напрямую
  eth: ['D','E','M','O','E','T','H','K','E','Y','1','2','3']
};
function getBuiltinKey(chain){ return (BUILTIN_KEYS[chain]||[]).join(''); }

const APP_STATE = {
  provider: null,
  signer: null,
  address: null,
  network: null,
  token: { address: null, abi: null, bytecode: null, contract: null, params: null },
  compiler: { worker: null },
  settings: { rpcUrl: '', bscApiKey: '', ethApiKey: '', autoVerify:false },
  logs: [],
  alt: { connected:false }
};

function log(msg, level = 'info') {
  const time = new Date().toISOString();
  const line = `[${time}] [${level}] ${msg}`;
  APP_STATE.logs.push(line);
  const out = document.getElementById('log-output');
  if (out) { out.textContent += line + '\n'; out.scrollTop = out.scrollHeight; }
  console[level === 'error' ? 'error':'log'](line);
}

(document.querySelectorAll('nav button')||[]).forEach(btn => btn.addEventListener('click', () => {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById(`view-${btn.dataset.view}`).classList.add('active');
}));

async function connectWallet() {
  if (!window.ethereum) { alert('Установите MetaMask или используйте альтернативное подключение'); return; }
  try {
    await window.ethereum.request({ method: 'eth_requestAccounts' });
    APP_STATE.provider = new ethers.BrowserProvider(window.ethereum);
    APP_STATE.signer = await APP_STATE.provider.getSigner();
    APP_STATE.address = await APP_STATE.signer.getAddress();
    const net = await APP_STATE.provider.getNetwork();
    APP_STATE.network = Number(net.chainId);
    APP_STATE.alt.connected=false;
    updateWalletBadge(); toggleConnectButtons();
    log('Кошелёк подключен');
  } catch(e){ log('Ошибка подключения: '+e.message,'error'); }
}

document.getElementById('btn-connect').addEventListener('click', connectWallet);
const btnDisconnect=document.getElementById('btn-disconnect');
btnDisconnect.addEventListener('click', ()=>{ APP_STATE.provider=null; APP_STATE.signer=null; APP_STATE.address=null; APP_STATE.network=null; APP_STATE.alt.connected=false; updateWalletBadge(); toggleConnectButtons(); log('Отключено'); });

function toggleConnectButtons(){ const c=!!APP_STATE.address; id('btn-connect').disabled=c; id('btn-disconnect').disabled=!c; }
function updateWalletBadge(){ id('wallet-address').textContent=APP_STATE.address?APP_STATE.address.slice(0,10)+'…':''; id('network').textContent=APP_STATE.network?('Chain '+APP_STATE.network+(APP_STATE.alt.connected?' (ALT)':'')) : ''; }

const altBtn = document.getElementById('alt-connect-btn'); if(altBtn) altBtn.addEventListener('click', altConnect);
async function altConnect(){
  const mnemonic = (id('alt-mnemonic')||{}).value?.trim()||'';
  const pk = (id('alt-private-key')||{}).value?.trim()||'';
  if(!mnemonic && !pk){ alert('Введите сид или приватный ключ'); return; }
  if(mnemonic && pk){ alert('Введите только одно: сид или ключ'); return; }
  try {
    const provider = new ethers.JsonRpcProvider(APP_STATE.settings.rpcUrl || 'https://bsc-dataseed.binance.org');
    let wallet;
    if(pk){ if(!/^0x[0-9a-fA-F]{64}$/.test(pk)) throw new Error('Формат ключа'); wallet=new ethers.Wallet(pk, provider); secureClear('alt-private-key'); log('ALT ключ'); }
    else { const words=mnemonic.split(/\s+/); if(words.length<12) throw new Error('Сид >=12 слов'); wallet=ethers.Wallet.fromPhrase(mnemonic).connect(provider); secureClear('alt-mnemonic'); log('ALT сид ('+words.length+' слов)'); }
    APP_STATE.provider=provider; APP_STATE.signer=wallet; APP_STATE.address=await wallet.getAddress(); const net=await provider.getNetwork(); APP_STATE.network=Number(net.chainId); APP_STATE.alt.connected=true; updateWalletBadge(); toggleConnectButtons();
  }catch(e){ log('ALT connect error: '+e.message,'error'); }
}
function secureClear(i){ const el=id(i); if(el) el.value=''; }

const formDeploy=id('form-deploy');
formDeploy && formDeploy.addEventListener('input', updateSourcePreview);
function getDeployFormData(){ const raw=Object.fromEntries(new FormData(formDeploy).entries()); const name=raw.name||'My Token'; const symbol=raw.symbol||'MTK'; const decimals=Number(raw.decimals||18); const supplyHuman=raw.supply||'0'; const supplyScaled = BigInt(supplyHuman||0) * (10n**BigInt(decimals)); return { name, symbol, decimals, supplyScaled, supplyHuman }; }
function buildContractSource(p){
return `// SPDX-License-Identifier: MIT\npragma solidity ^0.8.24;\n\nerror TransferToZeroAddress();\nerror InsufficientBalance(uint256 available,uint256 required);\nerror ExceedsAllowance(uint256 available,uint256 required);\nerror DecreasedAllowanceBelowZero(uint256 current,uint256 decrease);\n\ncontract CustomToken {\n    string private constant _NAME = "${p.name}";\n    string private constant _SYMBOL = "${p.symbol}";\n    uint8  private constant _DECIMALS = ${p.decimals};\n    uint256 private constant _TOTAL_SUPPLY = ${p.supplyScaled.toString()};\n\n    uint256 public totalSupply;\n    mapping(address=>uint256) public balanceOf;\n    mapping(address=>mapping(address=>uint256)) public allowance;\n\n    event Transfer(address indexed from,address indexed to,uint256 value);\n    event Approval(address indexed owner,address indexed spender,uint256 value);\n\n    constructor(){ totalSupply=_TOTAL_SUPPLY; balanceOf[msg.sender]=_TOTAL_SUPPLY; emit Transfer(address(0), msg.sender, _TOTAL_SUPPLY); }\n\n    function name() public pure returns(string memory){ return _NAME; }\n    function symbol() public pure returns(string memory){ return _SYMBOL; }\n    function decimals() public pure returns(uint8){ return _DECIMALS; }\n\n    function transfer(address to,uint256 value) external returns(bool){ if(to==address(0)) revert TransferToZeroAddress(); uint256 bal=balanceOf[msg.sender]; if(bal<value) revert InsufficientBalance(bal,value); unchecked{ balanceOf[msg.sender]=bal-value; balanceOf[to]+=value; } emit Transfer(msg.sender,to,value); return true; }\n\n    function approve(address spender,uint256 value) external returns(bool){ allowance[msg.sender][spender]=value; emit Approval(msg.sender,spender,value); return true; }\n\n    function transferFrom(address from,address to,uint256 value) external returns(bool){ if(to==address(0)) revert TransferToZeroAddress(); uint256 bal=balanceOf[from]; if(bal<value) revert InsufficientBalance(bal,value); uint256 a=allowance[from][msg.sender]; if(a<value) revert ExceedsAllowance(a,value); unchecked{ balanceOf[from]=bal-value; allowance[from][msg.sender]=a-value; balanceOf[to]+=value; } emit Transfer(from,to,value); emit Approval(from,msg.sender,allowance[from][msg.sender]); return true; }\n\n    function increaseAllowance(address spender,uint256 addValue) external returns(bool){ uint256 a=allowance[msg.sender][spender]+addValue; allowance[msg.sender][spender]=a; emit Approval(msg.sender,spender,a); return true; }\n    function decreaseAllowance(address spender,uint256 subValue) external returns(bool){ uint256 a=allowance[msg.sender][spender]; if(a<subValue) revert DecreasedAllowanceBelowZero(a,subValue); unchecked{ allowance[msg.sender][spender]=a-subValue; } emit Approval(msg.sender,spender,a-subValue); return true; }\n}`;
}
function updateSourcePreview(){ const el=id('contract-source'); if(el && formDeploy) el.textContent=buildContractSource(getDeployFormData()); }
updateSourcePreview();

function ensureCompiler(){ if(!APP_STATE.compiler.worker){ APP_STATE.compiler.worker=new Worker('js/compiler.worker.js'); } return APP_STATE.compiler.worker; }
let compileReqId=0; function compileSource(source){ return new Promise((res,rej)=>{ const w=ensureCompiler(); const id='cmp-'+(++compileReqId); const h=e=>{ if(e.data&&e.data.id===id){ w.removeEventListener('message',h); e.data.ok?res(e.data.result):rej(new Error(e.data.error)); } }; w.addEventListener('message',h); w.postMessage({ id, cmd:'compile', payload:{ source, version:'v0.8.24+commit.e11b9ed9', optimize:true } }); }); }

formDeploy && formDeploy.addEventListener('submit', async e=>{ e.preventDefault(); if(!APP_STATE.signer){ alert('Подключите кошелёк'); return; } const status=id('deploy-status'); const data=getDeployFormData(); const src=buildContractSource(data); status.textContent='Компиляция…'; log('Компиляция'); try{ const { abi, bytecode }=await compileSource(src); status.textContent='Деплой…'; log('Деплой'); const factory=new ethers.ContractFactory(abi, bytecode, APP_STATE.signer); const contract=await factory.deploy(); status.textContent='Ожидание подтверждения…'; await contract.deploymentTransaction().wait(); APP_STATE.token={ address:contract.target, abi, bytecode, contract, params:data }; id('token-address').textContent=contract.target; id('bscan-link').href=`https://bscscan.com/address/${contract.target}`; id('deployed-info').classList.remove('hidden'); enableManagePanel(); log('Контракт задеплоен '+contract.target); status.textContent='Успешно'; id('btn-verify').disabled=false; if(APP_STATE.settings.autoVerify){ window.__verifyContract && window.__verifyContract(); } }catch(err){ status.textContent='ОШИБКА: '+err.message; log('Deploy error: '+err.message,'error'); }});
function enableManagePanel(){ id('manage-guard').classList.add('hidden'); id('manage-panel').classList.remove('hidden'); }
function ensureToken(){ if(!APP_STATE.token.contract){ alert('Нет токена'); return false;} return true; }

async function refreshBalance(){ if(!ensureToken()) return; const bal=await APP_STATE.token.contract.balanceOf(APP_STATE.address); id('balance-value').textContent=bal.toString(); }
id('btn-refresh-balance') && id('btn-refresh-balance').addEventListener('click', refreshBalance);

id('btn-transfer') && id('btn-transfer').addEventListener('click', async ()=>{ if(!ensureToken()) return; const to=val('transfer-to'); const amt=val('transfer-amount'); if(!to||!amt) return; try{ const tx=await APP_STATE.token.contract.transfer(to, amt); log('Transfer '+tx.hash); await tx.wait(); refreshBalance(); }catch(e){ log('Transfer error '+e.message,'error'); }});

id('btn-approve') && id('btn-approve').addEventListener('click', async ()=>{ if(!ensureToken()) return; const spender=val('approve-spender'); const amt=val('approve-amount'); if(!spender||!amt) return; try{ const tx=await APP_STATE.token.contract.approve(spender, amt); log('Approve '+tx.hash); await tx.wait(); }catch(e){ log('Approve error '+e.message,'error'); }});

id('btn-inc-allow') && id('btn-inc-allow').addEventListener('click', async ()=>{ if(!ensureToken()) return; const spender=val('allow-spender'); const amt=val('allow-delta'); if(!spender||!amt) return; try{ const tx=await APP_STATE.token.contract.increaseAllowance(spender, amt); log('IncAllow '+tx.hash); await tx.wait(); }catch(e){ log('IncAllow error '+e.message,'error'); }});

id('btn-dec-allow') && id('btn-dec-allow').addEventListener('click', async ()=>{ if(!ensureToken()) return; const spender=val('allow-spender'); const amt=val('allow-delta'); if(!spender||!amt) return; try{ const tx=await APP_STATE.token.contract.decreaseAllowance(spender, amt); log('DecAllow '+tx.hash); await tx.wait(); }catch(e){ log('DecAllow error '+e.message,'error'); }});

id('btn-load-token') && id('btn-load-token').addEventListener('click', ()=>{ const addr=val('load-token-address'); const abiText=(id('load-token-abi')||{value:''}).value.trim(); if(!addr||!abiText) return; try{ const abi=JSON.parse(abiText); const contract=new ethers.Contract(addr, abi, APP_STATE.signer||APP_STATE.provider); APP_STATE.token={ address:addr, abi, bytecode:null, contract, params:null }; enableManagePanel(); log('Загружен токен '+addr);}catch(e){ log('Load ABI error '+e.message,'error'); }});

id('btn-verify') && id('btn-verify').addEventListener('click', ()=>{ window.__verifyContract && window.__verifyContract(); });

function loadSettings(){ try{ const saved=JSON.parse(localStorage.getItem('app_settings_simple')||'{}'); Object.assign(APP_STATE.settings, saved);}catch{} id('rpc-url') && (id('rpc-url').value=APP_STATE.settings.rpcUrl||''); id('auto-verify') && (id('auto-verify').checked=!!APP_STATE.settings.autoVerify); updateApiKeyStatus(); }
loadSettings();

id('btn-save-settings') && id('btn-save-settings').addEventListener('click', ()=>{ APP_STATE.settings.rpcUrl=val('rpc-url').trim(); const bscVal=val('bsc-api-key').trim(); if(bscVal) APP_STATE.settings.bscApiKey=bscVal; const ethVal=val('eth-api-key').trim(); if(ethVal) APP_STATE.settings.ethApiKey=ethVal; APP_STATE.settings.autoVerify = id('auto-verify')? id('auto-verify').checked : false; localStorage.setItem('app_settings_simple', JSON.stringify(APP_STATE.settings)); id('settings-status').textContent='Сохранено'; updateApiKeyStatus(); log('Настройки сохранены'); });

function updateApiKeyStatus(){ const box=id('api-key-status'); if(!box) return; const hasUserBsc=!!APP_STATE.settings.bscApiKey; const hasUserEth=!!APP_STATE.settings.ethApiKey; let txt='Активный ключ: встроенный'; if(hasUserBsc||hasUserEth) txt='Активный ключ: пользовательский'; box.textContent=txt; }

function id(x){ return document.getElementById(x); }
function val(x){ const el=id(x); return el?el.value:''; }

function getApiKeyForCurrentNetwork(){
  if(APP_STATE.network===56||APP_STATE.network===97){ return APP_STATE.settings.bscApiKey || getBuiltinKey('bsc'); }
  if(APP_STATE.network===1||APP_STATE.network===5||APP_STATE.network===11155111){ return APP_STATE.settings.ethApiKey || getBuiltinKey('eth'); }
  return APP_STATE.settings.bscApiKey || APP_STATE.settings.ethApiKey || getBuiltinKey('bsc');
}
window.__getExplorerApiKey = getApiKeyForCurrentNetwork;
