// src/lib/api.ts
let getClientToken: (() => string | undefined) | null = null;

async function readToken(): Promise<string | undefined> {
  // Cliente (navegador)
  if (typeof window !== 'undefined') {
    if (!getClientToken) {
      const mod = await import('./auth-client'); // solo en cliente
      getClientToken = mod.getToken;
    }
    return getClientToken?.();
  }

  // Servidor (App Router): cookies() es ASÍNCRONA en Next 15
  const { cookies } = await import('next/headers');
  const store = await cookies(); // 👈 importante
  return store.get('token')?.value;
}

const BASE =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, '') || 'http://localhost:3000';

type Opts = RequestInit & { token?: string; json?: unknown };

export async function api<T = unknown>(path: string, opts: Opts = {}): Promise<T> {
  const url = `${BASE}${path.startsWith('/') ? path : `/${path}`}`;

  const headers = new Headers(opts.headers || {});
  if (!headers.has('Content-Type') && opts.json !== undefined) {
    headers.set('Content-Type', 'application/json');
  }

  const token = opts.token ?? (await readToken());
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const res = await fetch(url, {
    ...opts,
    headers,
    body: opts.json !== undefined ? JSON.stringify(opts.json) : (opts.body as BodyInit | null),
    cache: 'no-store',
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `${res.status} ${res.statusText}`);
  }

  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) {
    return (await res.json()) as T;
  }
  // @ts-expect-error: puede retornar texto/archivo
  return await res.text();
}

export const apiGet = <T = unknown>(path: string, opts?: Opts) => api<T>(path, opts);
export const apiPost = <T = unknown>(path: string, body?: unknown, opts?: Opts) =>
  api<T>(path, { ...opts, method: 'POST', json: body });
export const apiPut =  <T = unknown>(path: string, body?: unknown, opts?: Opts) =>
  api<T>(path, { ...opts, method: 'PUT', json: body });
export const apiDel =  <T = unknown>(path: string, opts?: Opts) =>
  api<T>(path, { ...opts, method: 'DELETE' });
