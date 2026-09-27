export async function api<T>(url: string, body?: unknown): Promise<T> {
  let response: Response;
  try { response = await fetch(`/api${url}`, { method: body === undefined ? 'GET' : 'POST', headers: body === undefined ? {} : { 'Content-Type': 'application/json', 'X-NoteDrill': 'local' }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(['/clear', '/release', '/diagnostics'].includes(url) ? 30000 : 10000) }); }
  catch { throw new Error('The local service is unavailable. Start NoteDrill in your terminal, then reconnect. Your saved notes are still here.'); }
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'The local service returned an error.');
  return data as T;
}
