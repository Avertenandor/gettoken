// connectors.js - модуль выбора способа подключения (инжект/WalletConnect/Coinbase)
// Лёгкая реализация модального окна выбора и WalletConnect через @walletconnect/ethereum-provider (подключается динамически)

(function(){
  const modal = document.getElementById('connect-modal');
  if(!modal){ return; }

  const closeBtn = document.getElementById('connect-modal-close');
  function openModal(){ modal.style.display='flex'; }
  function closeModal(){ modal.style.display='none'; }
  if(closeBtn) closeBtn.addEventListener('click', closeModal);

  const btn = document.getElementById('btn-connect');
  if(btn){ btn.addEventListener('click', (e)=>{ e.preventDefault(); openModal(); }); }

  // Единая функция выбора способа подключения (без ESM-импортов)
  async function onPick(type){
    try {
      if(type==='walletconnect'){
        const projectId = (window.APP_STATE?.settings?.wcProjectId) || document.getElementById('wc-project-id')?.value?.trim();
        if(!projectId){ const st=id('connect-status'); if(st) st.textContent='Укажите WalletConnect Project ID в настройках'; return; }

        // Используем UMD-скрипт, подключённый в index.html
        const EthereumProvider = (window.WalletConnectEthereumProvider && (window.WalletConnectEthereumProvider.default||window.WalletConnectEthereumProvider)) || window.EthereumProvider;
        if(!EthereumProvider){ const st=id('connect-status'); if(st) st.textContent='WalletConnect провайдер не загружен'; return; }

        const chainId = Number(window.APP_STATE?.settings?.networkId || 56);
        const provider = await EthereumProvider.init({ projectId, showQrModal: true, chains: [chainId] });
        await provider.enable(); // откроет QR-модалку

        // Оборачиваем в ethers провайдер
        const bp = new ethers.BrowserProvider(provider);
        const signer = await bp.getSigner();
        window.APP_STATE.provider = bp;
        window.APP_STATE.signer = signer;
        window.APP_STATE.address = await signer.getAddress();
        const net = await bp.getNetwork();
        window.APP_STATE.network = Number(net.chainId);
        updateWalletBadge();
        updateNetStatus();
        if(window.__refreshWalletBalances) window.__refreshWalletBalances();
        const st = id('connect-status'); if(st) st.textContent='Кошелёк подключён (WalletConnect)';
      } else {
        const map = { metamask:'metamask', okx:'okx', trust:'trust', binance:'binance', coinbase:'coinbase' };
        try{
          await window.connectWallet(map[type] || undefined);
        }catch(e){
          if((map[type]||'')==='binance'){
            const st=id('connect-status');
            if(st){ st.textContent='Binance Wallet может работать нестабильно в этом браузере. Рекомендуем MetaMask / OKX / Trust или QR (WalletConnect).'; }
          }
          throw e;
        }
      }
      closeModal();
    } catch(e){
      const st=id('connect-status'); if(st) st.textContent='Ошибка подключения: '+(e?.message||e);
      console.error('Wallet connect error:', e);
    }
  }

  modal.addEventListener('click', (e)=>{ if(e.target === modal) closeModal(); });
  modal.querySelectorAll('[data-connector]')?.forEach(btn=>{
    btn.addEventListener('click', ()=> onPick(btn.getAttribute('data-connector')));
  });
})();
