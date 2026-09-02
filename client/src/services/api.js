const rawUrl = import.meta.env.VITE_API_URL || "/api";
const BASE_URL = rawUrl.endsWith("/") ? rawUrl.slice(0, -1) : rawUrl;

async function request(endpoint, options = {}) {
  const formattedEndpoint = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
  const url = `${BASE_URL}${formattedEndpoint}`;
  const config = {
    headers: { "Content-Type": "application/json" },
    ...options,
  };

  const response = await fetch(url, config);
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || data.error || "Request failed");
  }

  return data;
}

export const api = {
  post: (endpoint, body) =>
    request(endpoint, { method: "POST", body: JSON.stringify(body) }),
};
