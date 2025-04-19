#!/bin/bash

# Создаем резервную копию ветки main
git branch backup_main main

# Используем filter-branch для изменения сообщений коммитов
# Заменяем "ваше сообщение коммита" на "Development commit"
git filter-branch --msg-filter '
    sed -e "s/ваше сообщение коммита/Development commit/g"
' -- --all

# Заменяем "Удалены логи из отслеживания Git" на "Remove logs from Git tracking"
git filter-branch --msg-filter '
    sed -e "s/Удалены логи из отслеживания Git/Remove logs from Git tracking/g"
' -- --all

# Заменяем другие сообщения по необходимости
git filter-branch --msg-filter '
    sed -e "s/Удалил .env файлы из отслеживания Git для безопасности/Remove .env files for security/g"
' -- --all

git filter-branch --msg-filter '
    sed -e "s/Добавлены расширенные .gitignore файлы и .dockerignore для безопасности/Add enhanced .gitignore and .dockerignore for security/g"
' -- --all

git filter-branch --msg-filter '
    sed -e "s/Добавлена Docker-конфигурация для запуска проекта одной командой/Add Docker configuration for single-command project launch/g"
' -- --all

echo "История очищена. Проверьте её с помощью 'git log'"
echo "Если всё в порядке, выполните:"
echo "git push origin main --force"
echo "ВНИМАНИЕ: force push изменит историю репозитория. Убедитесь, что другие разработчики знают об этом." 