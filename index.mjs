import { appendFileSync } from "node:fs";
import { resolve as resolvePath } from "node:path";

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

function isHeadersLike(headers) {
  return (
    headers &&
    typeof headers === "object" &&
    typeof headers.has === "function" &&
    typeof headers.set === "function"
  );
}

function normalizeHeadersContainer(headers) {
  // 尽量保留原始 headers 类型，避免影响上游对请求的序列化行为。
  // - Headers-like: 原样返回
  // - Array<[string,string]>: 浅拷贝
  // - Plain object: 浅拷贝
  if (!headers || typeof headers !== "object") {
    return {};
  }

  if (isHeadersLike(headers)) {
    return headers;
  }

  if (Array.isArray(headers)) {
    return headers.slice();
  }

  return { ...headers };
}

function hasHeader(headers, name) {
  // Header 名大小写不敏感（plain object）。
  const target = name.toLowerCase();
  return Object.keys(headers).some((key) => key.toLowerCase() === target);
}

function hasHeaderEntry(headers, name) {
  // 兼容 Headers-like / Array / plain object。
  if (!headers || typeof headers !== "object") {
    return false;
  }

  if (isHeadersLike(headers)) {
    return headers.has(name);
  }

  if (Array.isArray(headers)) {
    const target = name.toLowerCase();
    return headers.some((pair) => Array.isArray(pair) && String(pair[0]).toLowerCase() === target);
  }

  return hasHeader(headers, name);
}

function setHeaderIfMissing(headers, name, value) {
  if (hasHeaderEntry(headers, name)) {
    return;
  }

  if (isHeadersLike(headers)) {
    headers.set(name, value);
    return;
  }

  if (Array.isArray(headers)) {
    headers.push([name, value]);
    return;
  }

  headers[name] = value;
}

function getProviderApiNpm(provider) {
  // 兼容不同版本/实现的 provider 结构（ProviderContext / 旧结构）。
  return provider?.api?.npm ?? provider?.info?.api?.npm;
}

function isDebugEnvEnabled() {
  return process?.env?.OPENCODE_SESSION_CACHE_DEBUG === "1";
}

function isDebugEnabled(provider) {
  if (isDebugEnvEnabled()) {
    return true;
  }
  if (provider?.options?.sessionCacheDebug === true) {
    return true;
  }
  return configDebugEnabled;
}

let configDebugEnabled = false;
let debugFileDisabled = false;
let debugFilePath = resolvePath(process.cwd(), "OPENCODE_SESSION_CACHE_DEBUG.log");

function resolveDebugFilePath(pluginInput) {
  const override = process?.env?.OPENCODE_SESSION_CACHE_DEBUG_FILE;
  if (typeof override === "string" && override.trim()) {
    debugFilePath = override.trim();
    return;
  }

  const base = pluginInput?.worktree ?? pluginInput?.directory;
  if (typeof base === "string" && base.trim()) {
    debugFilePath = resolvePath(base.trim(), "OPENCODE_SESSION_CACHE_DEBUG.log");
  }
}

function debugLog(line) {
  if (debugFileDisabled) {
    return;
  }

  try {
    appendFileSync(debugFilePath, line + "\n");
  } catch (_err) {
    // 调试日志写入失败不应影响请求；尝试写入 /tmp 作为兜底。
    try {
      appendFileSync("/tmp/OPENCODE_SESSION_CACHE_DEBUG.log", line + "\n");
    } catch (_err2) {
      // 两个位置都失败则禁用，避免重复触发异常。
      debugFileDisabled = true;
    }
  }
}

function configWantsDebug(config) {
  const providers = config?.provider ?? config?.providers;
  if (!providers || typeof providers !== "object") {
    return false;
  }

  for (const value of Object.values(providers)) {
    const opts = value?.options;
    if (opts?.sessionCacheDebug === true) {
      return true;
    }
  }
  return false;
}

function maskSessionId(sessionId) {
  if (typeof sessionId !== "string" || sessionId.length === 0) {
    return "";
  }
  const tail = sessionId.length > 8 ? sessionId.slice(-8) : sessionId;
  return `${sessionId.slice(0, 5)}...${tail}`;
}

export async function OpenAISessionCachePlugin(_input) {
  // 尽量把调试日志写到 OpenCode 的 worktree（通常就是当前项目目录）。
  resolveDebugFilePath(_input);
  return {
    // 启动阶段日志：用于确认插件是否被加载、调试开关是否生效。
    // 注意：仅在显式开启调试时才写文件（避免默认污染磁盘）。
    config: async (config) => {
      const debug = isDebugEnvEnabled() || configWantsDebug(config);
      if (!debug) {
        return;
      }

      configDebugEnabled = true;
      debugLog(
        `${new Date().toISOString()} [opencode-openai-session-cache] config hook enabled ` +
          `cwd=${process.cwd?.()} debugFile=${debugFilePath}`,
      );
    },
    "chat.params": async (input, output) => {
      const provider = await resolveProvider(input.provider);

      const debug = isDebugEnabled(provider);
      if (debug) {
        debugLog(`${new Date().toISOString()} [opencode-openai-session-cache] chat.params enter`);
      }

      // 仅对 OpenAI provider 生效。
      if (!provider || getProviderApiNpm(provider) !== "@ai-sdk/openai") {
        if (debug) {
          debugLog(
            `${new Date().toISOString()} [opencode-openai-session-cache] skip: non-openai provider`,
          );
        }
        return;
      }

      // 需要显式开启开关，避免对默认行为造成影响。
      if (provider.options?.cacheSessionId !== true) {
        if (debug) {
          debugLog(
            `${new Date().toISOString()} [opencode-openai-session-cache] skip: cacheSessionId not true`,
          );
        }
        return;
      }

      // 没有合法的 sessionID 时直接无操作。
      if (typeof input.sessionID !== "string") {
        if (debug) {
          debugLog(`${new Date().toISOString()} [opencode-openai-session-cache] skip: invalid sessionID`);
        }
        return;
      }

      // 仅替换前缀 `ses_` -> `sess_`（只替换开头）。
      const sess = input.sessionID.replace(/^ses_/, "sess_");
      const headers = normalizeHeadersContainer(output.options?.headers);

      const headersType = Array.isArray(headers) ? "array" : isHeadersLike(headers) ? "headers" : "object";
      const hadX = hasHeaderEntry(headers, "x-session-id");
      const hadSess = hasHeaderEntry(headers, "session_id");

      // 不覆盖用户显式设置的 headers。
      setHeaderIfMissing(headers, "x-session-id", sess);
      setHeaderIfMissing(headers, "session_id", sess);

      if (debug) {
        debugLog(
          `${new Date().toISOString()} ` +
            `[opencode-openai-session-cache] enabled cacheSessionId=true ` +
            `session=${maskSessionId(sess)} headersType=${headersType} ` +
            `x-session-id=${hadX ? "keep" : "set"} session_id=${hadSess ? "keep" : "set"}`,
        );
      }

      // 仅更新 output.options 的 headers 字段，保留其它 options。
      output.options = {
        ...output.options,
        headers,
      };
    },
  };
}
