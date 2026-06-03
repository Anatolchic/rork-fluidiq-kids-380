# Установка Caddy + rate-limit для Репетиторов

VPS: `5.35.86.239` (Beget, чистый RU-IP, Ubuntu 22.04+).
Цель: собрать Caddy с плагином `mholt/caddy-ratelimit`, поставить в systemd,
подложить `Caddyfile.repetitory`, перезапустить.

---

## 0. Предусловия

- На сервере открыты в UFW только: `22/tcp`, `80/tcp`, `443/tcp`.
- DNS A-записи `repetitory-app.ru`, `www`, `supabase`, `web` уже смотрят на IP сервера (DNS-only, без CF-proxy — урок проекта).
- Supabase Kong слушает `127.0.0.1:8000`.
- Лендинг лежит в `/var/www/repetitory-web/`, Expo Web build — в `/var/www/repetitory-expo-web/`.

---

## 1. Установка `xcaddy` (сборщик Caddy с плагинами)

```bash
# Go (нужен для xcaddy)
sudo apt-get update
sudo apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl

# Официальный репозиторий Caddy (для зависимостей + apt-юзера caddy)
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt-get update
sudo apt-get install -y caddy

# Go 1.22+ для xcaddy
sudo apt-get install -y golang-go

# xcaddy
go install github.com/caddyserver/xcaddy/cmd/xcaddy@latest
sudo mv ~/go/bin/xcaddy /usr/local/bin/
xcaddy version
```

---

## 2. Сборка Caddy с плагином `caddy-ratelimit`

```bash
cd /tmp
xcaddy build \
  --with github.com/mholt/caddy-ratelimit

# Проверяем что плагин внутри
./caddy list-modules | grep ratelimit
# должно вывести: http.handlers.rate_limit
```

Подменяем системный бинарь:

```bash
# Бэкап перед заменой (слёзное правило: бэкап ПЕРЕД)
sudo cp /usr/bin/caddy /usr/bin/caddy.bak.$(date +%s)

sudo systemctl stop caddy
sudo mv ./caddy /usr/bin/caddy
sudo setcap 'cap_net_bind_service=+ep' /usr/bin/caddy
caddy version
```

---

## 3. Подкладываем Caddyfile

```bash
# Бэкап текущего конфига
sudo cp /etc/caddy/Caddyfile /etc/caddy/Caddyfile.bak.$(date +%s) 2>/dev/null || true

# Копируем наш файл (из репо)
sudo cp /path/to/repo/infra/caddy/Caddyfile.repetitory /etc/caddy/Caddyfile

# Каталог логов
sudo mkdir -p /var/log/caddy
sudo chown caddy:caddy /var/log/caddy

# Валидация синтаксиса
sudo caddy validate --config /etc/caddy/Caddyfile
```

Если `validate` зелёный — поехали:

```bash
sudo systemctl restart caddy
sudo systemctl status caddy --no-pager
sudo journalctl -u caddy -n 50 --no-pager
```

---

## 4. Проверка rate-limit вживую

Auth-зона должна задушить на 6-м запросе за минуту:

```bash
for i in {1..7}; do
  curl -s -o /dev/null -w "req $i: %{http_code}\n" \
    -X POST https://supabase.repetitory-app.ru/auth/v1/token?grant_type=password \
    -H "apikey: $SUPABASE_ANON_KEY" \
    -H "Content-Type: application/json" \
    -d '{"email":"x@x.x","password":"wrong"}'
done
# ожидание: req 1..5 → 400, req 6..7 → 429
```

RPC-зона (60/мин):

```bash
for i in {1..65}; do
  curl -s -o /dev/null -w "%{http_code} " \
    https://supabase.repetitory-app.ru/rest/v1/rpc/ping \
    -H "apikey: $SUPABASE_ANON_KEY"
done
# в конце должны посыпаться 429
```

---

## 5. Обновление в будущем

При апдейте Caddy:

```bash
cd /tmp
xcaddy build --with github.com/mholt/caddy-ratelimit
sudo cp /usr/bin/caddy /usr/bin/caddy.bak.$(date +%s)
sudo systemctl stop caddy
sudo mv ./caddy /usr/bin/caddy
sudo setcap 'cap_net_bind_service=+ep' /usr/bin/caddy
sudo systemctl start caddy
```

---

## 6. Откат если что-то пошло не так

```bash
sudo systemctl stop caddy
sudo cp /usr/bin/caddy.bak.<timestamp> /usr/bin/caddy
sudo cp /etc/caddy/Caddyfile.bak.<timestamp> /etc/caddy/Caddyfile
sudo systemctl start caddy
```
