export async function requestJson(url, { method = 'GET', body } = {}) {
  const response = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
    cache: 'no-store',
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const error = new Error(typeof data?.error === 'string' ? data.error : '');
    // Siderne skelner mellem et HTTP-fejlsvar og et ubekræftet netværksudfald.
    error.status = response.status;
    throw error;
  }
  return data;
}
