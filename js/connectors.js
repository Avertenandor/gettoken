// connectors.js - модуль выбора способа подключения (инжект/WalletConnect/Coinbase)
// Лёгкая реализация модального окна выбора и WalletConnect через @walletconnect/ethereum-provider (подключается динамически)

(function(){
  const modal = document.getElementById('connect-modal');
  if(!modal){
    // модалка пока отсутствует в верстке — не активируем логику
    return;
  }
  const closeBtn = document.getElementById('connect-modal-close');
  function openModal(){ modal.style.display='flex'; }
  function closeModal(){ modal.style.display='none'; }
  if(closeBtn) closeBtn.addEventListener('click', closeModal);
  // Открываем модалку по основной кнопке подключения
  const btn = document.getElementById('btn-connect');
  if(btn){ btn.addEventListener('click', (e)=>{ e.preventDefault(); openModal(); }); }

  async function onPick(type){
    try {
      if(type==='walletconnect'){
        const projectId = (window.APP_STATE?.settings?.wcProjectId) || document.getElementById('wc-project-id')?.value?.trim();
        if(!projectId){ const st=id('connect-status'); if(st) st.textContent='Укажите WalletConnect Project ID в настройках'; return; }
        // динамическая загрузка EIP-1193 провайдера WC
        const mod = await import('https://cdn.jsdelivr.net/npm/@walletconnect/ethereum-provider@2.11.1/dist/index.min.js');
        const EthereumProvider = mod?.EthereumProvider || mod.default;
        const provider = await EthereumProvider.init({ projectId, showQrModal: true, chains: [window.APP_STATE?.settings?.networkId||56] });
        await provider.enable();
        // Сохраняем в APP_STATE и пересоздаем BrowserProvider
        const bp = new ethers.BrowserProvider(provider);
        const signer = await bp.getSigner();
        window.APP_STATE.provider = bp; window.APP_STATE.signer = signer; window.APP_STATE.address = await signer.getAddress();
        const net = await bp.getNetwork(); window.APP_STATE.network = Number(net.chainId);
        updateWalletBadge(); updateNetStatus(); if(window.__refreshWalletBalances) window.__refreshWalletBalances();
        const st = id('connect-status'); if(st) st.textContent='Кошелёк подключён (WalletConnect)';
      } else {
        // для injected: воспользуемся уже существующим connectWallet()
        await window.connectWallet();
      }
      closeModal();
    } catch(e){ const st=id('connect-status'); if(st) st.textContent='Ошибка подключения: '+(e?.message||e); }
  }

  modal.addEventListener('click', (e)=>{ if(e.target === modal) closeModal(); });
  modal.querySelectorAll('[data-connector]')?.forEach(btn=>{
    btn.addEventListener('click', ()=> onPick(btn.getAttribute('data-connector')));
  });
})();
