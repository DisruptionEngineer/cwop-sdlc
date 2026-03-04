#!/bin/bash
# CWOP-SDLC Customer Display - Kiosk Launcher
# Launches a fullscreen browser pointing at the CWOP gateway customer view.
# Designed for Raspberry Pi Zero 2 W with HyperPixel 4 Square display.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# ── Load Environment ──
ENV_FILE="$SCRIPT_DIR/../../.env"
if [ ! -f "$ENV_FILE" ]; then
  # Fallback: check the cwop-sdlc root
  ENV_FILE="/home/pi/cwop-sdlc/.env"
fi

if [ -f "$ENV_FILE" ]; then
  set -a
  source "$ENV_FILE"
  set +a
else
  echo "[kiosk] ERROR: No .env file found at $ENV_FILE"
  exit 1
fi

CWOP_GATEWAY_URL="${CWOP_GATEWAY_URL:-http://10.42.0.1:18790}"
CWOP_API_KEY="${CWOP_API_KEY:-}"

if [ -z "$CWOP_API_KEY" ]; then
  echo "[kiosk] ERROR: CWOP_API_KEY is not set in .env"
  exit 1
fi

# ── Wait for Display ──
echo "[kiosk] Waiting for display to be ready..."
sleep 5

# ── Hide Cursor ──
echo "[kiosk] Hiding cursor..."
unclutter -idle 0.5 -root &

# ── Disable Screen Blanking ──
echo "[kiosk] Disabling screen blanking..."
xset s off
xset -dpms
xset s noblank

# ── Discover Gateway ──
# Tries multiple methods to find the CWOP gateway on any network:
#   1. Avahi service discovery (_cwop._tcp)
#   2. mDNS hostname (tech-handheld-01.local)
#   3. mDNS hostname (cwop-tech.local - AP mode)
#   4. Hardcoded AP fallback (10.42.0.1)
echo "[kiosk] Discovering gateway..."

GATEWAY=""

# Method 1: Avahi service browsing for _cwop._tcp
if [ -z "$GATEWAY" ] && command -v avahi-browse &>/dev/null; then
  echo "[kiosk] Trying _cwop._tcp service discovery..."
  RESOLVED_IP=$(avahi-browse -t -r -p _cwop._tcp 2>/dev/null | grep "^=" | grep "IPv4" | head -1 | cut -d';' -f8 || true)
  if [ -n "$RESOLVED_IP" ]; then
    GATEWAY="$RESOLVED_IP"
    echo "[kiosk] Found gateway via _cwop._tcp service: $GATEWAY"
  fi
fi

# Method 2: Resolve tech-handheld-01.local (works on home WiFi)
if [ -z "$GATEWAY" ] && command -v avahi-resolve-host-name &>/dev/null; then
  echo "[kiosk] Trying tech-handheld-01.local..."
  RESOLVED_IP=$(avahi-resolve-host-name -4 tech-handheld-01.local 2>/dev/null | awk '{print $2}' || true)
  if [ -n "$RESOLVED_IP" ]; then
    GATEWAY="$RESOLVED_IP"
    echo "[kiosk] Resolved tech-handheld-01.local to $GATEWAY"
  fi
fi

# Method 3: Resolve cwop-tech.local (AP mode)
if [ -z "$GATEWAY" ] && command -v avahi-resolve-host-name &>/dev/null; then
  echo "[kiosk] Trying cwop-tech.local..."
  RESOLVED_IP=$(avahi-resolve-host-name -4 cwop-tech.local 2>/dev/null | awk '{print $2}' || true)
  if [ -n "$RESOLVED_IP" ]; then
    GATEWAY="$RESOLVED_IP"
    echo "[kiosk] Resolved cwop-tech.local to $GATEWAY via mDNS"
  fi
fi

# Method 4: getent fallback
if [ -z "$GATEWAY" ]; then
  for host in tech-handheld-01.local cwop-tech.local; do
    RESOLVED_IP=$(getent hosts "$host" 2>/dev/null | awk '{print $1}' || true)
    if [ -n "$RESOLVED_IP" ]; then
      GATEWAY="$RESOLVED_IP"
      echo "[kiosk] Resolved $host to $GATEWAY via getent"
      break
    fi
  done
fi

# Method 5: Hardcoded AP default
if [ -z "$GATEWAY" ]; then
  GATEWAY="10.42.0.1"
  echo "[kiosk] All discovery failed, using AP fallback: $GATEWAY"
fi

# ── Wait for Gateway to be Reachable ──
# Re-discover on each retry in case gateway booted after us
echo "[kiosk] Waiting for gateway to respond..."
RETRIES=0
MAX_RETRIES=60
while true; do
  # Re-try discovery every 5 attempts if current gateway isn't responding
  if [ $((RETRIES % 5)) -eq 0 ] && [ $RETRIES -gt 0 ]; then
    echo "[kiosk] Re-running discovery..."
    NEW_GW=""
    NEW_GW=$(avahi-browse -t -r -p _cwop._tcp 2>/dev/null | grep "^=" | grep "IPv4" | head -1 | cut -d';' -f8 || true)
    if [ -z "$NEW_GW" ]; then
      NEW_GW=$(avahi-resolve-host-name -4 tech-handheld-01.local 2>/dev/null | awk '{print $2}' || true)
    fi
    if [ -n "$NEW_GW" ] && [ "$NEW_GW" != "$GATEWAY" ]; then
      GATEWAY="$NEW_GW"
      echo "[kiosk] Updated gateway to: $GATEWAY"
    fi
  fi

  if curl -sf --max-time 2 "http://${GATEWAY}:18790" &>/dev/null; then
    echo "[kiosk] Gateway responding at $GATEWAY"
    break
  fi

  RETRIES=$((RETRIES + 1))
  if [ $RETRIES -ge $MAX_RETRIES ]; then
    echo "[kiosk] WARNING: Gateway not responding after ${MAX_RETRIES} attempts. Launching anyway."
    break
  fi
  echo "[kiosk] Gateway not ready, retry $RETRIES/$MAX_RETRIES..."
  sleep 5
done

# ── Build URL ──
URL="http://${GATEWAY}:18790/customer?key=${CWOP_API_KEY}"
echo "[kiosk] Launching browser: $URL"

# ── Launch Kiosk Browser ──
exec midori -e Fullscreen -a "$URL"
