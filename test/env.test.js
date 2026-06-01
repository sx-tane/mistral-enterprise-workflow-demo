import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { loadEnvFileIfPresent } from "../src/env.js";

test("loadEnvFileIfPresent loads a local env file without overwriting existing values", async () => {
  const previousApiKey = process.env.MISTRAL_API_KEY;
  const previousModel = process.env.MISTRAL_MODEL;
  const dir = await mkdtemp(join(tmpdir(), "mistral-env-test-"));
  const envPath = join(dir, ".env");

  try {
    delete process.env.MISTRAL_API_KEY;
    process.env.MISTRAL_MODEL = "already-set";

    await writeFile(
      envPath,
      [
        "MISTRAL_API_KEY='test-key'",
        "MISTRAL_MODEL=mistral-small-latest"
      ].join("\n")
    );

    const loaded = await loadEnvFileIfPresent(pathToFileURL(envPath));

    assert.equal(loaded, true);
    assert.equal(process.env.MISTRAL_API_KEY, "test-key");
    assert.equal(process.env.MISTRAL_MODEL, "already-set");
  } finally {
    if (previousApiKey === undefined) {
      delete process.env.MISTRAL_API_KEY;
    } else {
      process.env.MISTRAL_API_KEY = previousApiKey;
    }

    if (previousModel === undefined) {
      delete process.env.MISTRAL_MODEL;
    } else {
      process.env.MISTRAL_MODEL = previousModel;
    }

    await rm(dir, { force: true, recursive: true });
  }
});
