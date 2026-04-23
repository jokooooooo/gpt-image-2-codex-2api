# Codex OpenAI-Compatible Proxy

This project includes a single-file Node.js proxy that exposes a small OpenAI-compatible API on top of a locally logged-in Codex CLI.

It is intended for personal/local automation, browser testing, and controlled private deployments. It is not an official OpenAI API server.

## Files

- `codex-openai-proxy.mjs`: Node.js HTTP proxy server.
- `codex-proxy.html`: browser test console served by the proxy at `/`.
- `package.json`: includes `npm run codex-proxy`.

## Features

- `GET /health`
- `GET /v1/models`
- `POST /v1/chat/completions`
- `POST /v1/responses`
- `POST /v1/images/generations`
- Browser console at `GET /`
- Codex built-in `$imagegen` backend for image generation.
- No Python image CLI and no `OPENAI_API_KEY` requirement for the image endpoint.
- Windows support via shell-based `codex` spawning.
- CORS support for local browser testing.

## Security

Before exposing the proxy outside localhost, edit the `CONFIG` object in `codex-openai-proxy.mjs`:

```js
const CONFIG = {
  host: "0.0.0.0",
  port: 4100,
  extraPorts: [4101],
  requiredApiKey: "CHANGE_ME_LOCAL_ONLY",
};
```

Use a strong private token for `requiredApiKey`. Do not commit real API keys, public IP addresses, access tokens, logs, or `.env` files to GitHub.

The proxy shells out to the local `codex` CLI. Treat it as a privileged local service, especially when it is reachable from another machine.

## Prerequisites

1. Node.js 20+.
2. Codex CLI installed and logged in.
3. Confirm `codex` works in the target shell:

```bash
codex exec --skip-git-repo-check --sandbox read-only "Reply with exactly OK"
```

On Windows, confirm this works from `cmd` or PowerShell:

```powershell
codex exec --skip-git-repo-check --sandbox read-only "Reply with exactly OK"
```

## Start

```bash
npm run codex-proxy
```

Or:

```bash
node codex-openai-proxy.mjs
```

Default local URLs:

- `http://localhost:4100/health`
- `http://localhost:4100/v1/models`
- `http://localhost:4101/`

The HTML console auto-detects same-origin deployments. If you open it from the proxy itself, it uses the page origin as the Base URL.

## Run In Background On Linux

```bash
setsid -f bash -c 'cd /path/to/project && exec node codex-openai-proxy.mjs >> codex-openai-proxy.log 2>&1 < /dev/null'
```

Check process and ports:

```bash
ps -ef | grep '[c]odex-openai-proxy'
ss -ltnp | grep -E ':(4100|4101)'
```

If you expose the ports publicly, also allow them in the host firewall and cloud security group:

```bash
sudo ufw allow 4100/tcp
sudo ufw allow 4101/tcp
```

## API Authentication

Preferred request header:

```http
Authorization: Bearer YOUR_PRIVATE_TOKEN
```

For simple browser testing where preflight is a problem, the proxy also accepts `?api_key=YOUR_PRIVATE_TOKEN`. Avoid this in production because query strings can appear in logs.

## Image Generation

Request:

```bash
curl http://localhost:4100/v1/images/generations \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_PRIVATE_TOKEN" \
  -d '{
    "model": "codex-imagegen",
    "prompt": "A simple blue square icon, no text",
    "n": 1,
    "response_format": "b64_json"
  }'
```

Response format:

```json
{
  "created": 1776910000,
  "data": [
    {
      "b64_json": "iVBORw0KGgo...",
      "revised_prompt": null
    }
  ]
}
```

The image endpoint uses:

```text
codex exec "$imagegen ..."
```

It reads image output from Codex session logs first, then falls back to the generated image files under:

```text
$CODEX_HOME/generated_images
```

If `CODEX_HOME` is not set, the default is:

```text
~/.codex/generated_images
```

## Chat Completions

```bash
curl http://localhost:4100/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_PRIVATE_TOKEN" \
  -d '{
    "model": "codex-cli",
    "messages": [
      { "role": "user", "content": "Reply with a one-line status." }
    ]
  }'
```

## Responses API

```bash
curl http://localhost:4100/v1/responses \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_PRIVATE_TOKEN" \
  -d '{
    "model": "codex-cli",
    "input": "Explain this project briefly."
  }'
```

## Browser Console

Open:

```text
http://localhost:4101/
```

If hosted on a remote server, open the server URL in the browser and enter the private token in the API key field.

The console uses:

- `Authorization` plus `application/json` when the page is same-origin with the proxy.
- Query key plus `text/plain` only as a cross-origin fallback to avoid CORS preflight issues.

## Troubleshooting

Check health:

```bash
curl http://localhost:4100/health \
  -H "Authorization: Bearer YOUR_PRIVATE_TOKEN"
```

Check CORS preflight:

```bash
curl -i -X OPTIONS http://localhost:4100/v1/images/generations \
  -H "Origin: http://localhost:8080" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: authorization,content-type"
```

If the process is listening but requests hang, restart the proxy and inspect `codex-openai-proxy.log`.

If image generation completes but no image is returned, check:

```bash
find ~/.codex/generated_images -type f
find ~/.codex/sessions -type f -name '*.jsonl'
```

On Windows, check:

```powershell
$codexHome = if ($env:CODEX_HOME) { $env:CODEX_HOME } else { Join-Path $env:USERPROFILE ".codex" }
Get-ChildItem "$codexHome\generated_images" -Recurse
Get-ChildItem "$codexHome\sessions" -Recurse -Filter *.jsonl
```

## GitHub Publishing Checklist

Before pushing:

- Replace `CONFIG.requiredApiKey` with a placeholder.
- Remove real server IP addresses from docs and HTML.
- Do not commit `.env`.
- Do not commit `*.log`.
- Do not commit `$CODEX_HOME` or generated images.
- Verify no secrets remain:

```bash
grep -R "YOUR_REAL_TOKEN_OR_IP" -n . --exclude-dir=.git
```
