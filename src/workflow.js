export const structuredAnswerSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "answer",
    "confidence",
    "matchedRecords",
    "recommendedActions",
    "needsHumanReview",
    "missingInformation"
  ],
  properties: {
    answer: {
      type: "string",
      description: "Short operator-facing answer grounded in the provided context."
    },
    confidence: {
      type: "string",
      enum: ["high", "medium", "low"]
    },
    matchedRecords: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["recordType", "recordId", "reason"],
        properties: {
          recordType: {
            type: "string",
            enum: ["tour", "guide", "unknown"]
          },
          recordId: {
            type: "string"
          },
          reason: {
            type: "string"
          }
        }
      }
    },
    recommendedActions: {
      type: "array",
      items: {
        type: "string"
      }
    },
    needsHumanReview: {
      type: "boolean"
    },
    missingInformation: {
      type: "array",
      items: {
        type: "string"
      }
    }
  }
};

export function buildMessages({ question, operationsContext }) {
  return [
    {
      role: "system",
      content: [
        "You are an enterprise operations assistant.",
        "Answer only from the provided sanitized JSON context.",
        "Do not invent tour, guide, payment, logistics, or customer details.",
        "If the context is not enough, mark confidence as low and list missingInformation.",
        "Prefer a concise answer that an operations user can review before taking action."
      ].join(" ")
    },
    {
      role: "user",
      content: JSON.stringify(
        {
          question,
          operationsContext
        },
        null,
        2
      )
    }
  ];
}

export function buildMistralRequest({
  question,
  operationsContext,
  model = "mistral-small-latest"
}) {
  return {
    model,
    temperature: 0.1,
    max_tokens: 700,
    messages: buildMessages({ question, operationsContext }),
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "operations_workflow_answer",
        strict: true,
        schema: structuredAnswerSchema
      }
    }
  };
}

export async function callMistral({ apiKey, requestBody, fetchImpl = fetch, signal }) {
  if (!apiKey) {
    throw new Error(
      "MISTRAL_API_KEY is required for live API calls. Create .env from .env.example or set the environment variable before running live mode."
    );
  }

  const response = await fetchImpl("https://api.mistral.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    signal,
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Mistral API request failed: ${response.status} ${body}`);
  }

  return response.json();
}

export function extractAssistantContent(apiResponse) {
  const content = apiResponse?.choices?.[0]?.message?.content;

  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .filter((part) => part?.type === "text" && typeof part.text === "string")
      .map((part) => part.text)
      .join("");
  }

  throw new Error("Could not find assistant content in the Mistral response.");
}

export function parseStructuredAnswer(content) {
  const parsed = typeof content === "string" ? JSON.parse(content) : content;

  const requiredFields = [
    "answer",
    "confidence",
    "matchedRecords",
    "recommendedActions",
    "needsHumanReview",
    "missingInformation"
  ];

  for (const field of requiredFields) {
    if (!(field in parsed)) {
      throw new Error(`Structured answer is missing field: ${field}`);
    }
  }

  return parsed;
}

export function buildOfflineAnswer(question, operationsContext) {
  const lowerQuestion = question.toLowerCase();
  const wantsChineseGuide = lowerQuestion.includes("chinese");
  const pendingTours = operationsContext.tours.filter((tour) => {
    if (wantsChineseGuide) {
      return tour.language.toLowerCase() === "chinese";
    }

    return tour.status !== "confirmed" || tour.requiresPaymentCheck;
  });

  const matchedGuides = operationsContext.guides.filter((guide) => {
    if (!wantsChineseGuide) {
      return false;
    }

    return guide.languages.some((language) => language.toLowerCase() === "chinese");
  });

  return {
    answer:
      pendingTours.length === 0
        ? "No matching operational issue was found in the sample context."
        : `Found ${pendingTours.length} matching tour record(s) that need an operator review.`,
    confidence: pendingTours.length > 0 ? "medium" : "low",
    matchedRecords: [
      ...pendingTours.map((tour) => ({
        recordType: "tour",
        recordId: tour.tourId,
        reason: `Status is ${tour.status}; language is ${tour.language}.`
      })),
      ...matchedGuides.map((guide) => ({
        recordType: "guide",
        recordId: guide.guideId,
        reason: "Guide has the requested language in the sample context."
      }))
    ],
    recommendedActions:
      pendingTours.length > 0
        ? [
            "Review matched tour records with an operations user.",
            "Confirm guide availability before updating the production workflow.",
            "Use the structured output as an assistant result, not an automatic final decision."
          ]
        : ["Ask for a more specific tour date, city, language, or status."],
    needsHumanReview: true,
    missingInformation:
      pendingTours.length > 0
        ? []
        : ["No matching tour or guide record was found in the provided context."]
  };
}
