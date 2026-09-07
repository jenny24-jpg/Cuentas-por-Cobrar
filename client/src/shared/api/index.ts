// Cliente API único para todo el frontend. No uses fetch() suelto en los
// módulos: todo el equipo pasa por aquí para que la base URL, el manejo de
// errores y el formato de respuesta sean consistentes en toda la app.

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api';

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (response.status === 204) {
    return undefined as T;
  }

  const body = await response.json().catch(() => null);

  if (!response.ok) {
    throw new ApiError(
      body?.error ?? `Error ${response.status}`,
      response.status,
      body?.details,
    );
  }

  return body as T;
}

export const apiClient = {
  get: <T>(path: string) => request<T>(path, { method: 'GET' }),
  post: <T>(path: string, data: unknown) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(data) }),
  patch: <T>(path: string, data: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(data) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};

/** Construye un query string ignorando valores undefined/vacíos. */
export function buildQueryString(params: Record<string, string | number | undefined>): string {
  const usable = Object.entries(params).filter(
    ([, value]) => value !== undefined && value !== '',
  );
  if (usable.length === 0) return '';
  return '?' + new URLSearchParams(usable.map(([k, v]) => [k, String(v)])).toString();
}
