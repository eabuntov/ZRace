#!/usr/bin/env bash
#
# Deploy ZRace to a fresh Ubuntu machine behind nginx.
#
#   sudo tools/deploy.sh                                   # http://<this box>/
#   sudo tools/deploy.sh -d zrace.example.com --tls -e me@example.com
#   sudo ./deploy.sh --repo https://github.com/eabuntov/ZRace.git
#
# The game has no build step - it is index.html plus css/, js/ and assets/ - so
# deploying means installing nginx, copying those four things somewhere it
# serves from, and handing it a config that gets the details right: the media
# type of a .glb, pre-compressed copies of the files worth compressing, and
# cache headers that cannot serve a stale ES module against a fresh one.
#
# Run it again to publish changes. It is idempotent, and anything deleted from
# the source is deleted from the served copy.

set -euo pipefail

SELF=$(readlink -f "$0")
SRCDIR=$(dirname "$(dirname "$SELF")")      # the repo, one level above tools/
ARGV=("$@")                                 # kept intact for the sudo re-exec

DOMAIN=""
EMAIL=""
WEBROOT="/var/www/zrace"
SOURCE=""
REPO=""
BRANCH=""
PORT=80
SITE="zrace"
WANT_TLS=0
KEEP_DEFAULT=0
WANT_SCORES=0
SCORES_DB="/var/lib/zrace/zrace.db"
SCORES_PORT=8011
SCORES_USER="zrace"
# Deliberately not under $WEBROOT: nginx serves that directory, and a record board whose
# source and validator thresholds can be fetched over HTTP is not one you want.
SCORES_DIR="/opt/zrace"

usage() {
  cat <<'USAGE'
Usage: sudo deploy.sh [options]

  -d, --domain NAME    serve this host name (default: answer on any name)
  -e, --email ADDR     contact address for Let's Encrypt
      --tls            obtain a certificate with certbot and redirect to https
                       (needs --domain and --email, and port 80 reachable)
  -s, --source DIR     copy the game from here (default: this checkout)
      --repo URL       clone the game from git instead of copying a checkout
      --branch NAME    branch to clone with --repo (default: the repo's own)
  -r, --webroot DIR    where to install it (default: /var/www/zrace)
  -p, --port N         plain-HTTP port to listen on (default: 80)
  -n, --name NAME      nginx site file name (default: zrace)
      --scores         also install the global record board: a small Python service
                       over SQLite, behind /api/ on this same host
      --scores-db PATH where the record database lives (default: /var/lib/zrace/zrace.db)
      --keep-default   leave nginx's default welcome site enabled
  -h, --help           this message
USAGE
}

if [ -t 1 ]; then
  BOLD=$(printf '\033[1m'); GREEN=$(printf '\033[32m')
  YELLOW=$(printf '\033[33m'); RED=$(printf '\033[31m'); OFF=$(printf '\033[0m')
else
  BOLD=""; GREEN=""; YELLOW=""; RED=""; OFF=""
fi
log()  { printf '%s==>%s %s\n' "$GREEN$BOLD" "$OFF" "$*"; }
warn() { printf '%swarning:%s %s\n' "$YELLOW$BOLD" "$OFF" "$*" >&2; }
die()  { printf '%serror:%s %s\n' "$RED$BOLD" "$OFF" "$*" >&2; exit 1; }

while [ $# -gt 0 ]; do
  case "$1" in
    -d|--domain)    DOMAIN=${2:?--domain needs a host name};   shift 2 ;;
    -e|--email)     EMAIL=${2:?--email needs an address};      shift 2 ;;
    --tls)          WANT_TLS=1;                                shift ;;
    -s|--source)    SOURCE=${2:?--source needs a directory};   shift 2 ;;
    --repo)         REPO=${2:?--repo needs a URL};             shift 2 ;;
    --branch)       BRANCH=${2:?--branch needs a name};        shift 2 ;;
    -r|--webroot)   WEBROOT=${2:?--webroot needs a directory}; shift 2 ;;
    -p|--port)      PORT=${2:?--port needs a number};          shift 2 ;;
    -n|--name)      SITE=${2:?--name needs a site name};       shift 2 ;;
    --scores)       WANT_SCORES=1;                             shift ;;
    --scores-db)    SCORES_DB=${2:?--scores-db needs a path};  shift 2 ;;
    --keep-default) KEEP_DEFAULT=1;                            shift ;;
    -h|--help)      usage; exit 0 ;;
    *)              usage >&2; die "unknown option: $1" ;;
  esac
done

if [ -n "$SOURCE" ] && [ -n "$REPO" ]; then
  die "--source and --repo are alternatives; pick one"
