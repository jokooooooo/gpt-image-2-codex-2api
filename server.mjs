import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, "public");
const envPath = path.join(__dirname, ".env");

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

const ALLOWED_FORMATS = new Set([
  "json_latest",
  "json_list",
  "text_code",
  "text_info",
]);

await loadEnvFile(envPath);

const port = Number.parseInt(process.env.PORT || "3000", 10);

const server = createServer(async (req, res) => {
  try {
    const requestUrl = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

    if (req.method === "GET" && requestUrl.pathname === "/api/config") {
      return sendJson(res, 200, {
        hasServerApiKey: Boolean(process.env.NEXSMS_API_KEY?.trim()),
      });
    }

    if (req.method === "POST" && requestUrl.pathname === "/api/sms/messages") {
      return handleSmsLookup(req, res);
    }

    if (req.method !== "GET") {
      return sendJson(res, 405, { ok: false, error: "Method not allowed." });
    }

    return serveStatic(requestUrl.pathname, res);
  } catch (error) {
    console.error(error);
    return sendJson(res, 500, {
      ok: false,
      error: "Unexpected server error.",
    });
  }
});

server.listen(port, () => {
  console.log(`NexSMS viewer running at http://localhost:${port}`);
});

async function loadEnvFile(filePath) {
  try {
    const raw = await readFile(filePath, "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) {
        continue;
      }

      const separatorIndex = trimmed.indexOf("=");
      if (separatorIndex <= 0) {
        continue;
      }

      const key = trimmed.slice(0, separatorIndex).trim();
      const value = trimmed.slice(separatorIndex + 1).trim();
      if (!process.env[key]) {
        process.env[key] = stripOptionalQuotes(value);
      }
    }
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }
}

function stripOptionalQuotes(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}

async function handleSmsLookup(req, res) {
  let body;

  try {
    body = await readJsonBody(req);
  } catch (error) {
    return sendJson(res, 400, {
      ok: false,
      error: error.message,
    });
  }

  const apiKey = (body.apiKey || process.env.NEXSMS_API_KEY || "").trim();
  const phoneNumber = String(body.phoneNumber || "").trim();
  const format = String(body.format || "json_latest").trim();

  if (!apiKey) {
    return sendJson(res, 400, {
      ok: false,
      error: "Missing API key. Set NEXSMS_API_KEY or provide apiKey in the form.",
    });
  }

  if (!phoneNumber) {
    return sendJson(res, 400, {
      ok: false,
      error: "phoneNumber is required.",
    });
  }

  if (!ALLOWED_FORMATS.has(format)) {
    return sendJson(res, 400, {
      ok: false,
      error: "Invalid format value.",
    });
  }

  const upstreamUrl = new URL("https://api.nexsms.net/api/sms/messages");
  upstreamUrl.searchParams.set("apiKey", apiKey);
  upstreamUrl.searchParams.set("phoneNumber", phoneNumber);
  upstreamUrl.searchParams.set("format", format);

  let upstreamResponse;
  try {
    upstreamResponse = await fetch(upstreamUrl, {
      headers: {
        "accept": "application/json, text/plain;q=0.9, */*;q=0.8",
        "user-agent": "nexsms-sms-viewer/0.1",
      },
    });
  } catch (error) {
    return sendJson(res, 502, {
      ok: false,
      error: "Failed to reach NexSMS.",
      details: error.message,
    });
  }

  const rawBody = await upstreamResponse.text();
  const parsedBody = parseProviderPayload(rawBody);
  const providerSucceeded =
    upstreamResponse.ok &&
    (!isPlainObject(parsedBody) || parsedBody.code === undefined || parsedBody.code === 0);

  return sendJson(res, providerSucceeded ? 200 : upstreamResponse.status || 502, {
    ok: providerSucceeded,
    requestedAt: new Date().toISOString(),
    provider: {
      status: upstreamResponse.status,
      body: parsedBody,
    },
    normalized: normalizeSmsPayload(parsedBody, rawBody, format, phoneNumber),
    error: providerSucceeded ? null : getProviderError(parsedBody, upstreamResponse.status),
  });
}

function parseProviderPayload(rawBody) {
  const trimmed = rawBody.trim();
  if (!trimmed) {
    return "";
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    return trimmed;
  }
}

function getProviderError(parsedBody, status) {
  if (typeof parsedBody === "string" && parsedBody) {
    return parsedBody;
  }

  if (isPlainObject(parsedBody) && typeof parsedBody.message === "string") {
    return parsedBody.message;
  }

  return `NexSMS request failed with status ${status}.`;
}

function normalizeSmsPayload(parsedBody, rawBody, format, phoneNumber) {
  const normalized = {
    format,
    phoneNumber,
    latestCode: null,
    latestMessage: null,
    expiresTime: null,
    messages: [],
    rawText: typeof parsedBody === "string" ? parsedBody : rawBody,
  };

  if (typeof parsedBody === "string") {
    const text = parsedBody.trim();
    if (format === "text_code") {
      normalized.latestCode = text || null;
      return normalized;
    }

    if (format === "text_info") {
      const [code, expiresTime] = text.split("|");
      normalized.latestCode = code?.trim() || null;
      normalized.expiresTime = expiresTime?.trim() || null;
      return normalized;
    }

    return normalized;
  }

  const data = isPlainObject(parsedBody) ? parsedBody.data : null;
  const messages = Array.isArray(data)
    ? data.map(sanitizeMessage)
    : data && isPlainObject(data)
      ? [sanitizeMessage(data)]
      : [];

  normalized.messages = messages;
  normalized.latestMessage = pickLatestMessage(messages);
  normalized.latestCode = normalized.latestMessage?.code || null;
  normalized.expiresTime = normalized.latestMessage?.expiresTime || null;

  return normalized;
}

function sanitizeMessage(message) {
  return {
    phoneNumber: String(message.phoneNumber || ""),
    text: String(message.text || ""),
    code: String(message.code || ""),
    smsTime: String(message.smsTime || ""),
    expiresTime: String(message.expiresTime || ""),
  };
}

function pickLatestMessage(messages) {
  if (!messages.length) {
    return null;
  }

  return [...messages].sort((left, right) =>
    right.smsTime.localeCompare(left.smsTime)
  )[0];
}

async function serveStatic(pathname, res) {
  const resolvedPath = pathname === "/" ? "/index.html" : pathname;
  const absolutePath = path.join(publicDir, path.normalize(resolvedPath));

  if (!absolutePath.startsWith(publicDir)) {
    return sendJson(res, 403, { ok: false, error: "Forbidden." });
  }

  try {
    const file = await readFile(absolutePath);
    const contentType = MIME_TYPES[path.extname(absolutePath)] || "application/octet-stream";
    res.writeHead(200, { "content-type": contentType });
    res.end(file);
  } catch (error) {
    if (error.code === "ENOENT") {
      sendJson(res, 404, { ok: false, error: "Not found." });
      return;
    }

    throw error;
  }
}

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(body);
}

async function readJsonBody(req) {
  const chunks = [];

  for await (const chunk of req) {
    chunks.push(chunk);
  }

  if (!chunks.length) {
    return {};
  }

  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw.trim()) {
    return {};
  }

  try {
    return JSON.parse(raw);
  } catch {
    throw new Error("Request body must be valid JSON.");
  }
}
