# NexSMS SMS Viewer

Minimal local page for the NexSMS "get sms messages" API documented at:

- https://doc.nexsms.net/
- Upstream endpoint: `GET https://api.nexsms.net/api/sms/messages`

This project creates:

- a local proxy at `POST /api/sms/messages`
- a browser UI at `http://localhost:3000`

The proxy supports the document formats:

- `json_latest`
- `json_list`
- `text_code`
- `text_info`

## Run

1. Copy the env template:

   ```bash
   cp .env.example .env
   ```

2. Set your API key in `.env`:

   ```bash
   NEXSMS_API_KEY=YOUR_KEY
   ```

3. Start the app:

   ```bash
   npm start
   ```

4. Open `http://localhost:3000`

If you do not want to store the key in `.env`, leave it empty and paste the key into the page form. The browser still talks only to the local proxy, and the proxy makes the request to NexSMS.

## Codex OpenAI-Compatible Proxy

This repo also includes a single-file OpenAI-style proxy for the local `codex` CLI, including `/v1/images/generations` backed by Codex built-in `$imagegen`.

See [docs/codex-openai-proxy.md](docs/codex-openai-proxy.md) for setup, security notes, browser usage, endpoint examples, and GitHub publishing checks.

## Request Mapping

Frontend request:

```http
POST /api/sms/messages
Content-Type: application/json

{
  "phoneNumber": "447379841804",
  "format": "json_latest",
  "apiKey": "optional-if-not-set-in-env"
}
```

Proxy request sent to NexSMS:

```http
GET https://api.nexsms.net/api/sms/messages?apiKey=...&phoneNumber=447379841804&format=json_latest
```

## Notes

- `phoneNumber` must include the country code.
- `json_list` is the best mode if you want full SMS history on the page.
- `text_code` and `text_info` are supported, but they do not return structured message history.

## Domain Setup

Prepared deployment files:

- `deploy/sms-viewer.service`
- `deploy/nginx-sms.get-money.locker.conf`

The intended public domain is:

- `https://sms.get-money.locker`

Before enabling the Nginx config, make sure `sms.get-money.locker` has a DNS record
pointing to this server. The wildcard origin certificate already covers
`*.get-money.locker`.
