// Lógica do gerador de acrônimos (roda no navegador e no Node para testes).
(function (root) {
  function norm(s) {
    return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  }

  // Cada linha = um termo; palavras separadas por espaço (ou vírgula/;/|) = sinônimos.
  // Retorna [{ raw, opts: Map(letra -> [sinônimos originais]) }]
  function parseTerms(text) {
    return text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .map((line) => {
        const syns = line.split(/[\s,;|]+/).filter(Boolean);
        const opts = new Map();
        for (const syn of syns) {
          const m = norm(syn).match(/[a-z]/);
          if (!m) continue;
          const k = m[0];
          if (!opts.has(k)) opts.set(k, []);
          if (!opts.get(k).includes(syn)) opts.get(k).push(syn);
        }
        return { raw: line, opts };
      })
      .filter((t) => t.opts.size > 0);
  }

  // data = { c: nº de palavras comuns (início da lista), w: [palavras] }
  // Retorna Map(tamanho -> [{ w, n, common, rank, lang }])
  function buildIndex(data, lang) {
    const byLen = new Map();
    const words = data.w;
    for (let i = 0; i < words.length; i++) {
      const w = words[i];
      const n = norm(w);
      const L = n.length;
      if (!byLen.has(L)) byLen.set(L, []);
      byLen.get(L).push({ w, n, common: i < data.c, rank: i, lang: lang || '' });
    }
    return byLen;
  }

  const CAP = 5000;        // máx. de associações contadas por palavra
  const SOFT_STEPS = 20000; // depois de achar a primeira, para de contar
  const HARD_STEPS = 300000;

  // Tenta associar cada termo a uma posição distinta da palavra s.
  // Letras sobrando na palavra (L - n) ficam sem termo ("extras").
  function match(s, terms, ordered) {
    const n = terms.length, L = s.length;
    const used = new Array(n).fill(false);
    const cur = new Array(L).fill(-1);
    let count = 0, first = null, steps = 0;

    const rec = (j, m, skips) => {
      if (count >= CAP) return;
      if (++steps > HARD_STEPS) return;
      if (first && steps > SOFT_STEPS) return;
      if (j === L) {
        if (m === n) {
          count++;
          if (!first) first = cur.slice();
        }
        return;
      }
      if (L - j < n - m) return; // faltam posições para os termos restantes
      const c = s[j];
      if (ordered) {
        if (m < n && terms[m].opts.has(c)) {
          cur[j] = m;
          rec(j + 1, m + 1, skips);
          cur[j] = -1;
        }
      } else {
        for (let i = 0; i < n; i++) {
          if (!used[i] && terms[i].opts.has(c)) {
            used[i] = true; cur[j] = i;
            rec(j + 1, m + 1, skips);
            used[i] = false; cur[j] = -1;
          }
        }
      }
      if (skips > 0) rec(j + 1, m, skips - 1);
    };
    rec(0, 0, L - n);
    return { count, first };
  }

  // indexes: lista de Maps (um por dicionário ativo)
  // opts: { ordered, commonOnly, extra (0..3) }
  function search(indexes, terms, opts) {
    opts = opts || {};
    const ordered = !!opts.ordered;
    const commonOnly = !!opts.commonOnly;
    const extra = Math.max(0, Math.min(3, opts.extra | 0));
    const n = terms.length;
    if (n < 2) return [];

    const union = new Set();
    for (const t of terms) for (const k of t.opts.keys()) union.add(k);

    const out = [];
    for (let L = n; L <= n + extra; L++) {
      for (const index of indexes) {
        const list = index.get(L) || [];
        for (const e of list) {
          if (commonOnly && !e.common) continue;
          const s = e.n;
          // pré-filtro: precisa de pelo menos n letras que sejam iniciais possíveis
          let hits = 0;
          for (let j = 0; j < L; j++) if (union.has(s[j])) hits++;
          if (hits < n) continue;
          const r = match(s, terms, ordered);
          if (!r.count) continue;
          out.push({
            word: e.w,
            lang: e.lang,
            common: e.common,
            rank: e.rank,
            n: s,
            extra: L - n,
            count: r.count,
            assignment: r.first.map((i, j) => ({
              pos: j,
              letter: s[j],
              term: i,
              syns: i >= 0 ? terms[i].opts.get(s[j]) : null,
            })),
          });
        }
      }
    }
    // Menos letras extras primeiro; depois comuns (por frequência); depois o resto em ordem alfabética.
    out.sort((a, b) => {
      if (a.extra !== b.extra) return a.extra - b.extra;
      if (a.common !== b.common) return a.common ? -1 : 1;
      if (a.common) return a.rank - b.rank;
      return a.n < b.n ? -1 : a.n > b.n ? 1 : 0;
    });
    return out;
  }

  const api = { norm, parseTerms, buildIndex, search };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Acro = api;
})(typeof self !== 'undefined' ? self : this);
