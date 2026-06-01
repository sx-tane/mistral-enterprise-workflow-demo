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

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

async function readBody(req) {
  const chunks = [];

  for await (const chunk of req) {
    chunks.push(chunk);
  }

  return Buffer.concat(chunks).toString("utf8");
}

async function handleApiAssist(req, res) {
  try {
    const bodyText = await readBody(req);
    const body = bodyText ? JSON.parse(bodyText) : {};
    const question = String(body.question || "").trim();
    const mode = String(body.mode || "offline").toLowerCase();

    if (!question) {
      sendJson(res, 400, { error: "Question is required." });
      return;
    }

    const context = await loadOperationsContextFromCsv();

    if (mode === "live") {
      const requestBody = buildMistralRequest({
        question,
        operationsContext: context,
        model: process.env.MISTRAL_MODEL || "mistral-small-latest"
      });

      const response = await callMistral({
        apiKey: process.env.MISTRAL_API_KEY,
        requestBody
      });

      const content = extractAssistantContent(response);
      const structuredAnswer = parseStructuredAnswer(content);
      sendJson(res, 200, { mode: "live", answer: structuredAnswer });
      return;
    }

    const offlineAnswer = buildOfflineAnswer(question, context);
    sendJson(res, 200, { mode: "offline", answer: offlineAnswer });
  } catch (error) {
    sendJson(res, 500, { error: error.message || "Unexpected server error." });
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

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  await loadEnvFileIfPresent();

  const preferredPort = Number(process.env.PORT || 8787);
  const server = createAppServer();

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
    .then((port) => {
      // eslint-disable-next-line no-console
      console.log(`UI server ready at http://localhost:${port}`);
      if (port !== preferredPort) {
        // eslint-disable-next-line no-console
        console.log(`Port ${preferredPort} was busy, using ${port} instead.`);
      }
    })
    .catch((error) => {
      // eslint-disable-next-line no-console
      console.error(error.message);
      process.exitCode = 1;
    });
}