fi
case "$PORT" in ''|*[!0-9]*) die "--port wants a number, not '$PORT'" ;; esac
if [ "$WANT_TLS" -eq 1 ]; then
  [ -n "$DOMAIN" ] || die "--tls needs --domain: Let's Encrypt issues for a name, not an IP"
  [ -n "$EMAIL" ]  || die "--tls needs --email, for the expiry notices"
  [ "$PORT" -eq 80 ] || die "--tls needs port 80: that is where the ACME challenge arrives"
fi

# ---------------------------------------------------------------- the machine

if [ "$(id -u)" -ne 0 ]; then
  command -v sudo >/dev/null 2>&1 || die "run this as root"
  log "not root; re-running under sudo"
  exec sudo -- "$SELF" ${ARGV[@]+"${ARGV[@]}"}
fi

DISTRO=$(. /etc/os-release 2>/dev/null && printf '%s' "${ID:-}")
PRETTY=$(. /etc/os-release 2>/dev/null && printf '%s' "${PRETTY_NAME:-}")
PRETTY=${PRETTY:-this system}
case "$DISTRO" in
  ubuntu|debian) ;;
  *) warn "written for Ubuntu; on $PRETTY the package names may differ" ;;
esac

PKGS=(nginx rsync)
[ -n "$REPO" ] && PKGS+=(git)
[ "$WANT_SCORES" -eq 1 ] && PKGS+=(python3)
[ "$WANT_TLS" -eq 1 ] && PKGS+=(certbot python3-certbot-nginx)

log "installing ${PKGS[*]}"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq "${PKGS[@]}"

# ---------------------------------------------------------------- the payload

CLONE=""
STAGE=$(mktemp -d)
cleanup() { rm -rf "$STAGE" ${CLONE:+"$CLONE"}; }
trap cleanup EXIT

if [ -n "$REPO" ]; then
  CLONE=$(mktemp -d)
  log "cloning $REPO"
  git clone --depth 1 ${BRANCH:+--branch "$BRANCH"} -- "$REPO" "$CLONE/game" \
    || die "could not clone $REPO${BRANCH:+ (branch $BRANCH)}"
  SOURCE="$CLONE/game"
else
  SOURCE=${SOURCE:-$SRCDIR}
fi

SOURCE=$(readlink -f "$SOURCE")
if [ ! -f "$SOURCE/index.html" ] || [ ! -f "$SOURCE/js/main.js" ]; then
  die "$SOURCE does not look like ZRace: no index.html and js/main.js in it"
fi

# An allow list, not an ignore list. models/ alone is 177 MB of third-party
# reference scans that nothing at run time loads and that we have no business
# republishing; venv/ and tools/ have no place on a public server either.
log "staging the game from $SOURCE"
for item in index.html favicon.ico favicon.svg css js assets; do
  if [ -e "$SOURCE/$item" ]; then
    cp -a "$SOURCE/$item" "$STAGE/"
  else
    warn "no $item in the source; skipping it"
  fi
done

# Compress once here rather than on every request: gzip_static then serves the
# .gz straight off disk. It earns its keep on the car models, where the Seal's
# 4.6 MB comes down to 3.3 MB.
log "pre-compressing"
while IFS= read -r -d '' f; do
  gzip -9 -k -f -- "$f"
  # A .gz that saves nothing just costs a stat() per request.
  if [ "$(stat -c %s -- "$f.gz")" -ge "$(stat -c %s -- "$f")" ]; then
    rm -f -- "$f.gz"
  fi
done < <(find "$STAGE" -type f -size +1k \
           \( -name '*.html' -o -name '*.css' -o -name '*.js' -o -name '*.svg' \
              -o -name '*.json' -o -name '*.glb' \) -print0)

log "publishing to $WEBROOT"
mkdir -p "$WEBROOT"
rsync -a --delete "$STAGE/" "$WEBROOT/"
# nginx only ever reads these, so leave them owned by root and world-readable.
chown -R root:root "$WEBROOT"
find "$WEBROOT" -type d -exec chmod 755 {} +
find "$WEBROOT" -type f -exec chmod 644 {} +

# ----------------------------------------------------------------- the config

if [ -n "$DOMAIN" ]; then
  SERVER_NAME="$DOMAIN"
  DEFAULT_SERVER=""
else
  # Nothing else is on the box, so answer to whatever name the request carries.
  SERVER_NAME="_"
  DEFAULT_SERVER=" default_server"
fi

