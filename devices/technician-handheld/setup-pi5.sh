#!/bin/bash
# CWOP-SDLC Technician Handheld - Raspberry Pi 5 Setup
# Configures Pi 5 as a WiFi AP gateway running the CWOP-SDLC server.
# Idempotent: safe to re-run at any time.

set -euo pipefail

# ── Colors ──
BOLD='\033[1m'
DIM='\033[2m'
CYAN='\033[36m'
GREEN='\033[32m'
YELLOW='\033[33m'
RED='\033[31m'
RESET='\033[0m'

TOTAL=11
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CWOP_DIR="/home/pi/cwop-sdlc"

banner() {
  echo ""
  echo -e "${CYAN}${BOLD}+-----------------------------------------------+${RESET}"
  echo -e "${CYAN}${BOLD}|    CWOP-SDLC  Technician Handheld Setup       |${RESET}"
  echo -e "${CYAN}${BOLD}|    Raspberry Pi 5 Gateway Configuration        |${RESET}"
  echo -e "${CYAN}${BOLD}+-----------------------------------------------+${RESET}"
  echo ""
}

step() {
  echo -e "\n${CYAN}[$1/$TOTAL]${RESET} ${BOLD}$2${RESET}"
}

ok() {
  echo -e "  ${GREEN}[ok]${RESET} $1"
}

warn() {
  echo -e "  ${YELLOW}[warn]${RESET} $1"
}

fail() {
  echo -e "  ${RED}[fail]${RESET} $1"
  exit 1
}

banner

# ── Step 1: Platform Check ──
step 1 "Verifying platform..."

ARCH=$(uname -m)
if [[ "$ARCH" != "aarch64" && "$ARCH" != "armv7l" ]]; then
  fail "This script is designed for Raspberry Pi (expected aarch64 or armv7l, got $ARCH)."
fi
ok "Platform: $ARCH"

if [ "$(id -u)" -eq 0 ]; then
  fail "Do not run this script as root. Run as the 'pi' user; sudo will be used where needed."
fi
ok "Running as user: $(whoami)"

# ── Step 2: System Update ──
step 2 "Updating system packages..."

sudo apt update && sudo apt upgrade -y
ok "System updated"

# ── Step 3: Install Base Packages ──
step 3 "Installing base packages..."

sudo apt install -y git avahi-daemon hostapd dnsmasq curl unzip
ok "Base packages installed"

# ── Step 4: Install Bun Runtime ──
step 4 "Checking Bun runtime..."

if command -v bun &>/dev/null; then
  BUN_VERSION=$(bun --version)
  ok "Bun $BUN_VERSION already installed"
else
  warn "Bun not found. Installing..."
  curl -fsSL https://bun.sh/install | bash
  export PATH="$HOME/.bun/bin:$PATH"
  ok "Bun installed: $(bun --version)"
fi

# Ensure bun is on PATH for the rest of this script
export PATH="$HOME/.bun/bin:$PATH"

# ── Step 5: Install Ollama ──
step 5 "Checking Ollama..."

if command -v ollama &>/dev/null; then
  ok "Ollama already installed"
else
  warn "Ollama not found. Installing..."
  curl -fsSL https://ollama.com/install.sh | sh
  ok "Ollama installed"
fi

# Start ollama in the background if not running
if ! curl -sf http://localhost:11434/api/tags &>/dev/null; then
  warn "Starting Ollama server..."
  ollama serve &>/dev/null &
  sleep 3
fi

if curl -sf http://localhost:11434/api/tags &>/dev/null; then
  ok "Ollama server is running"
  OLLAMA_RUNNING=true
else
  warn "Ollama server did not start. Model pull will be skipped."
  OLLAMA_RUNNING=false
fi

# ── Step 6: Model Selection ──
step 6 "Model selection..."

if [ "$OLLAMA_RUNNING" = true ]; then
  echo ""
  echo -e "  ${BOLD}Available models for CWOP-SDLC on Pi 5:${RESET}"
  echo ""
  echo -e "  ${CYAN}1)${RESET} qwen2.5-coder:7b    ${DIM}(4.7 GB, best balance for Pi 5)${RESET}"
  echo -e "  ${CYAN}2)${RESET} qwen2.5-coder:1.5b  ${DIM}(1.0 GB, lightweight / fast)${RESET}"
  echo -e "  ${CYAN}3)${RESET} codellama:7b         ${DIM}(3.8 GB, good C#/SQL support)${RESET}"
  echo -e "  ${CYAN}s)${RESET} Skip                 ${DIM}(use existing models)${RESET}"
  echo ""

  read -p "  Select models to pull (comma-separated, e.g. 1,2): " MODEL_CHOICES

  if [[ "$MODEL_CHOICES" != "s" && -n "$MODEL_CHOICES" ]]; then
    IFS=',' read -ra CHOICES <<< "$MODEL_CHOICES"
    for choice in "${CHOICES[@]}"; do
      choice=$(echo "$choice" | tr -d ' ')
      case $choice in
        1) ollama pull qwen2.5-coder:7b ;;
        2) ollama pull qwen2.5-coder:1.5b ;;
        3) ollama pull codellama:7b ;;
        *) warn "Unknown option: $choice" ;;
      esac
    done
    ok "Models pulled"
  else
    ok "Skipping model pull"
  fi
else
  warn "Ollama not running. Skipping model selection."
  echo -e "  ${DIM}After starting Ollama, pull a model: ollama pull qwen2.5-coder:7b${RESET}"
fi

# ── Step 7: Configure WiFi AP Mode ──
step 7 "Configuring WiFi access point..."

echo ""
read -sp "  Enter WiFi password for the cwop-tech network (min 8 chars): " WIFI_PASSWORD
echo ""

