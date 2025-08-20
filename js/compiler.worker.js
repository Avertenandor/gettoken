/* compiler.worker.js - изолированная компиляция solc-js */
// Загружает нужную версию солидити (v0.8.24) и компилирует переданный исходник.

let solcLoaded = false;
let solc;

function loadSolc(version = 'v0.8.24+commit.e11b9ed9') {
  if (solcLoaded) return Promise.resolve();
  return new Promise((resolve, reject) => {
    try {
      importScripts(`https://binaries.soliditylang.org/bin/soljson-${version}.js`);
      // глобальная функция Module от solc
      solc = self.Module;
      if (!solc || !solc.cwrap) {
        reject(new Error('Ошибка инициализации solc-js'));
        return;
      }
      solcLoaded = true;
      resolve();
    } catch (e) { reject(e); }
  });
}

function compile(source, optimize = true) {
  if (!solcLoaded) throw new Error('solc не загружен');
  const input = {
    language: 'Solidity',
    sources: { 'Token.sol': { content: source } },
    settings: {
      optimizer: { enabled: optimize, runs: 200 },
      outputSelection: { '*': { '*': ['abi','evm.bytecode.object','metadata'] } }
    }
  };
  const output = JSON.parse(solc.cwrap('compileStandard','string',['string'])(JSON.stringify(input)));
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
