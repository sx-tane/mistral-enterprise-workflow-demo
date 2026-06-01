import { readFile } from "node:fs/promises";

function stripOptionalQuotes(value) {
  const trimmed = value.trim();

  if (
    (trimmed.startsWith("\"") && trimmed.endsWith("\"")) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
}

export async function loadEnvFileIfPresent(fileUrl = new URL("../.env", import.meta.url)) {
  let content;

  try {
    content = await readFile(fileUrl, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") {
      return false;
    }

    throw error;
  }

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");

    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const value = stripOptionalQuotes(line.slice(separatorIndex + 1));

    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }

  return true;
}
