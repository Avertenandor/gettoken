// Глобальные утилиты для всех скриптов
function id(i){return document.getElementById(i);} // Быстрый доступ к элементу
// Централизованный логгер с буфером
const __LOGS = [];
function __pushLog(type, message){
	const item = { ts: new Date().toISOString(), type, message: String(message) };
	__LOGS.push(item);
	const out = document.getElementById('log-output');
	if(out){
		const filter = (document.getElementById('log-filter')||{}).value||'all';
		if(filter==='all' || filter===type){ out.textContent += `[${item.ts}] ${type.toUpperCase()}: ${item.message}\n`; out.scrollTop = out.scrollHeight; }
		const cnt = document.getElementById('log-count'); if(cnt) cnt.textContent = `Всего: ${__LOGS.length}`;
	}
}
function log(msg, type='info'){ (console[type==='error'?'error':'log'])(msg); __pushLog(type, msg); }

// Перехват ошибок и предупреждений
const __origConsoleError = console.error.bind(console);
console.error = (...args)=>{ __origConsoleError(...args); __pushLog('error', args.map(x=> (x&&x.message)?x.message:String(x)).join(' ')); };
const __origConsoleWarn = console.warn.bind(console);
console.warn = (...args)=>{ __origConsoleWarn(...args); __pushLog('warn', args.map(x=> String(x)).join(' ')); };

// Перехват fetch для логов
const __origFetch = window.fetch?.bind(window);
if(__origFetch){
	window.fetch = async (input, init)=>{
		try{
			const url = (typeof input === 'string') ? input : (input && input.url) || '';
			__pushLog('info', `fetch → ${url}`);
			const resp = await __origFetch(input, init);
			__pushLog(resp.ok? 'info':'error', `fetch ← ${resp.status} ${url}`);
			try{
				const u = String(url);
			const isScan = /api\.(bscscan|etherscan)\.com\//.test(u);
				if(isScan){
					const ct = resp.headers.get('content-type')||'';
					if(ct.includes('application/json')){
						const dj = await resp.clone().json().catch(()=>null);
						if(dj){
							const status = dj.status!=null? String(dj.status):'';
							const result = dj.result!=null? String(dj.result): (dj.message!=null? String(dj.message):'');
							const brief = result.length>160? (result.slice(0,160)+'…') : result;
							__pushLog(status==='1'?'info':'warn', `scan ← status=${status} result=${brief}`);
						}
					} else {
						const txt = await resp.clone().text().catch(()=> '');
						if(txt){ __pushLog('warn', `scan ← text ${txt.slice(0,120)}…`); }
					}
				}
			}catch(_){/* игнорируем ошибки парсинга для логов */}
			return resp;
		}catch(e){ __pushLog('error', `fetch ✖ ${e.message}`); throw e; }
	};
}

