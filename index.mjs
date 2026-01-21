// OpenCode 插件：为 OpenAI Prompt Caching 注入会话相关 headers。
// 行为契约（与 README/docs 一致）：
// - 仅对 `provider.api.npm === "@ai-sdk/openai"` 生效
// - 仅在 `provider.options.cacheSessionId === true` 时启用
// - header 值：把 sessionID 的前缀 `ses_`（仅开头）替换为 `sess_`
// - 仅在缺失时写入 `x-session-id` 与 `session_id`，不覆盖用户显式设置

function resolveProvider(inputProvider) {
  // `input.provider` 可能是对象，也可能是 thenable；统一转成 Promise 便于 await。
  if (inputProvider && typeof inputProvider.then === "function") {
    return inputProvider;
  }
  return Promise.resolve(inputProvider);
}

function normalizeHeaders(headers) {
  // 兼容多种 headers 形态（普通对象 / Headers-like）。
  if (!headers || typeof headers !== "object") {
    return {};
  }

  if (typeof headers.entries === "function") {
    return Object.fromEntries(headers.entries());
  }

  return { ...headers };
}

function hasHeader(headers, name) {
  // Header 名大小写不敏感。
  const target = name.toLowerCase();
  return Object.keys(headers).some((key) => key.toLowerCase() === target);
}

export async function OpenAISessionCachePlugin(_input) {
  return {
    "chat.params": async (input, output) => {
      const provider = await resolveProvider(input.provider);
      // 仅对 OpenAI provider 生效。
      if (!provider || provider.api?.npm !== "@ai-sdk/openai") {
        return;
      }

      // 需要显式开启开关，避免对默认行为造成影响。
      if (provider.options?.cacheSessionId !== true) {
        return;
      }

      // 没有合法的 sessionID 时直接无操作。
      if (typeof input.sessionID !== "string") {
        return;
      }

      // 仅替换前缀 `ses_` -> `sess_`（只替换开头）。
      const sess = input.sessionID.replace(/^ses_/, "sess_");
      const headers = normalizeHeaders(output.options?.headers);

      // 不覆盖用户显式设置的 headers。
      if (!hasHeader(headers, "x-session-id")) {
        headers["x-session-id"] = sess;
      }

      if (!hasHeader(headers, "session_id")) {
        headers["session_id"] = sess;
      }

      // 仅更新 output.options 的 headers 字段，保留其它 options。
      output.options = {
        ...output.options,
        headers,
      };
    },
  };
}