if [ ${#WIFI_PASSWORD} -lt 8 ]; then
  fail "WiFi password must be at least 8 characters."
fi

ok "Writing hostapd configuration..."
sudo tee /etc/hostapd/hostapd.conf > /dev/null <<EOF
interface=wlan0
driver=nl80211
ssid=cwop-tech
hw_mode=g
channel=6
wmm_enabled=0
macaddr_acl=0
auth_algs=1
ignore_broadcast_ssid=0
wpa=2
wpa_passphrase=${WIFI_PASSWORD}
wpa_key_mgmt=WPA-PSK
wpa_pairwise=TKIP
rsn_pairwise=CCMP
EOF

ok "Writing dnsmasq configuration..."
sudo tee /etc/dnsmasq.conf > /dev/null <<EOF
interface=wlan0
dhcp-range=10.42.0.10,10.42.0.50,255.255.255.0,24h
address=/cwop-tech.local/10.42.0.1
EOF

ok "Configuring static IP for wlan0..."
if ! grep -q "interface wlan0" /etc/dhcpcd.conf 2>/dev/null; then
  sudo tee -a /etc/dhcpcd.conf > /dev/null <<EOF

# CWOP WiFi AP static IP
interface wlan0
    static ip_address=10.42.0.1/24
    nohook wpa_supplicant
EOF
  ok "Static IP added to /etc/dhcpcd.conf"
else
  ok "Static IP already configured in /etc/dhcpcd.conf"
fi

sudo systemctl unmask hostapd
sudo systemctl enable hostapd
sudo systemctl enable dnsmasq
ok "hostapd and dnsmasq enabled"

# ── Step 8: Configure Avahi/mDNS ──
step 8 "Configuring mDNS service advertisement..."

sudo mkdir -p /etc/avahi/services
sudo tee /etc/avahi/services/cwop.service > /dev/null <<EOF
<?xml version="1.0" standalone='no'?>
<!DOCTYPE service-group SYSTEM "avahi-service.dtd">
<service-group>
  <name replace-wildcards="yes">CWOP Gateway on %h</name>
  <service>
    <type>_cwop._tcp</type>
    <port>18790</port>
  </service>
</service-group>
EOF

sudo systemctl enable avahi-daemon
ok "Avahi configured to advertise _cwop._tcp on port 18790"

# ── Step 9: Clone/Update CWOP-SDLC ──
step 9 "Setting up CWOP-SDLC project..."

if [ -d "$CWOP_DIR/.git" ]; then
  ok "Repository already present at $CWOP_DIR"
  cd "$CWOP_DIR"
  git pull --ff-only || warn "Could not fast-forward; using existing checkout"
else
  if [ -d "$CWOP_DIR" ]; then
    warn "$CWOP_DIR exists but is not a git repo. Using as-is."
  else
    git clone https://github.com/disruptionengineer/cwop-sdlc.git "$CWOP_DIR"
    ok "Repository cloned to $CWOP_DIR"
  fi
fi

cd "$CWOP_DIR"
bun install
ok "Dependencies installed"

# ── Step 10: Generate API Key and .env ──
step 10 "Generating API key and environment file..."

API_KEY=$(openssl rand -hex 24)
ENV_FILE="$CWOP_DIR/.env"

cat > "$ENV_FILE" <<EOF
# CWOP-SDLC Gateway Environment
# Generated by setup-pi5.sh on $(date -Iseconds)
CWOP_NETWORK_MODE=device
CWOP_GATEWAY_HOST=0.0.0.0
CWOP_API_KEY=${API_KEY}
EOF

chmod 600 "$ENV_FILE"
ok "Environment file written to $ENV_FILE"

# ── Step 11: Install systemd Services ──
step 11 "Installing systemd services..."

SERVICE_SRC="$CWOP_DIR/devices/technician-handheld"

sudo cp "$SERVICE_SRC/cwop-gateway.service" /etc/systemd/system/cwop-gateway.service
sudo cp "$SERVICE_SRC/cwop-hotspot.service" /etc/systemd/system/cwop-hotspot.service

sudo systemctl daemon-reload
sudo systemctl enable cwop-gateway.service
sudo systemctl enable cwop-hotspot.service
ok "Services installed and enabled"

# ── Summary ──
echo ""
echo -e "${GREEN}${BOLD}+-----------------------------------------------+${RESET}"
echo -e "${GREEN}${BOLD}|         Setup Complete!                        |${RESET}"
echo -e "${GREEN}${BOLD}+-----------------------------------------------+${RESET}"
echo ""
echo -e "  ${BOLD}WiFi Network:${RESET}      cwop-tech"
echo -e "  ${BOLD}Gateway Address:${RESET}   http://10.42.0.1:18790"
echo -e "  ${BOLD}API Key:${RESET}           ${API_KEY}"
echo ""
echo -e "  ${YELLOW}IMPORTANT: Save this API key! You will need it${RESET}"
echo -e "  ${YELLOW}to configure customer display devices.${RESET}"
echo ""
echo -e "  ${BOLD}Services installed:${RESET}"
echo -e "    cwop-hotspot.service  - WiFi access point"
echo -e "    cwop-gateway.service  - CWOP-SDLC gateway server"
echo ""
echo -e "  ${BOLD}Next steps:${RESET}"
echo -e "    1. Reboot to activate the WiFi AP:  ${CYAN}sudo reboot${RESET}"
echo -e "    2. After reboot, verify services:"
echo -e "       ${CYAN}sudo systemctl status cwop-hotspot${RESET}"
echo -e "       ${CYAN}sudo systemctl status cwop-gateway${RESET}"
echo -e "    3. Connect a client device to the 'cwop-tech' WiFi network"
echo -e "    4. Open ${CYAN}http://10.42.0.1:18790${RESET} in a browser"
echo ""