# The /api/ proxy, built here rather than inline so the site template stays readable.
# It is empty unless --scores was asked for, and a nginx config with a blank line in it
# is still a nginx config.
API_LOCATION=""
if [ "$WANT_SCORES" -eq 1 ]; then
  API_LOCATION=$(cat <<API
    # The record board: server/scores.py over SQLite. It listens on loopback and has
    # no authentication of its own, so it is reached through here and never directly.
    location /api/ {
        proxy_pass http://127.0.0.1:$SCORES_PORT;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-For \$remote_addr;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_connect_timeout 3s;
        proxy_read_timeout 10s;
        # a leaderboard is not worth a 502 page, and the game copes with silence
        proxy_intercept_errors off;
    }
API
)
fi

AVAILABLE="/etc/nginx/sites-available/$SITE"
log "writing $AVAILABLE"
cat > "$AVAILABLE" <<EOF
# ZRace - written by tools/deploy.sh, overwritten every time it runs.

server {
    listen $PORT$DEFAULT_SERVER;
    listen [::]:$PORT$DEFAULT_SERVER;
    server_name $SERVER_NAME;

    root $WEBROOT;
    index index.html;

    # nginx's default charset_types leaves out CSS and SVG, so a stylesheet
    # would go out with no encoding and fall back to whatever the page that
    # linked it used. Name them and the question never comes up.
    charset utf-8;
    charset_types text/css text/plain text/xml image/svg+xml
                  application/javascript application/json;

    access_log /var/log/nginx/$SITE.access.log;
    error_log  /var/log/nginx/$SITE.error.log;

    # Serve the deploy-time .gz where there is one, compress the rest on the fly.
    gzip            on;
    gzip_static     on;
    gzip_vary       on;
    gzip_comp_level 6;
    gzip_min_length 1024;
    gzip_types text/plain text/css application/javascript text/javascript
               image/svg+xml application/json model/gltf-binary;

    # No file name here carries a content hash, and the ES modules import one
    # another, so a cached main.js against a fresh carModel.js does not fail
    # quietly: it fails with "does not provide an export named ...". Make the
    # browser revalidate - with ETags that is a 304 when nothing has changed.
    add_header Cache-Control "no-cache" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # Ubuntu's mime.types predates glTF. An add_header inside a location drops
    # every inherited one, which is why the three above are repeated here.
    location ~* \.glb\$ {
        types { }
        default_type model/gltf-binary;
        add_header Cache-Control "no-cache" always;
        add_header X-Content-Type-Options "nosniff" always;
        add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    }

$API_LOCATION    location = /favicon.ico { access_log off; log_not_found off; }

    location ~ /\\. { deny all; }

    location / {
        try_files \$uri \$uri/ =404;
    }
}
EOF

ln -sfn "$AVAILABLE" "/etc/nginx/sites-enabled/$SITE"

# Only when this site is the catch-all on port 80 does nginx's stock welcome
# site get in the way - two default_server blocks on one port and nginx refuses
# to start. On another port, or under a host name, it is none of our business.
if [ "$PORT" -eq 80 ] && [ -z "$DOMAIN" ] \
   && [ -L /etc/nginx/sites-enabled/default ] && [ "$KEEP_DEFAULT" -eq 0 ]; then
  rm -f /etc/nginx/sites-enabled/default
  log "disabled nginx's default welcome site, which also claims port 80 (--keep-default keeps it)"
fi

log "checking the config"
nginx -t
systemctl enable --now nginx >/dev/null 2>&1 || die "nginx would not start"
systemctl reload nginx

# ------------------------------------------------------------ the record board

if [ "$WANT_SCORES" -eq 1 ]; then
  # Its own unprivileged account, owning only the directory the database sits in.
  # A leaderboard that can write anywhere else is a leaderboard that can be used
  # to write anywhere else.
  id -u "$SCORES_USER" >/dev/null 2>&1 || {
    log "creating system user $SCORES_USER"
    useradd --system --no-create-home --shell /usr/sbin/nologin "$SCORES_USER"
  }
  install -d -o "$SCORES_USER" -g "$SCORES_USER" -m 750 "$(dirname "$SCORES_DB")"

  [ -f "$SOURCE/server/scores.py" ] || die "server/scores.py is missing from $SOURCE - is the source tree complete?"
  [ -f "$SOURCE/server/floors.json" ] || die "server/floors.json is missing - generate it with: node tools/lap_floors.mjs"
  log "installing the board service to $SCORES_DIR"
  install -d -m 755 "$SCORES_DIR/server"
  install -m 644 "$SOURCE/server/scores.py" "$SOURCE/server/floors.json" "$SCORES_DIR/server/"

  UNIT=/etc/systemd/system/zrace-scores.service
  log "writing $UNIT"
  cat > "$UNIT" <<UNITEOF
