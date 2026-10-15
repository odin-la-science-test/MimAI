/* MiMai — lecture du flux SSE des API « OpenAI-compatibles » (module pur, testable sous Node). */

export interface Delta {
  text?: string;
  usage?: { prompt: number; completion: number; total: number };
  finish?: string;
  error?: string;
}

/* découpe un flux de texte en messages « data: … » ; garde la fin incomplète pour le prochain morceau */
export class SseParser {
  private buf = '';
  push(chunk: string): string[] {
    this.buf += chunk;
    const out: string[] = [];
    let i: number;
    /* un événement se termine par une ligne vide ; on accepte \n\n et \r\n\r\n */
    while ((i = this.buf.search(/\r?\n\r?\n/)) >= 0) {
      const block = this.buf.slice(0, i);
      this.buf = this.buf.slice(i).replace(/^\r?\n\r?\n/, '');
      const data = block.split(/\r?\n/).filter(l => l.startsWith('data:')).map(l => l.slice(5).replace(/^ /, '')).join('\n');
      if (data) out.push(data);
    }
    return out;
  }
  /* flux terminé sans ligne vide finale : on rend ce qui reste */
  flush(): string[] {
    const rest = this.buf.trim();
    this.buf = '';
    if (!rest) return [];
    const data = rest.split(/\r?\n/).filter(l => l.startsWith('data:')).map(l => l.slice(5).replace(/^ /, '')).join('\n');
    return data ? [data] : [];
  }
}

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

/* contenu texte d'un « delta » : chaîne, ou liste de morceaux (Mistral) */
function textOf(c: unknown): string {
  if (typeof c === 'string') return c;
  if (Array.isArray(c)) return c.map(p => (p && typeof p === 'object' && typeof (p as { text?: unknown }).text === 'string' ? (p as { text: string }).text : '')).join('');
  return '';
}

/* interprète un message « data » : null = fin du flux ([DONE]) ; un objet Delta sinon */
export function interpret(data: string): Delta | null {
  if (data.trim() === '[DONE]') return null;
  let j: Record<string, unknown>;
  try { j = JSON.parse(data) as Record<string, unknown>; } catch { return {}; }
  const out: Delta = {};
  const err = j.error as { message?: unknown } | string | undefined;
  if (err) out.error = typeof err === 'string' ? err : String((err as { message?: unknown }).message ?? 'erreur');
  const ch = (j.choices as { delta?: { content?: unknown }; message?: { content?: unknown }; finish_reason?: string | null }[] | undefined)?.[0];
  if (ch) {
    const t = textOf(ch.delta?.content ?? ch.message?.content);
    if (t) out.text = t;
    if (ch.finish_reason) out.finish = ch.finish_reason;
  }
  const u = (j.usage ?? (j.x_groq as { usage?: unknown } | undefined)?.usage) as { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } | undefined;
  if (u) {
    const p = num(u.prompt_tokens), c = num(u.completion_tokens);
    out.usage = { prompt: p, completion: c, total: num(u.total_tokens) || p + c };
  }
  return out;
}
