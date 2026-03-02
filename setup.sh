#!/bin/bash
# CWOP-SDLC Setup Script
# One-command setup for any macOS or Linux machine.
# Installs Bun, checks Pi CLI, connects to Ollama, pulls models interactively.

set -e

BOLD='\033[1m'
DIM='\033[2m'
CYAN='\033[36m'
GREEN='\033[32m'
YELLOW='\033[33m'
RED='\033[31m'
RESET='\033[0m'

banner() {
  echo ""
  echo -e "${CYAN}${BOLD}╔═══════════════════════════════════════════════╗${RESET}"
  echo -e "${CYAN}${BOLD}║         CWOP-SDLC Setup                       ║${RESET}"
  echo -e "${CYAN}${BOLD}║  Context Window Orchestration for Engineers    ║${RESET}"
  echo -e "${CYAN}${BOLD}╚═══════════════════════════════════════════════╝${RESET}"
  echo ""
}

step() {
  echo -e "\n${CYAN}[$1/$TOTAL]${RESET} ${BOLD}$2${RESET}"
}

ok() {
  echo -e "  ${GREEN}✓${RESET} $1"
}

warn() {
  echo -e "  ${YELLOW}!${RESET} $1"
}

fail() {
  echo -e "  ${RED}✗${RESET} $1"
}

TOTAL=5
banner

# ── Step 1: Bun ──
step 1 "Checking Bun runtime..."
if command -v bun &>/dev/null; then
  BUN_VERSION=$(bun --version)
  ok "Bun $BUN_VERSION found"
else
  warn "Bun not found. Installing..."
  if [[ "$(uname)" == "Darwin" ]] && command -v brew &>/dev/null; then
    brew install oven-sh/bun/bun
  else
    curl -fsSL https://bun.sh/install | bash
  fi
  export PATH="$HOME/.bun/bin:$PATH"
  ok "Bun installed: $(bun --version)"
fi

# ── Step 2: Pi CLI ──
step 2 "Checking Pi CLI..."
if command -v pi &>/dev/null; then
  ok "Pi CLI found"
else
  warn "Pi CLI not found."
  echo -e "  ${DIM}Install Pi: npm install -g @anthropic-ai/pi${RESET}"
  echo -e "  ${DIM}Or visit: https://pi.dev${RESET}"
  echo ""
  read -p "  Install Pi now? (y/n) " -n 1 -r
  echo ""
  if [[ $REPLY =~ ^[Yy]$ ]]; then
    if command -v npm &>/dev/null; then
      npm install -g @mariozechner/pi-coding-agent
      ok "Pi CLI installed"
    else
      fail "npm not found. Install Node.js first, then run: npm install -g @mariozechner/pi-coding-agent"
    fi
  else
    warn "Skipping Pi CLI install. Extensions will not work without it."
  fi
fi

# ── Step 3: Install dependencies ──
step 3 "Installing project dependencies..."
cd "$(dirname "$0")"
bun install
ok "Dependencies installed"

# ── Step 4: Ollama ──
step 4 "Checking Ollama..."
OLLAMA_RUNNING=false

