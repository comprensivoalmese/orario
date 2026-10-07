/*
  alternativa.js – calcoli per le compresenze dell'ALTERNATIVA all'IRC (usati da scheda-compresenze.js):
    1. legge il file delle disponibilità dei docenti (le risposte del modulo Google, in .xlsx/.ods/.csv);
    2. riconosce i docenti dal nome (i nomi veri stanno solo in memoria: arrivano da «👁 Nomi»);
    3. SIMULA una prima bozza di copertura: a ogni ora di Religione di ogni classe assegna un docente disponibile.

  Qui ci sono solo calcoli, senza pagina: la scheda passa i dati già pronti (le ore da coprire e, per ogni docente, in quali
  ore può stare, cioè è libero e non è della classe) e riceve la proposta. Così si può provare da sola (vedi
  .claude/test-alternativa.html, solo sul computer di chi sviluppa).

  I CRITERI della simulazione (si spuntano e si mettono in ordine; il primo conta più del secondo, e così via):
    priorita      – chi è stato escluso negli anni passati passa avanti (più anni di esclusione = più precedenza);
    accontentare  – si cerca la combinazione che dà almeno un'ora al maggior numero di docenti;
    continuita    – chi aveva già quella classe l'anno scorso la riprende;
    graduatoria   – a parità di tutto, conta il punteggio della graduatoria interna.
  Prima di tutti i criteri c'è sempre «coprire più ore possibile»; dopo tutti c'è «distribuire le ore in modo equo».

  Come si calcola: è un problema di «flusso a costo minimo». Ogni ora da coprire è un nodo, ogni docente ha un nodo, e ogni
  criterio vale un punteggio. I criteri sono messi in ordine con pesi ENORMI (il primo vale sempre più di tutti i
  successivi messi insieme: per questo si usa BigInt), quindi l'ordine scelto è davvero rispettato. Il flusso garantisce
  che sia la migliore combinazione possibile, non solo una buona idea come farebbe un conteggio ora per ora.
*/
const Alternativa = (() => {
  const semplice = s => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const GIORNI = ['Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì'];
  const giornoDa = testo => GIORNI.find(g => semplice(g).startsWith(semplice(testo).slice(0, 3))) || '';

  // i criteri, nell'ordine proposto
  const CRITERI = [
    { id: 'priorita', titolo: 'Priorità per le esclusioni degli anni passati', aiuto: 'Chi è stato escluso più volte passa avanti.' },
    { id: 'accontentare', titolo: 'Accontentare il maggior numero di docenti', aiuto: 'Cerca la combinazione in cui più docenti hanno almeno un’ora tra quelle chieste.' },
    { id: 'continuita', titolo: 'Continuità sulla classe dell’anno scorso', aiuto: 'Chi aveva già quella classe la riprende.' },
    { id: 'graduatoria', titolo: 'Punteggio della graduatoria interna', aiuto: 'A parità di tutto il resto conta il punteggio.' }
  ];

  /* ---------- 1. il file delle disponibilità ---------- */
  // "3, 4, 6" oppure 5 oppure "5.0" → [3, 4, 6]
  function oreDa(valore) {
    if (valore == null || valore === '') return [];
    const testo = String(valore).replace(/(\d)\.0+(?!\d)/g, '$1');
    return [...new Set((testo.match(/\d+/g) || []).map(Number).filter(n => n > 0 && n < 13))].sort((a, b) => a - b);
  }
  const testoOre = ore => ore.join(', ');

  /*
    Legge le tabelle date da Foglio.leggiTabelle (prima scheda con una colonna «Cognome e Nome» e le colonne dei giorni).
    Restituisce [{ nome, email, giorni: { Lunedì: '3, 4, 6', … }, nessuna }]. Se lo stesso docente ha risposto più volte
    vale l'ultima risposta (le righe sono in ordine di arrivo).
  */
  function leggiDisponibilita(tabelle) {
    const scheda = (tabelle || []).find(t => t.righe && t.righe.length > 1 && (t.righe[0] || []).some(c => semplice(c).includes('cognome') || semplice(c) === 'nome'));
    if (!scheda) throw new Error('Nel file non trovo la colonna «Cognome e Nome»: è il file delle risposte del modulo?');
    const titoli = scheda.righe[0].map(semplice);
    const colNome = titoli.findIndex(t => t.includes('cognome') || t === 'nome');
    const colEmail = titoli.findIndex(t => t.includes('email'));
    const colOppure = titoli.findIndex(t => t.includes('oppure') || t.includes('nessuna'));
    const colGiorno = {};
    GIORNI.forEach(g => { const i = titoli.findIndex(t => t.startsWith(semplice(g).slice(0, 3))); if (i >= 0) colGiorno[g] = i; });
    if (!Object.keys(colGiorno).length) throw new Error('Nel file non trovo le colonne dei giorni (Lunedì, Mercoledì…).');
    const perNome = new Map();
    scheda.righe.slice(1).forEach(r => {
      const nome = String(r[colNome] || '').trim().replace(/\s+/g, ' ');
      if (!nome) return;
      const giorni = {}; let qualcuna = false;
      GIORNI.forEach(g => { const ore = colGiorno[g] === undefined ? [] : oreDa(r[colGiorno[g]]); giorni[g] = testoOre(ore); if (ore.length) qualcuna = true; });
      const oppure = colOppure >= 0 ? String(r[colOppure] || '') : '';
      perNome.set(semplice(nome), { nome, email: colEmail >= 0 ? String(r[colEmail] || '').trim() : '', giorni, nessuna: !qualcuna && /nessuna|non/i.test(oppure) || (!qualcuna && !!oppure.trim()) });
    });
    return [...perNome.values()];
  }

  /* ---------- 2. riconoscere i docenti dal nome ---------- */
  const parole = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  /*
    Il nome scritto nel modulo («Mario Rossi», «Bianchi Anna», «Verdi Luca ») si confronta con la mappa dei nomi
    veri (codice → { cognome, nome }) senza badare all'ordine, alle maiuscole e agli accenti.
    Restituisce il codice, oppure '' se non si trova (o se più docenti hanno gli stessi nomi: meglio sceglierlo a mano).
  */
  function codiceDaNome(nome, nomi) {
    if (!nomi || !nome) return '';
    const a = parole(nome); if (!a.length) return '';
    const insiemeA = new Set(a);
    const esatti = [], contenuti = [];
    nomi.forEach((v, codice) => {
      const b = parole((v.cognome || '') + ' ' + (v.nome || '')); if (!b.length) return;
      const insiemeB = new Set(b);
      if (insiemeA.size === insiemeB.size && [...insiemeA].every(x => insiemeB.has(x))) esatti.push(codice);
      else if ([...insiemeA].every(x => insiemeB.has(x)) || [...insiemeB].every(x => insiemeA.has(x))) contenuti.push(codice);
    });
    if (esatti.length === 1) return esatti[0];
    if (!esatti.length && contenuti.length === 1) return contenuti[0];
    return '';
  }

  /* ---------- la graduatoria interna ---------- */
  /*
    Legge il file della graduatoria interna (.xlsx, .ods, .csv). Trova da sola la riga delle intestazioni (nelle prime 15 righe: una
    colonna con il nome e una con «punteggio» o «totale»), anche se il nome è in due colonne (Cognome, Nome). Se ci sono più colonne
    di punteggio sceglie «Totale punteggio» o simili, ma si può scegliere un'altra con «colonna».
    Restituisce { righe: [{ nome, punteggio }], colonne: [{ indice, titolo }], usata: indice della colonna scelta }.
  */
  function leggiGraduatoria(tabelle, colonna) {
    let trovato = null;
    for (const t of tabelle || []) {
      for (let i = 0; i < Math.min(15, (t.righe || []).length) && !trovato; i++) {
        const h = t.righe[i].map(semplice);
        if (h.some(c => /cognome|nominativo|docente|^nome$/.test(c)) && h.some(c => /punt|totale/.test(c))) trovato = { t, i, h };
      }
      if (trovato) break;
    }
    if (!trovato) throw new Error('Nel file non trovo le intestazioni: servono una colonna con il nome (Cognome e Nome) e una con «Punteggio» o «Totale».');
    const { t, i, h } = trovato, intest = t.righe[i];
    const iCogn = h.findIndex(c => c.startsWith('cognome')), iNome = h.findIndex(c => c === 'nome');
    const iCompleto = iCogn >= 0 && h[iCogn].length > 'cognome'.length ? iCogn : -1;                 // «Cognome e Nome» in una colonna sola
    const iAltro = h.findIndex(c => /nominativo|docente/.test(c));
    const nomeDi = r => iCompleto >= 0 ? String(r[iCompleto] || '') : iCogn >= 0 ? (String(r[iCogn] || '') + ' ' + (iNome >= 0 ? String(r[iNome] || '') : '')) : String(r[iAltro >= 0 ? iAltro : iNome] || '');
    const corpo = t.righe.slice(i + 1).filter(r => nomeDi(r).trim());
    // le colonne dei punteggi: quelle con «punt» o «totale» nel titolo e almeno un numero
    const rango = c => (/totale/.test(c) && /punt/.test(c) ? 3 : /totale/.test(c) ? 2 : /punteggio/.test(c) ? 1 : 0);
    const colonne = h.map((c, k) => ({ indice: k, titolo: String(intest[k] || '').trim(), rango: rango(c) }))
      .filter((x, k) => /punt|totale/.test(h[k]) && corpo.some(r => numero(r[k]) !== null));
    if (!colonne.length) throw new Error('Nel file ci sono le intestazioni ma non trovo punteggi numerici.');
    const migliore = colonne.reduce((a, b) => (b.rango >= a.rango ? b : a));
    const usata = colonna !== undefined && colonne.some(x => x.indice === Number(colonna)) ? Number(colonna) : migliore.indice;
    const righe = corpo.map(r => ({ nome: nomeDi(r).trim().replace(/\s+/g, ' '), punteggio: numero(r[usata]) })).filter(r => r.punteggio !== null);
    return { righe, colonne: colonne.map(({ indice, titolo }) => ({ indice, titolo })), usata };
  }

  /*
    Abbina i punteggi ai docenti delle disponibilità, dal nome (senza badare all'ordine). «nomiDi(x)» può dare altri nomi dello stesso
    docente (quelli veri letti da «👁 Nomi»). Restituisce { abbinati: [{ i, punteggio }], senza: [indici dei docenti non trovati] }.
  */
  function abbinaPunteggi(dispo, righe, nomiDi) {
    const insiemi = righe.map(r => new Set(parole(r.nome)));
    const uguali = (a, b) => a.size === b.size && [...a].every(x => b.has(x));
    const contenuti = (a, b) => a.size && b.size && ([...a].every(x => b.has(x)) || [...b].every(x => a.has(x)));
    const abbinati = [], senza = [];
    dispo.forEach((d, i) => {
      const miei = [d.nome].concat(nomiDi ? nomiDi(d) : []).filter(Boolean).map(n => new Set(parole(n)));
      let trovati = righe.map((r, k) => k).filter(k => miei.some(m => uguali(m, insiemi[k])));
      if (!trovati.length) trovati = righe.map((r, k) => k).filter(k => miei.some(m => contenuti(m, insiemi[k])));
      if (trovati.length === 1) abbinati.push({ i, punteggio: righe[trovati[0]].punteggio });
      else senza.push(i);
    });
    return { abbinati, senza };
  }

  // le classi dell'anno scorso, scritte dall'utente («2A, 3B»), come sono chiamate oggi: la 1A di allora è la 2A di oggi
  function classiDiOggi(testo, salgono) {
    return String(testo || '').split(/[,;/]/).map(x => x.trim()).filter(Boolean).map(c => {
      if (!salgono) return semplice(c);
      const m = /^(\d)(.*)$/.exec(c); if (!m) return semplice(c);
      return semplice((Number(m[1]) + 1) + m[2]);
    });
  }

  /* ---------- 3. la simulazione ---------- */
  // numero scritto a mano («32,5») → numero; vuoto → null
  const numero = v => { const t = String(v == null ? '' : v).trim().replace(',', '.'); const n = parseFloat(t); return t === '' || isNaN(n) ? null : n; };

  /*
    opz = {
      slots:   [{ id, giorno, ora, classe }]                  le ore da coprire (quelle che non hanno già un docente)
      docenti: [{ codice, escl, classiPrima: ['2a'…], punteggio, gia, ok: [id delle ore dove può stare] }]
               «gia» = ore di Alternativa che il docente ha già nel Foglio (contano nel limite)
               «tetto» (facoltativo) = massimo di ore di Alternativa in tutto per questo docente (per non superare le 24 ore totali)
      ordine:  ['priorita', 'accontentare', …]               solo i criteri spuntati, nell'ordine scelto
      limite:  numero massimo di ore per docente ('' = il minimo che permette di coprire il più possibile)
      graduatoriaAlta: true se un punteggio più alto passa avanti
    }
    Restituisce { assegnazioni: [{ slotId, codice }], scoperte: [slotId], contenti: [codice], limite }
  */
  function simula(opz) {
    const slots = opz.slots || [], docenti = opz.docenti || [], ordine = (opz.ordine || []).filter(id => CRITERI.some(c => c.id === id));
    const n = slots.length;
    if (!n) return { assegnazioni: [], scoperte: [], contenti: [], limite: 0 };
    const conArchi = docenti.filter(d => (d.ok || []).length);
    const prova = limite => flusso(slots, docenti, ordine, limite, opz.graduatoriaAlta !== false);
    const richiesto = parseInt(opz.limite, 10);
    if (richiesto > 0) { const r = prova(richiesto); r.limite = richiesto; return r; }
    // limite automatico: il più basso con cui si copre quante ore si coprono senza limite
    const massimo = prova(n), coperte = massimo.assegnazioni.length;
    let l = Math.max(1, Math.ceil(n / Math.max(1, conArchi.length)));
    for (; l < n; l++) { const r = prova(l); if (r.assegnazioni.length === coperte) { r.limite = l; return r; } }
    massimo.limite = n; return massimo;
  }

  function flusso(slots, docenti, ordine, limite, graduatoriaAlta) {
    const n = slots.length;
    // 1) pesi: ogni criterio vale più di tutti quelli sotto di lui messi insieme
    const valorePrio = d => Math.max(0, Math.round(numero(d.escl) || 0));
    const punti = docenti.map(d => numero(d.punteggio));
    const piuAlto = Math.max(0, ...punti.filter(p => p !== null));
    const valoreGrad = d => { const p = numero(d.punteggio); const x = graduatoriaAlta ? (p === null ? 0 : p) : (p === null ? 0 : piuAlto - p); return Math.max(0, Math.round(x * 10)); };
    const massimi = {
      priorita: Math.max(1, ...docenti.map(valorePrio)),
      accontentare: 1,
      continuita: 1,
      graduatoria: Math.max(1, ...docenti.map(valoreGrad))
    };
    const peso = {};
    let cursore = BigInt(n * (n + 1) + 1);                       // sotto tutti i criteri c'è l'equilibrio (costo 1 per ogni ora)
    for (let i = ordine.length - 1; i >= 0; i--) { peso[ordine[i]] = cursore; cursore *= BigInt(n * massimi[ordine[i]] + 1); }
    const COPERTURA = cursore;                                  // coprire un'ora vale più di tutto il resto
    const P = id => peso[id] || 0n;

    // 2) il grafo: sorgente → ora → (docente, giorno e ora) → docente → pozzo
    const to = [], cap = [], costo = [], adj = [];
    const nodo = () => { adj.push([]); return adj.length - 1; };
    const arco = (a, b, c, k) => { adj[a].push(to.length); to.push(b); cap.push(c); costo.push(k); adj[b].push(to.length); to.push(a); cap.push(0); costo.push(-k); return to.length - 2; };
    const S = nodo(), T = nodo();
    const nodoOra = slots.map(() => nodo());
    const perId = new Map(slots.map((s, i) => [s.id, i]));
    slots.forEach((s, i) => arco(S, nodoOra[i], 1, 0n));
    const archiAssegna = [];                                    // { arco, slot, docente }
    docenti.forEach((d, j) => {
      const lim = Math.min(limite, d.tetto == null ? Infinity : d.tetto);      // il limite della simulazione e il tetto di ore in tutto di questo docente
      const unitaLibere = Math.max(0, lim - (d.gia || 0));
      const nodoDoc = nodo();
      const classiPrima = new Set(d.classiPrima || []);
      const perGH = new Map();                                  // un docente non può stare in due classi nella stessa ora
      (d.ok || []).forEach(id => {
        const i = perId.get(id); if (i === undefined || !unitaLibere) return;
        const s = slots[i], gh = s.giorno + '|' + s.ora;
        if (!perGH.has(gh)) { const x = nodo(); arco(x, nodoDoc, 1, 0n); perGH.set(gh, x); }
        const bonusClasse = classiPrima.has(semplice(s.classe)) ? P('continuita') : 0n;
        archiAssegna.push({ e: arco(nodoOra[i], perGH.get(gh), 1, -(COPERTURA + bonusClasse)), slot: i, docente: j });
      });
      for (let u = (d.gia || 0) + 1; u <= lim; u++) {
        let k = BigInt(u);                                      // equilibrio: più ore ha già, più costa dargliene un'altra
        k -= P('graduatoria') * BigInt(valoreGrad(d));          // il punteggio vale a ogni ora
        if (u === 1) k -= P('priorita') * BigInt(valorePrio(d)) + P('accontentare');   // la prima ora «accontenta» il docente
        arco(nodoDoc, T, 1, k);
      }
    });

    // 3) percorsi di costo minimo, uno alla volta, finché conviene (costi convessi: il risultato è il migliore possibile)
    const N = adj.length;
    for (;;) {
      const dist = new Array(N).fill(null), prima = new Array(N).fill(-1), inCoda = new Array(N).fill(false);
      dist[S] = 0n; const coda = [S]; inCoda[S] = true;
      while (coda.length) {
        const u = coda.shift(); inCoda[u] = false;
        for (const e of adj[u]) {
          if (cap[e] <= 0) continue;
          const v = to[e], nuovo = dist[u] + costo[e];
          if (dist[v] === null || nuovo < dist[v]) { dist[v] = nuovo; prima[v] = e; if (!inCoda[v]) { inCoda[v] = true; coda.push(v); } }
        }
      }
      if (dist[T] === null || dist[T] >= 0n) break;
      for (let v = T; v !== S; v = to[prima[v] ^ 1]) { cap[prima[v]] -= 1; cap[prima[v] ^ 1] += 1; }
    }

    const assegnazioni = archiAssegna.filter(a => cap[a.e] === 0).map(a => ({ slotId: slots[a.slot].id, codice: docenti[a.docente].codice }));
    const coperte = new Set(assegnazioni.map(a => a.slotId));
    return { assegnazioni, scoperte: slots.filter(s => !coperte.has(s.id)).map(s => s.id), contenti: [...new Set(assegnazioni.map(a => a.codice))], limite };
  }

  return { CRITERI, GIORNI, giornoDa, oreDa, testoOre, leggiDisponibilita, codiceDaNome, leggiGraduatoria, abbinaPunteggi, classiDiOggi, simula, numero };
})();
