const HEVY_API_BASE = "https://api.hevyapp.com";

export class HevyApiError extends Error {
  constructor(message, { code = "api", status = 0, retryAfter = null } = {}) {
    super(message);
    this.name = "HevyApiError";
    this.code = code;
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

function responseMessage(payload) {
  return "Hevy returned an error.";
}

export class HevyClient {
  constructor(apiKey, { baseUrl = HEVY_API_BASE, timeoutMs = 15000 } = {}) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.timeoutMs = timeoutMs;
  }

  async request(path, options = {}) {
    if (!this.apiKey) throw new HevyApiError("A Hevy API key is required.", { code: "auth" });
    const controller = new AbortController();
    const timeout = globalThis.setTimeout(() => controller.abort(), this.timeoutMs);
    const headers = new Headers(options.headers || {});
    headers.set("api-key", this.apiKey);
    if (options.body) headers.set("content-type", "application/json");
    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        ...options,
        headers,
        signal: controller.signal,
      });
      const contentType = response.headers.get("content-type") || "";
      const payload = contentType.includes("json") ? await response.json() : await response.text();
      if (!response.ok) {
        const code = response.status === 401 || response.status === 403
          ? "auth"
          : response.status === 429
            ? "rate-limit"
            : response.status >= 500
              ? "server"
              : "validation";
        throw new HevyApiError(responseMessage(payload), {
          code,
          status: response.status,
          retryAfter: response.headers.get("retry-after"),
        });
      }
      return payload;
    } catch (error) {
      if (error instanceof HevyApiError) throw error;
      if (error.name === "AbortError") throw new HevyApiError("Hevy did not respond in time.", { code: "timeout" });
      throw new HevyApiError("Unable to reach Hevy from this browser.", { code: "network" });
    } finally {
      globalThis.clearTimeout(timeout);
    }
  }

  getUserInfo() {
    return this.request("/v1/user/info");
  }

  listExerciseTemplates(page = 1, pageSize = 100) {
    return this.request(`/v1/exercise_templates?page=${page}&pageSize=${pageSize}`);
  }

  listRoutineFolders(page = 1, pageSize = 10) {
    return this.request(`/v1/routine_folders?page=${page}&pageSize=${pageSize}`);
  }

  listRoutines(page = 1, pageSize = 10) {
    return this.request(`/v1/routines?page=${page}&pageSize=${pageSize}`);
  }

  createRoutineFolder(payload) {
    return this.request("/v1/routine_folders", { method: "POST", body: JSON.stringify(payload) });
  }

  createRoutine(payload) {
    return this.request("/v1/routines", { method: "POST", body: JSON.stringify(payload) });
  }

  clearApiKey() {
    this.apiKey = null;
  }
}

export async function listAllPages(fetchPage, collectionKey) {
  const items = [];
  let page = 1;
  let pageCount = 1;
  do {
    const response = await fetchPage(page);
    items.push(...(response?.[collectionKey] || []));
    pageCount = Number(response?.page_count) || page;
    page += 1;
  } while (page <= pageCount);
  return items;
}
