// projects.js - IndexedDB хранение проектов (конфигураций токенов)

const DB_NAME = 'token_projects_db';
const DB_VERSION = 1;
let dbPromise = null;

function getDb(){
  if(!dbPromise){
    dbPromise = new Promise((resolve, reject)=>{
      const open = indexedDB.open(DB_NAME, DB_VERSION);
      open.onupgradeneeded = () => {
        const db = open.result;
        if(!db.objectStoreNames.contains('projects')){
          const store = db.createObjectStore('projects', { keyPath: 'id' });
          store.createIndex('by_time','createdAt');
        }
      };
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
    });
  }
  return dbPromise;
}

async function saveProject(){
  if(!APP_STATE.token || !APP_STATE.token.address){ alert('Нет токена'); return; }
  const db = await getDb();
  const tx = db.transaction('projects','readwrite');
  const store = tx.objectStore('projects');
  const rec = {
    id: APP_STATE.token.address,
    address: APP_STATE.token.address,
    abi: APP_STATE.token.abi,
    bytecode: APP_STATE.token.bytecode,
    params: APP_STATE.token.params,
    chainId: APP_STATE.network,
    createdAt: Date.now()
  };
  store.put(rec);
  await tx.complete;
  log('Проект сохранён: '+rec.id);
}

async function listProjects(){
  const db = await getDb();
  return new Promise((resolve,reject)=>{
    const tx = db.transaction('projects','readonly');
    const store = tx.objectStore('projects');
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

window.__saveProject = saveProject;
window.__listProjects = listProjects;
