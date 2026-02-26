#!/usr/bin/env bash
set -euo pipefail

# ------------------------------------------------------------------
# lightsail-panel setup script
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/onvad/lightsail-panel/main/setup.sh | sudo bash
#   or:
#   git clone https://github.com/Mixpeal/lightsail-panel && cd lightsail-panel && sudo bash setup.sh
# ------------------------------------------------------------------

REPO_URL="https://github.com/Mixpeal/lightsail-panel.git"
INSTALL_DIR="/opt/lightsail-panel"
SERVICE_USER="panel"
SERVICE_NAME="lightsail-panel"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

info()  { echo -e "${GREEN}[INFO]${NC} $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*" >&2; }

# Must run as root
if [ "$(id -u)" -ne 0 ]; then
  error "This script must be run as root. Use: sudo bash setup.sh"
  exit 1
fi

# Check for bun
if ! command -v bun &>/dev/null; then
  if [ -x /usr/local/bin/bun ]; then
    BUN=/usr/local/bin/bun
  else
    error "Bun is required but not found. Install: curl -fsSL https://bun.sh/install | bash"
    exit 1
  fi
else
  BUN=$(command -v bun)
fi

info "Using bun at: $BUN"

# ---- 1. Create system user -------------------------------------------
if ! id "$SERVICE_USER" &>/dev/null; then
  info "Creating system user: $SERVICE_USER"
  useradd --system --no-create-home --shell /usr/sbin/nologin "$SERVICE_USER"
else
  info "User $SERVICE_USER already exists"
fi

# ---- 2. Install to /opt/lightsail-panel ------------------------------
if [ -d "$INSTALL_DIR" ]; then
  info "Updating existing installation at $INSTALL_DIR"
  cd "$INSTALL_DIR"
  if [ -d ".git" ]; then
    git pull origin main
  fi
else
  # Detect if running from a cloned repo (local install) or piped from curl
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" 2>/dev/null && pwd)" || SCRIPT_DIR=""

  if [ -n "$SCRIPT_DIR" ] && [ -f "$SCRIPT_DIR/package.json" ]; then
    info "Installing from local copy..."
    cp -r "$SCRIPT_DIR" "$INSTALL_DIR"
  else
    info "Cloning from $REPO_URL..."
    if ! command -v git &>/dev/null; then
      error "Git is required. Install: sudo apt-get install -y git"
      exit 1
    fi
    git clone --depth 1 "$REPO_URL" "$INSTALL_DIR"
  fi
fi

chown -R "$SERVICE_USER:$SERVICE_USER" "$INSTALL_DIR"
cd "$INSTALL_DIR"

# ---- 3. Install deps & build ----------------------------------------
info "Installing dependencies..."
sudo -u "$SERVICE_USER" "$BUN" install --frozen-lockfile 2>/dev/null || sudo -u "$SERVICE_USER" "$BUN" install

info "Building..."
sudo -u "$SERVICE_USER" "$BUN" run build

# ---- 4. Configure password & secret ---------------------------------
ENV_FILE="$INSTALL_DIR/.env"

if [ -f "$ENV_FILE" ]; then
  info "Existing .env found — skipping password setup"
