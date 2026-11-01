export class RequestError extends Error {
  constructor(message, { status = 0, code = "NETWORK_ERROR", fields = [], requestId } = {}) {
    super(message);
    Object.assign(this, { status, code, fields, requestId });
  }
}

// Never show proxy HTML, parser exceptions or network internals to the user.
export async function request(path, options = {}) {
  let response;
  try { response = await fetch("/api/v1" + path, { credentials: "same-origin", ...options }); }
  catch (e) {
    if (e.name === "AbortError") throw e;
    throw new RequestError("Cannot reach the server. Check your connection and retry.");
  }
  if (response.status === 204) return null;
  let body;
  try { body = await response.json(); }
  catch { throw new RequestError("The server returned an unexpected response. Please retry.", { status: response.status }); }
  if (!response.ok) {
    const error = body?.error;
    throw new RequestError(typeof error?.message === "string" ? error.message : "Request failed. Please retry.", {
      status: response.status, code: error?.code,
      fields: Array.isArray(error?.fields) ? error.fields.filter((f) => typeof f.path === "string" && typeof f.message === "string") : [],
      requestId: body?.meta?.requestId,
    });
  }
  if (!body || typeof body !== "object" || !("data" in body)) throw new RequestError("The server returned an unexpected response. Please retry.");
  return body;
}
