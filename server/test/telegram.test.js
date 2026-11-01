import test from "node:test";
import assert from "node:assert/strict";
import { createTelegram } from "../v1/telegram.js";
const config = {
  token: "123456:TEST_TOKEN_FOR_UNIT_TESTING_ONLY",
  username: "MediMateTestBot",
};
test("Telegram stays disabled without private configuration and never makes a request", async () => {
  let called = false;
  const p = createTelegram({
    token: "",
    username: "",
    fetchImpl: async () => {
      called = true;
    },
  });
  assert.equal(p.enabled, false);
  await assert.rejects(
    () => p.sendTaskNotice("1"),
    (e) => e.code === "NOT_CONFIGURED" && !e.uncertain,
  );
  assert.equal(called, false);
});
test("Telegram uses fixed HTTPS methods and a generic notice without patient/task text", async () => {
  let sent;
  const p = createTelegram({
    ...config,
    fetchImpl: async (url, options) => {
      sent = { url, options };
      return Response.json({ ok: true, result: { message_id: 42 } });
    },
  });
  assert.deepEqual(await p.sendTaskNotice("123"), { messageId: "42" });
  assert.equal(
    sent.url,
    `https://api.telegram.org/bot${config.token}/sendMessage`,
  );
  assert.equal(sent.options.redirect, "error");
  assert.deepEqual(JSON.parse(sent.options.body), {
    chat_id: "123",
    text: "MediMate: an assigned task has an update. Sign in to review your caregiver tasks.",
  });
});
test("Telegram distinguishes explicit rejection from an uncertain network/response outcome", async () => {
  for (const [response, code, uncertain] of [
    [
      () => Response.json({ ok: false, error_code: 429 }),
      "RATE_LIMITED",
      false,
    ],
    [
      () => Response.json({ ok: false, error_code: 403 }),
      "RECIPIENT_BLOCKED",
      false,
    ],
    [() => new Response("<html>", { status: 502 }), "RESPONSE_INVALID", true],
    [
      () => {
        throw Error("do not expose token/url");
      },
      "OUTCOME_UNKNOWN",
      true,
    ],
  ]) {
    const p = createTelegram({ ...config, fetchImpl: response });
    await assert.rejects(
      () => p.sendTaskNotice("123"),
      (e) =>
        e.code === code &&
        e.uncertain === uncertain &&
        !e.message.includes(config.token),
    );
  }
});
test("Telegram timeout aborts, bounds response size and validates update responses", async () => {
  const p = createTelegram({
    ...config,
    timeoutMs: 20,
    fetchImpl: async (_url, { signal }) =>
      new Promise((_, reject) =>
        signal.addEventListener("abort", () => reject(Error())),
      ),
  });
  await assert.rejects(
    () => p.sendTaskNotice("123"),
    (e) => e.uncertain,
  );
  const huge = createTelegram({
    ...config,
    fetchImpl: async () => new Response("x".repeat(256 * 1024 + 1)),
  });
  await assert.rejects(
    () => huge.sendTaskNotice("123"),
    (e) => e.code === "RESPONSE_INVALID" && e.uncertain,
  );
  let payload;
  const poll = createTelegram({
    ...config,
    fetchImpl: async (_url, o) => {
      payload = JSON.parse(o.body);
      return Response.json({ ok: true, result: [] });
    },
  });
  await poll.updates(34);
  assert.deepEqual(payload, {
    offset: 34,
    limit: 25,
    timeout: 5,
    allowed_updates: ["message"],
  });
});
