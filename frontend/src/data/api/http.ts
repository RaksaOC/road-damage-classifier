/* fetch for /api/*: turns network failures and FastAPI errors ({"detail": ...}) into ServiceErrors. */
import { ServiceError, type ErrorKind } from "@/services/ports";

const KIND: Record<number, ErrorKind> = { 404: "not_found", 409: "conflict", 413: "invalid", 415: "invalid", 422: "invalid", 503: "unavailable" };

function detail(body: unknown): string | null {
  const d = (body as { detail?: unknown } | null)?.detail;
  if (typeof d === "string") return d;
  if (Array.isArray(d)) return d.map((x) => (x as { msg?: string }).msg).filter(Boolean).join("; ") || null; // validation errors
  return null;
}

export async function http<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, init);
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    throw new ServiceError("offline", "Can't reach the server. Check your connection and that the API is running.");
  }
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => null);
  if (res.ok) return body as T;
  // Next answers 500 itself when the API behind the /api rewrite is down
  if (res.status >= 500 && !detail(body)) {
    throw new ServiceError(res.status === 503 ? "unavailable" : "offline", "The analysis server isn't responding. Is the backend running on port 8600?");
  }
  throw new ServiceError(KIND[res.status] ?? "server", detail(body) ?? `The server answered ${res.status}.`);
}
