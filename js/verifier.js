// log, id из utils.js
// Каркас верификации контракта на BscScan (или аналогичных) через API

async function verifyContract(){
	if(!APP_STATE.token || !APP_STATE.token.address){ log('Нет токена для верификации','error'); return; }
	if(!APP_STATE.settings.apiKey){ log('Нет API ключа','error'); id('verify-status').textContent='Укажите API ключ в настройках'; return; }
	const statusEl = id('verify-status'); if(statusEl) statusEl.textContent='Отправка на верификацию...';
	try {
		const { abi, bytecode, params } = APP_STATE.token;
		const contractName = (params?.symbol)||'Token';
		// Минимальный source должен совпасть с деплоем; берём шаблон из app.js (повторяем формирование)
		const source = `// SPDX-License-Identifier: MIT\npragma solidity ^0.8.24;\ncontract ${params.symbol} {\nstring public name = '${params.name}';\nstring public symbol = '${params.symbol}';\nuint8 public decimals = ${params.decimals};\nuint256 public totalSupply;\nmapping(address=>uint256) public balanceOf;\nevent Transfer(address indexed from,address indexed to,uint256 value);\nconstructor(uint256 initialSupply){totalSupply=initialSupply;balanceOf[msg.sender]=initialSupply;emit Transfer(address(0),msg.sender,initialSupply);}\nfunction transfer(address to,uint256 value) external returns(bool){require(balanceOf[msg.sender]>=value,'bal');unchecked{balanceOf[msg.sender]-=value;balanceOf[to]+=value;}emit Transfer(msg.sender,to,value);return true;}\n}`;
		const form = new URLSearchParams();
		form.set('apikey', APP_STATE.settings.apiKey);
		form.set('module','contract');
		form.set('action','verifysourcecode');
		form.set('contractaddress', APP_STATE.token.address);
		form.set('sourceCode', source);
		form.set('codeformat','solidity-single-file');
		form.set('contractname', params.symbol); // без файла, одиночный
		form.set('compilerversion','v0.8.24+commit.e11b9ed9');
		form.set('optimizationUsed','1');
		form.set('runs','200');
		form.set('licenseType','3'); // MIT
		form.set('constructorArguements', encodeConstructorArgs(params));
		const apiBase = APP_STATE.network===97? 'https://api-testnet.bscscan.com/api':'https://api.bscscan.com/api';
		const resp = await fetch(apiBase, { method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'}, body:form.toString() });
		const data = await resp.json();
		if(data.status!=='1'){ throw new Error(data.result||'submit error'); }
		const guid = data.result;
		statusEl.textContent='GUID получен, polling...';
		const result = await pollVerify(apiBase, guid, 60); // максимум 60 попыток ~2-3 мин
		statusEl.textContent = result.ok? 'Контракт верифицирован':'Статус: '+result.status;
		log('Результат верификации: '+JSON.stringify(result));
	} catch(e){
		log('Ошибка верификации: '+e.message,'error');
		if(statusEl) statusEl.textContent='Ошибка верификации: '+e.message;
	}
}

function encodeConstructorArgs(p){
	if(!p || !p.supply) return '';
	// Конструктор (uint256 initialSupply)
	const hex = BigInt(p.supply).toString(16);
	return hex.padStart(64,'0');
}

async function pollVerify(apiBase, guid, maxAttempts){
	for(let i=0;i<maxAttempts;i++){
		await new Promise(r=>setTimeout(r, 3000));
		const url = `${apiBase}?module=contract&action=checkverifystatus&guid=${encodeURIComponent(guid)}`;
		const r = await fetch(url); const d = await r.json();
		if(d.status==='1') return { ok:true, status:d.result };
		if(d.status==='0' && /already verified/i.test(d.result||'')) return { ok:true, status:'already verified' };
		if(d.status==='0' && !/Pending in queue|In progress/i.test(d.result||'')) return { ok:false, status:d.result };
	}
	return { ok:false, status:'timeout' };
}

document.getElementById('verify-btn')?.addEventListener('click', verifyContract);
window.__verifyContract = verifyContract;
