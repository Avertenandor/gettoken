#!/bin/bash
# Универсальный скрипт запуска для Linux/Mac

echo "🚀 Запуск локального сервера для 'Печать монет'"
echo "📌 Сервер будет доступен по адресу: http://localhost:8080"
echo "🛑 Для остановки нажмите Ctrl+C"
echo ""

# Проверяем наличие Python
if command -v python3 &> /dev/null; then
    echo "✅ Используем Python 3"
    python3 -m http.server 8080
elif command -v python &> /dev/null; then
    echo "✅ Используем Python"
    python -m http.server 8080
else
    echo "❌ Python не найден. Установите Python для запуска сервера."
    echo "   Или используйте альтернативу: npx http-server -p 8080"
    exit 1
fi
