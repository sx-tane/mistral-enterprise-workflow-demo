import {
  buildMistralRequest,
  buildOfflineAnswer,
  callMistral,
  extractAssistantContent,
  parseStructuredAnswer
} from "./workflow.js";
import { loadOperationsContextFromCsv } from "./data-store.js";
import { loadEnvFileIfPresent } from "./env.js";

const DEFAULT_QUESTION =
  "Which upcoming tours need action, and is there a Chinese-speaking guide available?";

async function main() {
  await loadEnvFileIfPresent();

  const args = process.argv.slice(2);
  const live = args.includes("--live");
  const question = args.filter((arg) => !arg.startsWith("--")).join(" ") || DEFAULT_QUESTION;
  const context = await loadOperationsContextFromCsv();

  if (!live) {
    const offlineAnswer = buildOfflineAnswer(question, context);
    console.log(JSON.stringify(offlineAnswer, null, 2));
    return;
  }

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
  console.log(JSON.stringify(structuredAnswer, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
