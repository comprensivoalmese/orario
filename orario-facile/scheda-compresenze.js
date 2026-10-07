/*
  scheda-compresenze.js – scheda «Compresenze» di Orario Facile: la maschera per inserire le ore di compresenza.

  È una gestione strutturale (si fa una volta, quando si prepara l'orario), per questo sta in Orario Facile e non
  nell'app Luis@i, che le mostra soltanto (quadratino «Compresenze», vedi app/js/compresenze.js).
  Legge e scrive il Foglio Google «Compresenze» (CONFIG.fileCompresenze) con il permesso Google di chi la usa:
  per salvare bisogna poter modificare quel Foglio su Drive.

  Le ore sono divise in gruppi (potenziamento L2, Alternativa, ore eccedenti, completamento…). I gruppi di OGNI SCUOLA,
  con le ore previste e i docenti previsti, stanno nella scheda «Gruppi» del Foglio (si modificano qui, riquadro
  «Gruppi e ore previste»); se la scheda non c'è si parte dai gruppi proposti in CONFIG.gruppiCompresenze, senza numeri.
  Un gruppo «nelle ore di» una materia (Alternativa → Religione) conta da solo le ore previste nell'orario.
  Ogni ora è di un docente: docente, classe, giorno, ora e aula (vuota = aula del titolare).
  Per ogni ora si controlla che la classe abbia lezione, che il docente sia libero e (Alternativa) che in quell'ora
  ci sia la materia in parallelo. Le ore con un tipo che non è in nessun gruppo stanno in «Altre compresenze».
  Il SOSTEGNO ha una griglia sua (scheda «Sostegno» del Foglio, vedi sotto).
  L'ALTERNATIVA ha in più il riquadro «disponibilità dei docenti e bozza di copertura» (calcoli in alternativa.js): si carica il file
  delle risposte del modulo, si controlla che ogni ora indicata sia tra quelle possibili e si simula una prima copertura con criteri.
  Nel Foglio, accanto al codice, si scrive anche il nome del docente (se i nomi sono stati caricati con «👁 Nomi»):
  i nomi veri stanno solo su Drive, mai su GitHub né sul dispositivo.

  Uso da Orario Facile: SchedaCompresenze.monta(elemento, { orario: () => Dati.normalizza(S), email: () => '…',
  nome: codice => 'Cognome Nome' }).
*/
const SchedaCompresenze = (() => {
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const semplice = s => Compresenze.semplice(s);
  const SCRIVERE = 'https://www.googleapis.com/auth/spreadsheets';
  const TITOLI = ['Codice docente', 'Classe', 'Giorno', 'Ora', 'Tipo', 'Aula', 'Docente (non letto dall\'app)', 'Note'];
  const ALTRE = '__altre';

  let box = null;         // l'elemento della scheda
  let ctx = null;         // { orario(), email(), nome(codice) }
  let righe = [];         // tutte le righe del Foglio: { codice, classe, giorno, ora, tipo, aula, note, nome }
  let stato = 'collega';  // 'collega' (serve il permesso di Google) | 'carico' | 'pronto' | 'errore'
  let errore = '';
  let modificato = false; // ci sono modifiche non ancora salvate
  let salvo = false;      // salvataggio in corso
  let messaggio = '';
  // i gruppi di questa scuola, letti dalla scheda «Gruppi» del Foglio (null = scheda assente: si usano quelli proposti)
  // { tipo, previste (numero o ''), docenti: [{ codice, ore }], nelleOreDi, spiegazione, altriNomi }
  let gruppiScuola = null;
  let gruppiAperti = null;   // riquadro «Gruppi e ore previste» aperto (null = aperto solo se la scheda «Gruppi» non c'è ancora)
  let gruppiDalFoglio = false;   // true se i gruppi sono stati letti dalla scheda «Gruppi»
  const TITOLI_GRUPPI = ['Tipo', 'Ore previste', 'Docenti previsti (es. DOC08:1, DOC19:2)', 'Nelle ore di (materia in parallelo)', 'Spiegazione', 'Senza classe (SI/NO)', 'Luogo (gruppi senza classe)'];

  const proposti = () => ((typeof CONFIG !== 'undefined' && CONFIG.gruppiCompresenze) || [])
    .map(g => ({ tipo: g.tipo, previste: g.previste || '', docenti: g.docenti || [], nelleOreDi: g.nelleOreDi || '', spiegazione: g.spiegazione || '',
      altriNomi: g.altriNomi || [], senzaClasse: !!g.senzaClasse, luogo: g.luogo || '' }));
  // una riga è completa con docente, giorno e ora; la classe serve solo se il gruppo non è «senza classe»
  // (ricevimento parenti, disponibilità per le supplenze…)
  const completa = r => { const g = gruppoDi(r.tipo); return !!(r.codice && r.giorno && r.ora > 0 && (r.classe || (g && g.senzaClasse))); };
  const gruppi = () => gruppiScuola || (gruppiScuola = proposti());
  const gruppoDi = tipo => gruppi().find(g => semplice(g.tipo) === semplice(tipo) || (g.altriNomi || []).some(n => semplice(n) === semplice(tipo)));
  // l'orario attuale di Orario Facile, nel formato dell'app (Dati.normalizza): si ricalcola a ogni disegno
  let Dcache = null;
  const D = () => Dcache || (Dcache = ctx.orario());
  const codiceDi = e => String(e.codice !== undefined ? e.codice : e.nome).trim().toUpperCase();
  const curricolari = () => D().lezioni.filter(l => !l.compresenza);
  const nomeDi = (tipo, id) => { const e = D().mappa[tipo].get(id); return e ? (tipo === 'docente' ? nomeDoc(codiceDi(e)) : e.nome) : id; };
  // le lezioni della materia in parallelo (es. tutte le ore di Religione), per i gruppi «nelle ore di»
  const lezioniDi = materia => curricolari().filter(l => semplice(l.materia).includes(semplice(materia)));
  // ore previste di un gruppo: quelle scritte; se mancano e il gruppo è «nelle ore di» una materia, quante ore ha quella materia
  function previsteDi(g) {
    if (g.previste !== '' && g.previste != null && !isNaN(Number(g.previste))) return Number(g.previste);
    return g.nelleOreDi ? lezioniDi(g.nelleOreDi).length : null;
  }
  // "DOC08:1, DOC19:2" <-> [{ codice, ore }]
  const leggiDocenti = testo => String(testo || '').split(/[,;]/).map(x => x.trim()).filter(Boolean).map(x => {
    const [c, o] = x.split(/[:=]/); return { codice: String(c).trim().toUpperCase(), ore: parseInt(o, 10) || 1 };
  });
  const scriviDocenti = elenco => (elenco || []).map(x => x.codice + ':' + x.ore).join(', ');

  // Nome da mostrare per un codice (il nome vero se è stato caricato con «👁 Nomi», altrimenti il codice)
  const nomeDoc = codice => (ctx.nome && ctx.nome(codice)) || codice;
  const nomeVero = codice => { const n = nomeDoc(codice); return n && n !== codice ? n : ''; };

  /* ---------- Google: lettura e scrittura del Foglio ---------- */
  const base = () => 'https://sheets.googleapis.com/v4/spreadsheets/' + encodeURIComponent(CONFIG.fileCompresenze);
  function spiega(stato, testo) {
    if (stato === 403 && /has not been used|is disabled|SERVICE_DISABLED/i.test(testo)) return 'nel progetto Google Cloud va attivata la "Google Sheets API"';
    if (stato === 403) return 'il tuo account non ha il permesso di modificare il Foglio Compresenze';
    if (stato === 404) return 'Foglio Compresenze non trovato (è un Foglio Google? l\'ID in config.js è giusto?)';
    if (stato === 401) return 'il permesso di Google è scaduto: premi di nuovo «Collega a Google»';
    if (stato === 400 && /Unable to parse range/i.test(testo)) return 'il file non è un Foglio Google: aprilo e scegli File → Salva come Fogli Google';
    return 'errore ' + stato + ' da Google';
  }
  async function chiama(t, percorso, opzioni) {
    const r = await fetch(base() + percorso, Object.assign({ headers: { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' } }, opzioni || {}));
    if (!r.ok) throw new Error(spiega(r.status, await r.text()));
    return r.json();
  }
  // il permesso di Google per leggere e scrivere i Fogli (la finestra si apre solo dopo un tocco, vedi «Collega a Google»)
  const permessi = () => [NomiDocenti.PERMESSO_DRIVE, SCRIVERE];

  async function carica() {
    stato = 'carico'; messaggio = ''; disegna();
    try {
      if (!CONFIG.fileCompresenze) throw new Error('in config.js manca l\'ID del Foglio Compresenze (fileCompresenze)');
      const t = await NomiDocenti.gettone(permessi(), ctx.email());
      // senza nome del foglio si legge il PRIMO foglio del file
      const j = await chiama(t, '/values/' + encodeURIComponent('A1:Z1000'));
      const tab = j.values && j.values.length ? j.values : [TITOLI];
      righe = Compresenze.righeDaTabella(tab);
      // la scheda «Gruppi» (se non c'è ancora, si parte da quelli proposti e la si crea al primo salvataggio)
      gruppiScuola = null; gruppiDalFoglio = false;
      try {
        const gj = await chiama(t, '/values/' + encodeURIComponent("'Gruppi'!A1:G100"));
        const gr = (gj.values || []).slice(1).filter(r => String(r[0] || '').trim());
        if (gr.length) {
          gruppiScuola = gr.map(r => {
            const tipo = String(r[0]).trim(), p = proposti().find(x => semplice(x.tipo) === semplice(tipo));
            return { tipo, previste: String(r[1] || '').trim(), docenti: leggiDocenti(r[2]), nelleOreDi: String(r[3] || '').trim(),
              spiegazione: String(r[4] || '').trim(), altriNomi: p ? p.altriNomi : [],
              senzaClasse: r[5] !== undefined && String(r[5]).trim() !== '' ? /^(si|sì|x|1|true|vero)$/i.test(String(r[5]).trim()) : !!(p && p.senzaClasse),
              luogo: r[6] !== undefined && String(r[6]).trim() !== '' ? String(r[6]).trim() : (p ? p.luogo : '') };
          });
          // i gruppi «senza classe» proposti (ricevimento, disponibilità) si aggiungono se nel Foglio non ci sono ancora
          proposti().filter(p => p.senzaClasse && !gruppiScuola.some(g => semplice(g.tipo) === semplice(p.tipo) ||
            (p.altriNomi || []).some(n => semplice(n) === semplice(g.tipo)))).forEach(p => gruppiScuola.push(p));
          gruppiDalFoglio = true;
        }
      } catch (e) { /* scheda «Gruppi» assente: gruppi proposti */ }
      await caricaSostegno(t);
      await caricaAlt(t);
      // i vecchi nomi del tipo (es. «Tempo prolungato») diventano quelli del gruppo
      righe.forEach(r => { const g = gruppoDi(r.tipo); if (g) r.tipo = g.tipo; });
      modificato = false; stato = 'pronto';
    } catch (e) {
      stato = 'errore'; errore = String(e && e.message || e);
    }
    disegna();
  }

  async function salva() {
    if (salvo) return;
    salvo = true; messaggio = 'Salvo sul Foglio…'; disegna();
    try {
      const t = await NomiDocenti.gettone(permessi(), ctx.email());
      // il nome del primo foglio, per cancellare e riscrivere solo quello
      const info = await chiama(t, '?fields=sheets.properties(title,index)');
      const schede = (info.sheets || []).map(s => s.properties).sort((a, b) => a.index - b.index);
      const primo = schede[0];
      const foglio = "'" + String(primo ? primo.title : 'Compresenze').replace(/'/g, "''") + "'";
      const valori = [TITOLI].concat(righe.map(r => [r.codice, r.classe, r.giorno, r.ora === '' ? '' : Number(r.ora), r.tipo, r.aula,
        nomeVero(r.codice) || r.nome || '', r.note]));
      await chiama(t, '/values/' + encodeURIComponent(foglio + '!A1:Z1000') + ':clear', { method: 'POST', body: '{}' });
      await chiama(t, '/values/' + encodeURIComponent(foglio + '!A1:H' + valori.length) + '?valueInputOption=RAW',
        { method: 'PUT', body: JSON.stringify({ values: valori }) });
      // la scheda «Gruppi» con i gruppi e le ore previste di questa scuola (creata se manca, mai come prima scheda)
      if (!schede.some(s => s.title === 'Gruppi')) {
        await chiama(t, ':batchUpdate', { method: 'POST', body: JSON.stringify({ requests: [{ addSheet: { properties: { title: 'Gruppi', index: schede.length } } }] }) });
      }
      await salvaSostegnoClassi(t, schede);
      await salvaAlt(t, schede);
      const valGruppi = [TITOLI_GRUPPI].concat(gruppi().map(g => [g.tipo, g.previste === '' ? '' : Number(g.previste), scriviDocenti(g.docenti), g.nelleOreDi, g.spiegazione, g.senzaClasse ? 'SI' : 'NO', g.luogo || '']));
      await chiama(t, '/values/' + encodeURIComponent("'Gruppi'!A1:G100") + ':clear', { method: 'POST', body: '{}' });
      await chiama(t, '/values/' + encodeURIComponent("'Gruppi'!A1:G" + valGruppi.length) + '?valueInputOption=RAW',
        { method: 'PUT', body: JSON.stringify({ values: valGruppi }) });
      Compresenze.imposta(righe);   // l'app Luis@i aperta su questo dispositivo le usa subito
      modificato = false;
      messaggio = '✓ Salvato sul Foglio Compresenze: l\'app Luis@i le mostra entro pochi minuti.';
    } catch (e) {
      messaggio = '⚠️ Non salvato: ' + String(e && e.message || e) + '.';
    }
    salvo = false;
    disegna();
  }

  /* ---------- SOSTEGNO ----------
     Scheda «Sostegno» del Foglio: la griglia fatta a mano (un docente di sostegno per riga, in ogni ora la classe), che la
     scheda legge soltanto. Scheda «Sostegno classi»: per ogni classe la spunta «sostegno previsto» e le ore totali previste
     (es. 2 alunni da 18 ore = 36), che la scheda scrive. Dato delicato: solo su Drive (CONFIG.fileSostegno, oppure il
     Foglio Compresenze), mai su GitHub; nell'app lo vedono solo i docenti. */
  const TITOLI_SOST_CLASSI = ['Classe', 'Sostegno previsto (SI/NO)', 'Ore di sostegno previste', 'Note'];
  let griglia = null;                // ore lette dalla griglia «Sostegno» (null = scheda assente)
  let sostClassi = new Map();        // nome classe (semplice) -> { si, ore, note }
  let sostDaCreare = false;          // al prossimo salvataggio si creano le schede del sostegno
  const stessoFile = () => !CONFIG.fileSostegno || CONFIG.fileSostegno === CONFIG.fileCompresenze;
  const baseSost = () => 'https://sheets.googleapis.com/v4/spreadsheets/' + encodeURIComponent(Compresenze.fileSostegno());
  async function chiamaSost(t, percorso, opzioni) {
    const r = await fetch(baseSost() + percorso, Object.assign({ headers: { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' } }, opzioni || {}));
    if (!r.ok) throw new Error(spiega(r.status, await r.text()));
    return r.json();
  }
  async function caricaSostegno(t) {
    griglia = null; sostClassi = new Map(); sostDaCreare = false;
    try { griglia = Compresenze.righeDaGriglia((await chiamaSost(t, '/values/' + encodeURIComponent("'Sostegno'!A1:CZ300"))).values || []); }
    catch (e) { griglia = null; }
    try {
      ((await chiamaSost(t, '/values/' + encodeURIComponent("'Sostegno classi'!A1:D200"))).values || []).slice(1).forEach(r => {
        const cl = String(r[0] || '').trim(); if (!cl) return;
        sostClassi.set(semplice(cl), { si: /^(si|sì|x|1|true|vero)$/i.test(String(r[1] || '').trim()), ore: String(r[2] || '').trim(), note: String(r[3] || '').trim() });
      });
    } catch (e) { /* scheda assente */ }
  }
  // crea le due schede del sostegno (se mancano) e scrive la scheda «Sostegno classi»
  async function salvaSostegnoClassi(t, schedeCompresenze) {
    if (!sostDaCreare && griglia === null && !sostClassi.size) return;   // il sostegno non si usa ancora
    const info = stessoFile() ? { sheets: schedeCompresenze.map(p => ({ properties: p })) } : await chiamaSost(t, '?fields=sheets.properties(title,index)');
    const titoli = (info.sheets || []).map(s => s.properties.title);
    const nuove = ['Sostegno', 'Sostegno classi'].filter(x => !titoli.includes(x));
    if (nuove.length) {
      await chiamaSost(t, ':batchUpdate', { method: 'POST', body: JSON.stringify({ requests: nuove.map((x, i) => ({ addSheet: { properties: { title: x, index: titoli.length + i } } })) }) });
    }
    if (nuove.includes('Sostegno')) {
      // intestazione della griglia: riga 1 i giorni (sopra la loro prima ora), riga 2 le ore
      const d = D(), r1 = ['Codice docente', 'Docente (non letto dall\'app)'], r2 = ['', ''];
      d.giorni.forEach(g => d.ore.forEach((o, i) => { r1.push(i ? '' : g); r2.push(o.n + 'ª'); }));
      await chiamaSost(t, '/values/' + encodeURIComponent("'Sostegno'!A1") + '?valueInputOption=RAW', { method: 'PUT', body: JSON.stringify({ values: [r1, r2] }) });
      griglia = [];
    }
    const valori = [TITOLI_SOST_CLASSI].concat(D().classe.map(c => {
      const x = sostClassi.get(semplice(c.nome)) || { si: false, ore: '', note: '' };
      return [c.nome, x.si ? 'SI' : 'NO', x.ore === '' ? '' : Number(x.ore), x.note];
    }));
    await chiamaSost(t, '/values/' + encodeURIComponent("'Sostegno classi'!A1:D200") + ':clear', { method: 'POST', body: '{}' });
    await chiamaSost(t, '/values/' + encodeURIComponent("'Sostegno classi'!A1:D" + valori.length) + '?valueInputOption=RAW', { method: 'PUT', body: JSON.stringify({ values: valori }) });
    sostDaCreare = false;
  }

  function sostegnoHtml() {
    const d = D();
    const link = `https://docs.google.com/spreadsheets/d/${encodeURIComponent(Compresenze.fileSostegno())}/edit`;
    let h = '<section class="card comp-scheda" aria-labelledby="titoloSostegno">' +
      '<div class="row spread"><h3 id="titoloSostegno">Sostegno</h3>';
    if (griglia === null && !sostDaCreare) {
      return h + '</div><p class="hint">Le ore dei docenti di sostegno si scrivono nella scheda «Sostegno» del Foglio, come nell\'orario ' +
        'definitivo: un docente per riga e, per ogni giorno e ogni ora, la classe. Qui si segna per ogni classe se ha il sostegno e quante ore in tutto.</p>' +
        '<div class="row comp-azioni"><button type="button" class="btn" data-azione="prepara-sostegno">Prepara le schede del sostegno</button></div></section>';
    }
    const ore = griglia || [];
    const perClasse = cl => ore.filter(x => semplice(x.classe) === semplice(cl));
    let totPrev = 0, totIns = 0;
    const righeClassi = d.classe.map((c, i) => {
      const x = sostClassi.get(semplice(c.nome)) || { si: false, ore: '', note: '' };
      const mie = perClasse(c.nome), prev = Number(x.ore) || 0;
      if (x.si) { totPrev += prev; totIns += mie.length; }
      // quanti docenti di sostegno insieme al massimo nella stessa ora
      const conta = new Map(); mie.forEach(y => { const k = y.giorno + '|' + y.ora; conta.set(k, (conta.get(k) || 0) + 1); });
      const insieme = Math.max(0, ...conta.values());
      let esito = '', cls = '';
      if (!x.si && mie.length) { esito = `${mie.length} ore nella griglia ma il sostegno non è spuntato`; cls = 'bad'; }
      else if (x.si && !prev) { esito = `${mie.length} ore inserite · scrivi le ore previste`; cls = 'warn'; }
      else if (x.si) { esito = mie.length === prev ? `✓ ${mie.length} di ${prev}` : mie.length < prev ? `${mie.length} di ${prev}: ne mancano ${prev - mie.length}` : `${mie.length} di ${prev}: ${mie.length - prev} in più`; cls = mie.length === prev ? 'ok' : 'warn'; }
      if (insieme > 1) esito += ` · fino a ${insieme} docenti di sostegno insieme`;
      return `<li class="comp-sost${x.si ? ' attivo' : ''}">` +
        `<label class="row comp-spunta"><input type="checkbox" data-sc="${i}" data-campo="si"${x.si ? ' checked' : ''}> <b>${esc(c.nome)}</b></label>` +
        (x.si ? `<label class="fl comp-ore-sost">Ore previste<input type="number" min="0" data-sc="${i}" data-campo="ore" value="${esc(x.ore)}" placeholder="es. 36"></label>` : '') +
        (esito ? `<span class="tag ${cls}">${esc(esito)}</span>` : '') + '</li>';
    }).join('');
    // controlli della griglia: classe senza lezione, docente di sostegno che ha anche una lezione curricolare
    const problemi = [];
    ore.forEach(x => {
      const c = d.classe.find(k => semplice(k.nome) === semplice(x.classe));
      if (!c) { problemi.push(`${nomeDoc(x.codice)} ${x.giorno} ${x.ora}ª: classe «${x.classe}» sconosciuta`); return; }
      if (!curricolari().some(l => l.giorno === x.giorno && l.ora === x.ora && l.classe === c.id)) problemi.push(`${nomeDoc(x.codice)} ${x.giorno} ${x.ora}ª: la ${c.nome} non ha lezione`);
      const e = d.docente.find(k => codiceDi(k) === x.codice);
      const imp = e && curricolari().find(l => l.giorno === x.giorno && l.ora === x.ora && l.docente === e.id);
      if (imp) problemi.push(`${nomeDoc(x.codice)} ${x.giorno} ${x.ora}ª: ha anche lezione in ${nomeDi('classe', imp.classe)}`);
    });
    h += `<span class="tag${totPrev && totIns === totPrev ? ' ok' : ''}">${totIns} di ${totPrev || '—'}</span></div>` +
      '<p class="hint">Spunta le classi con alunni con disabilità e scrivi le ore di sostegno in tutto (es. 2 alunni da 18 ore = 36). ' +
      `Le ore dei docenti si scrivono nella scheda «Sostegno» del <a href="${esc(link)}" target="_blank" rel="noopener">Foglio</a>: un docente per riga, in ogni ora la classe. ` +
      'Dato riservato: resta solo su Drive e nell\'app lo vedono solo i docenti.</p>' +
      (griglia === null ? '<p class="hint"><b>Le schede del sostegno si creano quando salvi.</b></p>' : '') +
      `<ul class="comp-classi-sost">${righeClassi}</ul>` +
      (problemi.length ? `<details class="comp-problemi"><summary>⚠ ${problemi.length} ${problemi.length === 1 ? 'cosa da controllare' : 'cose da controllare'} nella griglia</summary><ul>${problemi.map(p => `<li>${esc(p)}</li>`).join('')}</ul></details>` : '') +
      '</section>';
    return h;
  }
  function cambioSostegno(el) {
    const c = D().classe[Number(el.dataset.sc)]; if (!c) return;
    const k = semplice(c.nome), x = sostClassi.get(k) || { si: false, ore: '', note: '' };
    if (el.dataset.campo === 'si') x.si = el.checked; else x.ore = el.value === '' ? '' : String(Math.max(0, parseInt(el.value, 10) || 0));
    sostClassi.set(k, x); modificato = true; messaggio = '';
    disegna();
  }

  /* ---------- controlli di una riga ---------- */
  function controlli(r) {
    const d = D(), manca = [], gr = gruppoDi(r.tipo), senza = !!(gr && gr.senzaClasse);
    if (!r.codice) manca.push('docente');
    if (!r.classe && !senza) manca.push('classe');
    if (!r.giorno) manca.push('giorno');
    if (!r.ora) manca.push('ora');
    if (manca.length) return { avvisi: ['Da completare: manca ' + manca.join(', ') + '.'], info: '', incompleta: true };
    const avvisi = [];
    const classe = r.classe ? d.classe.find(c => semplice(c.nome) === semplice(r.classe)) : null;
    const docente = d.docente.find(e => codiceDi(e) === r.codice);
    const ora = Number(r.ora);
    if (r.classe && !classe) avvisi.push(`La classe ${r.classe} non è nell'orario.`);
    if (!docente) avvisi.push(`Il docente ${r.codice} non è nell'orario.`);
    let info = '';
    // gruppi senza classe: si dice dove si svolge (l'aula scelta, altrimenti il luogo del gruppo, es. l'atrio)
    if (senza) info = 'Dove: ' + (r.aula || gr.luogo || 'da indicare');
    if (classe) {
      const t = curricolari().find(l => l.giorno === r.giorno && l.ora === ora && l.classe === classe.id);
      if (!t) avvisi.push(`In quell'ora la ${r.classe} non ha lezione.`);
      else {
        info = `In classe: ${t.materia || '—'} · ${nomeDi('docente', t.docente)} · aula ${nomeDi('aula', t.aula)}`;
        const g = gruppoDi(r.tipo);
        if (g && g.nelleOreDi && !semplice(t.materia).includes(semplice(g.nelleOreDi))) avvisi.push(`In quell'ora la classe non ha ${g.nelleOreDi}.`);
      }
    }
    if (docente) {
      const impegno = curricolari().find(l => l.giorno === r.giorno && l.ora === ora && l.docente === docente.id);
      if (impegno) avvisi.push(`In quell'ora ${nomeDoc(r.codice)} ha già lezione in ${nomeDi('classe', impegno.classe)}.`);
      const doppie = righe.filter(x => x !== r && x.codice === r.codice && x.giorno === r.giorno && Number(x.ora) === ora);
      if (doppie.length) avvisi.push('Il docente ha già un\'altra compresenza in quest\'ora.');
    }
    return { avvisi, info, incompleta: false };
  }

  /* ---------- disegno ---------- */
  function opzioni(elenco, scelto, vuota) {
    return (vuota !== undefined ? `<option value="">${esc(vuota)}</option>` : '') +
      elenco.map(o => `<option value="${esc(o.v)}"${String(o.v) === String(scelto) ? ' selected' : ''}>${esc(o.t)}</option>`).join('');
  }

  /*
    Solo per l'ALTERNATIVA (scelta della scuola): perché un docente NON va bene per questa riga (testo breve), oppure ''.
    Con giorno e ora scelti deve essere libero (niente lezione, niente altra compresenza, anche di sostegno, in quell'ora)
    e non deve essere un docente di quella classe. Negli altri gruppi la tendina mostra tutti i docenti.
  */
  const eAlternativa = g => !!g && semplice(g.tipo).includes('alternativa');
  // Il docente «e» può fare l'Alternativa in questa classe, giorno e ora? Restituisce '' se sì, altrimenti il motivo.
  // «rigaDaIgnorare» è la riga che si sta scegliendo (non conta come altro impegno).
  function motivoLibero(e, giorno, ora, classe, rigaDaIgnorare) {
    const c = codiceDi(e);
    if (curricolari().some(l => l.giorno === giorno && l.ora === ora && l.docente === e.id)) return 'occupato';
    if (righe.some(x => x !== rigaDaIgnorare && x.codice === c && x.giorno === giorno && Number(x.ora) === ora)) return 'occupato';
    if ((griglia || []).some(x => x.codice === c && x.giorno === giorno && x.ora === ora)) return 'occupato';
    if (classe && curricolari().some(l => l.docente === e.id && l.classe === classe.id)) return 'docente della classe';
    return '';
  }
  function motivoEscluso(e, r, g, classe) {
    if (!eAlternativa(g) || !r.giorno || !r.ora) return '';
    return motivoLibero(e, r.giorno, Number(r.ora), classe, r);
  }

  function rigaHtml(r, i, g) {
    const d = D();
    const classeRiga = r.classe ? d.classe.find(c => semplice(c.nome) === semplice(r.classe)) : null;
    // nella tendina solo i docenti adatti (vedi motivoEscluso); quello già scelto resta sempre, con il motivo
    const docenti = d.docente.map(e => {
      const c = codiceDi(e), n = nomeDoc(c), no = motivoEscluso(e, r, g, classeRiga);
      return { v: c, t: (n === c ? c : `${n} (${c})`) + (no ? ` (${no})` : ''), no };
    }).filter(x => !x.no || x.v === r.codice)
      .sort((a, b) => a.t.localeCompare(b.t, 'it', { numeric: true }));
    // un docente scritto nel Foglio ma non (più) nell'orario resta scelto, così non si perde
    if (r.codice && !docenti.some(x => x.v === r.codice)) docenti.unshift({ v: r.codice, t: r.codice + ' (non nell\'orario)' });
    const liberi = docenti.filter(x => !x.no).length;   // quanti docenti adatti ci sono (per l'etichetta)
    const classi = d.classe.map(c => ({ v: c.nome, t: c.nome }));
    if (r.classe && !classi.some(x => semplice(x.v) === semplice(r.classe))) classi.unshift({ v: r.classe, t: r.classe });
    const giorni = d.giorni.map(x => ({ v: x, t: x }));
    const ore = d.ore.map(o => ({ v: o.n, t: `${o.n}ª (${o.inizio})` }));
    const aule = d.aula.map(a => ({ v: a.nome, t: a.nome }));
    if (r.aula && !aule.some(x => semplice(x.v) === semplice(r.aula))) aule.unshift({ v: r.aula, t: r.aula });
    const k = controlli(r);
    const campo = (nome, etichetta, html) => `<label class="fl comp-campo comp-${nome}">${etichetta}${html}</label>`;
    const sel = (nome, elenco, scelto, vuota) => `<select data-i="${i}" data-campo="${nome}">${opzioni(elenco, scelto, vuota)}</select>`;
    return `<li class="comp-riga${k.incompleta ? ' da-completare' : k.avvisi.length ? ' con-avvisi' : ''}">` +
      `<div class="comp-campi">` +
      campo('codice', eAlternativa(g) && r.giorno && r.ora ? `Docente (${liberi} liberi, non della classe)` : 'Docente',
        sel('codice', docenti, r.codice, '— scegli —')) +
      // nei gruppi «senza classe» (ricevimento, disponibilità) la classe non si chiede
      (g && g.senzaClasse ? '' : campo('classe', 'Classe', sel('classe', classi, r.classe, '—'))) +
      campo('giorno', 'Giorno', sel('giorno', giorni, r.giorno, '—')) +
      campo('ora', 'Ora', sel('ora', ore, r.ora, '—')) +
      campo('aula', 'Aula', sel('aula', aule, r.aula, g && g.senzaClasse ? (g.luogo || '—') : 'del titolare')) +
      (g ? '' : campo('tipo', 'Tipo', `<input type="text" data-i="${i}" data-campo="tipo" value="${esc(r.tipo)}" placeholder="es. Laboratorio">`)) +
      campo('note', 'Note', `<input type="text" data-i="${i}" data-campo="note" value="${esc(r.note)}">`) +
      `<button type="button" class="iconbtn" data-azione="togli" data-i="${i}" title="Togli questa ora" aria-label="Togli questa ora">✕</button>` +
      `</div>` +
      (k.info ? `<p class="hint">${esc(k.info)}</p>` : '') +
      k.avvisi.map(a => `<p class="comp-avviso">⚠ ${esc(a)}</p>`).join('') +
      `</li>`;
  }

  function schedaHtml(g, indice) {
    const mie = righe.map((r, i) => ({ r, i })).filter(x => g ? gruppoDi(x.r.tipo) === g : !gruppoDi(x.r.tipo));
    if (!g && !mie.length) return '';
    const complete = mie.filter(x => completa(x.r)).length;
    const titolo = g ? g.tipo : 'Altre compresenze';
    let conto = '';
    const prev = g ? previsteDi(g) : null;
    if (prev) {
      const ok = mie.length === prev && complete === prev;
      conto = `<span class="tag${ok ? ' ok' : ''}">${complete} di ${prev}${mie.length > prev ? ` · ${mie.length - prev} in più` : ''}</span>`;
    } else conto = `<span class="tag">${complete} ore</span>`;
    // quante ore ha già ciascun docente previsto
    const docenti = g && g.docenti && g.docenti.length ? `<div class="row comp-docenti">${g.docenti.map(x => {
      const n = mie.filter(y => y.r.codice === x.codice).length;
      return `<span class="tag${n === x.ore ? ' ok' : ''}">${esc(nomeDoc(x.codice))}: ${n} di ${x.ore}</span>`;
    }).join('')}</div>` : '';
    const gid = g ? String(indice) : ALTRE;
    return `<section class="card comp-scheda" aria-labelledby="titoloGruppo${gid}">` +
      `<div class="row spread"><h3 id="titoloGruppo${gid}">${esc(titolo)}</h3>${conto}</div>` +
      (g && g.spiegazione ? `<p class="hint">${esc(g.spiegazione)}</p>` : '') + docenti +
      (mie.length ? `<ol class="comp-righe">${mie.map(x => rigaHtml(x.r, x.i, g)).join('')}</ol>` : '<p class="hint">Nessuna ora inserita.</p>') +
      `<div class="row comp-azioni"><button type="button" class="btn" data-azione="aggiungi" data-gruppo="${gid}">+ Aggiungi un'ora</button>` +
      (g && g.nelleOreDi ? `<button type="button" class="btn" data-azione="parallelo" data-gruppo="${gid}">Aggiungi le ore di ${esc(g.nelleOreDi)} che mancano</button>` : '') +
      `</div></section>`;
  }

  function disegna() {
    if (!box) return;
    Dcache = null;   // l'orario di Orario Facile può essere cambiato: lo si rilegge
    let corpo = '';
    if (stato === 'collega') {
      corpo = '<p class="hint">Le compresenze stanno nel Foglio Compresenze su Google Drive: serve il permesso di Google per leggerlo e modificarlo.</p>' +
        '<div class="row comp-azioni"><button type="button" class="btn" data-azione="collega">Collega a Google e apri le compresenze</button></div>';
    } else if (stato === 'carico') corpo = '<p class="hint">Leggo il Foglio Compresenze…</p>';
    else if (stato === 'errore') corpo = `<p class="comp-avviso">⚠️ ${esc(errore)}</p><div class="row comp-azioni"><button type="button" class="btn" data-azione="ricarica">Riprova</button></div>`;
    else {
      const complete = righe.filter(completa).length;
      corpo = `<div class="row comp-azioni"><button type="button" class="btn" data-azione="salva"${salvo || !modificato ? ' disabled' : ''}>📤 Salva sul Foglio</button>` +
        `<button type="button" class="btn" data-azione="ricarica"${salvo || !modificato ? ' disabled' : ''}>Annulla le modifiche</button>` +
        `<span class="hint">${complete} ore di compresenza · ${righe.length - complete} da completare${modificato ? ' · <b>ci sono modifiche non salvate</b>' : ''}</span></div>`;
    }
    const schede = stato === 'pronto'
      ? `${gruppiHtml()}${gruppi().map((g, i) => schedaHtml(g, i) + (eAlternativa(g) ? altHtml(g) : '')).join('')}${sostegnoHtml()}${schedaHtml(null)}` +
        `<p class="hint">Ogni ora è di un docente: le righe senza docente, giorno o ora restano «da completare» e l'app non le mostra. ` +
        `Nell'app Luis@i le compresenze si vedono spuntando «Compresenze».</p>`
      : '';
    // si ricorda dov'era il cursore, per rimetterlo lì dopo aver ridisegnato
    const a = document.activeElement, fuoco = a && box.contains(a) ? { i: a.dataset.i, g: a.dataset.g, sc: a.dataset.sc, al: a.dataset.al, alcrit: a.dataset.alcrit, alopz: a.dataset.alopz, campo: a.dataset.campo, azione: a.dataset.azione, gruppo: a.dataset.gruppo } : null;
    box.innerHTML = `<div class="card no-print">${corpo}<p class="comp-messaggio" role="status" aria-live="polite">${esc(messaggio)}</p></div>${schede}`;
    if (fuoco) {
      const sel = fuoco.alcrit !== undefined ? `[data-alcrit="${fuoco.alcrit}"]` : fuoco.alopz !== undefined ? `[data-alopz="${fuoco.alopz}"]`
        : fuoco.campo ? (fuoco.al !== undefined ? `[data-al="${fuoco.al}"][data-campo="${fuoco.campo}"]` : fuoco.sc !== undefined ? `[data-sc="${fuoco.sc}"][data-campo="${fuoco.campo}"]` : fuoco.g !== undefined ? `[data-g="${fuoco.g}"][data-campo="${fuoco.campo}"]` : `[data-i="${fuoco.i}"][data-campo="${fuoco.campo}"]`)
        : fuoco.azione ? `[data-azione="${fuoco.azione}"]${fuoco.gruppo ? `[data-gruppo="${fuoco.gruppo}"]` : fuoco.i ? `[data-i="${fuoco.i}"]` : ''}` : '';
      const el = sel && box.querySelector(sel);
      if (el) el.focus({ preventScroll: true });
    }
  }

  /* ---------- ALTERNATIVA: disponibilità dei docenti e bozza di copertura ----------
     Le disponibilità arrivano dal file delle risposte del modulo (si carica con «Carica le disponibilità») e stanno nella scheda
     «Disponibilità Alternativa» del Foglio (CONFIG.fileAlternativa, oppure il Foglio Compresenze): per ogni docente le ore
     di ogni giorno e i dati dei criteri (esclusioni passate, classi dell'anno scorso, punteggio della graduatoria).
     Hanno i nomi veri: restano solo su Drive. I calcoli sono in alternativa.js. */
  const GIORNI_ALT = Alternativa.GIORNI;
  const TITOLI_ALT = ['Codice docente', 'Docente'].concat(GIORNI_ALT, ['Nessuna disponibilità (SI/NO)', 'Esclusioni negli anni passati', 'Classi dell\'anno scorso', 'Punteggio graduatoria']);
  const SCHEDA_ALT = 'Disponibilità Alternativa';
  const CHIAVE_PREF_ALT = 'orariofacile.alternativa';
  let alt = { dispo: [], nelFoglio: false, bozza: null, criteri: Alternativa.CRITERI.map(c => ({ id: c.id, attivo: true })), limite: '', salgono: true, alta: true, risposte: '' };
  try {
    const p = JSON.parse(localStorage.getItem(CHIAVE_PREF_ALT) || 'null');
    if (p && Array.isArray(p.criteri)) {
      const noti = p.criteri.filter(c => Alternativa.CRITERI.some(x => x.id === c.id));
      alt.criteri = noti.concat(Alternativa.CRITERI.filter(x => !noti.some(c => c.id === x.id)).map(x => ({ id: x.id, attivo: true })));
      alt.limite = p.limite || ''; alt.salgono = p.salgono !== false; alt.alta = p.alta !== false; alt.risposte = p.risposte || '';
    }
  } catch (e) { /* senza memoria si parte dalle impostazioni proposte */ }
  const salvaPrefAlt = () => { try { localStorage.setItem(CHIAVE_PREF_ALT, JSON.stringify({ criteri: alt.criteri, limite: alt.limite, salgono: alt.salgono, alta: alt.alta, risposte: alt.risposte })); } catch (e) { /* va bene lo stesso */ } };

  const fileAlt = () => CONFIG.fileAlternativa || CONFIG.fileCompresenze;
  async function chiamaAlt(t, percorso, opzioni) {
    const r = await fetch('https://sheets.googleapis.com/v4/spreadsheets/' + encodeURIComponent(fileAlt()) + percorso,
      Object.assign({ headers: { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' } }, opzioni || {}));
    if (!r.ok) throw new Error(spiega(r.status, await r.text()));
    return r.json();
  }
  async function caricaAlt(t) {
    alt.dispo = []; alt.nelFoglio = false; alt.bozza = null;
    try {
      const j = await chiamaAlt(t, '/values/' + encodeURIComponent("'" + SCHEDA_ALT + "'!A1:K200"));
      alt.nelFoglio = true;
      alt.dispo = (j.values || []).slice(1).filter(r => String(r[0] || '').trim() || String(r[1] || '').trim()).map(r => {
        const giorni = {}; GIORNI_ALT.forEach((g, i) => { giorni[g] = Alternativa.testoOre(Alternativa.oreDa(r[2 + i])); });
        return { codice: String(r[0] || '').trim().toUpperCase(), nome: String(r[1] || '').trim(), giorni,
          nessuna: /^(si|sì|x|1|true|vero)$/i.test(String(r[7] || '').trim()), escl: String(r[8] || '').trim(),
          classiPrima: String(r[9] || '').trim(), punteggio: String(r[10] || '').trim() };
      });
    } catch (e) { /* scheda assente: si parte dal file delle disponibilità */ }
  }
  async function salvaAlt(t, schedeCompresenze) {
    if (!alt.dispo.length && !alt.nelFoglio) return;
    const info = fileAlt() === CONFIG.fileCompresenze ? { sheets: schedeCompresenze.map(p => ({ properties: p })) } : await chiamaAlt(t, '?fields=sheets.properties(title,index)');
    if (!(info.sheets || []).some(s => s.properties.title === SCHEDA_ALT) && !alt.nelFoglio) {
      await chiamaAlt(t, ':batchUpdate', { method: 'POST', body: JSON.stringify({ requests: [{ addSheet: { properties: { title: SCHEDA_ALT } } }] }) });
    }
    const valori = [TITOLI_ALT].concat(alt.dispo.map(x => [x.codice, x.nome].concat(GIORNI_ALT.map(g => x.giorni[g] || ''),
      [x.nessuna ? 'SI' : 'NO', x.escl === '' ? '' : (Alternativa.numero(x.escl) === null ? x.escl : Alternativa.numero(x.escl)), x.classiPrima,
        x.punteggio === '' ? '' : (Alternativa.numero(x.punteggio) === null ? x.punteggio : Alternativa.numero(x.punteggio))])));
    await chiamaAlt(t, '/values/' + encodeURIComponent("'" + SCHEDA_ALT + "'!A1:K200") + ':clear', { method: 'POST', body: '{}' });
    await chiamaAlt(t, '/values/' + encodeURIComponent("'" + SCHEDA_ALT + "'!A1:K" + valori.length) + '?valueInputOption=RAW',
      { method: 'PUT', body: JSON.stringify({ values: valori }) });
    alt.nelFoglio = true;
  }

  // le ore di Religione (una per classe), che l'Alternativa deve coprire, con l'eventuale riga già scritta
  function altSlots(g) {
    const d = D(), visti = new Set(), ordineGiorno = giorno => { const i = GIORNI_ALT.indexOf(giorno); return i < 0 ? 9 : i; };
    return lezioniDi(g.nelleOreDi).map(l => {
      const classe = d.classe.find(c => c.id === l.classe), nome = classe ? classe.nome : nomeDi('classe', l.classe);
      const riga = righe.find(r => gruppoDi(r.tipo) === g && semplice(r.classe) === semplice(nome) && r.giorno === l.giorno && Number(r.ora) === l.ora);
      return { id: l.giorno + '|' + l.ora + '|' + nome, giorno: l.giorno, ora: l.ora, classe: nome, classeObj: classe, riga };
    }).filter(s => !visti.has(s.id) && visti.add(s.id))
      .sort((a, b) => ordineGiorno(a.giorno) - ordineGiorno(b.giorno) || a.ora - b.ora || a.classe.localeCompare(b.classe, 'it', { numeric: true }));
  }
  const nomeAlt = codice => { const x = alt.dispo.find(y => y.codice === codice); return nomeVero(codice) || (x && x.nome) || codice; };

  /*
    Il controllo che hai chiesto: per ogni ora in cui un docente si è reso disponibile, è nell'elenco previsto?
    «Nell'elenco» = per quel giorno e quell'ora c'è almeno una classe con Religione dove il docente è libero e non è della classe
    (gli stessi docenti che la tendina dell'Alternativa propone). Per ogni ora: { giorno, ora, stato: 'ok' | 'no', testo }.
  */
  function altVerifica(x, slots, g) {
    const e = x.codice ? D().docente.find(k => codiceDi(k) === x.codice) : null, voci = [];
    GIORNI_ALT.forEach(giorno => Alternativa.oreDa(x.giorni[giorno]).forEach(ora => {
      const qui = slots.filter(s => s.giorno === giorno && s.ora === ora);
      let stato = 'no', testo;
      if (!x.codice) testo = 'docente non riconosciuto';
      else if (!e) testo = 'non è nell\'orario';
      else if (!qui.length) testo = `in quest'ora nessuna classe ha ${g.nelleOreDi}`;
      else {
        const ris = qui.map(s => ({ s, m: s.riga && s.riga.codice === x.codice ? '' : s.riga && s.riga.codice ? 'già coperta da un altro docente' : motivoLibero(e, giorno, ora, s.classeObj, null) }));
        const buone = ris.filter(r => !r.m);
        if (buone.length) { stato = 'ok'; testo = 'nell\'elenco per: ' + buone.map(r => r.s.classe).join(', '); }
        else testo = 'non nell\'elenco: ' + ris.map(r => `${r.s.classe} ${r.m}`).join('; ');
      }
      voci.push({ giorno, ora, stato, testo });
    }));
    return voci;
  }

  // dati per la simulazione: le ore ancora da coprire e, per ogni docente, in quali può stare
  function altDatiSimulazione(g) {
    const slots = altSlots(g), aperti = slots.filter(s => !(s.riga && s.riga.codice));
    const docenti = alt.dispo.filter(x => x.codice && !x.nessuna).map(x => {
      const e = D().docente.find(k => codiceDi(k) === x.codice);
      const ok = e ? aperti.filter(s => Alternativa.oreDa(x.giorni[s.giorno]).includes(s.ora) && !motivoLibero(e, s.giorno, s.ora, s.classeObj, null)).map(s => s.id) : [];
      return { codice: x.codice, escl: x.escl, classiPrima: Alternativa.classiDiOggi(x.classiPrima, alt.salgono), punteggio: x.punteggio,
        gia: righe.filter(r => gruppoDi(r.tipo) === g && r.codice === x.codice).length, ok };
    });
    return { slots, aperti, docenti };
  }
  function altSimula(g) {
    const dati = altDatiSimulazione(g);
    const ris = Alternativa.simula({ slots: dati.aperti, docenti: dati.docenti, ordine: alt.criteri.filter(c => c.attivo).map(c => c.id), limite: alt.limite, graduatoriaAlta: alt.alta });
    alt.bozza = { ris, aperti: dati.aperti, docenti: dati.docenti };
    messaggio = '';
  }
  function altApplica(g) {
    if (!alt.bozza) return;
    let n = 0;
    alt.bozza.ris.assegnazioni.forEach(a => {
      const s = alt.bozza.aperti.find(x => x.id === a.slotId); if (!s) return;
      const attuale = righe.find(r => gruppoDi(r.tipo) === g && semplice(r.classe) === semplice(s.classe) && r.giorno === s.giorno && Number(r.ora) === s.ora);
      if (attuale) attuale.codice = a.codice;
      else righe.push({ codice: a.codice, classe: s.classe, giorno: s.giorno, ora: s.ora, tipo: g.tipo, aula: '', note: '', nome: '' });
      n++;
    });
    alt.bozza = null; modificato = true;
    messaggio = `Bozza applicata: ${n} ore scritte qui sopra. Controllale e premi «Salva sul Foglio».`;
  }

  // Unisce le disponibilità lette (da file o dal Foglio delle risposte) a quelle che ci sono già: chi c'era resta con i suoi dati dei criteri
  function altUnisci(tabelle) {
    const nomi = ctx.nomi && ctx.nomi();
    if (!nomi) { messaggio = '⚠️ Per riconoscere i docenti premi prima «👁 Nomi» in alto: i nomi veri restano solo in memoria.'; return; }
    const lette = Alternativa.leggiDisponibilita(tabelle);
    const vecchi = new Map(alt.dispo.map(x => [semplice(x.nome), x]));
    let nuovi = 0, cambiati = 0;
    const chiave = x => GIORNI_ALT.map(g => x.giorni[g] || '').join('|') + (x.nessuna ? '|N' : '');
    alt.dispo = lette.map(x => {
      const v = vecchi.get(semplice(x.nome));
      if (!v) nuovi++; else if (chiave(v) !== chiave(x)) cambiati++;
      return { codice: Alternativa.codiceDaNome(x.nome, nomi) || (v ? v.codice : ''), nome: x.nome, giorni: x.giorni, nessuna: x.nessuna,
        escl: v ? v.escl : '', classiPrima: v ? v.classiPrima : '', punteggio: v ? v.punteggio : '' };
    });
    alt.bozza = null; modificato = true;
    const senza = alt.dispo.filter(x => !x.codice).length;
    messaggio = `Disponibilità lette: ${alt.dispo.length} docenti` + (vecchi.size ? ` (${nuovi} nuovi, ${cambiati} cambiate)` : '') +
      (senza ? `, ${senza} da riconoscere (scegli il docente nell'elenco)` : ', tutti riconosciuti') + '. Premi «Salva sul Foglio» per tenerle.';
  }
  async function altImporta(file) {
    try { altUnisci(await Foglio.leggiTabelle(file)); } catch (e) { messaggio = '⚠️ ' + String(e && e.message || e); }
    disegna();
  }
  // il Foglio Google delle risposte del modulo (link o ID): si rilegge quando arrivano nuove risposte, senza scaricare il file
  const idFoglio = testo => { const m = /\/d\/([A-Za-z0-9_-]{20,})/.exec(String(testo || '')) || /^([A-Za-z0-9_-]{25,})$/.exec(String(testo || '').trim()); return m ? m[1] : ''; };
  async function altDaFoglio() {
    const id = idFoglio(alt.risposte);
    if (!id) { messaggio = '⚠️ Incolla il link del Foglio Google delle risposte del modulo.'; disegna(); return; }
    messaggio = 'Leggo il Foglio delle risposte…'; disegna();
    try {
      const t = await NomiDocenti.gettone(permessi(), ctx.email());
      const r = await fetch('https://sheets.googleapis.com/v4/spreadsheets/' + encodeURIComponent(id) + '/values/' + encodeURIComponent('A1:Z500'), { headers: { Authorization: 'Bearer ' + t } });
      if (!r.ok) throw new Error(r.status === 403 || r.status === 404 ? 'non riesco ad aprire il Foglio delle risposte: controlla il link e che il tuo account lo possa leggere' : spiega(r.status, await r.text()));
      altUnisci([{ nome: 'Risposte', righe: (await r.json()).values || [] }]);
      salvaPrefAlt();
    } catch (e) { messaggio = '⚠️ ' + String(e && e.message || e); }
    disegna();
  }

  function altHtml(g) {
    if (!g.nelleOreDi) return '';
    const slots = altSlots(g), scoperte = slots.filter(s => !(s.riga && s.riga.codice)).length;
    const voci = alt.dispo.map(x => altVerifica(x, slots, g));
    const tutte = [].concat(...voci), buone = tutte.filter(v => v.stato === 'ok').length;
    const codiciOpz = D().docente.map(e => { const c = codiceDi(e), n = nomeDoc(c); return { v: c, t: n === c ? c : `${n} (${c})` }; }).sort((a, b) => a.t.localeCompare(b.t, 'it', { numeric: true }));
    const abbr = giorno => giorno.slice(0, 3);
    const righeDoc = alt.dispo.map((x, i) => {
      const chips = voci[i].map(v => `<span class="tag ${v.stato === 'ok' ? 'ok' : 'warn'}" title="${esc(v.testo)}">${esc(abbr(v.giorno))} ${v.ora}ª ${v.stato === 'ok' ? '✓' : '⚠'}</span>`).join('');
      const problemi = voci[i].filter(v => v.stato !== 'ok').map(v => `${abbr(v.giorno)} ${v.ora}ª: ${v.testo}`);
      return `<li class="comp-riga alt-doc">` +
        `<div class="row spread"><b>${esc(x.nome)}</b>` +
        (x.codice ? `<span class="tag">${esc(x.codice)}</span>` : `<label class="fl comp-campo">Chi è?<select data-al="${i}" data-campo="codice">${opzioni(codiciOpz, '', '— scegli il docente —')}</select></label>`) +
        `<button type="button" class="iconbtn" data-azione="alt-togli" data-i="${i}" title="Togli questo docente" aria-label="Togli ${esc(x.nome)}">✕</button></div>` +
        `<div class="row alt-ore">${x.nessuna ? '<span class="tag">Nessuna disponibilità</span>' : (chips || '<span class="tag warn">Nessuna ora indicata</span>')}</div>` +
        (problemi.length ? `<p class="hint">${problemi.map(esc).join(' · ')}</p>` : '') +
        `<div class="comp-campi alt-criteri-doc">` +
        `<label class="fl comp-campo">Esclusioni negli anni passati<input type="number" min="0" data-al="${i}" data-campo="escl" value="${esc(x.escl)}" placeholder="0"></label>` +
        `<label class="fl comp-campo">Classi dell'anno scorso<input type="text" data-al="${i}" data-campo="classiPrima" value="${esc(x.classiPrima)}" placeholder="es. 1A, 2B"></label>` +
        `<label class="fl comp-campo">Punteggio graduatoria<input type="text" inputmode="decimal" data-al="${i}" data-campo="punteggio" value="${esc(x.punteggio)}" placeholder="es. 32,5"></label>` +
        `</div></li>`;
    }).join('');
    const criteri = alt.criteri.map((c, i) => {
      const def = Alternativa.CRITERI.find(x => x.id === c.id);
      return `<li class="alt-criterio"><label class="row comp-spunta"><input type="checkbox" data-alcrit="${i}"${c.attivo ? ' checked' : ''}> <span><b>${i + 1}. ${esc(def.titolo)}</b><br><span class="hint">${esc(def.aiuto)}</span></span></label>` +
        `<span class="row"><button type="button" class="iconbtn" data-azione="alt-su" data-i="${i}" title="Più importante"${i === 0 ? ' disabled' : ''} aria-label="Sposta su">▲</button>` +
        `<button type="button" class="iconbtn" data-azione="alt-giu" data-i="${i}" title="Meno importante"${i === alt.criteri.length - 1 ? ' disabled' : ''} aria-label="Sposta giù">▼</button></span></li>`;
    }).join('');
    let bozza = '';
    if (alt.bozza) {
      const b = alt.bozza, ris = b.ris, daSlot = new Map(ris.assegnazioni.map(a => [a.slotId, a.codice]));
      const righeB = b.aperti.map(s => {
        const c = daSlot.get(s.id), d = c && b.docenti.find(x => x.codice === c);
        const note = [];
        if (d && Alternativa.classiDiOggi(alt.dispo.find(x => x.codice === c).classiPrima, alt.salgono).includes(semplice(s.classe))) note.push('riprende la classe');
        if (d && Alternativa.numero(d.escl) > 0) note.push(`escluso ${Alternativa.numero(d.escl)} ${Alternativa.numero(d.escl) === 1 ? 'volta' : 'volte'}`);
        const candidati = b.docenti.filter(x => x.ok.includes(s.id)).length;
        return `<li class="comp-riga ${c ? '' : 'con-avvisi'}"><b>${esc(s.giorno)} ${s.ora}ª · ${esc(s.classe)}</b> → ` +
          (c ? `${esc(nomeAlt(c))} <span class="tag">${esc(c)}</span>${note.map(n => ` <span class="tag ok">${esc(n)}</span>`).join('')}`
             : `<span class="comp-avviso">nessun docente${candidati ? '' : ' disponibile'}</span>`) + `</li>`;
      }).join('');
      const conDispo = b.docenti.filter(d => d.ok.length).length;
      const senzaOre = b.docenti.filter(d => !ris.contenti.includes(d.codice));
      bozza = `<div class="alt-bozza"><h4>Bozza di copertura</h4>` +
        `<div class="row alt-sintesi"><span class="tag${ris.scoperte.length ? '' : ' ok'}">${ris.assegnazioni.length} di ${b.aperti.length} ore coperte</span>` +
        `<span class="tag">${ris.contenti.length} docenti con almeno un'ora (su ${conDispo} che potevano)</span><span class="tag">massimo ${ris.limite} ore a docente</span></div>` +
        `<ul class="comp-righe">${righeB}</ul>` +
        (senzaOre.length ? `<p class="hint">Senza ore: ${senzaOre.map(d => esc(nomeAlt(d.codice)) + (d.ok.length ? '' : ' (nessuna ora nell\'elenco)')).join(' · ')}.</p>` : '') +
        `<div class="row comp-azioni"><button type="button" class="btn primary" data-azione="alt-applica"${ris.assegnazioni.length ? '' : ' disabled'}>✓ Applica la bozza alle ore qui sopra</button>` +
        `<button type="button" class="btn" data-azione="alt-scarta">Scarta la bozza</button></div></div>`;
    }
    const aperto = alt.aperto === undefined ? true : alt.aperto;
    return `<details class="card comp-scheda comp-alt"${aperto ? ' open' : ''}>` +
      `<summary><h3>Alternativa: disponibilità dei docenti e bozza di copertura</h3></summary>` +
      `<p class="hint">Carica il file delle risposte del modulo: per ogni docente controllo che le ore indicate siano tra quelle in cui può stare (libero e non della classe, come nell'elenco qui sopra) ` +
      `e poi puoi simulare una prima copertura delle ${scoperte} ore ancora senza docente. I nomi restano solo su Drive.</p>` +
      `<div class="row comp-azioni"><label class="btn alt-file">📥 Carica le disponibilità (.xlsx, .ods, .csv)<input type="file" accept=".xlsx,.ods,.csv" data-alfile hidden></label>` +
      (alt.dispo.length ? `<span class="tag${buone === tutte.length ? ' ok' : ''}">${alt.dispo.length} docenti · ${buone} ore su ${tutte.length} nell'elenco</span>` : '') + `</div>` +
      // per i prossimi aggiornamenti: si rilegge direttamente il Foglio Google delle risposte del modulo, senza scaricare nulla
      `<div class="comp-campi alt-risposte"><label class="fl comp-campo comp-note">Foglio Google delle risposte del modulo (link): per aggiornare quando arrivano nuove risposte` +
      `<input type="text" data-alopz="risposte" value="${esc(alt.risposte)}" placeholder="https://docs.google.com/spreadsheets/d/…"></label>` +
      `<button type="button" class="btn" data-azione="alt-foglio">🔄 Aggiorna dal Foglio</button></div>` +
      (alt.dispo.length ? `<ol class="comp-righe">${righeDoc}</ol>` : '<p class="hint">Nessuna disponibilità caricata.</p>') +
      (alt.dispo.length ? `<h4>Criteri della simulazione</h4><p class="hint">Spunta quelli da usare e mettili in ordine: il primo conta più del secondo, e così via. Prima di tutto si copre il maggior numero di ore possibile.</p>` +
        `<ol class="alt-criteri">${criteri}</ol>` +
        `<div class="comp-campi alt-opzioni">` +
        `<label class="fl comp-campo">Massimo ore per docente<input type="number" min="1" data-alopz="limite" value="${esc(alt.limite)}" placeholder="automatico"></label>` +
        `<label class="fl comp-campo">Punteggio di graduatoria<select data-alopz="alta"><option value="1"${alt.alta ? ' selected' : ''}>più alto = precedenza</option><option value="0"${alt.alta ? '' : ' selected'}>più basso = precedenza</option></select></label>` +
        `<label class="row comp-campo comp-note" style="gap:6px"><input type="checkbox" data-alopz="salgono"${alt.salgono ? ' checked' : ''}> Le classi dell'anno scorso salgono di un anno (la 1A di allora è la 2A di oggi)</label></div>` +
        `<div class="row comp-azioni"><button type="button" class="btn primary" data-azione="alt-simula">▶ Simula la copertura</button></div>` + bozza : '') +
      `</details>`;
  }
  function cambioAlt(el) {
    const x = alt.dispo[Number(el.dataset.al)]; if (!x) return;
    x[el.dataset.campo] = el.dataset.campo === 'codice' ? el.value.trim().toUpperCase() : el.value.trim();
    alt.bozza = null; modificato = true; messaggio = '';
    disegna();
  }
  function cambioAltOpzione(el) {
    if (el.dataset.alopz === 'risposte') { alt.risposte = el.value.trim(); salvaPrefAlt(); return; }   // solo il link: niente da ridisegnare
    if (el.dataset.alcrit !== undefined) alt.criteri[Number(el.dataset.alcrit)].attivo = el.checked;
    else if (el.dataset.alopz === 'limite') alt.limite = el.value === '' ? '' : String(Math.max(1, parseInt(el.value, 10) || 1));
    else if (el.dataset.alopz === 'alta') alt.alta = el.value === '1';
    else if (el.dataset.alopz === 'salgono') alt.salgono = el.checked;
    alt.bozza = null; salvaPrefAlt(); disegna();
  }
  function clicAlt(azione, b) {
    const g = gruppi().find(eAlternativa);
    if (azione === 'alt-foglio') { altDaFoglio(); return; }   // si ridisegna da sola a lettura finita
    if (azione === 'alt-simula' && g) altSimula(g);
    else if (azione === 'alt-applica' && g) altApplica(g);
    else if (azione === 'alt-scarta') alt.bozza = null;
    else if (azione === 'alt-togli') { alt.dispo.splice(Number(b.dataset.i), 1); alt.bozza = null; modificato = true; }
    else if (azione === 'alt-su' || azione === 'alt-giu') {
      const i = Number(b.dataset.i), j = azione === 'alt-su' ? i - 1 : i + 1;
      if (j >= 0 && j < alt.criteri.length) { [alt.criteri[i], alt.criteri[j]] = [alt.criteri[j], alt.criteri[i]]; salvaPrefAlt(); alt.bozza = null; }
    }
    disegna();
  }

  /* ---------- azioni ---------- */
  function gruppoDaId(id) { return id === ALTRE ? null : gruppi()[Number(id)]; }

  function aggiungi(id) {
    const g = gruppoDaId(id);
    // se il gruppo ha docenti previsti, la nuova ora va al primo a cui ne mancano
    let codice = '';
    if (g && g.docenti) {
      const manca = g.docenti.find(x => righe.filter(r => gruppoDi(r.tipo) === g && r.codice === x.codice).length < x.ore);
      if (manca) codice = manca.codice;
    }
    righe.push({ codice, classe: '', giorno: '', ora: '', tipo: g ? g.tipo : 'Altro', aula: '', note: '', nome: '' });
    modificato = true; messaggio = '';
    disegna();
    // il cursore va sulla prima tendina della nuova ora
    const nuova = box.querySelector(`[data-i="${righe.length - 1}"][data-campo="${codice ? 'classe' : 'codice'}"]`);
    if (nuova) nuova.focus();
  }

  // Gruppo «nelle ore di» una materia (es. Alternativa in parallelo a Religione): una riga per ogni ora di quella materia
  // che non ha ancora la sua riga; il docente si sceglie dopo
  function aggiungiParallelo(id) {
    const g = gruppoDaId(id); if (!g || !g.nelleOreDi) return;
    let n = 0;
    lezioniDi(g.nelleOreDi).forEach(l => {
      const cl = nomeDi('classe', l.classe);
      const c = righe.some(r => gruppoDi(r.tipo) === g && semplice(r.classe) === semplice(cl) && r.giorno === l.giorno && Number(r.ora) === l.ora);
      if (!c) { righe.push({ codice: '', classe: cl, giorno: l.giorno, ora: l.ora, tipo: g.tipo, aula: '', note: '', nome: '' }); n++; }
    });
    if (n) modificato = true;
    messaggio = n ? `Aggiunte ${n} ore di ${g.nelleOreDi}: scegli il docente di ogni ora.` : `Tutte le ore di ${g.nelleOreDi} hanno già la loro riga.`;
    disegna();
  }

  /* ---------- riquadro «Gruppi e ore previste» (i dati di questa scuola, salvati nella scheda «Gruppi») ---------- */
  function gruppiHtml() {
    const riga = (g, i) => {
      const auto = g.nelleOreDi && (g.previste === '' || g.previste == null) ? ` (da sole: ${lezioniDi(g.nelleOreDi).length})` : '';
      const nomi = (g.docenti || []).map(x => nomeDoc(x.codice) + ' ' + x.ore).join(' · ');
      return `<li class="comp-riga"><div class="comp-campi comp-campi-gruppo">` +
        `<label class="fl comp-campo comp-codice">Gruppo (testo della colonna Tipo)<input type="text" data-g="${i}" data-campo="tipo" value="${esc(g.tipo)}"></label>` +
        `<label class="fl comp-campo">Ore previste${esc(auto)}<input type="number" min="0" data-g="${i}" data-campo="previste" value="${esc(g.previste)}" placeholder="${g.nelleOreDi ? 'da sole' : '—'}"></label>` +
        `<label class="fl comp-campo">Nelle ore di (materia)<input type="text" data-g="${i}" data-campo="nelleOreDi" value="${esc(g.nelleOreDi)}" placeholder="es. Religione"></label>` +
        `<label class="fl comp-campo comp-note">Docenti previsti (codice:ore)<input type="text" data-g="${i}" data-campo="docenti" value="${esc(scriviDocenti(g.docenti))}" placeholder="es. DOC08:1, DOC19:2"></label>` +
        `<label class="fl comp-campo comp-note">Spiegazione<input type="text" data-g="${i}" data-campo="spiegazione" value="${esc(g.spiegazione)}"></label>` +
        // gruppi senza classe (ricevimento, disponibilità): solo docente, giorno e ora, con il luogo (es. l'atrio)
        `<label class="row comp-campo" style="gap:6px"><input type="checkbox" data-g="${i}" data-campo="senzaClasse"${g.senzaClasse ? ' checked' : ''}> Senza classe</label>` +
        (g.senzaClasse ? `<label class="fl comp-campo comp-note">Luogo (se non c'è l'aula)<input type="text" data-g="${i}" data-campo="luogo" value="${esc(g.luogo || '')}" placeholder="es. Atrio – accoglienza dei genitori"></label>` : '') +
        `<button type="button" class="iconbtn" data-azione="togli-gruppo" data-g="${i}" title="Togli il gruppo" aria-label="Togli il gruppo ${esc(g.tipo)}">✕</button>` +
        `</div>${nomi ? `<p class="hint">${esc(nomi)}</p>` : ''}</li>`;
    };
    const aperto = gruppiAperti === null ? !gruppiDalFoglio : gruppiAperti;
    return `<details class="card comp-scheda comp-gruppi"${aperto ? ' open' : ''}>` +
      `<summary><h3>Gruppi e ore previste di questa scuola</h3></summary>` +
      `<p class="hint">Cambiano da scuola a scuola (numero di classi, cattedre di potenziamento, ore eccedenti…): si salvano nella scheda «Gruppi» del Foglio. ` +
      `Con «Nelle ore di» (es. Religione) le ore previste si contano da sole nell'orario.</p>` +
      `<ol class="comp-righe">${gruppi().map(riga).join('')}</ol>` +
      `<div class="row comp-azioni"><button type="button" class="btn" data-azione="aggiungi-gruppo">+ Aggiungi un gruppo</button></div></details>`;
  }

  function cambioGruppo(el) {
    const g = gruppi()[Number(el.dataset.g)]; if (!g) return;
    const campo = el.dataset.campo, v = el.value.trim();
    if (campo === 'tipo') {
      if (!v) return;
      righe.forEach(r => { if (gruppoDi(r.tipo) === g) r.tipo = v; });   // le ore del gruppo seguono il nuovo nome
      g.tipo = v;
    } else if (campo === 'docenti') g.docenti = leggiDocenti(v);
    else if (campo === 'previste') g.previste = v === '' ? '' : String(Math.max(0, parseInt(v, 10) || 0));
    else if (campo === 'senzaClasse') g.senzaClasse = el.checked;
    else g[campo] = v;
    modificato = true; messaggio = '';
    disegna();
  }

  function clic(e) {
    const b = e.target.closest('[data-azione]'); if (!b || b.disabled) return;
    const azione = b.dataset.azione;
    if (azione.startsWith('alt-')) { clicAlt(azione, b); return; }
    if (azione === 'collega') carica();   // il tocco permette a Google di aprire la finestra del permesso
    else if (azione === 'salva') salva();
    else if (azione === 'ricarica') {
      if (modificato && !confirm('Annullare le modifiche non salvate e rileggere il Foglio?')) return;
      carica();
    } else if (azione === 'aggiungi') aggiungi(b.dataset.gruppo);
    else if (azione === 'parallelo') aggiungiParallelo(b.dataset.gruppo);
    else if (azione === 'prepara-sostegno') { sostDaCreare = true; modificato = true; messaggio = 'Premi «Salva sul Foglio» per creare le schede del sostegno.'; disegna(); }
    else if (azione === 'aggiungi-gruppo') {
      gruppi().push({ tipo: 'Nuovo gruppo', previste: '', docenti: [], nelleOreDi: '', spiegazione: '', altriNomi: [], senzaClasse: false, luogo: '' });
      gruppiAperti = true; modificato = true; messaggio = ''; disegna();
    } else if (azione === 'togli-gruppo') {
      const g = gruppi()[Number(b.dataset.g)]; if (!g) return;
      const n = righe.filter(r => gruppoDi(r.tipo) === g).length;
      if (n && !confirm('Il gruppo ha ' + n + ' ore: restano, ma passano in «Altre compresenze». Togliere il gruppo?')) return;
      gruppi().splice(Number(b.dataset.g), 1);
      modificato = true; messaggio = ''; disegna();
    } else if (azione === 'togli') {
      righe.splice(Number(b.dataset.i), 1);
      modificato = true; messaggio = 'Ora tolta (si toglie dal Foglio quando salvi).';
      disegna();
    }
  }

  function cambio(e) {
    const el = e.target;
    if (el.dataset.alfile !== undefined) { const f = el.files && el.files[0]; el.value = ''; if (f) altImporta(f); return; }
    if (el.dataset.al !== undefined && el.dataset.campo) { cambioAlt(el); return; }
    if (el.dataset.alcrit !== undefined || el.dataset.alopz !== undefined) { cambioAltOpzione(el); return; }
    if (el.dataset.g !== undefined && el.dataset.campo) { cambioGruppo(el); return; }
    if (el.dataset.sc !== undefined && el.dataset.campo) { cambioSostegno(el); return; }
    if (el.dataset.i === undefined || !el.dataset.campo) return;
    const r = righe[Number(el.dataset.i)]; if (!r) return;
    r[el.dataset.campo] = el.dataset.campo === 'ora' ? (parseInt(el.value, 10) || '') : el.value.trim();
    modificato = true; messaggio = '';
    disegna();
  }

  /*
    Disegna la scheda nell'elemento indicato (la chiama Orario Facile quando si apre la scheda «Compresenze»).
    La prima volta, se il permesso di Google c'è già si legge subito il Foglio; altrimenti compare il tasto
    «Collega a Google» (il browser apre la finestra di Google solo dopo un tocco).
  */
  function monta(el, contesto) {
    ctx = contesto;
    if (box !== el) {
      box = el;
      box.addEventListener('click', clic);
      box.addEventListener('change', cambio);
      // il riquadro dei gruppi resta aperto o chiuso anche quando la scheda si ridisegna («toggle» non risale: si ascolta in cattura)
      box.addEventListener('toggle', e => {
        if (!e.target.classList) return;
        if (e.target.classList.contains('comp-gruppi')) gruppiAperti = e.target.open;
        else if (e.target.classList.contains('comp-alt')) alt.aperto = e.target.open;
      }, true);
    }
    if (typeof Compresenze === 'undefined' || typeof NomiDocenti === 'undefined') {
      box.innerHTML = '<p class="hint">La scheda non è disponibile: mancano i file app/js/compresenze.js o app/js/nomi.js.</p>'; return;
    }
    if (stato === 'collega' && NomiDocenti.gettoneDisponibile(permessi())) { carica(); return; }
    // già caricata: si ridisegna (per esempio con i nomi appena caricati), ma non mentre si scrive in un campo
    const a = document.activeElement;
    if (a && box.contains(a) && /^(INPUT|SELECT)$/.test(a.tagName)) return;
    disegna();
  }

  // Ci sono modifiche non salvate (Orario Facile può chiedere conferma prima di chiudere la pagina)
  const daSalvare = () => modificato;

  // Le ore già lette dal Foglio (per l'«Orario di sintesi», sintesi.js): null se la scheda non ha ancora letto il Foglio
  const oreCaricate = () => stato === 'pronto' ? { righe: righe.filter(completa), sostegno: (griglia || []).slice() } : null;

  return { monta, daSalvare, oreCaricate };
})();
