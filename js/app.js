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
