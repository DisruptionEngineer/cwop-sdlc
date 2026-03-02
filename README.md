# CWOP-SDLC

Context Window Orchestration Platform — SDLC Extensions for Pi.

AI-powered coding extensions that run locally with Ollama. Built on [Pi](https://pi.dev) with intelligent context window management.

## What This Is

A portable toolkit of Pi extensions for software engineers. Clone the repo, run setup, and get:

- **Code Builder** — C#/SQL/Azure code generation with CWOP-managed context
- **Code Review** — PR review assistant with structured checklists
- **CWOP Dashboard** — Real-time context budget visualization
- **Web UI** — Browser-based dashboard and chat interface
- **Team Mode** — Multi-agent orchestration (Builder, Reviewer, SQL Expert, Azure Ops)

All data stays on your machine. All inference runs through local Ollama.

## Quick Start

```bash
git clone https://github.com/DisruptionEngineer/cwop-sdlc.git
cd cwop-sdlc
chmod +x setup.sh
./setup.sh
```

Setup will:
1. Check/install Bun runtime
2. Check Pi CLI
3. Install dependencies
4. Check Ollama connection
5. Interactive model selection

## Usage

### Pi Extensions (Terminal)

```bash
# Code generation mode
pi -e extensions/code-builder.ts

# Code review mode
pi -e extensions/code-review.ts

# All extensions with dashboard
pi -e extensions/code-builder.ts -e extensions/code-review.ts -e extensions/cwop-dashboard.ts

# Team mode (multi-agent)
pi -e extensions/code-builder.ts -e extensions/code-review.ts --agent .pi/agents/cwop-team.yaml
```

### Web Dashboard

```bash
bun run src/gateway/server.ts
# Open http://127.0.0.1:18790
```

### Task Runner

```bash
just ext-builder      # Code Builder
just ext-review       # Code Review
just ext-all          # All extensions
just team             # Multi-agent team
just gateway          # Web dashboard
just gateway-dev      # Dashboard with hot reload
just ollama-status    # Check Ollama
just ollama-models    # List pulled models
```

## Architecture

```
┌─────────────────────────────────────────────────┐
│                   Your Machine                   │
│                                                  │
│  Pi Terminal ──► Extensions ──► CWOP Engine       │
│       │         (code-builder   (context slots,   │
│       │          code-review     token budgets,    │
│       │          dashboard)      smart assembly)   │
│       │              │                             │
│       │              ▼                             │
│       │         Ollama (local LLM)                 │
│       │              │                             │
│       ▼              ▼                             │
│  Web UI ◄──── Gateway Server (WS + HTTP)          │
│  (dashboard,   http://127.0.0.1:18790             │
│   chat panel)                                     │
└─────────────────────────────────────────────────┘
```

## CWOP: Context Window Orchestration

Each extension manages its own context budget through named slots:

| Extension | Budget | Key Slots |
|-----------|--------|-----------|
| Code Builder | 6,000 tokens | system persona, tech stack, conventions, target spec, existing code, SQL schema, Azure schema |
| Code Review | 8,000 tokens | review persona, checklist, PR metadata, PR diff, file context, related tests |
| Dashboard | 2,000 tokens | live budgets, model status, extension states |

Slots have categories (static/auto/demand), priorities (critical/high/medium/low), and optional TTLs. The engine assembles context by priority, truncating or dropping low-priority slots when budget is exceeded.

## Tech Stack

- **Runtime:** Bun (TypeScript)
- **Agent Framework:** Pi (pi.dev)
- **LLM:** Ollama (local, any model)
- **Web UI:** Vanilla HTML/CSS/JS with Web Components
- **Gateway:** Bun HTTP + WebSocket server

### Primary Target Stack
C# 12 / .NET 8, Azure SQL, Azure Functions v4, Azure DevOps, Microsoft Teams

### Recommended Models

| Model | Size | Best For |
|-------|------|----------|
| qwen2.5-coder:7b | 4.7 GB | Code generation (default) |
| qwen2.5-coder:14b | 9.0 GB | Code review, complex tasks |
| deepseek-coder-v2:16b | 9.4 GB | Multi-language work |
| codellama:7b | 3.8 GB | C# and SQL |
| qwen2.5-coder:1.5b | 1.0 GB | Fast completions, limited hardware |

## Configuration

Environment variables:
- `OLLAMA_BASE_URL` — Ollama server URL (default: `http://localhost:11434`)
- `OLLAMA_MODEL` — Default model for all extensions
- `CWOP_CODE_MODEL` — Model for Code Builder
- `CWOP_REVIEW_MODEL` — Model for Code Review
- `CWOP_GATEWAY_PORT` — Gateway port (default: `18790`)
- `CWOP_BUDGET` — Default token budget

## Project Structure

```
cwop-sdlc/
├── extensions/              # Pi extensions (loaded with pi -e)
│   ├── code-builder.ts      # C#/SQL/Azure code generation
│   ├── code-review.ts       # PR review assistant
│   ├── cwop-dashboard.ts    # CWOP budget visualization
│   └── _shared/             # Shared extension utilities
├── src/
│   ├── cwop/                # CWOP Engine (context orchestration)
│   │   ├── engine.ts        # Core engine class
│   │   ├── slot.ts          # Context slot management
│   │   ├── tokenizer.ts     # Token estimation
│   │   ├── assembler.ts     # Context assembly strategies
│   │   └── presets/         # Per-extension slot configs
│   ├── llm/                 # LLM provider abstraction
│   │   ├── ollama.provider.ts
│   │   └── provider.factory.ts
│   ├── gateway/             # Web UI gateway server
│   │   ├── server.ts        # Bun HTTP + WebSocket
│   │   ├── router.ts        # API routes
│   │   └── ws-handler.ts    # WebSocket message handler
│   ├── registry/            # Extension registration
│   ├── types/               # TypeScript interfaces
│   └── ui/                  # Web dashboard (vanilla HTML/CSS/JS)
├── .pi/                     # Pi configuration
│   ├── agents/              # Multi-agent team configs
│   ├── themes/              # Custom themes
│   └── damage-control-rules.yaml
├── config/                  # App configuration
├── tests/                   # Bun test suite
├── setup.sh                 # One-command setup
├── justfile                 # Task runner recipes
└── package.json
```

## Testing

```bash
bun test                # Run all tests
bun test --watch        # Watch mode
just typecheck          # TypeScript type checking
```

## License

MIT
