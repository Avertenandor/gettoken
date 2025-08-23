/* compiler.worker.js - изолированная компиляция solc-js */
// Загружает нужную версию солидити (v0.8.24) и компилирует переданный исходник.

let solcLoaded = false;
let solc;
let compileStandardWrapper = null;

function loadSolc(version = 'v0.8.24+commit.e11b9ed9') {
  if (solcLoaded && compileStandardWrapper) return Promise.resolve();
  return new Promise((resolve, reject) => {
    try {
      // Важно: определить Module до importScripts, чтобы задать print/printErr и избежать ошибок 'apply'
      self.Module = {
        print: function(){},
        printErr: function(){},
        locateFile: function(path){ return `https://binaries.soliditylang.org/bin/${path}`; },
        // Дополнительные настройки для стабильности Emscripten
        noInitialRun: true,
        noExitRuntime: true,
        ENVIRONMENT: 'WORKER'
      };
      
      // Загружаем solc
      try{
        importScripts(`https://binaries.soliditylang.org/bin/soljson-${version}.js`);
      } catch(primaryError){
        // Альтернативная загрузка через jsDelivr mirror
        try{
          importScripts(`https://cdn.jsdelivr.net/gh/ethereum/solc-bin@gh-pages/bin/soljson-${version}.js`);
        }catch(mirrorError){
          console.error('Both primary and mirror solc load failed:', primaryError, mirrorError);
          throw primaryError;
        }
      }
      
      // Проверяем загрузку
      if (typeof Module === 'undefined' || !Module) {
        throw new Error('Module не определен после загрузки solc');
      }
      
      solc = Module;
      
      // Ждем инициализации Runtime если нужно
      if (solc.calledRun === false && typeof solc.run === 'function') {
        solc.run();
      }
      
      if (!solc || !solc.cwrap) {
        reject(new Error('Ошибка инициализации solc-js (cwrap недоступен)'));
        return;
      }
      
      compileStandardWrapper = solc.cwrap('compileStandard','string',['string']);
      if (typeof compileStandardWrapper !== 'function') {
        reject(new Error('compileStandard недоступен'));
        return;
      }
      
      solcLoaded = true;
      resolve();
    } catch (e) { 
      console.error('LoadSolc error:', e);
      reject(e); 
    }
  }).catch(async (e)=>{
    // Авто-фоллбек на более свежую версию, если указанная не загрузилась
    console.warn('Fallback to newer solc version due to:', e.message);
    if(version !== 'v0.8.26+commit.8a97fa17'){
      solcLoaded = false;
      compileStandardWrapper = null;
      self.Module = undefined;
      return loadSolc('v0.8.26+commit.8a97fa17');
    }
    throw e;
  });
}

function compile(source, optimize = true) {
  if (!solcLoaded || !compileStandardWrapper) throw new Error('solc не загружен');
  const input = {
    language: 'Solidity',
    sources: { 'Token.sol': { content: source } },
    settings: {
      optimizer: { enabled: optimize, runs: 200 },
      outputSelection: { '*': { '*': ['abi','evm.bytecode.object','metadata'] } }
    }
  };
  let outRaw;
  try {
    outRaw = compileStandardWrapper(JSON.stringify(input));
  } catch(err){
    throw new Error('Ошибка выполнения solc: '+(err?.message||err));
  }
  const output = JSON.parse(outRaw);
  if (output.errors) {
    const fatal = output.errors.filter(e=>e.severity==='error');
    if (fatal.length) {
      throw new Error(fatal.map(e=>e.formattedMessage).join('\n'));
    }
  }
  const contractName = Object.keys(output.contracts['Token.sol'])[0];
  const artifact = output.contracts['Token.sol'][contractName];
  return { contractName, abi: artifact.abi, bytecode: artifact.evm.bytecode.object, metadata: artifact.metadata };
}

self.onmessage = async (e) => {
  const { id, cmd, payload } = e.data;
  try {
    if (cmd === 'compile') {
      await loadSolc(payload.version);
      const result = compile(payload.source, payload.optimize);
      self.postMessage({ id, ok: true, result });
    } else if (cmd === 'ping') {
      self.postMessage({ id, ok: true, pong: true });
    } else {
      throw new Error('Unknown cmd');
    }
  } catch (error) {
    self.postMessage({ id, ok: false, error: error.message });
  }
};
