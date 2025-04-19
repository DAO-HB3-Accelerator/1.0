#!/bin/bash

set -e

host="$1"
shift
port="$1"
shift
cmd="$@"

until PGPASSWORD=$DB_PASSWORD psql -h "$host" -U "$DB_USER" -p "$port" -d "$DB_NAME" -c '\q'; do
  >&2 echo "Ожидание подключения к PostgreSQL..."
  sleep 1
done

>&2 echo "PostgreSQL запущен - выполнение команды"
exec $cmd 