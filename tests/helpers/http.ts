// tests/helpers/http.ts
// Boots the real Express app on an ephemeral port and gives tests a tiny
// JSON client. No supertest needed: Node's fetch is enough.
import type { AddressInfo } from 'node:net';
import http from 'node:http';

import app from '../../src/app.js';

export interface ApiResult<T = any> {
  status: number;
  body: T;
}

export async function startServer() {
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  const base = `http://127.0.0.1:${port}/api`;

  async function call<T = any>(method: string, path: string, opts: { token?: string; body?: unknown } = {}): Promise<ApiResult<T>> {
    const res = await fetch(base + path, {
      method,
      headers: {
        ...(opts.body !== undefined && { 'Content-Type': 'application/json' }),
        ...(opts.token && { Authorization: `Bearer ${opts.token}` }),
      },
      ...(opts.body !== undefined && { body: JSON.stringify(opts.body) }),
    });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : undefined };
  }

  return {
    baseUrl: base,
    get: <T = any>(path: string, token?: string) => call<T>('GET', path, { ...(token && { token }) }),
    post: <T = any>(path: string, body?: unknown, token?: string) => call<T>('POST', path, { body, ...(token && { token }) }),
    put: <T = any>(path: string, body?: unknown, token?: string) => call<T>('PUT', path, { body, ...(token && { token }) }),
    patch: <T = any>(path: string, body?: unknown, token?: string) => call<T>('PATCH', path, { body, ...(token && { token }) }),
    del: <T = any>(path: string, token?: string) => call<T>('DELETE', path, { ...(token && { token }) }),
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
