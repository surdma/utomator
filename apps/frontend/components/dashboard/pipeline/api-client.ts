// The dashboard uses one API path convention for requests and event streams.
export const getApi = (path: string) => `/api/${path}`;

export async function apiPost(
  path: string,
  data: Record<string, unknown> = {},
) {
  const response = await fetch(getApi(path), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(data),
  });
  const body = (await response.json()) as { error?: string; id?: string };
  if (!response.ok) throw new Error(body.error || 'Unable to submit request');
  return body;
}
