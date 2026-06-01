# Mistral Enterprise Workflow Demo

This is a small, public-safe demo of an enterprise LLM workflow pattern:

1. Take a natural-language operations question.
2. Attach only the relevant operational context.
3. Ask the Mistral Chat Completion API for a structured JSON answer.
4. Keep the result human-reviewable before any real business action.

The sample data is synthetic. It is inspired by common enterprise operations patterns, but it does not contain company, client, customer, or production data.

## Why this exists

Many enterprise AI demos stop at "call a model and print text." In real systems, the difficult part is usually around the model:

- Which data is the model allowed to see?
- How do we keep the response structured?
- What happens when the model lacks enough context?
- Where should human review stay in the workflow?
- How can another engineer reuse the pattern safely?

This repo is intentionally small so the pattern is easy to inspect.

## Workflow

```mermaid
flowchart LR
    A["Operations user question"] --> B["Backend API"]
    B --> C["Sanitized operational context"]
    C --> D["Mistral Chat Completion API"]
    D --> E["JSON schema structured output"]
    E --> F{"Safe to act automatically?"}
    F -- "No" --> G["Human review"]
    F -- "Yes, in future mature workflow" --> H["Assisted action"]
    G --> I["Operator decision"]
    H --> I
```

## What the demo shows

- A structured output schema for an operations assistant.
- A prompt boundary that tells the model not to invent records.
- A live API path using `MISTRAL_API_KEY`.
- An offline path so the repo can be reviewed without credentials.
- Tests for the request shape and response parsing.

## Project structure

```text
.
├── examples/
│   └── sample-operations-context.json
├── src/
│   ├── index.js
│   └── workflow.js
├── test/
│   └── workflow.test.js
├── .env.example
├── package.json
└── README.md
```

## Run offline

No dependencies are required beyond Node.js 20+.

```bash
npm test
npm run demo:offline
```

You can also pass a custom question:

```bash
npm run demo:offline -- "Which tours need a Chinese-speaking guide?"
```

## Run against Mistral

Create an API key in Mistral, then set:

```bash
export MISTRAL_API_KEY="replace_me"
export MISTRAL_MODEL="mistral-small-latest"
npm run demo:live -- "Which tours need a Chinese-speaking guide?"
```

PowerShell:

```powershell
$env:MISTRAL_API_KEY = "replace_me"
$env:MISTRAL_MODEL = "mistral-small-latest"
npm run demo:live -- "Which tours need a Chinese-speaking guide?"
```

## Notes on the Mistral API

This demo uses the Chat Completion endpoint and requests `response_format.type = "json_schema"` so the model returns JSON that follows the provided schema.

Useful official docs:

- Chat Completion API: https://docs.mistral.ai/api
- Chat completions guide: https://docs.mistral.ai/studio-api/conversations/chat-completion
- Custom structured outputs: https://docs.mistral.ai/studio-api/conversations/structured-output/custom

## Design choices

### Structured output over free-form text

Free-form answers are easy to demo, but harder to integrate. This demo asks for:

- `answer`
- `confidence`
- `matchedRecords`
- `recommendedActions`
- `needsHumanReview`
- `missingInformation`

That shape is easier for a backend service, UI, or review workflow to consume.

### Human review by default

The sample keeps `needsHumanReview` as a first-class field. In real enterprise workflows, this is useful while the team is still validating model behavior, data quality, and operational risk.

### Public-safe context

The example uses synthetic tour, guide, and logistics-like records. The pattern matters more than the domain.

## What I would add next

- A real API route using Fastify, Hono, or NestJS.
- Contract tests for the schema.
- A small UI showing matched records and review actions.
- Evaluation cases for "not enough information" and "ambiguous question."
- Logging/observability around latency, confidence, and fallback rate.

## License

MIT
