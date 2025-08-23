// log, id из utils.js
// Верификация контракта через Etherscan API V2 (multichain: chainid)

let __verifyCancel = false;
async function verifyContract(){
	if(!APP_STATE.token || !APP_STATE.token.address){ log('Нет токена для верификации','error'); return; }
	const preKey = (window.API_KEYS && (window.API_KEYS.bscscan||window.API_KEYS.etherscan)) || APP_STATE.settings.apiKey;
	if(!preKey){ log('Нет API ключа','error'); const el=id('verify-status'); if(el) el.textContent='Не найден API ключ (keys.js или настройки)'; return; }
	__verifyCancel = false;
	const statusEl = id('verify-status'); if(statusEl) statusEl.textContent='Отправка на верификацию...';
	const cancelBtn = document.getElementById('verify-cancel-btn'); if(cancelBtn) cancelBtn.disabled=false;
	try {
		const { params } = APP_STATE.token;
		const chainid = Number(APP_STATE.network);
		const source = params.source; if(!source){ throw new Error('Нет исходника для верификации'); }
		const contractName = extractContractName(source) || 'ConfigERC20';
		const autoKey = (window.API_KEYS && (window.API_KEYS.bscscan||window.API_KEYS.etherscan)) || APP_STATE.settings.apiKey;
		const { apiBase, variant } = getVerifyApi(chainid);

		const form = new URLSearchParams();
		form.set('module','contract');
		form.set('action','verifysourcecode');
		form.set('contractaddress', APP_STATE.token.address);
		form.set('sourceCode', source);
		form.set('codeformat','solidity-single-file');
		form.set('contractname', contractName);
		form.set('compilerversion','v0.8.24+commit.e11b9ed9');
		form.set('optimizationUsed','1');
		form.set('runs','200');
		form.set('licenseType','3');
		const ctor = encodeConstructorArgs(APP_STATE.token.abi, params);
		// Совместимость с v1 и v2: передаём обе формы параметра
		form.set('constructorArguments', ctor);
		form.set('constructorArguements', ctor);
		if(variant==='v2') form.set('chainid', String(chainid));
		form.set('apikey', autoKey);

		const resp = await fetch(apiBase, { method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'}, body:form.toString() });
		const data = await safeJson(resp);
		if(String(data.status)!=='1'){
			throw new Error(data.result||data.message||'submit error');
		}
		const guid = data.result;
		statusEl.textContent='GUID получен, polling...';
		showVerifyProgress(true);
		const result = await pollVerify(apiBase, guid, chainid, 60, autoKey, variant);
		statusEl.textContent = result.ok? 'Контракт верифицирован':'Статус: '+result.status;
		showVerifyProgress(false);
		log('Результат верификации: '+JSON.stringify(result));
	} catch(e){
		log('Ошибка верификации: '+e.message,'error');
		if(statusEl) statusEl.textContent='Ошибка верификации: '+e.message;
	}
	const cancelBtn2 = document.getElementById('verify-cancel-btn'); if(cancelBtn2) cancelBtn2.disabled=true;
}

function encodeConstructorArgs(abi, p){
	try{
		const ctor = (abi||[]).find(x=> x.type==='constructor') || { inputs:[] };
		const inputs = ctor.inputs||[];
		if(!inputs.length) return '';
		const types = inputs.map(i=> i.type);
		let strIdx = 0;
		const values = inputs.map(i=>{
			if(i.type==='string'){
				const v = (strIdx++ === 0) ? (p?.name||'Token') : (p?.symbol||'TKN');
				return v;
			}
			if(i.type==='uint8') return Number(p?.decimals||18);
			if(i.type==='uint256') return BigInt(p?.supply||0n);
			throw new Error('Unsupported ctor type: '+i.type);
		});
		const coder = (ethers && ethers.AbiCoder && ethers.AbiCoder.defaultAbiCoder) ? ethers.AbiCoder.defaultAbiCoder() : new ethers.AbiCoder();
		const encoded = coder.encode(types, values); // 0x...
		return encoded.startsWith('0x') ? encoded.slice(2) : encoded;
	}catch(_){ return ''; }
}

function extractContractName(source){
	if(!source) return '';
	const m = source.match(/contract\s+([A-Za-z0-9_]+)/);
	return m ? m[1] : '';
}

async function pollVerify(apiBase, guid, chainid, maxAttempts, apikey, variant){
	for(let i=0;i<maxAttempts;i++){
		if(__verifyCancel) return { ok:false, status:'cancelled' };
		await new Promise(r=>setTimeout(r, 4000));
		const url = variant==='v2'
			? `${apiBase}?module=contract&action=checkverifystatus&guid=${encodeURIComponent(guid)}&chainid=${chainid}`
			: `${apiBase}?module=contract&action=checkverifystatus&guid=${encodeURIComponent(guid)}&apikey=${encodeURIComponent(apikey)}`;
		const r = await fetch(url); let d; try { d = await r.json(); } catch(_) { d = { status:'0', result:'json parse error'}; }
		updateVerifyProgress((i+1)/maxAttempts, d.result||d.message||'');
		if(d.status==='1') return { ok:true, status:d.result };
		if(d.status==='0' && /already verified/i.test((d.result||'')+(d.message||''))) return { ok:true, status:'already verified' };
		if(d.status==='0' && !/Pending|In progress|Queue/i.test((d.result||'')+(d.message||''))) return { ok:false, status:d.result||d.message };
	}
	return { ok:false, status:'timeout' };
}

function getVerifyApi(chainid){
    // Etherscan v2 для Ethereum; BscScan использует v1 (/api)
    if(chainid===56 || chainid===97){
        return { apiBase: 'https://api.bscscan.com/api', variant:'v1' };
    }
    return { apiBase: 'https://api.etherscan.io/v2/api', variant:'v2' };
}

async function safeJson(resp){
    try{ return await resp.json(); }
    catch(e){
        const text = await resp.text().catch(()=> '');
        return { status:'0', result: text.slice(0,200) };
    }
}

function showVerifyProgress(on){
	const c = document.getElementById('verify-progress-container'); if(!c) return;
	if(on) c.classList.remove('hidden'); else c.classList.add('hidden');
	if(!on){ updateVerifyProgress(0,''); }
}
function updateVerifyProgress(fraction, text){
	const bar = document.getElementById('verify-progress-inner');
	if(bar) bar.style.width = Math.min(100, Math.round(fraction*100))+'%';
	const t = document.getElementById('verify-progress-text'); if(t) t.textContent = text;
}

document.getElementById('verify-btn-manage')?.addEventListener('click', verifyContract);
document.getElementById('verify-cancel-btn')?.addEventListener('click', ()=>{ __verifyCancel = true; const b=document.getElementById('verify-cancel-btn'); if(b) b.disabled=true; });
window.__verifyContract = verifyContract;
