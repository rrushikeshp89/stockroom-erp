const TOKEN_KEY = 'stockroom.token';

/** status 0 = the server couldn't be reached (offline, restarting, proxy error). */
export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export const OFFLINE_MESSAGE = "Can't reach the Stockroom server right now. Check your connection and try again.";

export const tokenStore = {
  get: () => {
    try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
  },
  set: (t: string | null) => {
    try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch { /* storage unavailable */ }
  },
};

let onUnauthorized: () => void = () => {};
export const setUnauthorizedHandler = (fn: () => void) => { onUnauthorized = fn; };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function send(method: string, path: string, body?: unknown): Promise<Response> {
  const token = tokenStore.get();
  return fetch(`/api${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

/** A gateway answer with no JSON body means the API itself never replied (e.g. it's restarting). */
const unreachable = (res: Response, data: unknown) =>
  [502, 503, 504].includes(res.status) || (res.status >= 500 && !(data && typeof data === 'object' && 'error' in data));

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  // Reads and sign-in are safe to repeat, so a brief outage (server restart, flaky network)
  // gets two quiet retries. Other writes are never retried automatically: no double submits.
  const retryable = method === 'GET' || path === '/auth/login';
  for (let attempt = 0; ; attempt++) {
    let res: Response;
    try {
      res = await send(method, path, body);
    } catch {
      if (retryable && attempt < 2) { await sleep(600 * (attempt + 1)); continue; }
      throw new ApiError(0, OFFLINE_MESSAGE);
    }
    if (res.status === 204) return undefined as T;
    const data = await res.json().catch(() => null);
    if (res.ok) return data as T;
    if (unreachable(res, data)) {
      if (retryable && attempt < 2) { await sleep(600 * (attempt + 1)); continue; }
      throw new ApiError(0, OFFLINE_MESSAGE);
    }
    if (res.status === 401 && path !== '/auth/login') onUnauthorized();
    throw new ApiError(res.status, (data as { error?: string } | null)?.error || `Something went wrong (${res.status})`);
  }
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body: unknown = {}) => request<T>('POST', path, body),
  patch: <T>(path: string, body: unknown) => request<T>('PATCH', path, body),
  del: <T = void>(path: string) => request<T>('DELETE', path),
};