else
  echo ""
  echo -e "${YELLOW}Set your admin password:${NC}"
  read -s -p "Password: " PANEL_PASSWORD
  echo ""
  read -s -p "Confirm:  " PANEL_PASSWORD_CONFIRM
  echo ""

  if [ "$PANEL_PASSWORD" != "$PANEL_PASSWORD_CONFIRM" ]; then
    error "Passwords don't match"
    exit 1
  fi

  if [ ${#PANEL_PASSWORD} -lt 8 ]; then
    error "Password must be at least 8 characters"
    exit 1
  fi

  info "Hashing password..."
  HASH=$(PANEL_PW="$PANEL_PASSWORD" node -e "const b=require('bcryptjs');console.log(b.hashSync(process.env.PANEL_PW,12))")

  SECRET=$(openssl rand -hex 32)
  PORT=3100

  cat > "$ENV_FILE" << EOF
PANEL_PASSWORD_HASH=$HASH
PANEL_SECRET=$SECRET
PORT=$PORT
NODE_ENV=production
EOF

  chmod 600 "$ENV_FILE"
  chown "$SERVICE_USER:$SERVICE_USER" "$ENV_FILE"
  info "Created .env (chmod 600)"
fi

# Read PORT from env
PORT=$(grep '^PORT=' "$ENV_FILE" | cut -d= -f2 || echo 3100)

# ---- 5. Sudoers for panel user --------------------------------------
SUDOERS_FILE="/etc/sudoers.d/lightsail-panel"

info "Configuring sudoers..."
cat > "$SUDOERS_FILE" << 'EOF'
# lightsail-panel — limited sudo for service management
panel ALL=(ALL) NOPASSWD: /usr/bin/systemctl start *.service
panel ALL=(ALL) NOPASSWD: /usr/bin/systemctl stop *.service
panel ALL=(ALL) NOPASSWD: /usr/bin/systemctl restart *.service
panel ALL=(ALL) NOPASSWD: /usr/bin/systemctl status *.service
panel ALL=(ALL) NOPASSWD: /usr/bin/systemctl show *.service
panel ALL=(ALL) NOPASSWD: /usr/bin/systemctl is-active *.service
panel ALL=(ALL) NOPASSWD: /usr/bin/journalctl -u *
panel ALL=(ALL) NOPASSWD: /usr/bin/cat /app/*/.env
panel ALL=(ALL) NOPASSWD: /usr/bin/tee /app/*/.env
panel ALL=(ALL) NOPASSWD: /usr/bin/cp /app/*/.env /app/*/.env.bak.*
EOF

chmod 440 "$SUDOERS_FILE"
visudo -cf "$SUDOERS_FILE" || { error "Invalid sudoers file"; rm "$SUDOERS_FILE"; exit 1; }

# ---- 6. Audit log directory -----------------------------------------
AUDIT_DIR="/var/log/lightsail-panel"
mkdir -p "$AUDIT_DIR"
chown "$SERVICE_USER:$SERVICE_USER" "$AUDIT_DIR"

# Logrotate
cat > /etc/logrotate.d/lightsail-panel << EOF
$AUDIT_DIR/audit.log {
    daily
    rotate 7
    compress
    delaycompress
    missingok
    notifempty
    create 640 $SERVICE_USER $SERVICE_USER
}
EOF

# ---- 7. Systemd unit ------------------------------------------------
info "Creating systemd service..."
cat > "/etc/systemd/system/${SERVICE_NAME}.service" << EOF
[Unit]
Description=Lightsail Panel
After=network.target

[Service]
Type=simple
User=$SERVICE_USER
WorkingDirectory=$INSTALL_DIR
ExecStart=$BUN run start -- -p $PORT
Restart=on-failure
RestartSec=5
EnvironmentFile=$ENV_FILE

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable "$SERVICE_NAME"

# ---- 8. Caddy (optional) -------------------------------------------
echo ""
read -p "Add Caddy reverse proxy entry? (y/N): " ADD_CADDY

if [[ "$ADD_CADDY" =~ ^[Yy]$ ]]; then
  read -p "Domain (e.g., panel.example.com): " PANEL_DOMAIN

  if [ -n "$PANEL_DOMAIN" ]; then
    CADDYFILE="/etc/caddy/Caddyfile"
    if [ -f "$CADDYFILE" ]; then
      # Check if entry already exists
      if grep -q "$PANEL_DOMAIN" "$CADDYFILE"; then
        warn "Entry for $PANEL_DOMAIN already exists in Caddyfile"
      else
        cat >> "$CADDYFILE" << EOF

$PANEL_DOMAIN {
    reverse_proxy localhost:$PORT
}
EOF
        info "Added $PANEL_DOMAIN to Caddyfile"
        systemctl reload caddy 2>/dev/null && info "Caddy reloaded" || warn "Could not reload Caddy"
      fi
    else
      warn "Caddyfile not found at $CADDYFILE — skipping"
    fi
  fi
fi

# ---- 9. Start -------------------------------------------------------
info "Starting $SERVICE_NAME..."
systemctl start "$SERVICE_NAME"
sleep 2

if systemctl is-active --quiet "$SERVICE_NAME"; then
  echo ""
  echo -e "${GREEN}============================================${NC}"
  echo -e "${GREEN} lightsail-panel is running!${NC}"
  echo -e "${GREEN} Port: $PORT${NC}"
  if [[ -n "${PANEL_DOMAIN:-}" ]]; then
    echo -e "${GREEN} URL:  https://$PANEL_DOMAIN${NC}"
  else
    echo -e "${GREEN} URL:  http://$(hostname -f):$PORT${NC}"
  fi
  echo -e "${GREEN}============================================${NC}"
else
  error "Service failed to start. Check: sudo journalctl -u $SERVICE_NAME -n 50"
  exit 1
fi
