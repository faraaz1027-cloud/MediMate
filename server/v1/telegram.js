export class TelegramError extends Error {
  constructor(code, uncertain = false) {
    super(code);
    Object.assign(this, { code, uncertain });
  }
}
export function createTelegram({
  token = process.env.TELEGRAM_BOT_TOKEN || "",
  username = process.env.TELEGRAM_BOT_USERNAME || "",
  fetchImpl = fetch,
  timeoutMs = 8000,
} = {}) {
  const enabled =
    /^\d+:[A-Za-z0-9_-]{20,}$/.test(token) &&
    /^[A-Za-z0-9_]{5,32}$/.test(username);
  async function call(method, body, timeout = timeoutMs) {
    if (!enabled) throw new TelegramError("NOT_CONFIGURED");
    const controller = new AbortController(),
      timer = setTimeout(() => controller.abort(), timeout);
    try {
      const r = await fetchImpl(
        `https://api.telegram.org/bot${token}/${method}`,
        {
          method: "POST",
          redirect: "error",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: controller.signal,
        },
      );
      const reader = r.body.getReader(),
        chunks = [];
      let size = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 256 * 1024) {
          await reader.cancel();
          throw new TelegramError("RESPONSE_INVALID", true);
        }
        chunks.push(Buffer.from(value));
      }
      let data;
      try {
        data = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      } catch {
        throw new TelegramError("RESPONSE_INVALID", true);
      }
      if (data?.ok === false)
        throw new TelegramError(
          data.error_code === 429
            ? "RATE_LIMITED"
            : data.error_code === 403
              ? "RECIPIENT_BLOCKED"
              : "PROVIDER_REJECTED",
        );
      if (!r.ok || data?.ok !== true)
        throw new TelegramError("RESPONSE_INVALID", true);
      return data.result;
    } catch (e) {
      if (e instanceof TelegramError) throw e;
      throw new TelegramError("OUTCOME_UNKNOWN", true);
    } finally {
      clearTimeout(timer);
    }
  }
  return {
    enabled,
    username: enabled ? username : null,
    async sendTaskNotice(chatId) {
      const r = await call("sendMessage", {
        chat_id: chatId,
        text: "MediMate: an assigned task has an update. Sign in to review your caregiver tasks.",
      });
      if (!Number.isSafeInteger(r?.message_id))
        throw new TelegramError("RESPONSE_INVALID", true);
      return { messageId: String(r.message_id) };
    },
    async updates(offset) {
      const r = await call(
        "getUpdates",
        { offset, limit: 25, timeout: 5, allowed_updates: ["message"] },
        15000,
      );
      if (!Array.isArray(r)) throw new TelegramError("RESPONSE_INVALID");
      return r;
    },
  };
}
