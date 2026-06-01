import assert from "node:assert/strict";
import test from "node:test";
import { loadOperationsContextFromCsv, normalizeRowsToOperationsContext } from "../src/data-store.js";

test("normalizeRowsToOperationsContext builds tours and guides", () => {
  const context = normalizeRowsToOperationsContext([
    {
      entity: "tour",
      id: "TOUR-1",
      date: "2026-06-10",
      city: "Tokyo",
      language: "Chinese",
      status: "guide_pending",
      travelerCount: "12",
      requiresPaymentCheck: "true"
    },
    {
      entity: "guide",
      id: "GUIDE-1",
      languages: "Chinese|English",
      availableDates: "2026-06-10|2026-06-11"
    }
  ]);

  assert.equal(context.tours.length, 1);
  assert.equal(context.guides.length, 1);
  assert.equal(context.tours[0].requiresPaymentCheck, true);
  assert.deepEqual(context.guides[0].languages, ["Chinese", "English"]);
});

test("loadOperationsContextFromCsv reads sample csv file", async () => {
  const context = await loadOperationsContextFromCsv();

  assert.ok(context.tours.length >= 1);
  assert.ok(context.guides.length >= 1);
  assert.equal(context.tours[0].tourId, "TOUR-1024");
});
