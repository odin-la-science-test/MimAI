/* MiMai — lecture des documents joints à une discussion : texte, Word (.docx), PowerPoint (.pptx), Excel (.xlsx), OpenDocument,
   PDF (texte). Tout se fait SUR L'APPAREIL (décompression en JavaScript pur, aucune bibliothèque native, aucun envoi).
   Limites honnêtes : un PDF scanné (image) ou protégé n'a pas de texte à lire ; un PDF aux polices exotiques peut sortir imparfait.
   Dans ces cas, l'app propose l'analyse par une IA en ligne connectée (Gemini lit les PDF), si l'utilisateur l'a activée. */
import * as FileSystem from 'expo-file-system/legacy';
import { unzipSync, unzlibSync, strFromU8 } from 'fflate';

export const MAX_BYTES = 15 * 1024 * 1024;
export const MAX_CHARS = 120000;
const TEXT_EXT = ['txt', 'md', 'markdown', 'csv', 'tsv', 'json', 'log', 'xml', 'html', 'htm', 'yaml', 'yml', 'ini', 'srt', 'tex', 'rtf'];
export const IMG_EXT = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'heic'];

export type Extracted =
  | { kind: 'text'; text: string; type: string }
  | { kind: 'image'; type: string }
  | { kind: 'none'; type: string; reason: string; canCloud?: boolean };

export const extOf = (name: string): string => (name.split('.').pop() || '').toLowerCase();

export function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const decodeEntities = (s: string): string =>
  s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#x([0-9a-f]+);/gi, (_m, h: string) => String.fromCodePoint(parseInt(h, 16))).replace(/&#(\d+);/g, (_m, d: string) => String.fromCodePoint(parseInt(d, 10))).replace(/&amp;/g, '&');

const tidy = (s: string): string => s.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();

/* ───────── Office / OpenDocument ───────── */
function wordText(xml: string): string {
  return xml.split('</w:p>').map(p => {
    const parts: string[] = [];
    const re = /<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>|<w:tab\/>|<w:br\/>/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(p))) parts.push(m[1] !== undefined ? m[1] : m[0] === '<w:tab/>' ? '\t' : '\n');
    return decodeEntities(parts.join(''));
  }).join('\n');
}

function slideText(xml: string): string {
  return xml.split('</a:p>').map(p => {
    const parts: string[] = [];
    const re = /<a:t>([^<]*)<\/a:t>/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(p))) parts.push(m[1]);
    return decodeEntities(parts.join(''));
  }).join('\n');
}

function sheetText(files: Record<string, Uint8Array>): string {
  const shared: string[] = [];
  const ss = files['xl/sharedStrings.xml'];
  if (ss) {
    const re = /<si>([\s\S]*?)<\/si>/g;
    const x = strFromU8(ss);
    let m: RegExpExecArray | null;
    while ((m = re.exec(x))) {
      const t: string[] = [];
      const r2 = /<t(?:\s[^>]*)?>([^<]*)<\/t>/g;
      let q: RegExpExecArray | null;
      while ((q = r2.exec(m[1]))) t.push(q[1]);
      shared.push(decodeEntities(t.join('')));
    }
  }
  const names = Object.keys(files).filter(n => /^xl\/worksheets\/sheet\d+\.xml$/.test(n)).sort((a, b) => parseInt(a.replace(/\D/g, ''), 10) - parseInt(b.replace(/\D/g, ''), 10));
  const out: string[] = [];
  names.forEach((n, i) => {
    out.push('— Feuille ' + (i + 1) + ' —');
    const x = strFromU8(files[n]);
    const rows = x.match(/<row[\s\S]*?<\/row>/g) || [];
    for (const row of rows) {
      const cells: string[] = [];
      const re = /<c\s([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(row))) {
        const attrs = m[1];
        const v = /<v>([^<]*)<\/v>/.exec(m[2] || '');
        const inl = /<t(?:\s[^>]*)?>([^<]*)<\/t>/.exec(m[2] || '');
        let val = '';
        if (/t="s"/.test(attrs) && v) val = shared[parseInt(v[1], 10)] ?? '';
        else if (inl) val = decodeEntities(inl[1]);
        else if (v) val = v[1];
        cells.push(val);
      }
      if (cells.some(c => c !== '')) out.push(cells.join(' | '));
    }
  });
  return out.join('\n');
}

function officeText(bytes: Uint8Array, ext: string): string {
  const files = unzipSync(bytes, { filter: f => /^(word\/document\.xml|ppt\/slides\/slide\d+\.xml|xl\/sharedStrings\.xml|xl\/worksheets\/sheet\d+\.xml|content\.xml)$/.test(f.name) });
  if (ext === 'docx') { const d = files['word/document.xml']; return d ? wordText(strFromU8(d)) : ''; }
  if (ext === 'pptx') {
    const names = Object.keys(files).filter(n => /^ppt\/slides\/slide\d+\.xml$/.test(n)).sort((a, b) => parseInt(a.replace(/\D/g, ''), 10) - parseInt(b.replace(/\D/g, ''), 10));
    return names.map((n, i) => 'Diapositive ' + (i + 1) + '\n' + slideText(strFromU8(files[n]))).join('\n\n');
  }
  if (ext === 'xlsx') return sheetText(files);
  const c = files['content.xml'];   // odt, ods, odp
  return c ? decodeEntities(strFromU8(c).replace(/<\/text:(p|h)>/g, '\n').replace(/<text:tab\/>/g, '\t').replace(/<text:line-break\/>/g, '\n').replace(/<[^>]+>/g, '')) : '';
}

