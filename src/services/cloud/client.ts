/* MiMai — appels réseau vers les IA en ligne (flux SSE, API « OpenAI-compatibles »).
   Seule porte de sortie du texte des conversations : elle n'est utilisée que si l'utilisateur a activé l'IA en ligne ET connecté
   une clé. Chaque appel est limité aux adresses de providers.ts ; aucun contenu n'est écrit dans les journaux. */
import { fetch as xfetch } from 'expo/fetch';
import { PROVIDER_BY_ID, apiBase } from './providers.ts';
import type { ProviderId } from './providers.ts';
import { classifyFailure } from './quota.ts';
import { CloudError } from './router.ts';
import { SseParser, interpret } from './sse.ts';
import type { ChatOpts, ChatResult } from './core.ts';

const headersOf = (res: { headers?: { forEach?: (cb: (v: string, k: string) => void) => void } }): Record<string, string> => {
  const h: Record<string, string> = {};
  try { res.headers?.forEach?.((v, k) => { h[k.toLowerCase()] = v; }); } catch { /* en-têtes illisibles : sans importance */ }
  return h;
};

const authHeaders = (key: string, id: ProviderId): Record<string, string> => ({
  Authorization: 'Bearer ' + key,
  ...(id === 'openrouter' ? { 'HTTP-Referer': 'https://mimai.app', 'X-Title': 'MiMai' } : {}),
});

/* garde-fou : on ne parle qu'aux adresses déclarées pour ce fournisseur */
function urlFor(id: ProviderId, account: string | undefined, path: string): string {
  const def = PROVIDER_BY_ID[id];
  if (!def) throw new CloudError({ kind: 'bad_request', reason: 'fournisseur inconnu' });
  const url = apiBase(def, account) + path;
  if (!url.startsWith('https://')) throw new CloudError({ kind: 'bad_request', reason: 'adresse non sécurisée' });
  return url;
}

export async function listModels(id: ProviderId, key: string, account: string | undefined) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 12000);
  try {
    const res = await xfetch(urlFor(id, account, '/models'), { method: 'GET', headers: { ...authHeaders(key, id), Accept: 'application/json' }, signal: ctl.signal });
    const text = await res.text();
    if (!res.ok) throw new CloudError(classifyFailure(res.status, text, headersOf(res)), headersOf(res));
    const j = JSON.parse(text) as { data?: { id: string; pricing?: { prompt?: string; completion?: string } }[]; models?: { id?: string; name?: string }[] };
    const list = j.data || (j.models || []).map(m => ({ id: String(m.id || m.name || '') }));
    return list.filter(m => m && m.id);
  } catch (e) {
    if (e instanceof CloudError) throw e;
    throw new CloudError({ kind: 'server', reason: 'réseau : ' + String((e as Error)?.message || e).slice(0, 100) });
  } finally { clearTimeout(timer); }
}

/* discussion en flux : onText reçoit le texte complet au fur et à mesure ; lève CloudError au moindre refus */
export async function chat(id: ProviderId, key: string, account: string | undefined, model: string, messages: unknown[], o: ChatOpts): Promise<ChatResult> {
  const def = PROVIDER_BY_ID[id];
  const url = urlFor(id, account, '/chat/completions');
  const promptChars = JSON.stringify(messages).length;
  let withUsage = def.streamUsage;
  for (let attempt = 0; attempt < 2; attempt++) {
    const ctl = new AbortController();
    let aborted = '';
    const first = setTimeout(() => { aborted = 'délai du premier mot dépassé'; ctl.abort(); }, o.timeoutMs);
    const total = setTimeout(() => { aborted = 'délai total dépassé'; ctl.abort(); }, Math.max(o.totalMs, o.timeoutMs));
    try {
      const body: Record<string, unknown> = { model, messages, stream: true, max_tokens: o.maxTokens, temperature: o.temperature };
      if (withUsage) body.stream_options = { include_usage: true };
      const res = await xfetch(url, { method: 'POST', headers: { ...authHeaders(key, id), 'Content-Type': 'application/json', Accept: 'text/event-stream' }, body: JSON.stringify(body), signal: ctl.signal });
      const headers = headersOf(res);
      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        /* certains fournisseurs refusent l'option de comptage en fin de flux : on réessaie sans */
        if (res.status === 400 && withUsage && /stream_options|include_usage/i.test(txt)) { withUsage = false; continue; }
        throw new CloudError(classifyFailure(res.status, txt, headers), headers);
      }
      const reader = res.body?.getReader?.();
      let text = '', tIn = 0, tOut = 0, finish: string | undefined;
      if (!reader) {
        /* pas de flux lisible : réponse complète d'un coup */
        const raw = await res.text();
        const j = JSON.parse(raw) as { choices?: { message?: { content?: string }; finish_reason?: string }[]; usage?: { prompt_tokens?: number; completion_tokens?: number } };
        text = j.choices?.[0]?.message?.content || ''; finish = j.choices?.[0]?.finish_reason; tIn = j.usage?.prompt_tokens || 0; tOut = j.usage?.completion_tokens || 0;
        if (text) o.onText?.(text);
      } else {
        const dec = new TextDecoder();
        const sse = new SseParser();
        let done = false, gotFirst = false;
        const handle = (payload: string) => {
          const d = interpret(payload);
          if (d === null) { done = true; return; }
          if (d.error) throw new CloudError(classifyFailure(/quota|limit|rate/i.test(d.error) ? 429 : 500, d.error, headers), headers);
          if (d.text) {
            text += d.text;
            if (!gotFirst) { gotFirst = true; clearTimeout(first); }
            o.onText?.(text);
          }
          if (d.usage) { tIn = d.usage.prompt; tOut = d.usage.completion; }
          if (d.finish) finish = d.finish;
        };
        while (!done) {
          const r = await reader.read();
          if (r.done) { sse.flush().forEach(handle); break; }
          sse.push(dec.decode(r.value, { stream: true })).forEach(handle);
        }
      }
      if (!text.trim()) throw new CloudError({ kind: 'server', reason: 'réponse vide' }, headers);
      /* comptes approximatifs si le fournisseur n'en donne pas (≈ 3,6 caractères par jeton) */
      if (!tOut) tOut = Math.ceil(text.length / 3.6);
      if (!tIn) tIn = Math.ceil(promptChars / 3.6);
      return { text, tokensIn: tIn, tokensOut: tOut, finish, headers };
    } catch (e) {
      if (e instanceof CloudError) throw e;
      throw new CloudError({ kind: 'server', reason: aborted || ('réseau : ' + String((e as Error)?.message || e).slice(0, 100)) });
    } finally { clearTimeout(first); clearTimeout(total); }
  }
  throw new CloudError({ kind: 'bad_request', reason: 'requête refusée' });
}
