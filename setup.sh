#!/bin/bash

# Вывод цветного текста
print_green() {
  echo -e "\e[32m$1\e[0m"
}

print_blue() {
  echo -e "\e[34m$1\e[0m"
}

print_yellow() {
  echo -e "\e[33m$1\e[0m"
}

print_red() {
  echo -e "\e[31m$1\e[0m"
}

# Проверка установки Docker и Docker Compose
check_docker() {
  print_blue "Проверка наличия Docker..."
  if ! command -v docker &> /dev/null; then
    print_yellow "Docker не установлен. Установите Docker перед запуском."
    print_yellow "Инструкции по установке: https://docs.docker.com/get-docker/"
    exit 1
  fi
  print_green "Docker установлен."

  print_blue "Проверка Docker Compose..."
  if ! docker compose version &> /dev/null; then
    print_yellow "Docker Compose не установлен или требуется обновление."
    print_yellow "Инструкции по установке: https://docs.docker.com/compose/install/"
    exit 1
  fi
  print_green "Docker Compose установлен."
}

# Проверка и создание .env файлов
check_env_files() {
  print_blue "Проверка наличия файлов конфигурации..."
  
  # Проверяем backend/.env
  if [ ! -f backend/.env ]; then
    if [ -f backend/.env.example ]; then
      print_yellow "Файл backend/.env не найден. Создаю из примера..."
      cp backend/.env.example backend/.env
      print_green "Файл backend/.env создан. Рекомендуется настроить его вручную."
    else
      print_red "Файл backend/.env.example не найден. Невозможно создать файл конфигурации."
      exit 1
    fi
  else
    print_green "Файл backend/.env уже существует."
  fi
  
  # Проверяем frontend/.env
  if [ ! -f frontend/.env ]; then
    if [ -f frontend/.env.example ]; then
      print_yellow "Файл frontend/.env не найден. Создаю из примера..."
      cp frontend/.env.example frontend/.env
      print_green "Файл frontend/.env создан. Рекомендуется настроить его вручную."
    else
      print_red "Файл frontend/.env.example не найден. Невозможно создать файл конфигурации."
      exit 1
    fi
  else
    print_green "Файл frontend/.env уже существует."
  fi
  
  print_blue "Проверка файлов конфигурации завершена."
  print_yellow "ВАЖНО: По соображениям безопасности используйте свои значения для паролей и ключей в .env файлах."
}

# Предварительная загрузка образов
pull_images() {
  print_blue "Предварительная загрузка образов Docker..."
  
  images=("node:20-alpine" "postgres:16-alpine" "ollama/ollama:latest" "curlimages/curl:latest")
  
  for img in "${images[@]}"; do
    print_blue "Загрузка образа: $img"
    docker pull $img
    if [ $? -ne 0 ]; then
      print_yellow "Предупреждение: Не удалось загрузить образ $img, но продолжаем работу..."
    else
      print_green "Образ $img успешно загружен."
    fi
  done
}

# Запуск проекта
start_project() {
  print_blue "Запуск проекта..."
  
  # Сначала убедимся, что предыдущие контейнеры остановлены
  print_blue "Остановка существующих контейнеров..."
  docker compose down
  
  # Запуск сервисов в Docker Compose
  print_blue "Запуск сервисов (PostgreSQL, Ollama, Backend, Frontend)..."
  docker compose up -d
  
  # Проверяем, что сервисы запустились
  if [ $? -eq 0 ]; then
    print_green "Сервисы успешно запущены!"
    print_green "----------------------------------------"
    print_green "Проект DApp-for-Business доступен по адресам:"
    print_green "Frontend: http://localhost:5173"
    print_green "Backend API: http://localhost:8000"
    print_green "Ollama API: http://localhost:11434"
    print_green "PostgreSQL: localhost:5432"
    print_green "----------------------------------------"
    print_green "Загрузка модели qwen2.5:7b может занять некоторое время..."
    print_green "Вы можете проверить статус загрузки модели командой:"
    print_green "docker logs -f dapp-ollama-setup"
    print_green "----------------------------------------"
  else
    print_red "Произошла ошибка при запуске сервисов."
    print_yellow "Проверьте логи командой: docker compose logs"
    print_yellow "Для просмотра логов конкретного сервиса: docker compose logs [service]"
    print_yellow "Например: docker compose logs backend"
  fi
}

# Основная функция
main() {
  print_blue "==============================================="
  print_blue "   Установка и запуск DApp-for-Business"
  print_blue "==============================================="
  
  check_docker
  check_env_files
  pull_images
  start_project
}

# Запуск основной функции
main 