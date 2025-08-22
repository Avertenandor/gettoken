# Генерация PNG фавиконов

SVG фавикон уже создан (favicon.svg).

Для генерации PNG версий используйте онлайн-конвертер или команды:

## Онлайн конвертер:
1. Откройте https://realfavicongenerator.net/
2. Загрузите favicon.svg
3. Скачайте пакет с PNG файлами

## Или используйте ImageMagick:
```bash
# Установите ImageMagick если нет
# Windows: choco install imagemagick
# Linux: sudo apt-get install imagemagick

# Генерация PNG файлов разных размеров
convert favicon.svg -resize 16x16 favicon-16.png
convert favicon.svg -resize 32x32 favicon-32.png
convert favicon.svg -resize 192x192 favicon-192.png
convert favicon.svg -resize 512x512 favicon-512.png
```

## Временное решение - создание заглушек:
Пока PNG файлы не сгенерированы, создаём пустые файлы чтобы избежать 404 ошибок.
