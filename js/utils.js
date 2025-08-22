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
	batch: { list:[], running:false }
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

// --- Вспомогательные: выбор провайдера и добавление сетей ---
function detectInjectedProviders(){
	const list = [];
	const eth = window.ethereum;
	const providers = (eth && eth.providers) ? eth.providers : null;
	if(providers && Array.isArray(providers)){
		providers.forEach(p=> list.push(p));
	} else if(eth){
		list.push(eth);
	}
	if(window.BinanceChain) list.push(window.BinanceChain);
	return list;
}
function providerId(p){
	if(p && p.isMetaMask) return 'metamask';
	if(p && (p.isOkxWallet || p.isOKXWallet)) return 'okx';
	if(p && p.isTrust) return 'trust';
	if(p && p.isCoinbaseWallet) return 'coinbase';
	if(p === window.BinanceChain) return 'binance';
	return 'unknown';
}
function pickInjectedProvider(){
	const list = detectInjectedProviders();
	if(!list.length) return null;
	const wanted = localStorage.getItem('lastProvider')||'';
	let chosen = list.find(p=> providerId(p)===wanted);
	if(!chosen){
		chosen = list.find(p=> p.isMetaMask) || list.find(p=> (p.isOkxWallet||p.isOKXWallet)) || list.find(p=> p.isTrust) || list.find(p=> p===window.BinanceChain) || list[0];
	}
	try { localStorage.setItem('lastProvider', providerId(chosen)); } catch(_){ }
	return chosen;
}
function getAddChainParams(chainId){
	const idHex = '0x'+Number(chainId).toString(16);
	switch(Number(chainId)){
		case 56:
			return { chainId:idHex, chainName:'BNB Smart Chain', nativeCurrency:{ name:'BNB', symbol:'BNB', decimals:18 }, rpcUrls:['https://bsc-dataseed.binance.org'], blockExplorerUrls:['https://bscscan.com'] };
		case 97:
			return { chainId:idHex, chainName:'BSC Testnet', nativeCurrency:{ name:'tBNB', symbol:'tBNB', decimals:18 }, rpcUrls:['https://data-seed-prebsc-1-s1.binance.org:8545'], blockExplorerUrls:['https://testnet.bscscan.com'] };
		case 1:
			return { chainId:idHex, chainName:'Ethereum Mainnet', nativeCurrency:{ name:'Ether', symbol:'ETH', decimals:18 }, rpcUrls:['https://rpc.ankr.com/eth'], blockExplorerUrls:['https://etherscan.io'] };
		case 11155111:
			return { chainId:idHex, chainName:'Sepolia', nativeCurrency:{ name:'Ether', symbol:'ETH', decimals:18 }, rpcUrls:['https://rpc.sepolia.org'], blockExplorerUrls:['https://sepolia.etherscan.io'] };
		default:
			const preset = NETWORK_PRESETS[chainId];
			return preset? { chainId:idHex, chainName:preset.name, nativeCurrency:{ name:getNativeSymbol(chainId), symbol:getNativeSymbol(chainId), decimals:18 }, rpcUrls:[preset.rpc], blockExplorerUrls:[] } : { chainId:idHex, chainName:'Custom', nativeCurrency:{ name:'ETH', symbol:'ETH', decimals:18 }, rpcUrls:[], blockExplorerUrls:[] };
	}
}
async function ensureChain(injected, desired){
	if(!desired) return;
	const idHex = '0x'+Number(desired).toString(16);
	try { await injected.request({ method:'wallet_switchEthereumChain', params:[{ chainId:idHex }] }); return; }
	catch(e){
		try { await injected.request({ method:'wallet_addEthereumChain', params:[ getAddChainParams(desired) ] }); return; }
		catch(e2){ throw e2; }
	}
}
function bindProviderEvents(injected){
	if(!injected || !injected.on) return;
	// Снимаем возможные дубликаты: нет стандартного off у всех провайдеров, оставим простую установку с флагом
	if(injected.__boundEvents) return; injected.__boundEvents = true;
	injected.on('accountsChanged', async (accounts)=>{
		if(!accounts || !accounts.length){ disconnectWallet(); return; }
		APP_STATE.address = accounts[0]; updateWalletBadge(); if(window.__refreshWalletBalances) window.__refreshWalletBalances();
	});
	injected.on('chainChanged', async (_id)=>{
		try{
			const chainId = parseInt(_id, 16);
			APP_STATE.network = chainId; updateNetStatus();
			if(window.ethers && APP_STATE.alt && APP_STATE.alt.injected){
				APP_STATE.provider = new ethers.BrowserProvider(APP_STATE.alt.injected);
				APP_STATE.signer = await APP_STATE.provider.getSigner();
			}
			if(window.__refreshWalletBalances) window.__refreshWalletBalances();
		}catch(_){ }
	});
	injected.on('disconnect', ()=>{ disconnectWallet(); });
}

async function connectWallet(){
	try {
		if(typeof window === 'undefined') throw new Error('Window недоступен');
		const injected = pickInjectedProvider();
		if(!injected){
			log('Кошелёк не найден. Установите MetaMask / OKX / Binance Wallet', 'error');
			const st = id('connect-status'); if(st) st.textContent = 'Кошелёк не найден в браузере';
			return;
		}
		bindProviderEvents(injected);
		APP_STATE.alt.injected = injected;
		// Запрос аккаунтов
		const accounts = await injected.request({ method: 'eth_requestAccounts' });
		if(!accounts || !accounts.length) throw new Error('Аккаунты не возвращены');
		const desired = APP_STATE.settings.networkId;
		try { if(desired) await ensureChain(injected, desired); } catch(e){ log('Не удалось переключить сеть: '+(e.message||e),'error'); }
		// Получаем актуальный chainId
		const chainIdHex = await injected.request({ method: 'eth_chainId' });
		const chainId = Number(chainIdHex);
		// Создаём BrowserProvider без лишних параметров
		let provider;
		if(window.ethers){ provider = new ethers.BrowserProvider(injected); }
		else { provider = injected; }
		let signer = null;
		if(provider && provider.getSigner){ signer = await provider.getSigner(); }
		APP_STATE.provider = provider;
		APP_STATE.signer = signer;
		APP_STATE.address = accounts[0];
		APP_STATE.network = chainId;
		updateWalletBadge();
		updateNetStatus();
		if(window.__refreshWalletBalances) window.__refreshWalletBalances();
		const st = id('connect-status'); if(st) st.textContent = `Кошелёк подключён (${providerId(injected)})`;
		log('Кошелёк подключён: '+accounts[0]);
	} catch(e){
		log('Ошибка подключения: '+ (e.message||e), 'error');
		const st = id('connect-status'); if(st) st.textContent = 'Ошибка подключения: '+(e.message||e);
	}
}

function disconnectWallet(){
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

// Убраны все функции блокировки - пользователи могут пробовать сколько угодно

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
