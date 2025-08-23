// verify_list.js - массовая проверка/верификация по адресам
(function(){
  let cancel = false;
  const logEl = ()=> document.getElementById('bulk-verify-log');
  const tbody = ()=> document.getElementById('bulk-verify-tbody');

  function a(s){ const el=logEl(); if(el){ el.textContent += (s+'\n'); el.scrollTop = el.scrollHeight; } }
  function row(addr){
    const tr = document.createElement('tr');
    tr.innerHTML = `<td><code>${addr}</code></td><td class="c-symbol">—</td><td class="c-dec">—</td><td class="c-status">—</td><td class="c-exp"><a href="#" target="_blank">—</a></td>`;
    return tr;
  }
  function explorerBase(chain){
    if(chain===56) return 'https://bscscan.com';
    if(chain===97) return 'https://testnet.bscscan.com';
    if(chain===1) return 'https://etherscan.io';
    if(chain===11155111) return 'https://sepolia.etherscan.io';
    return '';
  }
  function getApi(chain){
    if(chain===56||chain===97) return { base:'https://api.bscscan.com/api', variant:'v1' };
    return { base:'https://api.etherscan.io/v2/api', variant:'v2' };
  }
  async function fetchAbi(addr, chain){
    const key = (window.API_KEYS && (window.API_KEYS.bscscan||window.API_KEYS.etherscan)) || (window.APP_STATE?.settings?.apiKey)||'';
    const { base, variant } = getApi(chain);
    let url;
    if(variant==='v1') url = `${base}?module=contract&action=getabi&address=${addr}&apikey=${encodeURIComponent(key)}`;
    else url = `${base}?module=contract&action=getsourcecode&address=${addr}&chainid=${chain}&apikey=${encodeURIComponent(key)}`;
    const r = await fetch(url);
    let d; try{ d = await r.json(); }catch(_){ return { ok:false, error:'json error' }; }
    if(String(d.status)!=='1') return { ok:false, error: d.result || d.message || 'api error' };
    if(variant==='v1') return { ok:true, abi: d.result };
    // v2 etherscan: result[0].ABI
    try{ const arr = Array.isArray(d.result)? d.result: []; return { ok:true, abi: arr[0]?.ABI || '[]' }; }catch(_){ return { ok:false, error:'parse' }; }
  }
  async function fetchContractMeta(addr, chain){
    try{
      const provider = window.APP_STATE?.provider || new ethers.JsonRpcProvider((window.NETWORK_PRESETS && window.NETWORK_PRESETS[chain]?.rpc) || '');
      const erc = new ethers.Contract(addr, [
        'function name() view returns (string)',
        'function symbol() view returns (string)',
        'function decimals() view returns (uint8)',
        'function totalSupply() view returns (uint256)'
      ], provider);
      const [nm, sym, dec, ts] = await Promise.all([
        erc.name().catch(()=>''),
        erc.symbol().catch(()=>''),
        erc.decimals().then(n=> Number(n)).catch(()=>null),
        erc.totalSupply().catch(()=>null)
      ]);
      return { ok:true, name: nm||'', symbol: sym||'', decimals: (dec??''), totalSupply: ts };
    }catch(e){ return { ok:false, error:e.message } }
  }
  async function fetchDeployBytecode(addr, chain){
    try{
      const provider = window.APP_STATE?.provider || new ethers.JsonRpcProvider((window.NETWORK_PRESETS && window.NETWORK_PRESETS[chain]?.rpc) || '');
      const txHash = await provider.getTransactionReceipt(addr).then(()=>null).catch(()=>null); // заглушка
      // У некоторых эксплореров есть bytecode в getsourcecode, но здесь идём простым путём: getCode по адресу (runtime), а creation через API сканера недоступен. Поэтому сравнение будем делать по runtime (после конструкторных данных).
      const runtime = await provider.getCode(addr);
      return { ok:true, runtime };
    }catch(e){ return { ok:false, error:e.message }; }
  }
  async function run(){
    cancel = false;
    const btn = document.getElementById('bulk-verify-start');
    const stop = document.getElementById('bulk-verify-cancel');
    btn && (btn.disabled = true); stop && (stop.disabled=false);
    const chain = Number(document.getElementById('verify-chain').value||56);
    const text = (document.getElementById('bulk-addresses')||{}).value||'';
    const list = text.split(/\s+/).map(s=>s.trim()).filter(Boolean);
    tbody().innerHTML=''; logEl().textContent='';
    a(`Запуск. Сеть: ${chain}. Адресов: ${list.length}`);
    for(const addr of list){
      if(cancel) break;
      const tr = row(addr); tbody().appendChild(tr);
      const exp = explorerBase(chain); tr.querySelector('.c-exp a').href = exp? `${exp}/address/${addr}`:'#'; tr.querySelector('.c-exp a').textContent='Explorer';
      tr.querySelector('.c-status').textContent = 'Проверка...';
      // Проверим — не верифицирован ли уже
  const abiInfo = await fetchAbi(addr, chain);
      if(abiInfo.ok && abiInfo.abi && abiInfo.abi !== 'Contract source code not verified'){ tr.querySelector('.c-status').textContent='Уже верифицирован'; continue; }
      a(`${addr}: не верифицирован, пытаюсь верифицировать...`);
  // Попробуем получить on-chain meta (symbol/decimals)
      const meta = await fetchContractMeta(addr, chain);
      const symbol = meta.ok && meta.symbol ? meta.symbol : 'TKN';
      const decimals = meta.ok && (meta.decimals!=null) ? Number(meta.decimals) : 18;
      const name = (meta.ok && meta.name) ? meta.name : symbol; // если name не доступен — берём symbol
      const totalSupply = (meta.ok && meta.totalSupply!=null) ? meta.totalSupply : 0n;
      const supply = 0n; // параметр шаблона SOURCE_TEMPLATE не используется здесь
      const source = (window.CONFIG_ERC20_SOURCE) ? window.CONFIG_ERC20_SOURCE : (typeof SOURCE_TEMPLATE==='function'? SOURCE_TEMPLATE(name,symbol,decimals,String(supply)) : '');
      const contractName = (source.match(/contract\s+([A-Za-z0-9_]+)/)||[])[1] || 'ConfigERC20';
      const fileName = `${contractName}.sol`;
      const stdJson = {
        language: 'Solidity',
        sources: { [fileName]: { content: source } },
        settings: { optimizer: { enabled: true, runs: 200 }, viaIR: false, evmVersion: 'default', metadata: { bytecodeHash: 'ipfs' } }
      };
      const { base, variant } = getApi(chain);
      const key = (window.API_KEYS && (window.API_KEYS.bscscan||window.API_KEYS.etherscan)) || (window.APP_STATE?.settings?.apiKey)||'';
  const form = new URLSearchParams();
  form.set('module','contract'); form.set('action','verifysourcecode'); form.set('contractaddress', addr);
  form.set('sourceCode', JSON.stringify(stdJson)); form.set('codeformat','solidity-standard-json-input');
  form.set('contractname', `${fileName}:${contractName}`);
  form.set('compilerversion','v0.8.24+commit.e11b9ed9'); form.set('optimizationUsed','1'); form.set('runs','200'); form.set('licenseType','3');
      // Кодируем аргументы конструктора как в артефакте: (string,string,uint8,uint256) => (name,symbol,decimals,totalSupply)
      try{
        const coder = (ethers && ethers.AbiCoder && ethers.AbiCoder.defaultAbiCoder) ? ethers.AbiCoder.defaultAbiCoder() : new ethers.AbiCoder();
        const encoded = coder.encode(['string','string','uint8','uint256'], [name, symbol, decimals, totalSupply||0n]);
        const hex = encoded.startsWith('0x') ? encoded.slice(2) : encoded;
        form.set('constructorArguments', hex); form.set('constructorArguements', hex);
      }catch(_){ form.set('constructorArguments',''); form.set('constructorArguements',''); }
      if(variant==='v2') form.set('chainid', String(chain));
      form.set('apikey', key);
      try{
        const r = await fetch(base, { method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'}, body:form.toString() });
        let d; try{ d=await r.json(); }catch(_){ d={ status:'0', result:'json parse error'} }
        if(String(d.status)!=='1'){ tr.querySelector('.c-status').textContent = 'Ошибка: '+(d.result||d.message); a(`${addr}: submit error: ${d.result||d.message}`); continue; }
        const guid = d.result; tr.querySelector('.c-status').textContent = 'GUID '+guid+' — polling...';
        // poll
        let ok=false, status='';
        for(let i=0;i<60;i++){
          if(cancel) break; await new Promise(r=>setTimeout(r,4000));
          const url = (variant==='v2')
            ? `${base}?module=contract&action=checkverifystatus&guid=${encodeURIComponent(guid)}&chainid=${chain}`
            : `${base}?module=contract&action=checkverifystatus&guid=${encodeURIComponent(guid)}&apikey=${encodeURIComponent(key)}`;
          const pr = await fetch(url); let pd; try{ pd=await pr.json(); }catch(_){ pd={status:'0', result:'json'} }
          status = pd.result||pd.message||''; tr.querySelector('.c-status').textContent = status||'...';
          if(pd.status==='1'){ ok=true; break; }
          if(pd.status==='0' && /already verified/i.test(status)){ ok=true; status='already verified'; break; }
          if(pd.status==='0' && !/Pending|In progress|Queue/i.test(status)) break;
        }
        if(ok){ tr.querySelector('.c-status').textContent = 'Верифицирован'; }
        else {
          // Фоллбек: если байткод не совпал, пробуем шаблон SOURCE_TEMPLATE (конструктор uint256)
          if(/does\s+NOT\s+match|Unable to verify/i.test(status)){
            a(`${addr}: fallback → пытаюсь с шаблоном по символу`);
            const sanitized = (symbol||'TKN').replace(/[^A-Za-z0-9_]/g,'');
            const cname = (/^[0-9]/.test(sanitized) ? '_'+sanitized : sanitized) || 'Token';
            const altSource = (typeof SOURCE_TEMPLATE==='function') ? SOURCE_TEMPLATE(name||symbol||'Token', symbol||'TKN', decimals||18, (totalSupply||0n).toString()) : '';
            const altFile = `${cname}.sol`;
            const altJson = { language:'Solidity', sources:{ [altFile]:{ content: altSource } }, settings:{ optimizer:{enabled:true,runs:200}, viaIR:false, evmVersion:'default', metadata:{ bytecodeHash:'ipfs' } } };
            const altForm = new URLSearchParams();
            altForm.set('module','contract'); altForm.set('action','verifysourcecode'); altForm.set('contractaddress', addr);
            altForm.set('sourceCode', JSON.stringify(altJson)); altForm.set('codeformat','solidity-standard-json-input'); altForm.set('contractname', `${altFile}:${cname}`);
            altForm.set('compilerversion','v0.8.24+commit.e11b9ed9'); altForm.set('optimizationUsed','1'); altForm.set('runs','200'); altForm.set('licenseType','3');
            try{
              const coder = (ethers && ethers.AbiCoder && ethers.AbiCoder.defaultAbiCoder) ? ethers.AbiCoder.defaultAbiCoder() : new ethers.AbiCoder();
              const enc = coder.encode(['uint256'], [totalSupply||0n]); const hex = enc.startsWith('0x')? enc.slice(2): enc;
              altForm.set('constructorArguments', hex); altForm.set('constructorArguements', hex);
            }catch(_){ altForm.set('constructorArguments',''); altForm.set('constructorArguements',''); }
            if(variant==='v2') altForm.set('chainid', String(chain));
            altForm.set('apikey', key);
            const rr = await fetch(base, { method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'}, body:altForm.toString() });
            let dj; try{ dj=await rr.json(); }catch(_){ dj={ status:'0', result:'json parse error'} }
            if(String(dj.status)==='1'){
              const g2 = dj.result; tr.querySelector('.c-status').textContent = 'GUID '+g2+' — polling...';
              for(let i=0;i<60;i++){
                if(cancel) break; await new Promise(r=>setTimeout(r,4000));
                const url2 = (variant==='v2')
                  ? `${base}?module=contract&action=checkverifystatus&guid=${encodeURIComponent(g2)}&chainid=${chain}`
                  : `${base}?module=contract&action=checkverifystatus&guid=${encodeURIComponent(g2)}&apikey=${encodeURIComponent(key)}`;
                const pr2 = await fetch(url2); let pd2; try{ pd2=await pr2.json(); }catch(_){ pd2={status:'0', result:'json'} }
                const st2 = pd2.result||pd2.message||''; tr.querySelector('.c-status').textContent = st2||'...';
                if(pd2.status==='1'){ ok=true; break; }
                if(pd2.status==='0' && /already verified/i.test(st2)){ ok=true; break; }
                if(pd2.status==='0' && !/Pending|In progress|Queue/i.test(st2)) break;
              }
              tr.querySelector('.c-status').textContent = ok? 'Верифицирован' : ('Ошибка: '+status);
            } else {
              tr.querySelector('.c-status').textContent = 'Ошибка: '+(dj.result||dj.message||status);
            }
          } else {
            tr.querySelector('.c-status').textContent = 'Ошибка: '+status;
          }
        }
      }catch(e){ tr.querySelector('.c-status').textContent='Ошибка сети'; a(`${addr}: network error ${e.message}`); }
    }
    a('Готово.');
    btn && (btn.disabled = false); stop && (stop.disabled=true);
  }

  document.getElementById('bulk-verify-start')?.addEventListener('click', run);
  document.getElementById('bulk-verify-cancel')?.addEventListener('click', ()=>{ cancel=true; });
})();
