# Инструкция по деплою на GitHub Pages

## Шаг 1: Создание репозитория
1. Зайдите на GitHub.com
2. Создайте новый репозиторий с именем `gettoken`
3. НЕ инициализируйте с README (у нас уже есть)

## Шаг 2: Загрузка кода
```bash
# В папке проекта выполните:
git init
git add .
git commit -m "Initial commit: Печать монет v2.0"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/gettoken.git
git push -u origin main
```

## Шаг 3: Включение GitHub Pages
1. Откройте Settings репозитория
2. Найдите раздел "Pages" в левом меню
3. Source: выберите "Deploy from a branch"
4. Branch: выберите "main" и папку "/ (root)"
5. Нажмите Save

## Шаг 4: Настройка кастомного домена (если есть)
1. В разделе Pages добавьте ваш домен: gettoken.nl
2. Дождитесь проверки DNS (может занять до 24 часов)
3. Включите "Enforce HTTPS"

## Шаг 5: Проверка
- Сайт будет доступен по адресу: https://YOUR_USERNAME.github.io/gettoken/
- Или по вашему домену если настроен: https://gettoken.nl

## Автоматический деплой
При каждом push в main ветку сайт автоматически обновится.

## Важные файлы для GitHub Pages:
- `CNAME` - для кастомного домена (уже есть)
- `index.html` - главная страница (есть)
- `.nojekyll` - отключает Jekyll обработку (нужно создать)

## Создание .nojekyll:
```bash
touch .nojekyll
git add .nojekyll
git commit -m "Add .nojekyll for GitHub Pages"
git push
```

## Troubleshooting:
- Если сайт не открывается, проверьте настройки Pages
- Убедитесь что в корне есть index.html
- Проверьте консоль браузера на ошибки CSP
- DNS изменения могут занять до 24-48 часов
