#!/bin/bash

# Создаем новую ветку для безопасности
git checkout -b fix-commit-messages

# Сохраняем текущее состояние
git checkout main
git branch backup-history

# Создаем новую историю с правильными сообщениями
git checkout -B new-history b56e6b5e4
git commit --amend -m "Initial commit"

# Создаем один сборный коммит для всех коммитов "Описание изменений"
git checkout main -- .
git add .
git commit -m "Разработка основного функционала"

# Создаем коммит для удаления .cursor из репозитория
git checkout 59de0b75d -- .
git add .
git commit -m "Удалена директория .cursor из репозитория"

# Применяем новую историю
echo "Готово. Теперь вы можете проверить историю коммитов командой 'git log'"
echo "Если всё в порядке, выполните:"
echo "git checkout main"
echo "git reset --hard new-history"
echo "git push origin main --force"
echo "ВНИМАНИЕ: force push изменит историю репозитория. Убедитесь, что другие разработчики знают об этом." 