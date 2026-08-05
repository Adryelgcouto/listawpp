#!/usr/bin/env bash
# Idempotent, non-blocking startup for Lista Zap (dev server on 0.0.0.0:8080)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

PORT=8080
LOG_FILE="${ROOT}/.dev-server.log"
PID_FILE="${ROOT}/.dev-server.pid"

is_listening() {
  if command -v lsof >/dev/null 2>&1; then
    lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1
    return $?
  fi
  if command -v nc >/dev/null 2>&1; then
    nc -z 127.0.0.1 "$PORT" >/dev/null 2>&1
    return $?
  fi
  return 1
}

if is_listening; then
  echo "[startup] Já rodando em 0.0.0.0:${PORT}"
  exit 0
fi

if [[ -f "$PID_FILE" ]]; then
  OLD_PID="$(cat "$PID_FILE" 2>/dev/null || true)"
  if [[ -n "${OLD_PID}" ]] && kill -0 "$OLD_PID" 2>/dev/null; then
    if is_listening; then
      echo "[startup] PID ${OLD_PID} ativo na porta ${PORT}"
      exit 0
    fi
  fi
  rm -f "$PID_FILE"
fi

if [[ ! -d node_modules ]]; then
  echo "[startup] Instalando dependências..."
  npm i --silent
fi

echo "[startup] Iniciando Vite em 0.0.0.0:${PORT} (background)..."
nohup npm run dev >"$LOG_FILE" 2>&1 &
echo $! >"$PID_FILE"
echo "[startup] PID $(cat "$PID_FILE") — log: $LOG_FILE"
exit 0
