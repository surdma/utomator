export async function request<T>(
  url: string,
  method = 'GET',
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(url, {
    method,
    cache: 'no-store',
    signal,
    ...(body === undefined
      ? {}
      : {
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        }),
  });
  const data = (await response.json()) as T & { error?: string };
  if (!response.ok) throw Error(data.error || 'Growth workflow request failed');
  return data;
}
