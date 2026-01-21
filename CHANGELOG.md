# Changelog

## 0.1.1

- Preserve original `headers` container type (Headers/array/object) to avoid affecting downstream request serialization.
- Improve OpenCode provider compatibility by supporting `provider.info.api.npm` shape.

## 0.1.2

- Add optional debug logging gated by `OPENCODE_SESSION_CACHE_DEBUG=1`.

## 0.1.3

- Write debug logs to `OPENCODE_SESSION_CACHE_DEBUG.log` when `OPENCODE_SESSION_CACHE_DEBUG=1`.

## 0.1.0

- Initial release: OpenCode plugin that injects `x-session-id` and `session_id` for OpenAI prompt caching.