if command -v ollama &>/dev/null; then
  ok "Ollama CLI found"
  if curl -sf http://localhost:11434/api/tags &>/dev/null; then
    OLLAMA_RUNNING=true
    ok "Ollama server is running"
    MODEL_COUNT=$(curl -sf http://localhost:11434/api/tags | python3 -c "import sys,json;print(len(json.load(sys.stdin).get('models',[])))" 2>/dev/null || echo "0")
    ok "$MODEL_COUNT model(s) available"
  else
    warn "Ollama installed but not running. Start it: ollama serve"
  fi
else
  warn "Ollama not found."
  echo -e "  ${DIM}Install: https://ollama.com/download${RESET}"
  echo ""
  read -p "  Install Ollama now? (y/n) " -n 1 -r
  echo ""
  if [[ $REPLY =~ ^[Yy]$ ]]; then
    if [[ "$(uname)" == "Darwin" ]] && command -v brew &>/dev/null; then
      brew install ollama
      ok "Ollama installed via Homebrew. Start with: ollama serve"
    elif [[ "$(uname)" == "Darwin" ]]; then
      echo "  Opening Ollama download page..."
      open "https://ollama.com/download/mac"
      echo -e "  ${YELLOW}After installing, run: ollama serve${RESET}"
    else
      curl -fsSL https://ollama.com/install.sh | sh
      ok "Ollama installed. Start with: ollama serve"
    fi
  fi
fi

# ── Step 5: Model Selection ──
step 5 "Model selection..."

if [ "$OLLAMA_RUNNING" = true ]; then
  echo ""
  echo -e "  ${BOLD}Available models for CWOP-SDLC:${RESET}"
  echo ""
  echo -e "  ${CYAN}1)${RESET} qwen2.5-coder:7b    ${DIM}(4.7 GB, best balance)${RESET}"
  echo -e "  ${CYAN}2)${RESET} qwen2.5-coder:14b   ${DIM}(9.0 GB, higher quality)${RESET}"
  echo -e "  ${CYAN}3)${RESET} deepseek-coder-v2:16b ${DIM}(9.4 GB, strong multi-lang)${RESET}"
  echo -e "  ${CYAN}4)${RESET} codellama:7b         ${DIM}(3.8 GB, good C#/SQL)${RESET}"
  echo -e "  ${CYAN}5)${RESET} qwen2.5-coder:1.5b   ${DIM}(1.0 GB, lightweight)${RESET}"
  echo -e "  ${CYAN}s)${RESET} Skip                 ${DIM}(use existing models)${RESET}"
  echo ""

  read -p "  Select models to pull (comma-separated, e.g. 1,4): " MODEL_CHOICES

  if [[ "$MODEL_CHOICES" != "s" && -n "$MODEL_CHOICES" ]]; then
    IFS=',' read -ra CHOICES <<< "$MODEL_CHOICES"
    for choice in "${CHOICES[@]}"; do
      choice=$(echo "$choice" | tr -d ' ')
      case $choice in
        1) ollama pull qwen2.5-coder:7b ;;
        2) ollama pull qwen2.5-coder:14b ;;
        3) ollama pull deepseek-coder-v2:16b ;;
        4) ollama pull codellama:7b ;;
        5) ollama pull qwen2.5-coder:1.5b ;;
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

# ── Done ──
echo ""
echo -e "${GREEN}${BOLD}╔═══════════════════════════════════════════════╗${RESET}"
echo -e "${GREEN}${BOLD}║         Setup Complete!                        ║${RESET}"
echo -e "${GREEN}${BOLD}╚═══════════════════════════════════════════════╝${RESET}"
echo ""
echo -e "  ${BOLD}Quick Start:${RESET}"
echo ""
echo -e "  ${CYAN}# Start the web dashboard${RESET}"
echo -e "  bun run src/gateway/server.ts"
echo -e "  ${DIM}# Then open http://127.0.0.1:18790${RESET}"
echo ""
echo -e "  ${CYAN}# Use Pi with Code Builder extension${RESET}"
echo -e "  pi -e extensions/code-builder.ts"
echo ""
echo -e "  ${CYAN}# Use Pi with Code Review extension${RESET}"
echo -e "  pi -e extensions/code-review.ts"
echo ""
echo -e "  ${CYAN}# All extensions + dashboard widget${RESET}"
echo -e "  pi -e extensions/code-builder.ts -e extensions/code-review.ts -e extensions/cwop-dashboard.ts"
echo ""
echo -e "  ${CYAN}# Or use the task runner${RESET}"
echo -e "  just ext-builder       ${DIM}# Code generation mode${RESET}"
echo -e "  just ext-review        ${DIM}# Code review mode${RESET}"
echo -e "  just ext-all           ${DIM}# All extensions${RESET}"
echo -e "  just gateway           ${DIM}# Web dashboard${RESET}"
echo ""
echo -e "  ${DIM}Set OLLAMA_MODEL env var to change default model${RESET}"
echo -e "  ${DIM}Set CWOP_GATEWAY_PORT env var to change gateway port${RESET}"
echo ""
