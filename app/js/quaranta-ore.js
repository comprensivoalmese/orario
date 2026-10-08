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
    let r = await prendi(base.concat(["'Esoneri'!A1:G3000"])), conEsoneri = true;
    if (r.status === 400) { r = await prendi(base); conEsoneri = false; }
    if (r.status === 403 || r.status === 404) throw new Error('il tuo account non può aprire il Foglio «40 ore» (va condiviso con chi è autorizzato)');
    if (r.status === 400) throw new Error('nel Foglio «40 ore» mancano le schede «Impegni», «Docenti» o «Impostazioni»');
    if (!r.ok) throw new Error('errore ' + r.status + ' da Google');
    const [imp, doc, set, eso] = ((await r.json()).valueRanges || []).map(v => v.values || []);
    return Object.assign(interpreta(imp, doc, set, eso || []), { conEsoneri });
  }

  // Dalle tabelle del Foglio ai dati: { impegni, docenti, categorie, visibileTutti, anno, colonnaVisibile, esoneri }
  function interpreta(imp, doc, set, eso) {
    // Impostazioni: voce/valore (colonne A-B) e la tabella Tipo → Conta in (dove la si trova)
    const categorie = Object.assign({}, CATEGORIE);
    let visibileTutti = false, anno = '';
    (set || []).forEach(r => {
      const voce = semplice(r[0]);
      if (voce.includes('visibile')) visibileTutti = si(r[1]);
      if (voce.includes('anno')) anno = String(r[1] || '');
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
    return { impegni, docenti, categorie, visibileTutti, anno, colonnaVisibile: d.visibile, colonnaFormazione: d.formazione, colonneDocenti: di.length,
      colonnaImpostazioni: (set || []).findIndex(r => semplice(r[0]).includes('visibile')), esoneri, righeEsoneri: (eso || []).slice(1), colonnaApprovato: e.approvato };
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
      const tocca = b => (!d.dal || b.data >= d.dal) && (!b.classi.length || b.classi.some(c => mie.has(c)));
      const miei = bl.filter(b => b.conta !== 'altro' && tocca(b));
      const tot = { prime: 0, seconde: 0, formazione: 0, no: 0 };
      // per giorno e conteggio: unione dei blocchi (senza gli impegni da cui il docente è esonerato)
      const perGiorno = new Map();
      miei.filter(b => !esonerato.has(b.chiave)).forEach(b => { const k = b.data + '|' + b.conta; if (!perGiorno.has(k)) perGiorno.set(k, []); perGiorno.get(k).push(b); });
      perGiorno.forEach((g, k) => { tot[k.split('|')[1]] += durata(g); });
      // dettaglio per impegno (anche quelli esonerati, segnati)
      const perImpegno = new Map();
      miei.forEach(b => { if (!perImpegno.has(b.chiave)) perImpegno.set(b.chiave, []); perImpegno.get(b.chiave).push(b); });
      const dettaglio = [...perImpegno.values()].map(g => ({ data: g[0].data, orario: orarioDi(g), impegno: g[0].impegno, ore: arrotonda(durata(g)), conta: g[0].conta,
        esonero: esonerato.has(g[0].chiave), proposto: proposto.has(g[0].chiave) }))
        .sort((a, b) => (a.data + a.orario).localeCompare(b.data + b.orario));
      const esonerate = arrotonda(dettaglio.filter(x => x.esonero && (x.conta === 'prime' || x.conta === 'seconde')).reduce((s, x) => s + x.ore, 0));
      const proposteOre = arrotonda(dettaglio.filter(x => x.proposto && (x.conta === 'prime' || x.conta === 'seconde')).reduce((s, x) => s + x.ore, 0));
      // formazione: quella scritta negli impegni + le ore attribuite al docente nella scheda «Docenti»
      tot.formazione += d.oreFormazione || 0;
      const dov = dovute(d.tipo, d.oreSett);
      return Object.assign({}, d, {
        classi: [...mie].sort(), dovute: dov,
        prime: arrotonda(tot.prime), seconde: arrotonda(tot.seconde), formazione: arrotonda(tot.formazione), nonConta: arrotonda(tot.no), esonerate, proposte: proposteOre,
        residuoPrime: arrotonda(dov - tot.prime), residuoSeconde: arrotonda(dov - tot.seconde),
        residuo: arrotonda(2 * dov - tot.prime - tot.seconde - tot.formazione), dettaglio
      });
    }).sort((a, b) => (a.nome || a.codice).localeCompare(b.nome || b.codice, 'it'));
    const daApprovare = docenti.filter(d => d.dettaglio.some(x => x.proposto));
    if (daApprovare.length) avvisi.unshift(`Proposte di esonero da approvare: ${daApprovare.map(d => (d.nome || d.codice) + ' (' + d.dettaglio.filter(x => x.proposto).length + ')').join(', ')}. Apri il dettaglio del docente per approvarle.`);
    // l'elenco degli impegni (una riga per giorno + impegno), per il piano degli estratti
    const perChiave = new Map();
    bl.forEach(b => { if (!perChiave.has(b.chiave)) perChiave.set(b.chiave, []); perChiave.get(b.chiave).push(b); });
    const impegni = [...perChiave.entries()].map(([chiave, g]) => {
      const riga = foglio.impegni.find(x => x.data + '|' + x.impegno === chiave);
      const righe = foglio.impegni.filter(x => x.data + '|' + x.impegno === chiave);
      const inizio = righe.map(x => x.ini).filter(x => x != null), fine = righe.map(x => x.fin).filter(x => x != null);
      return { chiave, data: g[0].data, orario: inizio.length ? hhmm(Math.min(...inizio)) + '–' + hhmm(Math.max(...fine)) : '', impegno: g[0].impegno,
        conta: g[0].conta, classi: righe.map(x => x.classi).filter(Boolean).join(' / '), tipo: riga ? riga.tipo : '' };
    }).sort((a, b) => (a.data + a.orario).localeCompare(b.data + b.orario));
    return { docenti, impegni, avvisi };
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
        dal: d.dal || '', esonerate: d.esonerate || 0, proposte: d.proposte || 0, dettaglio: d.dettaglio.map(x => [x.data, x.orario, x.impegno, x.ore, x.conta, x.esonero ? 1 : x.proposto ? 2 : 0])
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
      `<tr class="${data < oggi ? 'q40-passato' : ''}${eso === 1 ? ' q40-esonero' : ''}"><td>${esc(giorno(data))}</td><td>${esc(orario)}</td><td>${esc(imp)}</td><td>${ore(h)}</td><td>${esc(NOMI_CONTA[conta] || conta)}${eso === 1 ? ' · esonerato' : eso === 2 ? ' · esonero proposto, in attesa di approvazione' : ''}</td></tr>`).join('');
    return `<table class="q40-riepilogo"><caption>Le tue ore${d.tipo !== 'COI' ? ` (${esc(d.tipo)}, ${ore(d.oreSett)} ore settimanali: dovute in proporzione)` : ''}</caption>
      <thead><tr><th scope="col"></th><th scope="col">Dovute</th><th scope="col">Programmate</th><th scope="col">Restano</th></tr></thead>
      <tbody>${riga('Prime 40 (collegio, programmazione, famiglie)', d.dovute, d.prime)}${riga('Seconde 40 (consigli di classe, GLO)', d.dovute, d.seconde)}</tbody></table>
      ${d.formazione ? `<p>Formazione obbligatoria: <strong>${ore(d.formazione)}</strong> ore (contano nelle ore che restano delle 80).</p>` : ''}
      ${d.esonerate ? `<p>Esonerato da impegni per <strong>${ore(d.esonerate)}</strong> ore (già tolte dalle programmate).</p>` : ''}
      ${d.proposte ? `<p>Esoneri proposti in attesa di approvazione: <strong>${ore(d.proposte)}</strong> ore (per ora contano ancora).</p>` : ''}
      <p><button type="button" class="pulsante" data-q40-excel>📥 Scarica il mio Excel</button>
        <span class="q40-nota">Le tue ore divise in A e B: scrivi SI nella colonna «Esonero» per gli impegni da cui chiedi l'esonero e rimanda il file a chi gestisce l'orario.</span></p>
      <table class="q40-dettaglio"><caption>Impegni dell'anno</caption>
      <thead><tr><th scope="col">Giorno</th><th scope="col">Orario</th><th scope="col">Impegno</th><th scope="col">Ore</th><th scope="col">Conta in</th></tr></thead>
      <tbody>${dett}</tbody></table>
      <p class="q40-nota">Calcolo dal Piano delle attività e dalle tue classi${aggiornato ? ', aggiornato il ' + esc(new Date(aggiornato).toLocaleDateString('it-IT')) : ''}.
      Scrutini ed esami non contano nelle 40+40. Per correzioni rivolgiti alla segreteria o a chi gestisce l'orario.</p>`;
  }

  // Una voce pubblicata (dettaglio come array) nella forma usata da excelDocente
  const daPubblicato = (d, codice, nome) => Object.assign({}, d, { codice, nome,
    dettaglio: d.dettaglio.map(([data, orario, impegno, ore, conta, esonero]) => ({ data, orario, impegno, ore, conta, esonero: esonero === 1, proposto: esonero === 2 })) });

  return { configurato, leggiFoglio, interpreta, classiDaOrario, calcola, scriviVisibile, scriviVisibileTutti, scriviFormazione, scriviEsoneri, scriviEsoneriTutti, scriviApprovato, togliEsoneri, esoneriPerImpegno,
    excelDocente, leggiEsoneriDaExcel, daPubblicato, pubblica, datiDaPubblicare, leggiPubblicato, htmlDocente, NOMI_CONTA, dovute, file };
})();
