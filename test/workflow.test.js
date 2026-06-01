import assert from "node:assert/strict";
import test from "node:test";
import {
  buildMistralRequest,
  buildOfflineAnswer,
  extractAssistantContent,
  parseStructuredAnswer
} from "../src/workflow.js";

const sampleContext = {
  tours: [
    {
      tourId: "TOUR-1024",
      date: "2026-06-14",
      city: "Tokyo",
      language: "Chinese",
      status: "guide_pending",
      travelerCount: 18,
      requiresPaymentCheck: false
    }
  ],
  guides: [
    {
      guideId: "GUIDE-B",
      languages: ["Chinese", "English"],
      availableDates: ["2026-06-14"]
    }
  ]
};

test("buildMistralRequest asks for a JSON schema response", () => {
  const request = buildMistralRequest({
    question: "Which tours need a Chinese-speaking guide?",
    operationsContext: sampleContext
  });

  assert.equal(request.model, "mistral-small-latest");
  assert.equal(request.response_format.type, "json_schema");
  assert.equal(request.response_format.json_schema.name, "operations_workflow_answer");
  assert.equal(request.response_format.json_schema.strict, true);
  assert.ok(request.messages[0].content.includes("Do not invent"));
});

test("extractAssistantContent supports standard string responses", () => {
  const content = extractAssistantContent({
    choices: [
      {
        message: {
          content: "{\"answer\":\"ok\"}"
        }
      }
    ]
  });

  assert.equal(content, "{\"answer\":\"ok\"}");
});

test("parseStructuredAnswer validates required fields", () => {
  const answer = parseStructuredAnswer(
    JSON.stringify({
      answer: "Found one tour.",
      confidence: "medium",
      matchedRecords: [],
      recommendedActions: [],
      needsHumanReview: true,
      missingInformation: []
    })
  );

  assert.equal(answer.answer, "Found one tour.");
  assert.equal(answer.needsHumanReview, true);
});

test("offline demo returns public-safe structured output", () => {
  const answer = buildOfflineAnswer("Which tours need a Chinese-speaking guide?", sampleContext);

  assert.equal(answer.needsHumanReview, true);
  assert.equal(answer.matchedRecords[0].recordId, "TOUR-1024");
  assert.ok(answer.recommendedActions.length > 0);
});
