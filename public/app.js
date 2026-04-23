const storageKeys = {
  autoRefresh: "nexsms:autoRefresh",
  format: "nexsms:format",
  phoneNumber: "nexsms:phoneNumber",
  pollMs: "nexsms:pollMs",
};

const form = document.querySelector("#sms-form");
const apiKeyInput = document.querySelector("#apiKey");
const phoneNumberInput = document.querySelector("#phoneNumber");
const formatInput = document.querySelector("#format");
const pollMsInput = document.querySelector("#pollMs");
const autoRefreshInput = document.querySelector("#autoRefresh");
const fetchButton = document.querySelector("#fetchButton");
const copyButton = document.querySelector("#copyButton");
const statusNode = document.querySelector("#status");
const refreshMetaNode = document.querySelector("#refreshMeta");
const apiKeyHintNode = document.querySelector("#apiKeyHint");

const latestCodeNode = document.querySelector("#latestCode");
const resultPhoneNode = document.querySelector("#resultPhone");
const expiresTimeNode = document.querySelector("#expiresTime");
const smsTimeNode = document.querySelector("#smsTime");
const resultFormatNode = document.querySelector("#resultFormat");
const latestTextNode = document.querySelector("#latestText");
const messageListNode = document.querySelector("#messageList");
const rawPayloadNode = document.querySelector("#rawPayload");

let pollTimer = null;
let latestCode = "";
let hasServerApiKey = false;

restoreState();
await loadConfig();
if (autoRefreshInput.checked && phoneNumberInput.value.trim()) {
  fetchMessages({ silentLoading: true });
}
syncPolling();

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  saveState();
  await fetchMessages();
  syncPolling();
});

copyButton.addEventListener("click", async () => {
  if (!latestCode) {
    setStatus("Nothing to copy yet.", "idle");
    return;
  }

  try {
    await navigator.clipboard.writeText(latestCode);
    setStatus("Latest code copied to clipboard.", "success");
  } catch (error) {
    setStatus(`Clipboard error: ${error.message}`, "error");
  }
});

phoneNumberInput.addEventListener("input", saveState);
formatInput.addEventListener("change", saveState);
pollMsInput.addEventListener("change", () => {
  saveState();
  syncPolling();
});
autoRefreshInput.addEventListener("change", () => {
  saveState();
  syncPolling();
});

async function loadConfig() {
  try {
    const response = await fetch("/api/config");
    const payload = await response.json();
    hasServerApiKey = Boolean(payload.hasServerApiKey);
    apiKeyHintNode.textContent = hasServerApiKey
      ? "Server .env already contains NEXSMS_API_KEY. This field is optional."
      : "Server .env has no key. Paste an API key here or set NEXSMS_API_KEY locally.";
  } catch (error) {
    apiKeyHintNode.textContent = `Could not read local config: ${error.message}`;
  }
}

function restoreState() {
  phoneNumberInput.value = localStorage.getItem(storageKeys.phoneNumber) || "";
  formatInput.value = localStorage.getItem(storageKeys.format) || "json_latest";
  pollMsInput.value = localStorage.getItem(storageKeys.pollMs) || "10000";
  autoRefreshInput.checked = localStorage.getItem(storageKeys.autoRefresh) !== "false";
}

function saveState() {
  localStorage.setItem(storageKeys.phoneNumber, phoneNumberInput.value.trim());
  localStorage.setItem(storageKeys.format, formatInput.value);
  localStorage.setItem(storageKeys.pollMs, pollMsInput.value);
  localStorage.setItem(storageKeys.autoRefresh, String(autoRefreshInput.checked));
}

function syncPolling() {
  window.clearInterval(pollTimer);
  pollTimer = null;

  if (!autoRefreshInput.checked || !phoneNumberInput.value.trim()) {
    return;
  }

  pollTimer = window.setInterval(() => {
    fetchMessages({ silentLoading: true });
  }, Number.parseInt(pollMsInput.value, 10));
}

async function fetchMessages({ silentLoading = false } = {}) {
  const phoneNumber = phoneNumberInput.value.trim();
  if (!phoneNumber) {
    setStatus("Phone number is required.", "error");
    phoneNumberInput.focus();
    return;
  }

  if (!silentLoading) {
    setLoading(true);
  }

  const payload = {
    phoneNumber,
    format: formatInput.value,
  };

  if (apiKeyInput.value.trim()) {
    payload.apiKey = apiKeyInput.value.trim();
  }

  try {
    const response = await fetch("/api/sms/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    rawPayloadNode.textContent = JSON.stringify(data, null, 2);

    if (!response.ok || !data.ok) {
      renderResponse(data);
      setStatus(data.error || "The provider request failed.", "error");
      return;
    }

    renderResponse(data);
    setStatus("Messages updated successfully.", "success");
  } catch (error) {
    setStatus(`Request failed: ${error.message}`, "error");
  } finally {
    setLoading(false);
  }
}

function renderResponse(data) {
  const normalized = data.normalized || {};
  const latestMessage = normalized.latestMessage || {};
  const messages = Array.isArray(normalized.messages) ? normalized.messages : [];

  latestCode = normalized.latestCode || "";
  latestCodeNode.textContent = latestCode || "--";
  resultPhoneNode.textContent = normalized.phoneNumber || phoneNumberInput.value.trim() || "--";
  expiresTimeNode.textContent = normalized.expiresTime || "--";
  smsTimeNode.textContent = latestMessage.smsTime || "--";
  resultFormatNode.textContent = normalized.format || formatInput.value;
  latestTextNode.textContent =
    latestMessage.text ||
    normalized.rawText ||
    (messages.length ? messages[0].text : "No SMS content yet.");

  refreshMetaNode.textContent = data.requestedAt
    ? `Last request: ${new Date(data.requestedAt).toLocaleString()}`
    : "No requests sent yet.";

  if (!messages.length) {
    messageListNode.innerHTML =
      '<div class="empty-state">No structured SMS messages returned for this lookup yet.</div>';
    return;
  }

  const rendered = messages
    .map(
      (message) => `
        <article class="message-item">
          <header>
            <div>
              <h3>${escapeHtml(message.phoneNumber || "--")}</h3>
              <span class="message-code">${escapeHtml(message.code || "No code")}</span>
            </div>
            <time>${escapeHtml(message.smsTime || "--")}</time>
          </header>
          <p>${escapeHtml(message.text || "--")}</p>
        </article>
      `
    )
    .join("");

  messageListNode.innerHTML = rendered;
}

function setLoading(isLoading) {
  fetchButton.disabled = isLoading;
  fetchButton.textContent = isLoading ? "Fetching..." : "Fetch now";
  if (isLoading) {
    setStatus("Querying NexSMS...", "loading");
  }
}

function setStatus(text, variant) {
  statusNode.textContent = text;
  statusNode.className = `status ${variant}`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
