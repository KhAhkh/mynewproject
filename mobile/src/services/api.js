const buildUrl = (baseUrl, path) => {
  const normalized = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
  return `${normalized}${path.startsWith("/") ? "" : "/"}${path}`;
};

const parseJson = async (response) => {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

export const createApiClient = (baseUrl) => {
  const request = async (path, { method = "GET", token, body, timeoutMs = 20000 } = {}) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    const headers = {
      Accept: "application/json",
      "Content-Type": "application/json"
    };
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    try {
      const response = await fetch(buildUrl(baseUrl, path), {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal
      });

      const data = await parseJson(response);
      if (!response.ok) {
        const message = data?.message || `Request failed with status ${response.status}`;
        throw new Error(message);
      }
      return data;
    } finally {
      clearTimeout(timeout);
    }
  };

  return {
    login: ({ username, password, deviceId }) =>
      request("/api/auth/login", {
        method: "POST",
        body: { username, password, device_id: deviceId }
      }),
    registerSalesman: ({ username, password, salesmanId }) =>
      request("/api/auth/register", {
        method: "POST",
        body: {
          username,
          password,
          salesman_id: salesmanId ?? null
        }
      }),
    fetchBundle: (token) =>
      request("/api/mobile/sync/bundle", {
        method: "GET",
        token
      }),
    uploadSync: (token, payload) =>
      request("/api/mobile/sync/upload", {
        method: "POST",
        token,
        body: payload,
        timeoutMs: 30000
      })
  };
};
