# GPT Image to Codex OpenAI-Compatible API

Single-file Node.js proxy that exposes a small OpenAI-compatible API on top of a locally logged-in Codex CLI.

The image endpoint implements:

```text
POST /v1/images/generations
```

and uses Codex built-in `$imagegen` under the hood.

## Files

- `codex-openai-proxy.mjs`: proxy server.
- `docs/codex-openai-proxy.md`: full setup and usage guide.

## Quick Start

```bash
node codex-openai-proxy.mjs
```

Then open:

```text
http://localhost:4101/
```

Read the full documentation:

```text
docs/codex-openai-proxy.md
```

## Security

Before exposing the proxy outside localhost, edit `CONFIG.requiredApiKey` in `codex-openai-proxy.mjs`.

Do not commit real API keys, public server IPs, logs, `.env` files, or Codex local data.

## Friendly Links

[![LINUXDO](https://img.shields.io/badge/%E7%A4%BE%E5%8C%BA-LINUXDO-0086c9?style=for-the-badge&labelColor=555555)](https://linux.do)
