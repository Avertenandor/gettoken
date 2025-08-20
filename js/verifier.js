// verifier.js - автоматическая/ручная верификация (BSC + ETH)
// Использует выбранный API ключ (bscApiKey / ethApiKey) из настроек через __getExplorerApiKey().
// Поддержаны сети: BSC mainnet (56), BSC testnet (97), Ethereum mainnet (1), Sepolia (11155111), Goerli (5).

const EXPLORERS = {
  56: { api: 'https://api.bscscan.com/api', browser: 'https://bscscan.com/address/', label:'BscScan' },
  97: { api: 'https://api-testnet.bscscan.com/api', browser: 'https://testnet.bscscan.com/address/', label:'BscScan Testnet' },
  1:  { api: 'https://api.etherscan.io/api', browser: 'https://etherscan.io/address/', label:'Etherscan' },
  5:  { api: 'https://api-goerli.etherscan.io/api', browser: 'https://goerli.etherscan.io/address/', label:'Goerli' },
  11155111: { api: 'https://api-sepolia.etherscan.io/api', browser: 'https://sepolia.etherscan.io/address/', label:'Sepolia' }
};

function getExplorer(){ return EXPLORERS[APP_STATE.network] || EXPLORERS[56]; }

function pickApiKey(){
  if(typeof window.__getExplorerApiKey === 'function') return window.__getExplorerApiKey();
  // legacy fallback
  return APP_STATE.settings.apiKey || APP_STATE.settings.bscApiKey || APP_STATE.settings.ethApiKey;
}

async function verifyOnExplorer(){
  if(!APP_STATE.token || !APP_STATE.token.address || !APP_STATE.token.params) throw new Error('Нет данных токена');
  const apiKey = pickApiKey();
  if(!apiKey) throw new Error('Нет API ключа');
  const p = APP_STATE.token.params;
  const source = buildContractSource(p);
  const compilerVersion = 'v0.8.24+commit.e11b9ed9';
  const constructorArgs = '';
  const exp = getExplorer();
  const form = new URLSearchParams({
    module: 'contract', action: 'verifysourcecode', apikey: apiKey,
    contractaddress: APP_STATE.token.address,
    sourceCode: source, codeformat: 'solidity-single-file', contractname: 'CustomToken',
    compilerversion: compilerVersion, optimizationUsed: '1', runs: '200', constructorArguements: constructorArgs, licenseType: '3'
  });
  const resp = await fetch(exp.api, { method: 'POST', body: form });
  const data = await resp.json();
  if(data.status !== '1') throw new Error('Submit: '+data.message+' '+data.result);
  log(`Верификация отправлена (${exp.label}) GUID=${data.result}`);
  return { guid: data.result, exp, apiKey };
}

async function pollVerifyStatus(guid, exp, apiKey, intervalMs=6000, maxAttempts=20){
  for(let i=0;i<maxAttempts;i++){
    await new Promise(r=>setTimeout(r, intervalMs));
    const url = `${exp.api}?module=contract&action=checkverifystatus&guid=${guid}&apikey=${apiKey}`;
    const resp = await fetch(url); const data = await resp.json();
    if(data.status==='1'){ log('Контракт верифицирован'); return true; }
    if(data.result && /Already Verified/i.test(data.result)){ log('Уже верифицирован'); return true; }
    log('Статус верификации: '+data.result);
  }
  throw new Error('Тайм-аут');
}

window.__verifyContract = async function(manual=true){
  try {
    log('Старт верификации…');
    const { guid, exp, apiKey } = await verifyOnExplorer();
    log('GUID получен, ожидание…');
    await pollVerifyStatus(guid, exp, apiKey);
    if(manual) alert('Верификация успешна');
  } catch(e){
    log('Ошибка верификации: '+e.message,'error');
    if(manual) alert('Ошибка: '+e.message);
  }
};

// Авто перехват логов для запуска авто-верификации (оставляем логику в app.js после деплоя)
// Здесь только резерв: если лог содержит "Контракт задеплоен" и autoVerify=true и нет __autoVerifyStarted.
(function(){
  const origLog = log; window.log = function(msg, level){
    origLog(msg, level);
    if(APP_STATE.settings.autoVerify && /Контракт задеплоен/.test(msg) && !APP_STATE.__autoVerifyStarted){
      APP_STATE.__autoVerifyStarted=true; window.__verifyContract && window.__verifyContract(false);
    }
  };
})();