/* ───────── PDF (texte) ───────── */
const latin1 = (u: Uint8Array): string => {
  let s = '';
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000) as unknown as number[]);
  return s;
};

function parseCMap(txt: string, map: Map<number, string>): void {
  const hexToStr = (h: string): string => { let o = ''; for (let i = 0; i + 3 < h.length + 1; i += 4) o += String.fromCharCode(parseInt(h.slice(i, i + 4), 16)); return o; };
  let m: RegExpExecArray | null;
  const bf = /beginbfchar([\s\S]*?)endbfchar/g;
  while ((m = bf.exec(txt))) {
    const re = /<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>/g;
    let q: RegExpExecArray | null;
    while ((q = re.exec(m[1]))) map.set(parseInt(q[1], 16), hexToStr(q[2].padStart(4, '0')));
  }
  const br = /beginbfrange([\s\S]*?)endbfrange/g;
  while ((m = br.exec(txt))) {
    const re = /<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*(?:<([0-9a-fA-F]+)>|\[([^\]]*)\])/g;
    let q: RegExpExecArray | null;
    while ((q = re.exec(m[1]))) {
      const lo = parseInt(q[1], 16), hi = parseInt(q[2], 16);
      if (q[3]) { const base = hexToStr(q[3].padStart(4, '0')).charCodeAt(0); for (let c = lo; c <= hi && c - lo < 512; c++) map.set(c, String.fromCharCode(base + (c - lo))); }
      else if (q[4]) { const items = q[4].match(/<([0-9a-fA-F]+)>/g) || []; items.forEach((it, i) => map.set(lo + i, hexToStr(it.slice(1, -1).padStart(4, '0')))); }
    }
  }
}

function unescapePdf(s: string): string {
  return s.replace(/\\([nrtbf()\\]|[0-7]{1,3})/g, (_m, g: string) => {
    if (g === 'n') return '\n'; if (g === 'r') return '\r'; if (g === 't') return '\t'; if (g === 'b' || g === 'f') return '';
    if (/^[0-7]+$/.test(g)) return String.fromCharCode(parseInt(g, 8));
    return g;
  });
}

function pdfText(bytes: Uint8Array): string {
  const raw = latin1(bytes);
  if (/\/Encrypt\b/.test(raw.slice(-4096)) || /\/Encrypt\s*\d+\s+\d+\s+R/.test(raw)) throw new Error('PDF protégé');
  const cmap = new Map<number, string>();
  const contents: string[] = [];
  let pos = 0;
  while (contents.length < 4000) {
    const s = raw.indexOf('stream', pos);
    if (s < 0) break;
    const e = raw.indexOf('endstream', s);
    if (e < 0) break;
    pos = e + 9;
    const head = raw.slice(Math.max(0, s - 400), s);
    const dictStart = head.lastIndexOf('<<');
    const dict = dictStart >= 0 ? head.slice(dictStart) : head;
    let a = s + 6;
    if (raw[a] === '\r') a++;
    if (raw[a] === '\n') a++;
    let data = bytes.subarray(a, e);
    if (/\/FlateDecode/.test(dict)) { try { data = unzlibSync(data); } catch { continue; } }
    else if (/\/Filter/.test(dict)) continue;
    const txt = latin1(data);
    if (/beginbfchar|beginbfrange/.test(txt)) { parseCMap(txt, cmap); continue; }
    if (/\bBT\b/.test(txt) && /\bET\b/.test(txt)) contents.push(txt);
  }
  const out: string[] = [];
  const hex = (h: string): string => {
    const clean = h.replace(/\s+/g, '');
    let o = '';
    if (cmap.size) {
      const step = clean.length % 4 === 0 ? 4 : 2;
      for (let i = 0; i + step <= clean.length; i += step) { const c = parseInt(clean.slice(i, i + step), 16); o += cmap.get(c) ?? (c >= 32 && c < 127 ? String.fromCharCode(c) : ''); }
    } else for (let i = 0; i + 2 <= clean.length; i += 2) { const c = parseInt(clean.slice(i, i + 2), 16); o += c >= 32 ? String.fromCharCode(c) : ' '; }
    return o;
  };
  for (const c of contents) {
    const re = /\[((?:[^\]\\]|\\.)*)\]\s*TJ|\(((?:[^()\\]|\\.)*)\)\s*(?:Tj|'|")|<([0-9a-fA-F\s]+)>\s*Tj|(T\*|ET|\bTD\b|\bTd\b)/g;
    let m: RegExpExecArray | null;
    let line = '';
    while ((m = re.exec(c))) {
      if (m[1] !== undefined) {
        const parts = m[1].match(/\(((?:[^()\\]|\\.)*)\)|<([0-9a-fA-F\s]+)>|-?\d+(?:\.\d+)?/g) || [];
        for (const p of parts) {
          if (p[0] === '(') line += unescapePdf(p.slice(1, -1));
          else if (p[0] === '<') line += hex(p.slice(1, -1));
          else if (parseFloat(p) < -220) line += ' ';
        }
      } else if (m[2] !== undefined) line += unescapePdf(m[2]);
      else if (m[3] !== undefined) line += hex(m[3]);
      else if (m[4]) { if (line.trim()) out.push(line); line = ''; }
    }
    if (line.trim()) out.push(line);
  }
  return out.join('\n');
}

