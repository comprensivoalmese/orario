/*
  quaranta-ore.js – le ATTIVITÀ FUNZIONALI ALL'INSEGNAMENTO («40+40 ore», art. 44 c. 3 CCNL Istruzione e Ricerca 2019-21)
  dei docenti della secondaria. Lo usano:
  - Orario Facile, scheda «40+40» (orario-facile/scheda-40ore.js): solo chi ha SI nella colonna «40 ore» delle Autorizzazioni;
  - l'app Luis@i (voce «Le mie 40+40» del menu): ogni docente vede SOLO le proprie, se è abilitato.

  DA DOVE VENGONO I DATI
  - Foglio Google «40 ore» (CONFIG.file40ore, su Drive solo per gli autorizzati: contiene i nomi):
    · scheda «Impegni»: una riga = un blocco di tempo (Data, Inizio, Fine, Impegno, Tipo, Classi, Ore, Note);
      Classi: SPAZIO = classi insieme (in parallelo), «/» = gruppi uno dopo l'altro (il tempo si divide in parti uguali),
      vuoto = tutti i docenti; GLO: ogni gruppo («1A / 2B») è un GLO da 0,5 ore;
    · scheda «Docenti»: Codice, Docente, Tipo cattedra (COI/COE/PAR), Ore settimanali, Scuola di completamento,
      In servizio dal, Visibile al docente (SI/NO);
    · scheda «Impostazioni»: «Visibile a tutti i docenti» (SI/NO) e la tabella Tipo → Conta in.
  - Le CLASSI di ogni docente NON stanno nel Foglio: arrivano dall'orario ufficiale (cattedre) e dal sostegno
    (Compresenze, solo in memoria); il potenziamento e le altre compresenze NON contano.

  IL CONTO: per ogni giorno e ogni conteggio (prime 40, seconde 40, formazione) le ore di un docente sono la durata
  dell'UNIONE dei blocchi in cui c'è almeno una sua classe: i blocchi sovrapposti (CdC in parallelo) contano una volta,
  quelli in orari diversi si sommano. Ore dovute: COI 40 + 40; COE e part-time 40 × ore / 18 (O.M. 446/1997 art. 7 c. 7).
  Formazione obbligatoria (sicurezza, privacy…): conta nelle ore che restano delle 80 (art. 44 c. 4; D.Lgs. 81/2008 art. 37).

  PUBBLICAZIONE: «quaranta-ore.json» nella cartella dei soli docenti (CONFIG.cartellaImpegni), con i SOLI CODICI (DOC01…)
  dei docenti abilitati (spunta «Visibile al docente» o «Visibile a tutti»): niente nomi, niente classi del sostegno.
  L'app mostra a ciascuno solo la riga del proprio codice (controllo fatto nel browser, come per gli altri dati).
*/
const QuarantaOre = (() => {
  const SHEETS = 'https://sheets.googleapis.com/v4/spreadsheets/';
  const API = 'https://www.googleapis.com/drive/v3/files';
  const NOME_PUBBLICATO = 'quaranta-ore.json';
  const SCRIVERE = 'https://www.googleapis.com/auth/spreadsheets';

  // In quale conteggio va ogni tipo, se nel Foglio manca la tabella (Impostazioni, colonne Tipo / Conta in)
  const CATEGORIE = {
    'collegio docenti': 'prime', 'dipartimenti': 'prime', 'programmazione': 'prime', 'plesso': 'prime',
    'assemblea con i genitori': 'prime', 'colloqui con le famiglie': 'prime',
    'cdc': 'seconde', 'glo': 'seconde', 'formazione obbligatoria': 'formazione',
    'scrutini': 'no', 'esami': 'no', 'altro (non conta)': 'altro'
  };
  const NOMI_CONTA = { prime: 'prime 40', seconde: 'seconde 40', formazione: 'formazione', no: 'non conta', altro: 'non conta' };
  const ORE_GLO = 0.5;

  const semplice = s => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  const si = v => /^(si|sì|s|x|✓|✔|1|true|vero|yes)$/i.test(String(v == null ? '' : v).trim());
  const classeSemplice = s => String(s || '').toUpperCase().replace(/\s+/g, '');
  const due = n => String(n).padStart(2, '0');
  const hhmm = m => m == null ? '' : due(Math.floor(m / 60)) + ':' + due(m % 60);
  const arrotonda = n => Math.round(n * 100) / 100;

  // ---------- lettura dei valori delle celle ----------
  // Data: numero di serie (Fogli/Excel) o testo «05/10/2026» → «2026-10-05»
  function data(v) {
    if (typeof v === 'number' && v > 20000) {
      const d = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 864e5);
      return d.getUTCFullYear() + '-' + due(d.getUTCMonth() + 1) + '-' + due(d.getUTCDate());
    }
    const m = String(v || '').match(/(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})/);
    if (m) return (m[3].length === 2 ? '20' + m[3] : m[3]) + '-' + due(+m[2]) + '-' + due(+m[1]);
    const iso = String(v || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
    return iso ? iso[0] : '';
  }
  // Orario: «15:00», «15.30», 15 oppure la frazione di giorno di Fogli (0,625 = 15:00) → minuti dalla mezzanotte
  function minuti(v) {
    if (v === '' || v == null) return null;
    if (typeof v === 'number') { if (v < 1) return Math.round(v * 1440); if (v <= 24) return Math.round(v * 60); return null; }
    const m = String(v).match(/(\d{1,2})\s*[.:,h]\s*(\d{2})/);
    if (m) return +m[1] * 60 + +m[2];
    const h = String(v).match(/^\s*(\d{1,2})\s*$/);
    return h ? +h[1] * 60 : null;
  }
  const numero = v => { if (typeof v === 'number') return v; const n = parseFloat(String(v || '').replace(',', '.')); return isFinite(n) ? n : null; };

  // Trova la colonna dal titolo (prima colonna il cui titolo soddisfa la prova)
  const colonna = (intest, prova) => intest.findIndex(t => prova(semplice(t)));

  // ---------- 1. Il Foglio «40 ore» ----------
  const file = () => (typeof CONFIG !== 'undefined' && CONFIG.file40ore) || '';
  const configurato = () => !!file() && typeof NomiDocenti !== 'undefined';

  // La scheda «Esoneri» (una riga per impegno proposto o approvato per l'esonero di un docente) può non esserci ancora: senza, si rilegge
  // il Foglio senza di lei (Google rifiuta tutta la richiesta se manca anche una sola scheda)
  async function leggiFoglio(email) {
    const t = await NomiDocenti.gettone([NomiDocenti.PERMESSO_DRIVE], email);
    const prendi = zone => fetch(SHEETS + encodeURIComponent(file()) + '/values:batchGet?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=SERIAL_NUMBER&' +
      zone.map(z => 'ranges=' + encodeURIComponent(z)).join('&'), { cache: 'no-cache', headers: { Authorization: 'Bearer ' + t } });
    const base = ["'Impegni'!A1:L3000", "'Docenti'!A1:L400", "'Impostazioni'!A1:F60"];
    // prima si chiede quali schede ci sono: quelle facoltative («Esoneri», «Presenze», «Impegni altre scuole») si leggono solo se esistono
    const info = await fetch(SHEETS + encodeURIComponent(file()) + '?fields=sheets.properties.title', { cache: 'no-cache', headers: { Authorization: 'Bearer ' + t } });
    if (info.status === 403 || info.status === 404) throw new Error('il tuo account non può aprire il Foglio «40 ore» (va condiviso con chi è autorizzato)');
    if (!info.ok) throw new Error('errore ' + info.status + ' da Google');
    const titoli = ((await info.json()).sheets || []).map(s => s.properties.title);
    const facoltative = [['Esoneri', "'Esoneri'!A1:G3000"], ['Presenze', "'Presenze'!A1:F20000"], [SCHEDA_ESTERNI, `'${SCHEDA_ESTERNI}'!A1:H5000`]].filter(([n]) => titoli.includes(n));
    const r = await prendi(base.concat(facoltative.map(x => x[1])));
    if (r.status === 400) throw new Error('nel Foglio «40 ore» mancano le schede «Impegni», «Docenti» o «Impostazioni»');
    if (!r.ok) throw new Error('errore ' + r.status + ' da Google');
    const valori = ((await r.json()).valueRanges || []).map(v => v.values || []);
    const [imp, doc, set] = valori;
    const di = nome => { const i = facoltative.findIndex(x => x[0] === nome); return i < 0 ? [] : valori[3 + i] || []; };
    return Object.assign(interpreta(imp, doc, set, di('Esoneri'), di('Presenze'), di(SCHEDA_ESTERNI)),
      { conEsoneri: titoli.includes('Esoneri'), conPresenze: titoli.includes('Presenze'), conEsterni: titoli.includes(SCHEDA_ESTERNI) });
  }
  const SCHEDA_ESTERNI = 'Impegni altre scuole';

  // Dalle tabelle del Foglio ai dati: { impegni, docenti, categorie, visibileTutti, anno, colonnaVisibile, esoneri }
  function interpreta(imp, doc, set, eso, pre, est) {
    // Impostazioni: voce/valore (colonne A-B) e la tabella Tipo → Conta in (dove la si trova)
    const categorie = Object.assign({}, CATEGORIE);
    let visibileTutti = false, anno = '', scuole = [], rigaScuole = 0, ultimaRigaVoci = 0;
    (set || []).forEach((r, i) => {
      const voce = semplice(r[0]);
      if (voce) ultimaRigaVoci = i + 1;
      if (voce.includes('visibile')) visibileTutti = si(r[1]);
      if (voce.includes('anno')) anno = String(r[1] || '');
      // l'elenco delle scuole di completamento (scheda 40+40), separate da «;»
      if (voce.includes('scuole di completamento')) { rigaScuole = i + 1; scuole = String(r[1] || '').split(/[;\n]/).map(x => x.trim()).filter(Boolean); }
    });
    const ri = (set || []).findIndex(r => r.some(c => semplice(c) === 'conta in'));
    if (ri >= 0) {
      const cT = set[ri].findIndex(c => semplice(c) === 'tipo'), cC = set[ri].findIndex(c => semplice(c) === 'conta in');
      set.slice(ri + 1).forEach(r => {
        const tipo = semplice(r[cT]), conta = semplice(r[cC]);
        if (!tipo) return;
        categorie[tipo] = conta.includes('prime') ? 'prime' : conta.includes('seconde') ? 'seconde' : conta.includes('formaz') ? 'formazione' : (tipo.startsWith('altro') ? 'altro' : 'no');
      });
    }

    // Impegni
    const ii = imp[0] || [];
    const c = {
      data: colonna(ii, t => t.startsWith('data')), inizio: colonna(ii, t => t.startsWith('inizio')), fine: colonna(ii, t => t.startsWith('fine')),
      impegno: colonna(ii, t => t.startsWith('impegno')), tipo: colonna(ii, t => t === 'tipo' || t.startsWith('tipo ')),
      classi: colonna(ii, t => t.startsWith('classi')), ore: colonna(ii, t => t.startsWith('ore')), note: colonna(ii, t => t.startsWith('note'))
    };
    if (c.data < 0 || c.impegno < 0) throw new Error('nella scheda «Impegni» mancano le colonne «Data» e «Impegno»');
    const v = (r, k) => c[k] >= 0 ? r[c[k]] : '';
    const impegni = [];
    imp.slice(1).forEach((r, i) => {
      const d = data(v(r, 'data')), titolo = String(v(r, 'impegno') || '').trim();
      if (!d || !titolo) return;
      const tipo = String(v(r, 'tipo') || '').trim() || 'Altro (non conta)';
      impegni.push({
        riga: i + 2, data: d, ini: minuti(v(r, 'inizio')), fin: minuti(v(r, 'fine')), impegno: titolo, tipo,
        conta: categorie[semplice(tipo)] || indovina(tipo), classi: String(v(r, 'classi') || '').trim() || classiDalTitolo(tipo, titolo),
        ore: numero(v(r, 'ore')), note: String(v(r, 'note') || '')
      });
    });

    // Docenti
    const di = doc[0] || [];
    const d = {
      codice: colonna(di, t => t.startsWith('codice')), nome: colonna(di, t => t.startsWith('docente') || t === 'nome' || t.startsWith('cognome')),
      tipo: colonna(di, t => t.startsWith('tipo')), ore: colonna(di, t => t.startsWith('ore') && !t.includes('formaz')), scuola: colonna(di, t => t.includes('scuola')),
      dal: colonna(di, t => t.includes('servizio') || t === 'dal'), visibile: colonna(di, t => t.startsWith('visibile')),
      // ore di formazione obbligatoria da attribuire al docente (sicurezza, privacy…), oltre a quelle scritte negli impegni
      formazione: colonna(di, t => t.includes('formaz'))
    };
    const w = (r, k) => d[k] >= 0 ? r[d[k]] : '';
    const docenti = [];
    doc.slice(1).forEach((r, i) => {
      const codice = String(w(r, 'codice') || '').trim().toUpperCase();
      if (!/^DOC\d+/.test(codice)) return;
      docenti.push({
        riga: i + 2, codice, nome: String(w(r, 'nome') || '').trim(), tipo: String(w(r, 'tipo') || 'COI').trim().toUpperCase() || 'COI',
        oreSett: numero(w(r, 'ore')) || 18, scuola: String(w(r, 'scuola') || '').trim(), dal: data(w(r, 'dal')), visibile: si(w(r, 'visibile')),
        oreFormazione: numero(w(r, 'formazione')) || 0
      });
    });
    // Esoneri: Codice, Docente, Data, Impegno, Ore, Importato il, Approvato (una riga per impegno).
    // Map codice → Map «data|impegno» → { approvato, riga } (riga = numero di riga nel Foglio, per segnare «Approvato»)
    const esoneri = new Map();
    const ei = (eso || [])[0] || [];
    const e = { codice: colonna(ei, t => t.startsWith('codice')), data: colonna(ei, t => t.startsWith('data')), impegno: colonna(ei, t => t.startsWith('impegno')),
      approvato: colonna(ei, t => t.startsWith('approvat')) };
    if (e.codice >= 0 && e.data >= 0 && e.impegno >= 0) (eso || []).slice(1).forEach((r, i) => {
      const codice = String(r[e.codice] || '').trim().toUpperCase(), dd = data(r[e.data]), imp = String(r[e.impegno] || '').trim();
      if (!codice || !dd || !imp) return;
      if (!esoneri.has(codice)) esoneri.set(codice, new Map());
      esoneri.get(codice).set(dd + '|' + imp, { approvato: e.approvato >= 0 && si(r[e.approvato]), riga: i + 2 });
    });
    const presenze = presenzeDaRighe(pre);
    const esterni = esterniDaRighe(est);
    return { impegni, docenti, categorie, visibileTutti, anno, scuole, rigaScuole, ultimaRigaVoci, colonnaVisibile: d.visibile, colonnaFormazione: d.formazione, colonneDocenti: di.length,
      colonnaImpostazioni: (set || []).findIndex(r => semplice(r[0]).includes('visibile')), esoneri, righeEsoneri: (eso || []).slice(1), colonnaApprovato: e.approvato,
      presenze, righePresenze: (pre || []).slice(1), esterni, righeEsterni: (est || []).slice(1) };
  }
  /*
    Scheda «Presenze» (incontri già svolti): Data, Impegno, Codice, Docente, Presente (SI/NO), Note – una riga per docente e incontro.
    Restituisce Map codice → Map «data|impegno» → true (presente) / false (assente). Un incontro senza righe = presenze non registrate
    (il docente conta come presente).
  */
  function presenzeDaRighe(pre) {
    const presenze = new Map();
    const pi = (pre || [])[0] || [];
    const p = { codice: colonna(pi, t => t.startsWith('codice')), data: colonna(pi, t => t.startsWith('data')), impegno: colonna(pi, t => t.startsWith('impegno')),
      presente: colonna(pi, t => t.startsWith('present')) };
    if (p.codice >= 0 && p.data >= 0 && p.impegno >= 0 && p.presente >= 0) (pre || []).slice(1).forEach(r => {
      const codice = String(r[p.codice] || '').trim().toUpperCase(), dd = data(r[p.data]), imp = String(r[p.impegno] || '').trim();
      const v = String(r[p.presente] == null ? '' : r[p.presente]).trim();
      if (!codice || !dd || !imp || !v) return;
      if (!presenze.has(codice)) presenze.set(codice, new Map());
      presenze.get(codice).set(dd + '|' + imp, si(v));
    });
    return presenze;
  }
  /*
    Scheda «Impegni altre scuole» (docenti in COE): Scuola, Codice, Docente, Data, Orario, Impegno, Ore, Conta in.
    → [{ scuola, codice, data, orario, impegno, ore, conta }]. Non contano nelle 40+40 di questa scuola: completano il piano del docente.
  */
  function esterniDaRighe(est) {
    const ei = (est || [])[0] || [];
    const c = { scuola: colonna(ei, t => t.startsWith('scuola')), codice: colonna(ei, t => t.startsWith('codice')), data: colonna(ei, t => t.startsWith('data')),
      orario: colonna(ei, t => t.startsWith('orario')), impegno: colonna(ei, t => t.startsWith('impegno')), ore: colonna(ei, t => t === 'ore' || t.startsWith('ore ')),
      conta: colonna(ei, t => t.startsWith('conta')) };
    if (c.codice < 0 || c.data < 0 || c.impegno < 0) return [];
    const v = (r, k) => c[k] >= 0 ? r[c[k]] : '';
    return (est || []).slice(1).map(r => {
      const impegno = String(v(r, 'impegno') || '').trim();
      return { scuola: String(v(r, 'scuola') || '').trim(), codice: String(v(r, 'codice') || '').trim().toUpperCase(), data: data(v(r, 'data')),
        orario: String(v(r, 'orario') || '').trim(), impegno, ore: numero(v(r, 'ore')) || 0, conta: contaDa(v(r, 'conta'), impegno) };
    }).filter(x => x.codice && x.data && x.impegno);
  }
  // «prime 40», «A», «seconde 40», «B», «formazione», «non conta»… → prime / seconde / formazione / no / altro (se manca: dal nome dell'impegno)
  function contaDa(v, impegno) {
    const t = semplice(v);
    if (/^prim|^a\b/.test(t)) return 'prime';
    if (/^second|^b\b/.test(t)) return 'seconde';
    if (/formaz/.test(t)) return 'formazione';
    if (/non conta|^no\b|scrutin|esam/.test(t)) return 'no';
    return indovina(t || impegno);
  }
  // «15:00–17:00» (anche con il trattino corto) → [inizio, fine] in minuti, oppure [null, null]
  function intervallo(orario) {
    const m = String(orario || '').match(/(\d{1,2})[:.](\d{2})\s*[–\-—]\s*(\d{1,2})[:.](\d{2})/);
    return m ? [+m[1] * 60 + +m[2], +m[3] * 60 + +m[4]] : [null, null];
  }
  /*
    Scrutini ed esami con la colonna Classi vuota: le classi si ricavano dal titolo, così ogni docente risulta solo nei suoi
    (non contano nelle 40+40, ma servono al dettaglio e agli estratti per le scuole di completamento):
    «Scrutini 1C-2C-3C» = uno dopo l'altro; «Scrutini terze» / «prime-seconde»; «Orali A» = 3A; le altre prove = tutte le terze.
  */
  const TERZE = '3A 3B 3C 3D 3E';
  function classiDalTitolo(tipo, titolo) {
    const t = semplice(tipo), s = String(titolo || '');
    if (t.startsWith('scrutin')) {
      if (/terze/i.test(s)) return TERZE.split(' ').join(' / ');
      if (/prime.?seconde/i.test(s)) return '1A / 1B / 1C / 1D / 1E / 2A / 2B / 2C / 2D / 2E';
      const c = (s.toUpperCase().match(/\b[1-3]\s?[A-E]\b/g) || []).map(classeSemplice);
      return c.join(' / ');
    }
    if (t.startsWith('esam')) {
      const o = s.match(/^\s*orali\s+([A-E])\b/i);
      return o ? '3' + o[1].toUpperCase() : TERZE;
    }
    return '';
  }

  // Tipo scritto a mano e non presente nella tabella: lo si riconosce dalle parole
  function indovina(tipo) {
    const s = semplice(tipo);
    if (/prescrutin/.test(s) || /\bcdc/.test(s) || s.includes('consigli')) return 'seconde';
    if (/\bglo\b/.test(s)) return 'seconde';
    if (/scrutin|esam/.test(s)) return 'no';
    if (/formazion|sicurezza|privacy/.test(s)) return 'formazione';
    if (/collegio|dipartiment|programmazion|pless|assemble|colloqui/.test(s)) return 'prime';
    return 'altro';
  }

  // ---------- 2. Le classi di ogni docente (dall'orario: cattedre + sostegno) ----------
  // D = orario normalizzato (Dati.normalizza). Restituisce Map codice → Set di classi («1A»…)
  function classiDaOrario(D) {
    const codiceDi = new Map(D.docente.map(e => [e.id, String(e.codice !== undefined ? e.codice : e.nome).trim().toUpperCase()]));
    const classeDi = new Map(D.classe.map(c => [c.id, classeSemplice(c.nome)]));
    const m = new Map();
    const metti = (doc, cl) => { const k = codiceDi.get(doc), c = classeDi.get(cl); if (!k || !c) return; if (!m.has(k)) m.set(k, new Set()); m.get(k).add(c); };
    (D.lezioniCurricolari || D.lezioni).filter(l => !l.compresenza).forEach(l => metti(l.docente, l.classe));
    // il sostegno conta (CdC, GLO, scrutini): solo in memoria; potenziamento e altre compresenze no
    if (typeof Compresenze !== 'undefined') Compresenze.lezioni(D).filter(l => /^sostegno/i.test(l.materia || '')).forEach(l => metti(l.docente, l.classe));
    return m;
  }

  // ---------- 3. Il conto ----------
  // Una riga del Foglio diventa uno o più blocchi { data, ini, fin, ore, classi:[…], impegno, conta, chiave }
  function blocchi(impegni) {
    const out = [];
    impegni.forEach(x => {
      const chiave = x.data + '|' + x.impegno;
      const gruppi = x.classi.split('/').map(g => (g.toUpperCase().match(/\b[1-5]\s?[A-Z]\b/g) || []).map(classeSemplice));
      const conClassi = gruppi.filter(g => g.length);
      if (/^glo\b/i.test(semplice(x.tipo)) && conClassi.length) {
        conClassi.forEach(g => out.push({ data: x.data, ini: null, fin: null, ore: ORE_GLO, classi: g, impegno: x.impegno, conta: x.conta, chiave }));
      } else if (conClassi.length > 1 && x.ini != null && x.fin != null && x.fin > x.ini) {
        const passo = (x.fin - x.ini) / conClassi.length;
        conClassi.forEach((g, i) => out.push({ data: x.data, ini: Math.round(x.ini + passo * i), fin: Math.round(x.ini + passo * (i + 1)), ore: null, classi: g, impegno: x.impegno, conta: x.conta, chiave }));
      } else {
        const tutte = conClassi.length ? conClassi[0] : [];
        const tempo = x.ini != null && x.fin != null && x.fin > x.ini;
        out.push({ data: x.data, ini: tempo ? x.ini : null, fin: tempo ? x.fin : null, ore: tempo ? null : x.ore, classi: tutte, impegno: x.impegno, conta: x.conta, chiave });
      }
    });
    return out;
  }
  // Durata dell'unione di intervalli (in ore) + le ore scritte a mano dei blocchi senza orario
  function durata(bl) {
    const int = bl.filter(b => b.ini != null).sort((a, b) => a.ini - b.ini);
    let tot = 0, a = null, b = null;
    int.forEach(x => {
      if (a === null) { a = x.ini; b = x.fin; }
      else if (x.ini <= b) b = Math.max(b, x.fin);
      else { tot += b - a; a = x.ini; b = x.fin; }
    });
    if (a !== null) tot += b - a;
    return tot / 60 + bl.filter(x => x.ini == null && x.ore).reduce((s, x) => s + x.ore, 0);
  }
  function orarioDi(bl) {
    const int = bl.filter(b => b.ini != null);
    if (!int.length) return '';
    return hhmm(Math.min(...int.map(b => b.ini))) + '–' + hhmm(Math.max(...int.map(b => b.fin)));
  }
  const dovute = (tipo, ore) => tipo === 'COI' ? 40 : Math.min(40, Math.round(40 * (ore || 0) / 18));

  /*
    Il calcolo completo. foglio = leggiFoglio(), classi = classiDaOrario(D).
    Restituisce { docenti: [...con prime, seconde, formazione, nonConta, dovute, dettaglio], impegni: [...], avvisi: [...] }
  */
  function calcola(foglio, classi) {
    const bl = blocchi(foglio.impegni);
    const avvisi = [];
    // controlli sul Foglio: impegni che contano senza orario né ore, classi che non esistono
    const esistenti = new Set([].concat(...[...classi.values()].map(s => [...s])));
    foglio.impegni.forEach(x => {
      if (['prime', 'seconde', 'formazione'].includes(x.conta) && (x.ini == null || x.fin == null) && !x.ore && !/^glo\b/i.test(semplice(x.tipo)))
        avvisi.push(`Riga ${x.riga} (${x.impegno}, ${x.data.split('-').reverse().join('/')}): manca l'orario o le ore, per ora vale 0.`);
      const ignote = (x.classi.toUpperCase().match(/\b[1-5]\s?[A-Z]\b/g) || []).map(classeSemplice).filter(c => esistenti.size && !esistenti.has(c));
      if (ignote.length) avvisi.push(`Riga ${x.riga} (${x.impegno}): classi che non ci sono nell'orario: ${[...new Set(ignote)].join(', ')}.`);
    });
    // i docenti: quelli del Foglio, più quelli dell'orario che nel Foglio mancano
    const elenco = foglio.docenti.slice();
    [...classi.keys()].filter(k => !elenco.some(d => d.codice === k)).forEach(k => {
      elenco.push({ riga: 0, codice: k, nome: '', tipo: 'COI', oreSett: 18, scuola: '', dal: '', visibile: false, manca: true });
      avvisi.push(`${k}: non è nella scheda «Docenti» del Foglio (conto come COI da 18 ore).`);
    });
    const docenti = elenco.map(d => {
      const mie = classi.get(d.codice) || new Set();
      // solo gli esoneri APPROVATI tolgono ore; quelli proposti e non ancora approvati si vedono soltanto
      const proposte = foglio.esoneri && foglio.esoneri.get(d.codice) || new Map();
      const esonerato = new Set([...proposte].filter(([, x]) => x.approvato).map(([k]) => k));
      const proposto = new Set([...proposte].filter(([, x]) => !x.approvato).map(([k]) => k));
      // le ASSENZE registrate nella scheda «Presenze» (incontri già svolti): quelle ore non sono state fatte e non contano
      const assente = new Set([...(foglio.presenze && foglio.presenze.get(d.codice) || new Map())].filter(([k, c]) => c === false && !esonerato.has(k)).map(([k]) => k));
      const tocca = b => (!d.dal || b.data >= d.dal) && (!b.classi.length || b.classi.some(c => mie.has(c)));
      const miei = bl.filter(b => b.conta !== 'altro' && tocca(b));
      const tot = { prime: 0, seconde: 0, formazione: 0, no: 0 };
      // per giorno e conteggio: unione dei blocchi (senza gli impegni da cui il docente è esonerato o a cui era assente)
      const perGiorno = new Map();
      miei.filter(b => !esonerato.has(b.chiave) && !assente.has(b.chiave)).forEach(b => { const k = b.data + '|' + b.conta; if (!perGiorno.has(k)) perGiorno.set(k, []); perGiorno.get(k).push(b); });
      perGiorno.forEach((g, k) => { tot[k.split('|')[1]] += durata(g); });
      // dettaglio per impegno (anche quelli esonerati, segnati)
      const perImpegno = new Map();
      miei.forEach(b => { if (!perImpegno.has(b.chiave)) perImpegno.set(b.chiave, []); perImpegno.get(b.chiave).push(b); });
      const dettaglio = [...perImpegno.values()].map(g => ({ data: g[0].data, orario: orarioDi(g), impegno: g[0].impegno, ore: arrotonda(durata(g)), conta: g[0].conta,
        esonero: esonerato.has(g[0].chiave), proposto: proposto.has(g[0].chiave), assente: assente.has(g[0].chiave) }))
        .sort((a, b) => (a.data + a.orario).localeCompare(b.data + b.orario));
      const esonerate = arrotonda(dettaglio.filter(x => x.esonero && (x.conta === 'prime' || x.conta === 'seconde')).reduce((s, x) => s + x.ore, 0));
      const proposteOre = arrotonda(dettaglio.filter(x => x.proposto && (x.conta === 'prime' || x.conta === 'seconde')).reduce((s, x) => s + x.ore, 0));
      const assenze = arrotonda(dettaglio.filter(x => x.assente && (x.conta === 'prime' || x.conta === 'seconde')).reduce((s, x) => s + x.ore, 0));
      // impegni presso le ALTRE scuole (docenti in COE): non contano qui, completano il piano del docente; si cercano le sovrapposizioni
      const esterni = (foglio.esterni || []).filter(x => x.codice === d.codice).sort((a, b) => (a.data + a.orario).localeCompare(b.data + b.orario));
      const oreEsterne = { prime: arrotonda(esterni.filter(x => x.conta === 'prime').reduce((s, x) => s + x.ore, 0)),
        seconde: arrotonda(esterni.filter(x => x.conta === 'seconde').reduce((s, x) => s + x.ore, 0)) };
      const conflitti = [];
      esterni.forEach(x => {
        const [a, b] = intervallo(x.orario); if (a == null) return;
        dettaglio.filter(y => y.data === x.data && !y.esonero && !y.assente).forEach(y => {
          const [c, e] = intervallo(y.orario);
          if (c != null && a < e && c < b) conflitti.push({ data: x.data, nostro: y.impegno, nostroOrario: y.orario, loro: x.impegno, loroOrario: x.orario, scuola: x.scuola });
        });
      });
      // formazione: quella scritta negli impegni + le ore attribuite al docente nella scheda «Docenti»
      tot.formazione += d.oreFormazione || 0;
      const dov = dovute(d.tipo, d.oreSett);
      return Object.assign({}, d, {
        classi: [...mie].sort(), dovute: dov,
        prime: arrotonda(tot.prime), seconde: arrotonda(tot.seconde), formazione: arrotonda(tot.formazione), nonConta: arrotonda(tot.no), esonerate, proposte: proposteOre, assenze, esterni, oreEsterne, conflitti,
        residuoPrime: arrotonda(dov - tot.prime), residuoSeconde: arrotonda(dov - tot.seconde),
        residuo: arrotonda(2 * dov - tot.prime - tot.seconde - tot.formazione), dettaglio
      });
    }).sort((a, b) => (a.nome || a.codice).localeCompare(b.nome || b.codice, 'it'));
    // le sovrapposizioni con gli impegni delle altre scuole
    docenti.forEach(d => d.conflitti.forEach(c => avvisi.push(`${d.nome || d.codice}: il ${c.data.split('-').reverse().join('/')} «${c.nostro}» (${c.nostroOrario}) ` +
      `si sovrappone a «${c.loro}» presso ${c.scuola || 'l\'altra scuola'} (${c.loroOrario}).`)));
    const daApprovare = docenti.filter(d => d.dettaglio.some(x => x.proposto));
    if (daApprovare.length) avvisi.unshift(`Proposte di esonero da approvare: ${daApprovare.map(d => (d.nome || d.codice) + ' (' + d.dettaglio.filter(x => x.proposto).length + ')').join(', ')}. Apri il dettaglio del docente per approvarle.`);
    // gli incontri con le presenze registrate (scheda «Presenze»)
    const registrati = new Set(); (foglio.presenze || new Map()).forEach(m => m.forEach((v, k) => registrati.add(k)));
    // l'elenco degli impegni (una riga per giorno + impegno), per il piano degli estratti
    const perChiave = new Map();
    bl.forEach(b => { if (!perChiave.has(b.chiave)) perChiave.set(b.chiave, []); perChiave.get(b.chiave).push(b); });
    const impegni = [...perChiave.entries()].map(([chiave, g]) => {
      const riga = foglio.impegni.find(x => x.data + '|' + x.impegno === chiave);
      const righe = foglio.impegni.filter(x => x.data + '|' + x.impegno === chiave);
      const inizio = righe.map(x => x.ini).filter(x => x != null), fine = righe.map(x => x.fin).filter(x => x != null);
      return { chiave, data: g[0].data, orario: inizio.length ? hhmm(Math.min(...inizio)) + '–' + hhmm(Math.max(...fine)) : '', impegno: g[0].impegno,
        conta: g[0].conta, classi: righe.map(x => x.classi).filter(Boolean).join(' / '), tipo: riga ? riga.tipo : '', registrato: registrati.has(chiave) };
    }).sort((a, b) => (a.data + a.orario).localeCompare(b.data + b.orario));
    return { docenti, impegni, avvisi, registrati };
  }

  // ---------- 4. Scrivere nel Foglio la spunta di visibilità ----------
  const lettera = n => { let s = ''; n++; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
  async function scriviCella(zona, valore, email) {
    const t = await NomiDocenti.gettone([NomiDocenti.PERMESSO_DRIVE, SCRIVERE], email);
    const r = await fetch(SHEETS + encodeURIComponent(file()) + '/values/' + encodeURIComponent(zona) + '?valueInputOption=USER_ENTERED', {
      method: 'PUT', headers: { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' }, body: JSON.stringify({ values: [[valore]] })
    });
    if (!r.ok) throw new Error(r.status === 403 ? 'il tuo account non può modificare il Foglio «40 ore»' : 'errore ' + r.status + ' da Google');
  }
  // Spunta «Visibile al docente» (riga del docente nella scheda Docenti)
  function scriviVisibile(foglio, docente, si, email) {
    if (foglio.colonnaVisibile < 0) throw new Error('nella scheda «Docenti» manca la colonna «Visibile al docente»');
    if (!docente.riga) throw new Error('il docente non è nella scheda «Docenti» del Foglio');
    return scriviCella(`'Docenti'!${lettera(foglio.colonnaVisibile)}${docente.riga}`, si ? 'SI' : 'NO', email);
  }
  // «Visibile a tutti i docenti» (scheda Impostazioni, colonna B)
  function scriviVisibileTutti(foglio, si, email) {
    const riga = foglio.colonnaImpostazioni >= 0 ? foglio.colonnaImpostazioni + 1 : 2;
    return scriviCella(`'Impostazioni'!B${riga}`, si ? 'SI' : 'NO', email);
  }

  // Ore di formazione obbligatoria attribuite al docente (scheda «Docenti», colonna «Ore formazione»: se manca la crea in fondo)
  async function scriviFormazione(foglio, docente, ore, email) {
    if (!docente.riga) throw new Error('il docente non è nella scheda «Docenti» del Foglio');
    let col = foglio.colonnaFormazione;
    if (col == null || col < 0) {
      col = foglio.colonneDocenti;
      await scriviCella(`'Docenti'!${lettera(col)}1`, 'Ore formazione', email);
      foglio.colonnaFormazione = col; foglio.colonneDocenti = col + 1;
    }
    return scriviCella(`'Docenti'!${lettera(col)}${docente.riga}`, ore ? ore : '', email);
  }

  /*
    ESONERI: la scheda «Esoneri» del Foglio (Codice, Docente, Data, Impegno, Ore, Importato il, Approvato), una riga per impegno.
    - scriviEsoneri: le PROPOSTE importate dall'Excel del docente sostituiscono tutte le sue righe (voci = [{ data, impegno, ore }]);
      un impegno che era già approvato resta approvato, i nuovi restano «da approvare» (Approvato vuoto). Se la scheda non
      c'è la crea.
    - scriviApprovato: SI/NO nella colonna «Approvato» di una riga (tasto «Approva» della scheda 40+40, oppure a mano nel Foglio).
    Solo gli esoneri APPROVATI tolgono ore nel calcolo (calcola).
  */
  const TITOLI_ESONERI = ['Codice', 'Docente', 'Data', 'Impegno', 'Ore', 'Importato il', 'Approvato'];
  const dataIt = v => typeof v === 'number' ? data(v).split('-').reverse().join('/') : v;   // le date lette come numeri di serie
  async function chiamaFoglio(percorso, metodo, corpo, email) {
    const t = await NomiDocenti.gettone([NomiDocenti.PERMESSO_DRIVE, SCRIVERE], email);
    const r = await fetch(SHEETS + encodeURIComponent(file()) + percorso, {
      method: metodo, headers: { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' }, body: corpo ? JSON.stringify(corpo) : undefined
    });
    if (!r.ok) throw new Error(r.status === 403 ? 'il tuo account non può modificare il Foglio «40 ore»' : 'errore ' + r.status + ' da Google');
    return r.json();
  }
  async function scriviEsoneri(foglio, codice, nome, voci, email) {
    return scriviEsoneriTutti(foglio, [{ codice, nome, voci }], email);
  }
  /*
    Come scriviEsoneri, ma per più docenti in una volta sola (una sola scrittura nel Foglio): lo usa il «Piano di esoneri»
    della scheda 40+40. elenco = [{ codice, nome, voci: [{ data, impegno, ore, approvato }] }]; con «approvato: true» la riga
    nasce già approvata, altrimenti resta com'era (approvata se lo era già, se no da approvare).
  */
  async function scriviEsoneriTutti(foglio, elenco, email) {
    if (!foglio.conEsoneri) {
      await chiamaFoglio(':batchUpdate', 'POST', { requests: [{ addSheet: { properties: { title: 'Esoneri' } } }] }, email);
      foglio.conEsoneri = true; foglio.righeEsoneri = [];
    }
    const codici = new Set(elenco.map(x => String(x.codice).toUpperCase()));
    const altre = (foglio.righeEsoneri || []).filter(r => !codici.has(String(r[0] || '').trim().toUpperCase()) && r.some(c => c !== '' && c != null))
      .map(r => [r[0], r[1], dataIt(r[2]), r[3], r[4], dataIt(r[5]), r[6] == null ? '' : r[6]]);
    const oggi = new Date().toLocaleDateString('it-IT');
    const nuove = [].concat(...elenco.map(x => {
      const k = String(x.codice).toUpperCase(), prima = foglio.esoneri.get(k) || new Map();
      return x.voci.map(v => [k, x.nome || '', v.data.split('-').reverse().join('/'), v.impegno, v.ore, oggi,
        v.approvato || (prima.get(v.data + '|' + v.impegno) || {}).approvato ? 'SI' : '']);
    }));
    const valori = [TITOLI_ESONERI].concat(altre, nuove);
    await chiamaFoglio('/values/' + encodeURIComponent("'Esoneri'!A:G") + ':clear', 'POST', {}, email);
    await chiamaFoglio('/values/' + encodeURIComponent(`'Esoneri'!A1:G${valori.length}`) + '?valueInputOption=USER_ENTERED', 'PUT', { values: valori }, email);
    // si rifà l'elenco in memoria con i numeri di riga nuovi
    foglio.righeEsoneri = altre.concat(nuove);
    foglio.colonnaApprovato = 6;
    foglio.esoneri = new Map();
    foglio.righeEsoneri.forEach((r, i) => {
      const c = String(r[0]).toUpperCase(), chiave = data(r[2]) + '|' + r[3];
      if (!foglio.esoneri.has(c)) foglio.esoneri.set(c, new Map());
      foglio.esoneri.get(c).set(chiave, { approvato: si(r[6]), riga: i + 2 });
    });
  }
  async function scriviApprovato(foglio, codice, chiave, valore, email) {
    const x = (foglio.esoneri.get(String(codice).toUpperCase()) || new Map()).get(chiave);
    if (!x) throw new Error('questa proposta di esonero non è più nel Foglio: rileggilo');
    let col = foglio.colonnaApprovato;
    if (col == null || col < 0) { col = 6; await scriviCella(`'Esoneri'!G1`, 'Approvato', email); foglio.colonnaApprovato = col; }
    await scriviCella(`'Esoneri'!${lettera(col)}${x.riga}`, valore ? 'SI' : '', email);
    x.approvato = !!valore;
  }
  // Toglie del tutto dal Foglio alcune righe di esonero di un docente (chiavi = «data|impegno»): le altre restano come sono
  async function togliEsoneri(foglio, codice, nome, chiavi, email) {
    const k = String(codice).toUpperCase(), via = new Set(chiavi);
    const restano = (foglio.righeEsoneri || []).filter(r => String(r[0] || '').trim().toUpperCase() === k)
      .map(r => ({ data: data(r[2]), impegno: String(r[3] || '').trim(), ore: numero(r[4]) || 0 }))
      .filter(v => v.data && v.impegno && !via.has(v.data + '|' + v.impegno));
    return scriviEsoneri(foglio, k, nome, restano, email);
  }
  /*
    Chi è esonerato da ogni impegno: [{ data, impegno, approvati: [codici], proposti: [codici] }], in ordine di data.
    Lo usano il riquadro «Esoneri per impegno» della scheda 40+40 e il suo Excel.
  */
  function esoneriPerImpegno(foglio) {
    const perChiave = new Map();
    (foglio.esoneri || new Map()).forEach((voci, codice) => voci.forEach((x, chiave) => {
      if (!perChiave.has(chiave)) { const i = chiave.indexOf('|'); perChiave.set(chiave, { chiave, data: chiave.slice(0, i), impegno: chiave.slice(i + 1), approvati: [], proposti: [] }); }
      perChiave.get(chiave)[x.approvato ? 'approvati' : 'proposti'].push(codice);
    }));
    return [...perChiave.values()].sort((a, b) => a.chiave.localeCompare(b.chiave));
  }

  /* ---------- PRESENZE agli incontri già svolti (scheda «Presenze» del Foglio) ----------
     Si caricano da un Excel (verbali, registro firme, modulo…) con leggiPresenzeDaTabelle, che capisce due forme:
     - UNA RIGA PER PRESENZA: colonne Data, Docente (o Cognome e Nome, o Codice), facoltative Impegno e Presente/Assente.
       Senza la colonna Presente: se la colonna del docente si chiama «Assenti» le righe sono le assenze, altrimenti sono le
       presenze e chi era atteso a quell'incontro ma non c'è risulta assente;
     - GRIGLIA: una riga per docente e una colonna per incontro (nel titolo la data, es. «Collegio 03/09/2026»), nelle celle
       P / A / SI / NO / X / AG…
     Gli incontri si riconoscono dalla data e, se c'è, dal nome (o dal tipo); i docenti dal codice o dal nome. */
  const TITOLI_PRESENZE = ['Data', 'Impegno', 'Codice', 'Docente', 'Presente (SI/NO)', 'Note'];
  const parole = s => semplice(s).split(/[^a-z0-9]+/).filter(Boolean);
  function trovaDocente(testo, elenco) {
    const t = String(testo || '').trim();
    if (/^DOC\d+$/i.test(t)) return elenco.find(d => d.codice === t.toUpperCase()) || null;
    const a = new Set(parole(t)); if (!a.size) return null;
    const uguali = elenco.filter(d => { const b = new Set(parole(d.nome)); return b.size === a.size && [...a].every(x => b.has(x)); });
    if (uguali.length === 1) return uguali[0];
    const dentro = elenco.filter(d => { const b = new Set(parole(d.nome)); return b.size && ([...a].every(x => b.has(x)) || [...b].every(x => a.has(x))); });
    return dentro.length === 1 ? dentro[0] : null;
  }
  // una cella → true (presente) / false (assente) / null (vuota o non capita); «assenti» = la colonna conta le assenze
  function presenza(v, assenti) {
    const t = semplice(v);
    let p = null;
    if (/^(si|s|x|p|pres|presente|1|true|vero|ok|firma|firmato|✓|✔)\b/.test(t) || t === 'x') p = true;
    else if (/^(no|n|a|ag|ai|ass|assente|giust|ingiust|0|false|falso|e|es|eso|esonerat\w*|altra|altrove|coe)\b/.test(t)) p = false;
    if (p === null) return null;
    return assenti ? !p : p;
  }
  /*
    altrove = true: il file elenca chi NON era da noi perché era nell'altra scuola (docenti in COE). Allora un elenco senza la
    colonna Presente vale tutto come «non presente» e a chi non è nel file non succede niente; con la colonna Presente (o nella
    griglia) contano solo le righe con NO / A / E / «altra scuola». Il chiamante ne fa degli esoneri (piano di esoneri).
  */
  function leggiPresenzeDaTabelle(tabelle, risultato, altrove) {
    const elenco = risultato.docenti.map(d => ({ codice: d.codice, nome: d.nome || '' }));
    // chi è atteso a ogni incontro (dal dettaglio di ogni docente)
    const attesi = new Map();
    risultato.docenti.forEach(d => d.dettaglio.forEach(x => {
      if (!['prime', 'seconde', 'formazione'].includes(x.conta)) return;
      const k = x.data + '|' + x.impegno; if (!attesi.has(k)) attesi.set(k, new Set()); attesi.get(k).add(d.codice);
    }));
    const esito = { voci: new Map(), incontri: new Set(), nonTrovati: new Set(), giorniSenza: new Set(), nonAttesi: 0, righe: 0, forma: '' };
    const segna = (codice, k, presente) => { if (!esito.voci.has(k)) esito.voci.set(k, new Map()); esito.voci.get(k).set(codice, presente); esito.incontri.add(k); };
    // gli incontri di un giorno che corrispondono al testo (nome o tipo); se il testo non dice niente, tutti quelli del giorno
    const incontri = (dd, testo) => {
      const tutti = risultato.impegni.filter(p => p.data === dd && attesi.has(p.chiave));
      if (!tutti.length) { esito.giorniSenza.add(dd); return []; }
      const t = semplice(String(testo || '').replace(/\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}/, ''));
      if (!t) return tutti;
      const scelti = tutti.filter(p => { const a = semplice(p.impegno), b = semplice(p.tipo); return a === t || a.includes(t) || t.includes(a) || (b && (t.includes(b) || b.includes(t))); });
      return scelti.length ? scelti : tutti;
    };
    const metti = (testoDocente, dd, testoImpegno, presente) => {
      if (presente === null || !dd) return;
      const d = trovaDocente(testoDocente, elenco);
      if (!d) {
        // più nomi nella stessa cella («Bonaudo, Rindone»): se il testo intero non è un docente si prova pezzo per pezzo
        const pezzi = String(testoDocente || '').split(/\s*[,;\/\n]\s*|\s+e\s+/).filter(Boolean);
        if (pezzi.length > 1) { pezzi.forEach(p => metti(p, dd, testoImpegno, presente)); return; }
        if (String(testoDocente || '').trim()) esito.nonTrovati.add(String(testoDocente).trim()); return;
      }
      esito.righe++;
      // «non atteso» si conta solo se il docente non era atteso a NESSUNO degli incontri della riga (es. due CdC lo stesso giorno)
      const delGiorno = incontri(dd, testoImpegno), suoi = delGiorno.filter(p => attesi.get(p.chiave).has(d.codice));
      if (!delGiorno.length) return;
      if (suoi.length) suoi.forEach(p => segna(d.codice, p.chiave, presente)); else esito.nonAttesi++;
    };
    for (const tab of tabelle || []) {
      const righe = tab.righe || [];
      for (let i = 0; i < Math.min(15, righe.length); i++) {
        const h = righe[i].map(semplice);
        const cData = h.findIndex(c => /^(data|giorno)/.test(c));
        const cCogn = h.findIndex(c => c.startsWith('cognome')), cNome = h.findIndex(c => c === 'nome');
        const cDoc = h.findIndex(c => /docent|nominativ|assent|presenti$/.test(c)), cCod = h.findIndex(c => c.startsWith('codice'));
        const nomeDi = r => cCod >= 0 && /^DOC\d+/i.test(String(r[cCod] || '').trim()) ? String(r[cCod]).trim()
          : cCogn >= 0 ? String(r[cCogn] || '') + (cNome >= 0 && cNome !== cCogn ? ' ' + String(r[cNome] || '') : '') : String(r[cDoc >= 0 ? cDoc : cNome] || '');
        const haDocente = cCogn >= 0 || cDoc >= 0 || cCod >= 0 || cNome >= 0;
        // 1) UNA RIGA PER PRESENZA
        if (cData >= 0 && haDocente) {
          const cImp = h.findIndex(c => /impegno|riunione|incontro|organo|oggetto|^tipo/.test(c));
          const cPres = h.findIndex((c, j) => j !== cDoc && /present|presenz|assen|esito|stato|firma/.test(c));
          const assenti = cPres >= 0 ? /assen/.test(h[cPres]) : cDoc >= 0 && /assent/.test(h[cDoc]);
          esito.forma = cPres >= 0 ? 'una riga per docente e incontro' : altrove ? 'elenco di chi era nell\'altra scuola' : assenti ? 'elenco degli assenti' : 'elenco dei presenti';
          const corpo = righe.slice(i + 1);
          if (cPres >= 0) corpo.forEach(r => metti(nomeDi(r), data(r[cData]), cImp >= 0 ? r[cImp] : '', presenza(r[cPres], assenti)));
          else if (altrove) corpo.forEach(r => metti(nomeDi(r), data(r[cData]), cImp >= 0 ? r[cImp] : '', false));
          else {
            // solo un elenco (dei presenti o degli assenti): per gli incontri citati, chi era atteso e non c'è ha l'opposto
            corpo.forEach(r => metti(nomeDi(r), data(r[cData]), cImp >= 0 ? r[cImp] : '', !assenti));
            esito.incontri.forEach(k => attesi.get(k).forEach(c => { if (!esito.voci.get(k).has(c)) esito.voci.get(k).set(c, assenti); }));
          }
          return esito;
        }
        // 2) GRIGLIA: almeno due colonne con una data nel titolo
        const conData = righe[i].map((c, j) => ({ j, dd: data(c), testo: c })).filter(x => x.dd);
        if (conData.length >= 2) {
          esito.forma = 'griglia (docenti × incontri)';
          const cD = haDocente ? (cCogn >= 0 ? cCogn : cDoc >= 0 ? cDoc : cCod >= 0 ? cCod : cNome) : righe[i].findIndex((c, j) => !conData.some(x => x.j === j));
          righe.slice(i + 1).forEach(r => {
            const chi = haDocente ? nomeDi(r) : String(r[cD] || '');
            conData.forEach(x => metti(chi, x.dd, x.testo, presenza(r[x.j], false)));
          });
          return esito;
        }
      }
    }
    throw new Error('non trovo le presenze nel file: servono le colonne Data e Docente (o Cognome e Nome), oppure una griglia con le date nei titoli delle colonne');
  }
  /* ---------- IMPEGNI DELLE ALTRE SCUOLE (docenti in COE) ----------
     L'altra scuola manda il piano dei docenti in comune; leggiImpegniEsterni capisce:
     - un foglio per docente (come l'estratto che mandiamo noi): il nome del docente nel nome del foglio o nelle prime righe, poi
       le colonne Giorno/Data, Orario, Impegno, Ore, Conta in;
     - un elenco unico con la colonna Docente (o Cognome e Nome) e le stesse colonne.
     Le ore mancanti si ricavano dall'orario («15:00–17:00» = 2); «Conta in» (prime/seconde, A/B…) se manca si ricava dal nome. */
  function leggiImpegniEsterni(tabelle, risultato, scuola) {
    const tutti = risultato.docenti.map(d => ({ codice: d.codice, nome: d.nome || '', scuola: d.scuola || '' }));
    // prima si cercano i docenti di quella scuola, poi tutti
    const suoi = tutti.filter(d => semplice(d.scuola) && (semplice(d.scuola).includes(semplice(scuola)) || semplice(scuola).includes(semplice(d.scuola))));
    const trova = testo => trovaDocente(testo, suoi) || trovaDocente(testo, tutti);
    const esito = { voci: [], docenti: new Set(), nonTrovati: new Set(), righe: 0 };
    for (const tab of tabelle || []) {
      const righe = tab.righe || [];
      for (let i = 0; i < Math.min(15, righe.length); i++) {
        const h = righe[i].map(semplice);
        const cData = h.findIndex(c => /^(giorno|data)/.test(c)), cImp = h.findIndex(c => /impegno|attivit|riunione|oggetto/.test(c));
        if (cData < 0 || cImp < 0) continue;
        const cOrario = h.findIndex(c => c.startsWith('orario')), cIni = h.findIndex(c => c.startsWith('inizio')), cFin = h.findIndex(c => c.startsWith('fine'));
        const cOre = h.findIndex(c => c === 'ore' || c.startsWith('ore ') || c.startsWith('durata')), cConta = h.findIndex(c => /conta|categoria|tipo/.test(c));
        const cCogn = h.findIndex(c => c.startsWith('cognome')), cNome = h.findIndex(c => c === 'nome'), cDoc = h.findIndex(c => /^(docente|nominativo|codice)/.test(c));   // non «Orario del docente» né «Docenti in comune»
        // il docente del foglio intero (un foglio per docente): dal nome del foglio o dal testo delle prime righe
        let delFoglio = null;
        if (cDoc < 0 && cCogn < 0) {
          delFoglio = trova(tab.nome);
          for (let j = 0; j < i && !delFoglio; j++) delFoglio = trova(righe[j].filter(x => x !== '' && x != null).join(' '));
          if (!delFoglio) break;   // né colonna del docente né nome riconoscibile: il foglio non riguarda un docente (es. «Piano»)
        }
        righe.slice(i + 1).forEach(r => {
          const dd = data(r[cData]), imp = String(r[cImp] || '').trim();
          if (!dd || !imp) return;
          const testo = cDoc >= 0 ? r[cDoc] : cCogn >= 0 ? String(r[cCogn] || '') + (cNome >= 0 ? ' ' + String(r[cNome] || '') : '') : '';
          const d = delFoglio || trova(testo);
          if (!d) { if (String(testo || '').trim()) esito.nonTrovati.add(String(testo).trim()); return; }
          let orario = cOrario >= 0 ? String(r[cOrario] || '').trim() : '';
          if (!orario && cIni >= 0 && cFin >= 0) { const a = minuti(r[cIni]), b = minuti(r[cFin]); if (a != null && b != null) orario = hhmm(a) + '–' + hhmm(b); }
          const [a, b] = intervallo(orario);
          const ore = cOre >= 0 && numero(r[cOre]) != null ? numero(r[cOre]) : (a != null && b > a ? arrotonda((b - a) / 60) : 0);
          esito.voci.push({ codice: d.codice, data: dd, orario, impegno: imp, ore, conta: contaDa(cConta >= 0 ? r[cConta] : '', imp) });
          esito.docenti.add(d.codice); esito.righe++;
        });
        break;
      }
    }
    if (!esito.righe) throw new Error('nel file non trovo impegni dei docenti in comune: servono le colonne Giorno (o Data) e Impegno, e il docente (colonna o nome del foglio)');
    return esito;
  }
  // Scrive gli impegni di una scuola nella scheda «Impegni altre scuole»: quelli di prima di QUELLA scuola si sostituiscono
  async function scriviImpegniEsterni(foglio, risultato, scuola, voci, email) {
    if (!foglio.conEsterni) {
      await chiamaFoglio(':batchUpdate', 'POST', { requests: [{ addSheet: { properties: { title: SCHEDA_ESTERNI } } }] }, email);
      foglio.conEsterni = true; foglio.righeEsterni = [];
    }
    const nomeDi = c => (risultato.docenti.find(d => d.codice === c) || {}).nome || '';
    const TITOLI = ['Scuola', 'Codice', 'Docente', 'Data', 'Orario', 'Impegno', 'Ore', 'Conta in'];
    const altre = (foglio.righeEsterni || []).filter(r => semplice(r[0]) !== semplice(scuola) && r.some(c => c !== '' && c != null))
      .map(r => [r[0], r[1], r[2], dataIt(r[3]), r[4], r[5], r[6], r[7]]);
    const nuove = voci.map(v => [scuola, v.codice, nomeDi(v.codice), v.data.split('-').reverse().join('/'), v.orario, v.impegno, v.ore, NOMI_CONTA[v.conta] || v.conta]);
    const valori = [TITOLI].concat(altre, nuove);
    await chiamaFoglio('/values/' + encodeURIComponent(`'${SCHEDA_ESTERNI}'!A:H`) + ':clear', 'POST', {}, email);
    await chiamaFoglio('/values/' + encodeURIComponent(`'${SCHEDA_ESTERNI}'!A1:H${valori.length}`) + '?valueInputOption=USER_ENTERED', 'PUT', { values: valori }, email);
    foglio.righeEsterni = altre.concat(nuove);
    foglio.esterni = esterniDaRighe(valori);
  }
  // L'elenco delle scuole di completamento nella scheda «Impostazioni» (voce «Scuole di completamento», valore «IC A; IC B»):
  // nella sua riga se c'è già, altrimenti nella prima riga libera dopo le altre voci (colonne A-B: la tabella dei tipi sta in D-E)
  async function scriviScuole(foglio, lista, email) {
    const riga = foglio.rigaScuole || (foglio.ultimaRigaVoci || 2) + 1;
    await chiamaFoglio('/values/' + encodeURIComponent(`'Impostazioni'!A${riga}:B${riga}`) + '?valueInputOption=RAW', 'PUT',
      { values: [['Scuole di completamento (separate da ;)', lista.filter(Boolean).join('; ')]] }, email);
    foglio.rigaScuole = riga; foglio.ultimaRigaVoci = Math.max(foglio.ultimaRigaVoci || 0, riga);
    foglio.scuole = lista.filter(Boolean);
  }
  // Scrive le presenze nella scheda «Presenze»: per gli incontri caricati sostituisce le righe di prima, le altre restano
  async function scriviPresenze(foglio, risultato, voci, email) {
    if (!foglio.conPresenze) {
      await chiamaFoglio(':batchUpdate', 'POST', { requests: [{ addSheet: { properties: { title: 'Presenze' } } }] }, email);
      foglio.conPresenze = true; foglio.righePresenze = [];
    }
    const nomeDi = c => (risultato.docenti.find(d => d.codice === c) || {}).nome || '';
    const altre = (foglio.righePresenze || []).filter(r => !voci.has(data(r[0]) + '|' + String(r[1] || '').trim()) && r.some(c => c !== '' && c != null))
      .map(r => [dataIt(r[0]), r[1], r[2], r[3], r[4], r[5] == null ? '' : r[5]]);
    const nuove = [];
    [...voci.keys()].sort().forEach(k => { const i = k.indexOf('|'); voci.get(k).forEach((presente, c) => nuove.push([k.slice(0, i).split('-').reverse().join('/'), k.slice(i + 1), c, nomeDi(c), presente ? 'SI' : 'NO', ''])); });
    const valori = [TITOLI_PRESENZE].concat(altre, nuove);
    await chiamaFoglio('/values/' + encodeURIComponent("'Presenze'!A:F") + ':clear', 'POST', {}, email);
    await chiamaFoglio('/values/' + encodeURIComponent(`'Presenze'!A1:F${valori.length}`) + '?valueInputOption=USER_ENTERED', 'PUT', { values: valori }, email);
    foglio.righePresenze = altre.concat(nuove);
    foglio.presenze = presenzeDaRighe(valori);
  }
  /*
    Il MODELLO da compilare: tutti gli incontri fino a «fino» (compreso) con i docenti attesi, una riga ciascuno, e la colonna
    Presente già a SI (o com'era registrata): basta mettere NO agli assenti e ricaricarlo.
  */
  function modelloPresenze(foglio, risultato, fino) {
    const I = t => ({ v: t, stile: 'intest' });
    const righe = [[{ v: `Presenze agli incontri – ${foglio.anno || ''}`, stile: 'titolo' }],
      [{ v: 'Scrivi NO nella colonna «Presente» per chi era assente, poi carica il file in Orario Facile (40+40 → «Carica presenze»). Non cambiare le altre colonne.', stile: 'evid' }], [],
      ['Data', 'Orario', 'Impegno', 'Codice', 'Docente', 'Presente (SI/NO)'].map(I)];
    const da = righe.length + 1;
    risultato.impegni.filter(p => p.data <= fino && ['prime', 'seconde', 'formazione'].includes(p.conta)).forEach(p => {
      risultato.docenti.filter(d => d.dettaglio.some(x => x.data + '|' + x.impegno === p.chiave)).forEach(d => {
        const reg = foglio.presenze && foglio.presenze.get(d.codice) && foglio.presenze.get(d.codice).get(p.chiave);
        righe.push([p.data.split('-').reverse().join('/'), p.orario, p.impegno, d.codice, d.nome || '', { v: reg === false ? 'NO' : 'SI', stile: 'evid' }]);
      });
    });
    return [{ nome: 'Presenze', larghezze: [12, 12, 40, 9, 28, 16], blocca: 4, righe, elenchi: righe.length >= da ? [{ zona: `F${da}:F${righe.length}`, valori: ['SI', 'NO'] }] : [] }];
  }

  /*
    L'EXCEL DEL DOCENTE («Le mie 40+40» nell'app, o dal prospetto): le sue ore divise in A (prime 40) e B (seconde 40),
    con la colonna «Esonero» dove scrive SI per gli impegni da cui chiede l'esonero; i totali si ricalcolano da soli.
    Una colonna nascosta («chiave») permette a Orario Facile di rileggere il file (leggiEsoneriDaExcel).
    d = { codice, nome, tipo, oreSett, dovute, formazione, dettaglio: [{ data, orario, impegno, ore, conta, esonero }] }
  */
  function excelDocente(d, anno) {
    const giornoLungo = iso => { const [a, m, g] = iso.split('-').map(Number); return new Date(a, m - 1, g).toLocaleDateString('it-IT', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' }); };
    const I = t => ({ v: t, stile: 'intest' });
    const righe = [
      [{ v: `Le mie 40+40 – a.s. ${anno || ''}`, stile: 'titolo' }],
      ['Docente', { v: d.nome || d.codice, stile: 'grassetto' }],
      ['Codice', d.codice],
      [{ v: 'Scrivi SI nella colonna «Esonero» accanto agli impegni da cui chiedi l\'esonero, poi rimanda il file a chi gestisce l\'orario. ' +
        'Non cambiare le altre colonne. I totali si aggiornano da soli.', stile: 'evid' }],
      []
    ];
    const zone = [];
    const blocco = (titolo, conta) => {
      righe.push([{ v: titolo, stile: 'grassetto' }]);
      righe.push(['Giorno', 'Orario', 'Impegno', 'Ore', 'Esonero (SI)', 'chiave (non toccare)'].map(I));
      const da = righe.length + 1;
      d.dettaglio.filter(x => x.conta === conta).forEach(x => righe.push([giornoLungo(x.data), x.orario, x.impegno, x.ore, { v: x.esonero || x.proposto ? 'SI' : '', stile: 'evid' }, x.data + '|' + x.impegno]));
      const a = Math.max(righe.length, da);
      if (righe.length >= da) zone.push(`E${da}:E${a}`);
      const D = `D${da}:D${a}`, E = `E${da}:E${a}`;
      righe.push(['', '', { v: 'Programmate', stile: 'grassetto' }, { f: `SUM(${D})`, stile: 'grassetto' }]);
      righe.push(['', '', 'Esonero richiesto', { f: `SUMIF(${E},"SI",${D})` }]);
      const n = righe.length;
      righe.push(['', '', { v: 'Dopo gli esoneri', stile: 'grassetto' }, { f: `D${n - 1}-D${n}`, stile: 'grassetto' }]);
      righe.push(['', '', 'Dovute', d.dovute]);
      righe.push(['', '', { v: 'Restano (in negativo = oltre il dovuto)', stile: 'grassetto' }, { f: `D${n + 2}-D${n + 1}`, stile: 'grassetto' }]);
      righe.push([]);
    };
    blocco('A – Prime 40: collegio docenti, dipartimenti, programmazione, plesso, incontri con le famiglie', 'prime');
    blocco('B – Seconde 40: consigli di classe e GLO', 'seconde');
    if (d.formazione) righe.push(['', '', 'Formazione obbligatoria (conta nelle ore che restano delle 80)', d.formazione]);
    // docenti in COE: gli impegni presso l'altra scuola, per avere il piano completo (non contano qui, non si chiede l'esonero)
    if ((d.esterni || []).length) {
      righe.push([], [{ v: 'Impegni presso l\'altra scuola (solo da vedere: non contano qui)', stile: 'grassetto' }]);
      righe.push(['Giorno', 'Orario', 'Impegno', 'Ore', 'Scuola'].map(I));
      d.esterni.forEach(x => righe.push([giornoLungo(x.data), x.orario, x.impegno, x.ore, x.scuola + ' · ' + (NOMI_CONTA[x.conta] || x.conta)]));
    }
    righe.push([d.tipo && d.tipo !== 'COI' ? `${d.tipo} con ${d.oreSett} ore settimanali: le ore dovute sono in proporzione (O.M. 446/1997 art. 7 c. 7).` : '']);
    return [{ nome: 'Le mie 40+40', larghezze: [20, 12, 50, 8, 13, 20], nascoste: [5], righe, elenchi: zone.length ? [{ zona: zone.join(' '), valori: ['SI', 'NO'] }] : [] }];
  }

  /*
    Rilegge l'Excel rimandato dal docente (Foglio.leggiTabelle): { codice, nome, chiavi: [«data|impegno» con SI] }.
    Lancia un errore se il file non è un Excel delle 40+40.
  */
  function leggiEsoneriDaExcel(tabelle) {
    for (const t of tabelle || []) {
      const righe = t.righe || [];
      const rc = righe.find(r => semplice(r[0]) === 'codice');
      const ri = righe.findIndex(r => r.some(c => semplice(c).startsWith('esonero')));
      if (!rc || ri < 0) continue;
      const rn = righe.find(r => semplice(r[0]) === 'docente');
      const chiavi = [];
      righe.forEach(r => {
        const cE = r.length > 4 ? 4 : -1;
        const chiave = String(r[5] || '');
        if (/^\d{4}-\d{2}-\d{2}\|/.test(chiave) && cE >= 0 && si(r[cE])) chiavi.push(chiave);
      });
      return { codice: String(rc[1] || '').trim().toUpperCase(), nome: rn ? String(rn[1] || '') : '', chiavi };
    }
    throw new Error('non sembra un Excel «Le mie 40+40» (mancano il codice del docente o la colonna «Esonero»)');
  }

  // ---------- 5. Pubblicare per i docenti (solo codici) ----------
  const cartella = () => (typeof CONFIG !== 'undefined' && (CONFIG.cartellaImpegni || CONFIG.cartellaPubblicazione)) || '';
  function datiDaPubblicare(foglio, risultato) {
    const docenti = {};
    risultato.docenti.filter(d => foglio.visibileTutti || d.visibile).forEach(d => {
      docenti[d.codice] = {
        tipo: d.tipo, oreSett: d.oreSett, dovute: d.dovute, prime: d.prime, seconde: d.seconde, formazione: d.formazione,
        dal: d.dal || '', esonerate: d.esonerate || 0, proposte: d.proposte || 0, assenze: d.assenze || 0,
        // ultimo numero: 1 = esonerato, 2 = esonero proposto, 3 = assente (presenze registrate), 0 = niente
        dettaglio: d.dettaglio.map(x => [x.data, x.orario, x.impegno, x.ore, x.conta, x.esonero ? 1 : x.proposto ? 2 : x.assente ? 3 : 0]),
        // impegni presso le altre scuole (docenti in COE): [data, orario, impegno, ore, conta, scuola]
        esterni: (d.esterni || []).map(x => [x.data, x.orario, x.impegno, x.ore, x.conta, x.scuola])
      };
    });
    return { tipo: 'quaranta-ore', anno: foglio.anno, aggiornato: new Date().toISOString(), docenti };
  }
  async function pubblica(foglio, risultato, email) {
    if (typeof PubblicaDrive === 'undefined') throw new Error('manca pubblica-drive.js');
    return PubblicaDrive.scriviFile(NOME_PUBBLICATO, cartella(), JSON.stringify(datiDaPubblicare(foglio, risultato)), email);
  }

  // ---------- 6. Nell'app: leggere le proprie ----------
  // senzaChiedere = true: se manca il permesso di Google restituisce null invece di aprire la finestra di Google
  // (i browser la aprono solo dopo un tocco)
  let idTrovato = '';
  async function leggiPubblicato(email, senzaChiedere) {
    if (!cartella() || typeof NomiDocenti === 'undefined') throw new Error('non configurato');
    let t = NomiDocenti.gettoneDisponibile([NomiDocenti.PERMESSO_DRIVE]);
    if (!t && senzaChiedere) return null;
    if (!t) t = await NomiDocenti.gettone([NomiDocenti.PERMESSO_DRIVE], email);
    const intest = { headers: { Authorization: 'Bearer ' + t }, cache: 'no-cache' };
    if (!idTrovato) {
      const tra = s => "'" + String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
      const q = `name = ${tra(NOME_PUBBLICATO)} and ${tra(cartella())} in parents and trashed = false`;
      const r = await fetch(API + '?fields=files(id)&supportsAllDrives=true&includeItemsFromAllDrives=true&q=' + encodeURIComponent(q), intest);
      if (!r.ok) throw new Error('errore ' + r.status);
      const j = await r.json();
      if (!j.files || !j.files[0]) return null;
      idTrovato = j.files[0].id;
    }
    const r = await fetch(API + '/' + encodeURIComponent(idTrovato) + '?alt=media&supportsAllDrives=true', intest);
    if (!r.ok) throw new Error('errore ' + r.status);
    return r.json();
  }

  // HTML della pagina «Le mie 40+40» per un docente (d = una voce di datiDaPubblicare().docenti)
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const ore = n => String(arrotonda(n)).replace('.', ',');
  const giorno = iso => { const [a, m, g] = iso.split('-').map(Number); return new Date(a, m - 1, g).toLocaleDateString('it-IT', { weekday: 'short', day: '2-digit', month: '2-digit' }); };
  function htmlDocente(d, aggiornato) {
    const riga = (titolo, dov, fatte) => `<tr><th scope="row">${titolo}</th><td>${ore(dov)}</td><td>${ore(fatte)}</td><td class="${dov - fatte < 0 ? 'q40-oltre' : ''}">${ore(dov - fatte)}</td></tr>`;
    const oggi = new Date().toISOString().slice(0, 10);
    const dett = d.dettaglio.map(([data, orario, imp, h, conta, eso]) =>
      `<tr class="${data < oggi ? 'q40-passato' : ''}${eso === 1 ? ' q40-esonero' : eso === 3 ? ' q40-assente' : ''}"><td>${esc(giorno(data))}</td><td>${esc(orario)}</td><td>${esc(imp)}</td><td>${ore(h)}</td><td>${esc(NOMI_CONTA[conta] || conta)}${eso === 1 ? ' · esonerato' : eso === 2 ? ' · esonero proposto, in attesa di approvazione' : eso === 3 ? ' · assente (non conta)' : ''}</td></tr>`).join('');
    return `<table class="q40-riepilogo"><caption>Le tue ore${d.tipo !== 'COI' ? ` (${esc(d.tipo)}, ${ore(d.oreSett)} ore settimanali: dovute in proporzione)` : ''}</caption>
      <thead><tr><th scope="col"></th><th scope="col">Dovute</th><th scope="col">Programmate</th><th scope="col">Restano</th></tr></thead>
      <tbody>${riga('Prime 40 (collegio, programmazione, famiglie)', d.dovute, d.prime)}${riga('Seconde 40 (consigli di classe, GLO)', d.dovute, d.seconde)}</tbody></table>
      ${d.formazione ? `<p>Formazione obbligatoria: <strong>${ore(d.formazione)}</strong> ore (contano nelle ore che restano delle 80).</p>` : ''}
      ${d.esonerate ? `<p>Esonerato da impegni per <strong>${ore(d.esonerate)}</strong> ore (già tolte dalle programmate).</p>` : ''}
      ${d.assenze ? `<p>Assenze registrate agli incontri già svolti: <strong>${ore(d.assenze)}</strong> ore (non contano nelle programmate).</p>` : ''}
      ${d.proposte ? `<p>Esoneri proposti in attesa di approvazione: <strong>${ore(d.proposte)}</strong> ore (per ora contano ancora).</p>` : ''}
      <p><button type="button" class="pulsante" data-q40-excel>📥 Scarica il mio Excel</button>
        <span class="q40-nota">Le tue ore divise in A e B: scrivi SI nella colonna «Esonero» per gli impegni da cui chiedi l'esonero e rimanda il file a chi gestisce l'orario.</span></p>
      <table class="q40-dettaglio"><caption>Impegni dell'anno</caption>
      <thead><tr><th scope="col">Giorno</th><th scope="col">Orario</th><th scope="col">Impegno</th><th scope="col">Ore</th><th scope="col">Conta in</th></tr></thead>
      <tbody>${dett}</tbody></table>
      ${(d.esterni || []).length ? `<table class="q40-dettaglio q40-esterni"><caption>Impegni presso l'altra scuola (non contano qui: le ore dovute sono divise in proporzione)</caption>
      <thead><tr><th scope="col">Giorno</th><th scope="col">Orario</th><th scope="col">Impegno</th><th scope="col">Ore</th><th scope="col">Scuola</th></tr></thead>
      <tbody>${d.esterni.map(([data, orario, imp, h, conta, scuola]) => `<tr class="${data < oggi ? 'q40-passato' : ''}"><td>${esc(giorno(data))}</td><td>${esc(orario)}</td><td>${esc(imp)}</td><td>${ore(h)}</td><td>${esc(scuola)} · ${esc(NOMI_CONTA[conta] || conta)}</td></tr>`).join('')}</tbody></table>` : ''}
      <p class="q40-nota">Calcolo dal Piano delle attività e dalle tue classi${aggiornato ? ', aggiornato il ' + esc(new Date(aggiornato).toLocaleDateString('it-IT')) : ''}.
      Scrutini ed esami non contano nelle 40+40. Per correzioni rivolgiti alla segreteria o a chi gestisce l'orario.</p>`;
  }

  // Una voce pubblicata (dettaglio come array) nella forma usata da excelDocente
  const daPubblicato = (d, codice, nome) => Object.assign({}, d, { codice, nome,
    dettaglio: d.dettaglio.map(([data, orario, impegno, ore, conta, esonero]) => ({ data, orario, impegno, ore, conta, esonero: esonero === 1, proposto: esonero === 2, assente: esonero === 3 })),
    esterni: (d.esterni || []).map(([data, orario, impegno, ore, conta, scuola]) => ({ data, orario, impegno, ore, conta, scuola })) });

  return { configurato, leggiFoglio, interpreta, classiDaOrario, calcola, scriviVisibile, scriviVisibileTutti, scriviFormazione, scriviEsoneri, scriviEsoneriTutti, scriviApprovato, togliEsoneri, esoneriPerImpegno,
    leggiPresenzeDaTabelle, scriviPresenze, modelloPresenze, scriviScuole, leggiImpegniEsterni, scriviImpegniEsterni, excelDocente, leggiEsoneriDaExcel, daPubblicato, pubblica, datiDaPubblicare, leggiPubblicato, htmlDocente, NOMI_CONTA, dovute, file };
})();