# ZRace record board - written by tools/deploy.sh, overwritten every time it runs.
[Unit]
Description=ZRace global record board
After=network.target
Before=nginx.service

[Service]
Type=simple
User=$SCORES_USER
Group=$SCORES_USER
ExecStart=/usr/bin/python3 $SCORES_DIR/server/scores.py --host 127.0.0.1 --port $SCORES_PORT --db $SCORES_DB --floors $SCORES_DIR/server/floors.json
Restart=on-failure
RestartSec=2

# It reads a JSON file, writes one database and answers on loopback. Nothing else.
NoNewPrivileges=yes
PrivateTmp=yes
PrivateDevices=yes
ProtectSystem=strict
ProtectHome=yes
ProtectKernelTunables=yes
ProtectKernelModules=yes
ProtectControlGroups=yes
RestrictAddressFamilies=AF_INET AF_INET6
RestrictNamespaces=yes
LockPersonality=yes
MemoryDenyWriteExecute=yes
ReadWritePaths=$(dirname "$SCORES_DB")

[Install]
WantedBy=multi-user.target
UNITEOF

  systemctl daemon-reload
  systemctl enable --now zrace-scores >/dev/null 2>&1 || true
  systemctl restart zrace-scores
  sleep 1
  if systemctl is-active --quiet zrace-scores; then
    log "record board running on 127.0.0.1:$SCORES_PORT, database $SCORES_DB"
  else
    warn "the record board did not start; see: journalctl -u zrace-scores -n 40"
  fi
elif systemctl list-unit-files 2>/dev/null | grep -q '^zrace-scores\.service'; then
  # Deployed with --scores once and without it now: stop serving a board the site
  # no longer proxies to, but leave the database where it is.
  log "--scores not given; stopping the record board (its database is untouched)"
  systemctl disable --now zrace-scores >/dev/null 2>&1 || true
fi

# --------------------------------------------------------------- firewall, TLS

if command -v ufw >/dev/null 2>&1 && ufw status 2>/dev/null | grep -q '^Status: active'; then
  if [ "$PORT" -eq 80 ]; then
    ufw allow 'Nginx Full' >/dev/null && log "opened ports 80 and 443 in ufw"
  else
    ufw allow "$PORT/tcp" >/dev/null && log "opened port $PORT in ufw"
  fi
fi

# The config above is rewritten from scratch on every run, which throws away the
# ssl block certbot added last time. So if this host already has a certificate,
# put it back whether or not --tls was passed - otherwise a second run would
# quietly drop the site to plain HTTP.
if [ "$WANT_TLS" -eq 0 ] && [ -n "$DOMAIN" ] && [ -d "/etc/letsencrypt/live/$DOMAIN" ]; then
  log "$DOMAIN already has a certificate; re-applying it to the new config"
  WANT_TLS=1
fi

if [ "$WANT_TLS" -eq 1 ]; then
  command -v certbot >/dev/null 2>&1 || apt-get install -y -qq certbot python3-certbot-nginx
  log "installing a Let's Encrypt certificate for $DOMAIN"
  # --keep-until-expiring makes the re-run above a no-op at the CA: it reuses
  # the certificate on disk and only rewrites the nginx config.
  certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --redirect \
    --keep-until-expiring ${EMAIL:+-m "$EMAIL"} ${EMAIL:+--no-eff-email} \
    || die "certbot failed - check that $DOMAIN resolves to this machine and port 80 is reachable, then re-run"
  systemctl reload nginx
fi

# ---------------------------------------------------------------------- done

if [ -n "$DOMAIN" ]; then
  if [ "$WANT_TLS" -eq 1 ]; then URL="https://$DOMAIN"; else URL="http://$DOMAIN"; fi
  [ "$PORT" -eq 80 ] || URL="$URL:$PORT"
else
  IP=$(hostname -I 2>/dev/null | awk '{print $1}')
  URL="http://${IP:-localhost}"
  [ "$PORT" -eq 80 ] || URL="$URL:$PORT"
fi

SIZE=$(du -sh "$WEBROOT" | cut -f1)
cat <<EOF

${GREEN}${BOLD}ZRace is live at $URL${OFF}

  files    $WEBROOT ($SIZE)
  config   $AVAILABLE
  logs     /var/log/nginx/$SITE.{access,error}.log

three.js comes from jsdelivr through the import map in index.html, so this box
serves the game but the player's browser still has to reach that CDN.

Publish a change by re-running this script.
EOF