const printableRatio = (s: string): number => {
  if (!s) return 0;
  let ok = 0;
  for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); if ((c >= 32 && c < 127) || c >= 160 || c === 10 || c === 9) ok++; }
  return ok / s.length;
};

/* ───────── point d'entrée ───────── */
export async function extractFromFile(uri: string, name: string, size?: number): Promise<Extracted> {
  const ext = extOf(name);
  const type = (ext || 'doc').toUpperCase().slice(0, 4);
  if (IMG_EXT.includes(ext)) return { kind: 'image', type };
  if (size && size > MAX_BYTES) return { kind: 'none', type, reason: 'Fichier trop volumineux (' + Math.round(size / 1048576) + ' Mo, maximum ' + Math.round(MAX_BYTES / 1048576) + ' Mo).' };
  try {
    if (TEXT_EXT.includes(ext)) {
      let t = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.UTF8 });
      if (ext === 'rtf') t = t.replace(/\\par[d]?/g, '\n').replace(/\\'[0-9a-f]{2}/gi, '').replace(/\\[a-z]+-?\d* ?/gi, '').replace(/[{}]/g, '');
      if (ext === 'html' || ext === 'htm' || ext === 'xml') t = decodeEntities(t.replace(/<(script|style)[\s\S]*?<\/\1>/gi, '').replace(/<\/(p|div|li|tr|h\d)>/gi, '\n').replace(/<[^>]+>/g, ' '));
      t = tidy(t);
      return t ? { kind: 'text', text: t.slice(0, MAX_CHARS), type } : { kind: 'none', type, reason: 'Le fichier est vide.' };
    }
    const b64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
    const bytes = b64ToBytes(b64);
    if (['docx', 'pptx', 'xlsx', 'odt', 'ods', 'odp'].includes(ext)) {
      const t = tidy(officeText(bytes, ext));
      return t ? { kind: 'text', text: t.slice(0, MAX_CHARS), type } : { kind: 'none', type, reason: 'Aucun texte trouvé dans ce document.' };
    }
    if (ext === 'pdf') {
      let t = '';
      try { t = tidy(pdfText(bytes)); } catch (e) {
        if (e instanceof Error && /protégé/.test(e.message)) return { kind: 'none', type, reason: 'Ce PDF est protégé : MiMai ne peut pas le lire.' };
      }
      if (t.length >= 60 && printableRatio(t) > 0.85) return { kind: 'text', text: t.slice(0, MAX_CHARS), type };
      return { kind: 'none', type, canCloud: true, reason: 'Ce PDF n’a pas de texte lisible (scanné, ou polices spéciales).' };
    }
    if (ext === 'doc' || ext === 'ppt' || ext === 'xls') return { kind: 'none', type, reason: 'Ancien format ' + ext.toUpperCase() + ' : enregistrez-le en .' + ext + 'x puis rejoignez-le.' };
    return { kind: 'none', type, reason: 'Format .' + (ext || '?') + ' non pris en charge (texte, Word, PowerPoint, Excel, OpenDocument, PDF, images).' };
  } catch (err) {
    return { kind: 'none', type, reason: 'Fichier illisible (' + (err instanceof Error ? err.message.slice(0, 60) : 'erreur') + ').' };
  }
}

/* texte du document pour le prompt : tout le document s'il tient, sinon les passages les plus proches de la question */
export function pickExcerpt(text: string, question: string, budget: number): string {
  if (text.length <= budget) return text;
  const q = new Set((question.toLowerCase().match(/[a-zà-ÿ0-9]{4,}/g) || []));
  const paras = text.split(/\n{1,}/).filter(p => p.trim());
  const scored = paras.map((p, i) => {
    let sc = 0;
    if (q.size) { const w = p.toLowerCase().match(/[a-zà-ÿ0-9]{4,}/g) || []; for (const x of w) if (q.has(x)) sc++; }
    return { p, i, sc: sc + (i < 3 ? 0.5 : 0) };
  });
  const chosen: { p: string; i: number }[] = [];
  let used = 0;
  for (const c of scored.slice().sort((a, b) => b.sc - a.sc || a.i - b.i)) {
    if (used + c.p.length + 1 > budget) continue;
    chosen.push(c); used += c.p.length + 1;
    if (used >= budget * 0.97) break;
  }
  return chosen.sort((a, b) => a.i - b.i).map(c => c.p).join('\n') + '\n[… extrait : le document est plus long que ce qui est transmis]';
}
