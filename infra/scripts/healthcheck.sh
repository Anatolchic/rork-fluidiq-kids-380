#!/bin/bash
# Проверяет 5 endpoint, при недоступности шлёт в TG алерт.
LOG=/var/log/repetitory-health.log
TG_TOKEN=$(grep -E "^TG_BOT_TOKEN=" /opt/supabase-repetitory/docker/.env 2>/dev/null | cut -d= -f2 | tr -d "\"")
OWNER_TG=249568618

check() {
  local name=$1 url=$2 expected=$3
  local code=$(curl -s -o /dev/null -w "%{http_code}" -m 8 "$url")
  if [[ "$code" != "$expected" ]]; then
    echo "$(date -Iseconds) FAIL $name: got $code expected $expected" >> $LOG
    if [ -n "$TG_TOKEN" ]; then
      curl -s -m 5 "https://api.telegram.org/bot$TG_TOKEN/sendMessage" \
        -d "chat_id=$OWNER_TG" \
        --data-urlencode "text=⚠️ Репетиторы: $name недоступен (HTTP $code)" > /dev/null
    fi
    return 1
  fi
  return 0
}

check "Web" "https://web.repetitory-app.ru/" "200"
check "Supabase Auth" "https://supabase.repetitory-app.ru/auth/v1/settings" "401"
check "Supabase REST" "https://supabase.repetitory-app.ru/rest/v1/" "200"
check "Edge Functions" "https://supabase.repetitory-app.ru/functions/v1/calendar-ics" "401"
