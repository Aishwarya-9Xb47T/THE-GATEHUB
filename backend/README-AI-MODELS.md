# AI Model Manager — THE GATEHUB

The AI Model Manager automatically validates configured models, falls back to compatible alternatives, and only surfaces errors when no viable model or provider exists.

## Environment variables

```env
# Primary chat model
OPENAI_MODEL=gpt-4o-mini

# Used when primary is unavailable (404 / not in API list)
OPENAI_FALLBACK_MODEL=gpt-4.1-mini

# Optional specialized models
OPENAI_REASONING_MODEL=gpt-4o
OPENAI_EMBEDDING_MODEL=text-embedding-3-small

# Comma-separated safe models (merged with data/ai-safe-models.json)
OPENAI_SAFE_MODELS=gpt-4o-mini,gpt-4o,gpt-4.1-mini

# Ollama equivalents
OLLAMA_MODEL=llama3.1
OLLAMA_FALLBACK_MODEL=llama3.2

# Developer logging
AI_DEV_LOGS=true
```

## Fallback priority

1. **Configured model** (`OPENAI_MODEL` or Admin Settings)
2. **Fallback model** (`OPENAI_FALLBACK_MODEL`)
3. **Safe model list** (`backend/data/ai-safe-models.json` + `OPENAI_SAFE_MODELS`)
4. **Mock Provider** (realistic local quiz, Development Mode banner)

On **404 Model Not Found**, the OpenAI provider retries silently through the chain. Users are not interrupted when a fallback succeeds.

## Startup validation

When the backend boots, `validateModelsOnStartup()`:

- Lists models available to your API key (OpenAI)
- Detects installed Ollama models
- Switches the active runtime model to the first compatible option
- Logs the switch in development mode

## Admin APIs

```bash
# Full model + provider health
curl -H "Authorization: Bearer $TOKEN" http://localhost:5000/api/admin/ai/health

# Per-model availability checks
curl -H "Authorization: Bearer $TOKEN" http://localhost:5000/api/admin/ai/models
```

### Health response fields

| Field | Description |
|-------|-------------|
| `configuredModel` | Model from env / settings |
| `activeModel` | Model actually in use |
| `fallbackModel` | Configured fallback |
| `fallbackUsed` | Whether a fallback was applied |
| `apiReachable` | Provider API reachable |
| `authentication` | `ok` / `invalid` / `missing` |
| `latencyMs` | Last health probe latency |
| `lastError` | Most recent model error |

## Assessment Studio behavior

| Scenario | User experience |
|----------|-----------------|
| Fallback succeeds | Review step shows **Using compatible AI model** banner |
| All models fail → Mock | **Development Mode** banner, no blocking error |
| Quota / auth errors | Existing premium error dialog + offline option |

## Adding new safe models

Edit `backend/data/ai-safe-models.json`:

```json
{
  "openai": ["gpt-4o-mini", "gpt-4o", "gpt-4.1-mini", "your-new-model"]
}
```

Or set `OPENAI_SAFE_MODELS` in `.env` (takes precedence for OpenAI).

## Debugging

1. Enable dev logs: `AI_DEV_LOGS=true`
2. Check console for `[ai-model]` JSON lines
3. Call `GET /api/admin/ai/health`
4. Verify model list: `curl https://api.openai.com/v1/models -H "Authorization: Bearer $OPENAI_API_KEY"`

### Common issues

| Problem | Fix |
|---------|-----|
| `gpt-5.5` not found | Set `OPENAI_MODEL=gpt-4o-mini` or rely on auto-fallback |
| Fallback not used | Set `OPENAI_FALLBACK_MODEL` and ensure key can access it |
| Still seeing errors | Check `lastError` in `/api/admin/ai/health` |

## Architecture

```
AiRouter
  └── OpenAIProvider.complete()
        └── completeWithModelFallback()  ← AiModelManager
              ├── try configured
              ├── try fallback
              ├── try safe models
              └── throw MODEL_NOT_FOUND → AiRouter → Mock
```

See also: [README-AI-PROVIDERS.md](./README-AI-PROVIDERS.md)
