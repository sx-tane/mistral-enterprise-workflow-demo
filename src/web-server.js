import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnvFileIfPresent } from "./env.js";
import {
  buildMistralRequest,
  buildOfflineAnswer,
  callMistral,
  extractAssistantContent,
  parseStructuredAnswer
} from "./workflow.js";
import { loadOperationsContextFromCsv } from "./data-store.js";

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8"
};

const STATIC_ROOT = new URL("./web/", import.meta.url);

function logStartup(message) {
  // eslint-disable-next-line no-console
  console.log(`[startup] ${message}`);
}

function logStartupError(message) {
  // eslint-disable-next-line no-console
  console.error(`[startup] ${message}`);
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function createRequestId() {
  return `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function logRequest(requestId, message) {
  // eslint-disable-next-line no-console
  console.log(`[request:${requestId}] ${message}`);
}

function summarizeMistralResponse(response) {
  return {
    id: response.id,
    model: response.model,
    created: response.created,
    object: response.object,
    usage: response.usage,
    finishReason: response.choices?.[0]?.finish_reason ?? null,
    assistantContent: extractAssistantContent(response)
  };
}

async function readBody(req) {
  const chunks = [];

  for await (const chunk of req) {
    chunks.push(chunk);
  }

  return Buffer.concat(chunks).toString("utf8");
}

async function handleApiAssist(req, res) {
  const requestId = createRequestId();
  const startedAt = Date.now();

  try {
    const bodyText = await readBody(req);
    const body = bodyText ? JSON.parse(bodyText) : {};
    const question = String(body.question || "").trim();
    const mode = String(body.mode || "offline").toLowerCase();
    const requestedAt = new Date(startedAt).toISOString();

    if (!question) {
      logRequest(requestId, "Rejected empty question.");
      sendJson(res, 400, {
        error: "Question is required.",
        debug: {
          requestId,
          requestedAt,
          mode,
          statusCode: 400
        }
      });
      return;
    }

    logRequest(requestId, `Received mode=${mode}; question="${question}"`);
    const context = await loadOperationsContextFromCsv();
    const model = process.env.MISTRAL_MODEL || "mistral-small-latest";
    const debugBase = {
      requestId,
      requestedAt,
      mode,
      question,
      model,
      contextSummary: {
        tours: context.tours.length,
        guides: context.guides.length
      }
    };

    if (mode === "live") {
      const requestBody = buildMistralRequest({
        question,
        operationsContext: context,
        model
      });

      logRequest(requestId, `Calling Mistral model=${model}.`);
      const response = await callMistral({
        apiKey: process.env.MISTRAL_API_KEY,
        requestBody
      });
      const latencyMs = Date.now() - startedAt;
      const mistralResponse = summarizeMistralResponse(response);

      const structuredAnswer = parseStructuredAnswer(mistralResponse.assistantContent);
      logRequest(
        requestId,
        `Mistral response ok; status=200; latencyMs=${latencyMs}; finishReason=${mistralResponse.finishReason}.`
      );
      sendJson(res, 200, {
        mode: "live",
        answer: structuredAnswer,
        debug: {
          ...debugBase,
          statusCode: 200,
          latencyMs,
          mistralRequest: {
            model: requestBody.model,
            temperature: requestBody.temperature,
            max_tokens: requestBody.max_tokens,
            response_format: requestBody.response_format,
            messages: requestBody.messages
          },
          mistralResponse
        }
      });
      return;
    }

    const offlineAnswer = buildOfflineAnswer(question, context);
    const latencyMs = Date.now() - startedAt;
    logRequest(requestId, `Offline response ok; status=200; latencyMs=${latencyMs}.`);
    sendJson(res, 200, {
      mode: "offline",
      answer: offlineAnswer,
      debug: {
        ...debugBase,
        statusCode: 200,
        latencyMs,
        offline: true,
        offlineInput: {
          question,
          context
        }
      }
    });
  } catch (error) {
    const latencyMs = Date.now() - startedAt;
    logRequest(
      requestId,
      `Error; status=500; latencyMs=${latencyMs}; message="${error.message || "Unexpected server error."}"`
    );
    sendJson(res, 500, {
      error: error.message || "Unexpected server error.",
      debug: {
        requestId,
        requestedAt: new Date(startedAt).toISOString(),
        statusCode: 500,
        latencyMs
      }
    });
  }
}

async function handleStatic(req, res) {
  try {
    const url = new URL(req.url || "/", "http://localhost");
    const pathname = url.pathname === "/" ? "/index.html" : url.pathname;

    if (pathname.includes("..")) {
      sendJson(res, 400, { error: "Invalid path." });
      return;
    }

    const fileUrl = new URL(`.${pathname}`, STATIC_ROOT);
    const content = await readFile(fileUrl);
    const mimeType = MIME_TYPES[extname(pathname)] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": mimeType });
    res.end(content);
  } catch {
    sendJson(res, 404, { error: "Not found." });
  }
}

export function createAppServer() {
  return createServer(async (req, res) => {
    if (req.url === "/api/assist" && req.method === "POST") {
      await handleApiAssist(req, res);
      return;
    }

    if (req.method === "GET") {
      await handleStatic(req, res);
      return;
    }

    sendJson(res, 405, { error: "Method not allowed." });
  });
}

async function verifyMistralAccess({ model, apiKey }) {
  if (process.env.MISTRAL_STARTUP_CHECK === "false") {
    logStartup("Mistral startup check skipped because MISTRAL_STARTUP_CHECK=false.");
    return;
  }

  if (!apiKey) {
    logStartup("Mistral live mode: not configured. MISTRAL_API_KEY is missing.");
    return;
  }

  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(), 10000);

  try {
    const requestBody = buildMistralRequest({
      question: "Run a startup connectivity check and return a concise structured answer.",
      operationsContext: { tours: [], guides: [] },
      model
    });

    const response = await callMistral({
      apiKey,
      requestBody,
      signal: abortController.signal
    });
    const content = extractAssistantContent(response);
    const structuredAnswer = parseStructuredAnswer(content);

    logStartup(
      `Mistral live mode: connected successfully. model=${model}; confidence=${structuredAnswer.confidence}`
    );
  } catch (error) {
    logStartupError(`Mistral live mode: connection failed. ${error.message}`);
  } finally {
    clearTimeout(timeout);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const envLoaded = await loadEnvFileIfPresent();

  const preferredPort = Number(process.env.PORT || 8787);
  const server = createAppServer();
  const model = process.env.MISTRAL_MODEL || "mistral-small-latest";

  function listenWithFallback(startPort, maxAttempts = 10) {
    return new Promise((resolve, reject) => {
      let port = startPort;

      const tryListen = () => {
        const onListening = () => {
          server.removeListener("error", onError);
          resolve(port);
        };

        const onError = (error) => {
          server.removeListener("listening", onListening);

          if (error?.code === "EADDRINUSE" && port < startPort + maxAttempts - 1) {
            port += 1;
            tryListen();
            return;
          }

          reject(error);
        };

        server.once("listening", onListening);
        server.once("error", onError);
        server.listen(port);
      };

      tryListen();
    });
  }

  listenWithFallback(preferredPort)
    .then(async (port) => {
      logStartup(`Loaded .env file: ${envLoaded ? "yes" : "no"}`);
      logStartup(`MISTRAL_API_KEY present: ${process.env.MISTRAL_API_KEY ? "yes" : "no"}`);
      logStartup(`MISTRAL_MODEL: ${model}`);
      logStartup(`UI server ready at http://localhost:${port}`);
      if (port !== preferredPort) {
        logStartup(`Port ${preferredPort} was busy, using ${port} instead.`);
      }
      await verifyMistralAccess({ model, apiKey: process.env.MISTRAL_API_KEY });
    })
    .catch((error) => {
      logStartupError(error.message);
      process.exitCode = 1;
    });
}
