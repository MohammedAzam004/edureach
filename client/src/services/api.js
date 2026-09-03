// Resolve API base URL
let rawUrl = (import.meta.env.VITE_API_URL || "").trim();

if (!rawUrl) {
  if (typeof window !== "undefined" && window.location.hostname === "localhost") {
    rawUrl = "http://localhost:5000/api";
  } else {
    rawUrl = "/api";
  }
}

// Strip trailing slashes
rawUrl = rawUrl.replace(/\/+$/, "");

// Ensure /api suffix exists for deployed backend URLs
const BASE_URL = rawUrl.startsWith("http") && !rawUrl.endsWith("/api")
  ? `${rawUrl}/api`
  : rawUrl;

async function request(endpoint, options = {}) {
  const formattedEndpoint = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
  const url = `${BASE_URL}${formattedEndpoint}`;
  const config = {
    headers: { "Content-Type": "application/json" },
    ...options,
  };

  let response;
  try {
    response = await fetch(url, config);
  } catch (networkError) {
    throw new Error(
      "Unable to reach the server. If deployed on Render free tier, the backend may take 30–50 seconds to wake up from idle. Please wait a moment and try again."
    );
  }

  const contentType = response.headers.get("content-type") || "";
  let data;

  if (contentType.includes("application/json")) {
    data = await response.json();
  } else {
    const text = await response.text();
    if (!response.ok) {
      if (response.status === 405) {
        throw new Error(
          "Error 405 (Method Not Allowed): The request was sent to Vercel instead of Render. Please set VITE_API_URL in Vercel (Project Settings → Environment Variables) to your Render backend URL (e.g. https://xxx.onrender.com) and click Redeploy."
        );
      }
      if (response.status === 502 || response.status === 503 || response.status === 504) {
        throw new Error(
          "Backend is currently waking up or starting on Render (free tier takes ~30–50s). Please wait a moment and try again."
        );
      }
      throw new Error(text.slice(0, 150) || `Server error (${response.status})`);
    }
    data = { message: text };
  }

  if (!response.ok) {
    if (response.status === 405) {
      throw new Error(
        "Error 405: Request routed to Vercel. Set VITE_API_URL to your Render backend URL in Vercel and redeploy."
      );
    }
    if (response.status === 503 || response.status === 502) {
      throw new Error(
        "Service Unavailable: Render backend is waking up or deploying. Please wait ~30-50 seconds and retry."
      );
    }
    throw new Error(data.message || data.error || `Request failed (${response.status})`);
  }

  return data;
}

export const api = {
  post: (endpoint, body) =>
    request(endpoint, { method: "POST", body: JSON.stringify(body) }),
};