// Привязка UI логов
document.addEventListener('DOMContentLoaded', ()=>{
	const out = document.getElementById('log-output'); if(!out) return;
	const filter = document.getElementById('log-filter');
	const clearBtn = document.getElementById('log-clear');
		const exportBtn = document.getElementById('log-export');
		const copyBtn = document.getElementById('log-copy');
	const cnt = document.getElementById('log-count'); if(cnt) cnt.textContent = `Всего: ${__LOGS.length}`;
	function render(){
		const f = (filter&&filter.value)||'all';
		out.textContent='';
		__LOGS.forEach(item=>{ if(f==='all'||f===item.type){ out.textContent += `[${item.ts}] ${item.type.toUpperCase()}: ${item.message}\n`; } });
		out.scrollTop = out.scrollHeight;
		if(cnt) cnt.textContent = `Всего: ${__LOGS.length}`;
	}
		filter && filter.addEventListener('change', render);
		copyBtn && copyBtn.addEventListener('click', ()=>{ try{ navigator.clipboard.writeText(out.textContent||''); __pushLog('info','Логи скопированы в буфер обмена'); }catch(e){ __pushLog('error','Не удалось скопировать логи: '+e.message); } });
	clearBtn && clearBtn.addEventListener('click', ()=>{ __LOGS.length = 0; render(); });
	exportBtn && exportBtn.addEventListener('click', ()=>{
		const blob = new Blob([out.textContent], { type:'text/plain;charset=utf-8' });
		const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `logs_${Date.now()}.txt`; a.click(); setTimeout(()=>URL.revokeObjectURL(url), 1000);
	});
	render();
});

	// window.onerror и unhandledrejection
	window.addEventListener('error', (e)=>{ __pushLog('error', `onerror: ${e.message||''} @ ${e.filename||''}:${e.lineno||''}`); });
	window.addEventListener('unhandledrejection', (e)=>{
		const msg = (e.reason && e.reason.message) ? e.reason.message : String(e.reason);
		if(/reading 'type'/.test(msg)) { __pushLog('warn', `wallet inpage noise: ${msg}`); return; }
		__pushLog('error', `unhandledrejection: ${msg}`);
	});

	// Перехват XHR
	(function(){
		const X = window.XMLHttpRequest; if(!X) return;
		const open = X.prototype.open; const send = X.prototype.send;
		X.prototype.open = function(method, url){ this.__url = url; return open.apply(this, arguments); };
		X.prototype.send = function(){
			const url = this.__url||''; __pushLog('info', `xhr → ${url}`);
			this.addEventListener('load', ()=>{ __pushLog((this.status>=200&&this.status<400)?'info':'error', `xhr ← ${this.status} ${url}`); });
			this.addEventListener('error', ()=>{ __pushLog('error', `xhr ✖ ${url}`); });
			return send.apply(this, arguments);
		};
	})();

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
	apiKey: (window.API_KEYS && (window.API_KEYS.bscscan||window.API_KEYS.etherscan)) || localStorage.getItem('apiKey')||'',
		networkId: 56, // только BSC
		usdtAddress: localStorage.getItem('usdtAddress')||'0x55d398326f99059fF775485246999027B3197955',
		plexAddress: localStorage.getItem('plexAddress')||'0xdf179b6cAdBC61FFD86A3D2e55f6d6e083ade6c1',
		wcProjectId: localStorage.getItem('wcProjectId')||''
	},
	artifacts: { fixedErc20: null },
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
function pickInjectedProvider(preferredId){
	const list = detectInjectedProviders();
	if(!list.length) return null;
	const wanted = preferredId || localStorage.getItem('lastProvider')||'';
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
	log('wallet accountsChanged: '+JSON.stringify(accounts));
	if(!accounts || !accounts.length){ disconnectWallet(); return; }
		APP_STATE.address = accounts[0]; updateWalletBadge(); if(window.__refreshWalletBalances) window.__refreshWalletBalances();
	});
	injected.on('chainChanged', async (_id)=>{
		try{
			const chainId = parseInt(_id, 16);
	    log('wallet chainChanged: '+chainId);
			APP_STATE.network = chainId; updateNetStatus();
			if(window.ethers && APP_STATE.alt && APP_STATE.alt.injected){
				APP_STATE.provider = new ethers.BrowserProvider(APP_STATE.alt.injected);
				APP_STATE.signer = await APP_STATE.provider.getSigner();
			}
			if(window.__refreshWalletBalances) window.__refreshWalletBalances();
		}catch(_){ }
	});
    injected.on('disconnect', ()=>{ log('wallet disconnect'); disconnectWallet(); });
}

async function requestAccountsWithRetry(injected, maxTries=3){
	let lastErr;
	for(let i=0;i<maxTries;i++){
		try{
			if(injected && typeof injected.request==='function'){
				const acc = await injected.request({ method:'eth_requestAccounts' });
				if(acc && acc.length) return acc;
			}
			// Fallback enable() для старых/альтернативных провайдеров (BinanceChain)
			if(injected && typeof injected.enable==='function'){
				const acc2 = await injected.enable(); if(acc2 && acc2.length) return acc2;
			}
			// Fallback getAccounts
			if(injected && typeof injected.request==='function'){
				const acc3 = await injected.request({ method:'eth_accounts' }); if(acc3 && acc3.length) return acc3;
			}
		}catch(e){ lastErr = e; }
		await new Promise(r=> setTimeout(r, 400*(i+1)));
	}
	if(lastErr) throw lastErr; else throw new Error('No active wallet found');
}

async function connectWallet(preferredId){
	try {
		if(typeof window === 'undefined') throw new Error('Window недоступен');
		const injected = pickInjectedProvider(preferredId);
		if(!injected){
			log('Кошелёк не найден. Установите MetaMask / OKX / Binance Wallet', 'error');
			const st = id('connect-status'); if(st) st.textContent = 'Кошелёк не найден в браузере';
			return;
		}
		bindProviderEvents(injected);
		APP_STATE.alt.injected = injected;
		// Запрос аккаунтов с ретраями
		const accounts = await requestAccountsWithRetry(injected, 3);
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
		if(provider && provider.getSigner){
			try { signer = await provider.getSigner(); }
			catch(_){ /* повторим один раз после короткой задержки */ await new Promise(r=>setTimeout(r,200)); signer = await provider.getSigner(); }
		}
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
	const wcInput = document.getElementById('wc-project-id');
	if(wcInput){ APP_STATE.settings.wcProjectId = wcInput.value.trim(); if(APP_STATE.settings.wcProjectId) localStorage.setItem('wcProjectId', APP_STATE.settings.wcProjectId); }
}

async function fetchTokenBalance(){
	if(!APP_STATE.token.contract || !APP_STATE.address) return null;
	try {
		const decimals = Number(await APP_STATE.token.contract.decimals());
		const bal = await APP_STATE.token.contract.balanceOf(APP_STATE.address);
		if(window.ethers && ethers.formatUnits) return parseFloat(ethers.formatUnits(bal, decimals));
		return Number(bal) / Math.pow(10, decimals);
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

// Предзагрузка артефактов (без критичности)
fetch('./artifacts/FixedERC20.json').then(r=> r.ok? r.json(): null).then(j=>{ if(j) APP_STATE.artifacts.fixedErc20 = j; }).catch(()=>{});
