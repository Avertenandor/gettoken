# gettoken.nl – Печать монет

Минималистичный веб-инструмент для мгновенного создания и верификации фиксированного токена (ERC‑20 / BEP‑20).

## Возможности
- Генерация исходника минимального фиксированного ERC-20 контракта
- Компиляция в браузере (Web Worker + solc wasm) – (версию можно расширить)
- Деплой через MetaMask или альтернативное локальное подключение (сид / приватный ключ – временно)
- Авто/ручная верификация на BscScan / Etherscan (автоподбор API ключа: встроенный или пользовательский)
- Управление: balance, transfer, approve, increase/decrease allowance
- Встроенные резервные API ключи (можно заменить своими) – хранятся локально
- Логи + экспорт
- Полный набор SEO / OpenGraph / Twitter / FAQ / Breadcrumb JSON-LD
- PWA manifest, фавиконы, sitemap, robots, humans, security.txt

## Структура
```
index.html         – Основная страница + SEO/OG/LD+JSON
js/app.js          – Логика подключения, деплой, управление
js/verifier.js     – Логика верификации контрактов
js/compiler.worker.js (планируем/добавить при расширении)
css/style.css      – Стили
favicons/          – Иконки
sitemap.xml, robots.txt, site.webmanifest
```

## Быстрый старт локально
Откройте `index.html` в браузере или поднимите статический сервер:
```
# PowerShell
python -m http.server 8080
```
Перейдите в `http://localhost:8080/`.

## Деплой на GitHub Pages
1. Создайте репозиторий `gettoken` (пустой) на GitHub.
2. Выполните команды (HTTPS пример):
```
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/Avertenandor/gettoken.git
git push -u origin main
```
3. В настройках репозитория включите Pages (branch: `main`, папка `/root`).
4. Настройте custom domain `gettoken.nl` и добавьте DNS A/AAAA + CNAME.
5. Замените placeholder verification meta (Google/Yandex).

## Безопасность
- НЕ используйте реальные основные приватные ключи.
- Встроенные ключи только для верификации контрактов, не для кошельков.

## Проверки перед прод
- Заменить `REPLACE-YANDEX-CODE` и `REPLACE-GOOGLE-CODE` реальными кодами.
- Проверить работоспособность верификации (GUID статус).
- Прогнать Lighthouse (Performance/Best Practices/SEO ≥ 90).

## Лицензия
MIT (при необходимости добавьте LICENSE).

## Roadmap (предложения)
- Добавить выбор сети (dropdown)
- Историю деплоев (localStorage)
- Экспорт ABI/bytecode
- Поддержка mint/burn (опционально) с отказом по умолчанию
- Автоматическое создание релизов GitHub Actions

---
Generated draft README. Update по мере развития.
