# THE GATEHUB — AI Provider Architecture

THE GATEHUB uses a **provider-agnostic AI layer**. Assessment Studio, Copilot, and future AI features call `AiRouter` — never a vendor SDK directly. The frontend does not know which provider is active.

## Architecture

```
POST /api/assessment-studio/ai/generate-assessment
POST /api/assessment-studio/ai/jobs/:id/copilot
                    ↓
              AiRouter (Strategy + fallback)
                    ↓
           ProviderFactory (Factory)
                    ↓
    Ollama | OpenAI | Gemini | Claude | Azure | Mock
```

### Directory layout

```
backend/src/services/ai/
├── AiRouter.ts              # Single entry point, bootstrap, fallback
├── AiRuntimeConfig.ts       # Runtime config + persistence
├── ProviderFactory.ts       # Factory pattern
├── ollamaClient.ts          # Ollama HTTP client (tags, chat, stream)
├── assessmentCore.ts        # Shared prompts + JSON parsing
├── aiMetrics.ts             # Benchmark counters
└── providers/
    ├── AIProvider.ts        # Interface
    ├── BaseChatProvider.ts  # Shared assessment/copilot logic
    ├── OllamaProvider.ts
    ├── OpenAIProvider.ts
    ├── GeminiProvider.ts
    ├── ClaudeProvider.ts
    ├── AzureOpenAIProvider.ts
    └── MockProvider.ts
```

## Supported providers

| Provider | ID | Environment |
|----------|-----|-------------|
| **Ollama (local)** | `ollama` | `OLLAMA_HOST`, `OLLAMA_MODEL` |
| OpenAI | `openai` | `OPENAI_API_KEY` |
| Google Gemini | `gemini` | `GEMINI_API_KEY` or `GOOGLE_AI_API_KEY` |
| Anthropic Claude | `claude` | `CLAUDE_API_KEY` or `ANTHROPIC_API_KEY` |
| Azure OpenAI | `azure_openai` | `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_API_KEY`, `AZURE_OPENAI_DEPLOYMENT` |
| Mock (offline) | `mock` | none |

## Install Ollama

1. Download from [https://ollama.com](https://ollama.com)
2. Pull a model:

```bash
ollama pull llama3.1
```

Supported model families (auto-detected): `llama3.1`, `llama3.2`, `qwen2.5`, `mistral`, `phi3`, `deepseek-r1`, `gemma3`, `codellama`.

3. Start the server:

```bash
ollama serve
```

Default host: `http://localhost:11434`

## Configure THE GATEHUB

Add to `backend/.env`:

```env
AI_PROVIDER=ollama
OLLAMA_HOST=http://localhost:11434
OLLAMA_MODEL=llama3.1

# Optional cloud keys (when not using Ollama)
OPENAI_API_KEY=
GEMINI_API_KEY=
CLAUDE_API_KEY=

# Optional tuning
AI_TEMPERATURE=0.7
AI_TOP_P=0.9
AI_TOP_K=40
AI_MAX_TOKENS=4096
AI_TIMEOUT_MS=120000
AI_STREAMING=true
```

Start backend:

```bash
cd backend && npm run dev
```

On startup, the backend:

1. Detects if Ollama is running (`GET /api/tags`)
2. Lists installed models
3. Falls back to **Mock Provider** if Ollama is selected but unavailable

## Switch providers

### Environment variable

```env
AI_PROVIDER=openai   # or ollama, gemini, claude, azure_openai, mock
```

### Admin Settings (UI)

Admin → Settings → **AI** tab:

- Provider picker (Ollama, OpenAI, Gemini, Claude, Azure, Mock)
- Detected Ollama models + current model
- Health status, benchmark panel
- Temperature, Top P, Top K, Max Tokens, Timeout, Streaming

### Admin API

```bash
# List providers + health
curl -H "Authorization: Bearer $TOKEN" http://localhost:5000/api/admin/ai/providers

# List models
curl -H "Authorization: Bearer $TOKEN" http://localhost:5000/api/admin/ai/models

# Full status + benchmark
curl -H "Authorization: Bearer $TOKEN" http://localhost:5000/api/admin/ai/status

# Switch provider
curl -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"provider":"ollama"}' http://localhost:5000/api/admin/ai/provider

# Switch model
curl -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"model":"llama3.1"}' http://localhost:5000/api/admin/ai/model

# Update generation params
curl -X PATCH -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"temperature":0.7,"streamingEnabled":true}' http://localhost:5000/api/admin/ai/config
```

## Assessment generation (unchanged contract)

```bash
curl -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  http://localhost:5000/api/assessment-studio/ai/generate-assessment \
  -d '{"quizName":"Sample","questionCount":5,"difficulty":"medium"}'
```

Response format is unchanged — no frontend modifications required.

## Copilot commands

All copilot actions route through `AiRouter`:

- Rewrite, Harder, Simplify, Translate
- Hints, Explanation, Regenerate

Works with any active provider (or Mock fallback).

## Health checks

```bash
# Ollama directly
curl http://localhost:11434/api/tags

# THE GATEHUB admin status
curl -H "Authorization: Bearer $TOKEN" http://localhost:5000/api/admin/ai/status
```

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Connection refused | Run `ollama serve` |
| Model not found | `ollama pull <model>` |
| Health check timeout | Increase `AI_TIMEOUT_MS` or check firewall |
| No API key (cloud) | Set provider to `ollama` or `mock` |
| All providers fail | System auto-falls back to Mock (2s delay, sample questions) |

## Mock provider

Use `AI_PROVIDER=mock` or let auto-fallback engage when Ollama/cloud is down. Generates sample questions with Bloom levels, difficulty, hints, and explanations — ideal for frontend development without external APIs.

## Changing providers in production

Set `AI_PROVIDER` **or** use Admin Settings. Assessment Studio, Copilot, and future AI features require **no code changes** when switching providers.
