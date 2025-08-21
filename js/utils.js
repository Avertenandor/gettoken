// Глобальные утилиты для всех скриптов
function id(i){return document.getElementById(i);} // Быстрый доступ к элементу
function log(msg, type='info'){console[type==='error'?'error':'log'](msg);} // Логгер

// --- Глобальное состояние приложения ---
const NETWORK_PRESETS = {
	56: { name: 'BSC', rpc: 'https://bsc-dataseed.binance.org' },
	97: { name: 'BSC Testnet', rpc: 'https://data-seed-prebsc-1-s1.binance.org:8545' }
};

const APP_STATE = {
	provider: null,
	signer: null,
	address: null,
	network: null,
	alt: { connected: false },
	settings: { rpcUrl: '', apiKey: '' }
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
		const chainId = Number(chainIdHex);
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
		const st = id('connect-status'); if(st) st.textContent = 'Кошелёк подключён';
		log('Кошелёк подключён: '+accounts[0]);
	} catch(e){
		log('Ошибка подключения: '+ (e.message||e), 'error');
		const st = id('connect-status'); if(st) st.textContent = 'Ошибка подключения: '+(e.message||e);
	}
}

// Экспорт в глобальную область
window.APP_STATE = APP_STATE;
window.connectWallet = connectWallet;
window.updateWalletBadge = updateWalletBadge;
window.updateNetStatus = updateNetStatus;
