const form = document.getElementById("ask-form");
const questionField = document.getElementById("question");
const modeField = document.getElementById("mode");
const submitButton = document.getElementById("submit-btn");

const statusPill = document.getElementById("status-pill");
const answerNode = document.getElementById("answer");
const confidenceNode = document.getElementById("confidence");
const humanReviewNode = document.getElementById("human-review");
const matchedNode = document.getElementById("matched-records");
const actionsNode = document.getElementById("actions");
const missingNode = document.getElementById("missing");
const requestIdNode = document.getElementById("request-id");
const debugOutputNode = document.getElementById("debug-output");

function setStatus(text, className = "") {
  statusPill.textContent = text;
  statusPill.className = `pill ${className}`.trim();
}

function clearList(node) {
  while (node.firstChild) {
    node.removeChild(node.firstChild);
  }
}

function renderList(node, values, fallbackText) {
  clearList(node);

  if (!values?.length) {
    const li = document.createElement("li");
    li.textContent = fallbackText;
    node.appendChild(li);
    return;
  }

  for (const value of values) {
    const li = document.createElement("li");
    li.textContent = value;
    node.appendChild(li);
  }
}

function renderAnswer(structuredAnswer) {
  answerNode.textContent = structuredAnswer.answer || "No answer returned.";
  confidenceNode.textContent = structuredAnswer.confidence || "-";
  humanReviewNode.textContent = structuredAnswer.needsHumanReview ? "required" : "optional";

  renderList(
    matchedNode,
    structuredAnswer.matchedRecords?.map(
      (record) => `${record.recordType.toUpperCase()} ${record.recordId} - ${record.reason}`
    ),
    "No matched records."
  );

  renderList(actionsNode, structuredAnswer.recommendedActions, "No suggested actions.");
  renderList(missingNode, structuredAnswer.missingInformation, "No missing information reported.");
}

function renderDebug(debug) {
  requestIdNode.textContent = debug?.requestId || "-";
  debugOutputNode.textContent = JSON.stringify(debug || {}, null, 2);
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const question = questionField.value.trim();
  const mode = modeField.value;

  if (!question) {
    setStatus("missing question", "bad");
    return;
  }

  submitButton.disabled = true;
  setStatus("running", "mono");
  requestIdNode.textContent = "-";
  debugOutputNode.textContent = "Request in progress...";

  try {
    const response = await fetch("/api/assist", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ question, mode })
    });

    const payload = await response.json();
    renderDebug(payload.debug);

    if (!response.ok) {
      throw new Error(payload.error || `Request failed with status ${response.status}`);
    }

    renderAnswer(payload.answer);
    setStatus(payload.mode, payload.mode === "live" ? "good" : "");
  } catch (error) {
    answerNode.textContent = error.message;
    confidenceNode.textContent = "-";
    humanReviewNode.textContent = "-";
    renderList(matchedNode, [], "No matched records.");
    renderList(actionsNode, [], "No suggested actions.");
    renderList(missingNode, [], "No missing information reported.");
    debugOutputNode.textContent = error.message;
    setStatus("error", "bad");
  } finally {
    submitButton.disabled = false;
  }
});
