// Глобальные утилиты для всех скриптов
function id(i){return document.getElementById(i);} // Быстрый доступ к элементу
function log(msg, type='info'){console[type==='error'?'error':'log'](msg);} // Логгер

// --- Глобальное состояние приложения ---
const NETWORK_PRESETS = {
	1: { name: 'Ethereum', rpc: 'https://rpc.ankr.com/eth' },
	11155111: { name: 'Sepolia', rpc: 'https://rpc.sepolia.org' },
	56: { name: 'BSC', rpc: 'https://bsc-dataseed.binance.org' },
	97: { name: 'BSC Testnet', rpc: 'https://data-seed-prebsc-1-s1.binance.org:8545' }
};

const APP_STATE = {
	provider: null,
	signer: null,
	address: null,
	network: null,
	alt: { connected: false },
	settings: {
		rpcUrl: localStorage.getItem('rpcUrl')||'',
		apiKey: localStorage.getItem('apiKey')||'',
		networkId: parseInt(localStorage.getItem('networkId')||'56',10), // default BSC
		usdtAddress: localStorage.getItem('usdtAddress')||'',
		plexAddress: localStorage.getItem('plexAddress')||''
	},
	token: { address:null, abi:null, bytecode:null, contract:null, params:null },
	batch: { list:[], running:false },
	security: { seedAttempts:0, pkAttempts:0, lastAttemptTs:0 }
};

function updateWalletBadge(){
	const badge = id('net-status');
	if(!badge) return;
	if(APP_STATE.address){
		badge.textContent = 'Подключён';
		badge.className = 'status-badge sb-connected';
	} else {
		badge.textContent = 'Не подключён';
		badge.className = 'status-badge sb-disconnected';
	}
	const wa = id('wallet-address');
	if(wa) wa.textContent = APP_STATE.address ? shortAddress(APP_STATE.address) : '';
}

function updateNetStatus(){
	const netEl = id('network');
	if(!netEl) return;
	if(APP_STATE.network && NETWORK_PRESETS[APP_STATE.network]){
		netEl.textContent = ` | ${NETWORK_PRESETS[APP_STATE.network].name}`;
	} else {
		netEl.textContent = '';
	}
}

function shortAddress(a){return a? a.slice(0,6)+'...'+a.slice(-4):'';}

function getExplorerBase(chainId){
	switch(Number(chainId)){
		case 1: return 'https://etherscan.io';
		case 11155111: return 'https://sepolia.etherscan.io';
		case 56: return 'https://bscscan.com';
		case 97: return 'https://testnet.bscscan.com';
		default: return '';
	}
}
function getNativeSymbol(chainId){
	switch(Number(chainId)){
		case 1: return 'ETH';
		case 11155111: return 'ETH';
		case 56: return 'BNB';
		case 97: return 'tBNB';
		default: return 'ETH';
	}
}

async function connectWallet(){
	try {
		if(typeof window === 'undefined') throw new Error('Window недоступен');
		const injected = window.ethereum || window.BinanceChain;
		if(!injected){
			log('Кошелёк не найден. Установите MetaMask / OKX / Binance Wallet', 'error');
			const st = id('connect-status'); if(st) st.textContent = 'Кошелёк не найден в браузере';
			return;
		}
		// Запрос аккаунтов
		const accounts = await injected.request({ method: 'eth_requestAccounts' });
		if(!accounts || !accounts.length) throw new Error('Аккаунты не возвращены');
		const chainIdHex = await injected.request({ method: 'eth_chainId' });
		let chainId = Number(chainIdHex);
		const desired = APP_STATE.settings.networkId;
		if(desired && desired !== chainId){
			// Пытаемся переключить сеть
			try { await injected.request({ method:'wallet_switchEthereumChain', params:[{ chainId:'0x'+desired.toString(16) }] }); chainId = desired; }
			catch(_){
				// Пытаемся добавить
				const preset = NETWORK_PRESETS[desired];
				if(preset){
					try { await injected.request({ method:'wallet_addEthereumChain', params:[{ chainId:'0x'+desired.toString(16), chainName:preset.name, rpcUrls:[preset.rpc] }] }); chainId = desired; }
					catch(e){ log('Не удалось переключить сеть: '+e.message,'error'); }
				}
			}
		}
		const rpcUrl = APP_STATE.settings.rpcUrl || (NETWORK_PRESETS[chainId]?.rpc);
		let provider;
		if(window.ethers){
			provider = new ethers.BrowserProvider(injected, chainId);
		} else {
			// fallback: простой объект провайдера с partial API
			provider = injected;
		}
		let signer = null;
		if(provider && provider.getSigner){
			signer = await provider.getSigner();
		}
		APP_STATE.provider = provider;
		APP_STATE.signer = signer;
		APP_STATE.address = accounts[0];
		APP_STATE.network = chainId;
		updateWalletBadge();
		updateNetStatus();
		if(window.__refreshWalletBalances) window.__refreshWalletBalances();
		const st = id('connect-status'); if(st) st.textContent = 'Кошелёк подключён';
		log('Кошелёк подключён: '+accounts[0]);
	} catch(e){
		log('Ошибка подключения: '+ (e.message||e), 'error');
		const st = id('connect-status'); if(st) st.textContent = 'Ошибка подключения: '+(e.message||e);
	}
}

