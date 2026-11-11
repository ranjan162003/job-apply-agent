// Thin fetch wrapper: JSON in/out, and backend `{detail}` errors surfaced as ApiError.

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function requestJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers: {
        // Every change must carry this header; the backend refuses cross-site form posts without it.
        "X-Apply-Copilot-Client": "dashboard",
        // FormData sets its own multipart Content-Type (with the boundary).
        ...(init.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
        ...init.headers,
      },
    });
  } catch {
    throw new ApiError("Can't reach the backend. Is it running on port 8010? (cd scripts, then npm run dev)", 0);
  }

  if (response.status === 204) {
    return undefined as T;
  }
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiError(describeErrorBody(body) ?? `Request failed (${response.status})`, response.status);
  }
  return body as T;
}

function describeErrorBody(body: unknown): string | null {
  if (!body || typeof body !== "object" || !("detail" in body)) return null;
  const detail = (body as { detail: unknown }).detail;
  if (typeof detail === "string") return detail;
  // FastAPI validation errors: [{loc, msg, ...}]
  if (Array.isArray(detail)) {
    return detail.map((item) => (item && typeof item === "object" && "msg" in item ? String(item.msg) : "")).join("; ");
  }
  return null;
}
