// log, id из utils.js
// Каркас верификации контракта на BscScan (или аналогичных) через API

async function verifyContract(){
	if(!APP_STATE.token || !APP_STATE.token.address){ log('Нет токена для верификации','error'); return; }
	if(!APP_STATE.settings.apiKey){ log('Нет API ключа','error'); id('verify-status').textContent='Укажите API ключ в настройках'; return; }
	const statusEl = id('verify-status'); if(statusEl) statusEl.textContent='Отправка на верификацию...';
	// Упрощённо: отправляем минималистичный исходник (тот же, что деплоили)
	try {
		// Здесь должен быть реальный POST на BscScan API. Для продакшен нужно:
		// 1. Собрать параметры sourceCode, contractName, compilerVersion, optimizationUsed, runs
		// 2. Отправить form-data (application/x-www-form-urlencoded)
		// 3. Получить GUID и polling until status
		// Сейчас ставим заглушку (эмуляция):
		await new Promise(r=>setTimeout(r, 1200));
		statusEl.textContent='Запрос принят, ожидание статуса...';
		await new Promise(r=>setTimeout(r, 2000));
		statusEl.textContent='Контракт верифицирован (эмуляция)';
		log('Верификация завершена (эмуляция)');
	} catch(e){
		log('Ошибка верификации: '+e.message,'error');
		if(statusEl) statusEl.textContent='Ошибка верификации: '+e.message;
	}
}

document.getElementById('verify-btn')?.addEventListener('click', verifyContract);
window.__verifyContract = verifyContract;