function disconnectWallet(){
	APP_STATE.security.seedAttempts = 0; APP_STATE.security.pkAttempts=0;
	APP_STATE.provider = null;
	APP_STATE.signer = null;
	APP_STATE.address = null;
	APP_STATE.network = null;
	updateWalletBadge();
	updateNetStatus();
	const fullEl = id('wallet-full-address'); if(fullEl) fullEl.textContent='';
	['balance-native','balance-usdt','balance-plex'].forEach(i=>{ const el=id(i); if(el) el.textContent=''; });
	const st = id('connect-status'); if(st) st.textContent = 'Отключено';
}

function saveSettings(){
	if(APP_STATE.settings.rpcUrl) localStorage.setItem('rpcUrl', APP_STATE.settings.rpcUrl);
	if(APP_STATE.settings.apiKey) localStorage.setItem('apiKey', APP_STATE.settings.apiKey);
	if(APP_STATE.settings.networkId!=null) localStorage.setItem('networkId', String(APP_STATE.settings.networkId));
	if(APP_STATE.settings.usdtAddress) localStorage.setItem('usdtAddress', APP_STATE.settings.usdtAddress);
	if(APP_STATE.settings.plexAddress) localStorage.setItem('plexAddress', APP_STATE.settings.plexAddress);
}

async function fetchTokenBalance(){
	if(!APP_STATE.token.contract || !APP_STATE.address) return null;
	try {
		const decimals = await APP_STATE.token.contract.decimals();
		const bal = await APP_STATE.token.contract.balanceOf(APP_STATE.address);
		return Number(bal) / (10 ** decimals);
	} catch(e){ log('Ошибка получения баланса: '+e.message,'error'); return null; }
}

// secureWipeString удалён: строки неизменяемы, не используем хранение секретов вне input
window.__secAttempt = function(type){
	const now = Date.now();
	if(now - APP_STATE.security.lastAttemptTs > 60000){ APP_STATE.security.seedAttempts=0; APP_STATE.security.pkAttempts=0; }
	APP_STATE.security.lastAttemptTs = now;
	if(type==='seed') APP_STATE.security.seedAttempts++; else if(type==='pk') APP_STATE.security.pkAttempts++;
	if(APP_STATE.security.seedAttempts>5 || APP_STATE.security.pkAttempts>5){
		__toast && __toast('Слишком много попыток. Подождите минуту.','error',5000);
		return false;
	}
	return true;
};

// Экспорт в глобальную область
window.APP_STATE = APP_STATE;
window.connectWallet = connectWallet;
window.disconnectWallet = disconnectWallet;
window.saveSettings = saveSettings;
window.fetchTokenBalance = fetchTokenBalance;
window.updateWalletBadge = updateWalletBadge;
window.updateNetStatus = updateNetStatus;
window.getExplorerBase = getExplorerBase;
window.getNativeSymbol = getNativeSymbol;
