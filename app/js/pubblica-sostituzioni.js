/*
  pubblica-sostituzioni.js – pubblica su Google Drive le assenze e le sostituzioni UNENDOLE a quelle già pubblicate.

  Il file pubblicato (CONFIG.fileSostituzioniPubblicate, lo legge l'app per tutti) è uno solo per la scuola, ma le
  sostituzioni si registrano su dispositivi diversi (il computer di Orario Facile, il telefono con «Sostituzioni smart»).
  Per non cancellare il lavoro degli altri, prima di scrivere si rilegge il file e si cambiano solo:
  - le assenze/sostituzioni registrate su QUESTO dispositivo (si aggiungono o si aggiornano);
  - quelle che questo dispositivo aveva pubblicato e che poi sono state annullate qui (si tolgono).
  Per sapere cosa aveva pubblicato questo dispositivo si ricordano solo gli ID (chiave "sostituzioni.pubblicateDaQui").
  Le sostituzioni di ALTRI dispositivi annullate da qui (tasto «✕ Annulla» nella tabella dell'app) vanno nell'elenco
  "annullate" del file: tutti le nascondono e il dispositivo che le aveva registrate le toglie dal suo registro.
  Allo stesso modo le assenze di ALTRI dispositivi tolte da qui vanno nell'elenco "assenzeAnnullate": tutti le nascondono
  e il dispositivo che le aveva registrate le toglie dalle sue assenze (e, se erano a recupero, si ricorda di restituire
  le ore nel foglio del conteggio: chiave "sostituzioni.daSistemare", ci pensa Sostituzioni.sistemaInSospeso).

  Nel file pubblicato vanno SOLO i dati che l'app mostra: giorno, ore, classe, codici dei docenti (niente permessi,
  niente nomi veri). Usa PubblicaDrive (pubblica-drive.js), Dati.leggiDrive (dati.js) e NomiDocenti (nomi.js).

  Pubblicazione automatica (app, per chi può modificare): avviaAutomatica() controlla ogni pochi secondi se le
  sostituzioni di questo dispositivo sono cambiate e, se il permesso di Google è già disponibile, pubblica da sola;
  altrimenti mostra una barra con il tasto «Pubblica ora» (Google vuole un tocco per aprire la sua finestra).
*/
const PubblicaSostituzioni = (() => {
  const CHIAVE_DA_QUI = 'sostituzioni.pubblicateDaQui';   // ID pubblicati da questo dispositivo
  const CHIAVE_FIRMA = 'sostituzioni.firmaPubblicata';     // "impronta" dei dati locali all'ultima pubblicazione
  const GIORNI_INDIETRO = 14;                              // si pubblicano le ultime due settimane e il futuro
  const PERMESSI = () => [NomiDocenti.PERMESSO_DRIVE, 'https://www.googleapis.com/auth/drive'];

  const leggiLocale = (k, d) => { try { const t = localStorage.getItem(k); return t ? JSON.parse(t) : d; } catch (e) { return d; } };
  const scriviLocale = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* ignorato */ } };
  const configurato = () => typeof CONFIG !== 'undefined' && !!CONFIG.fileSostituzioniPubblicate &&
    typeof PubblicaDrive !== 'undefined' && PubblicaDrive.configurato() && typeof Dati !== 'undefined';

  function daQuando() { const d = new Date(); d.setDate(d.getDate() - GIORNI_INDIETRO); return d.toISOString().slice(0, 10); }
  const recente = x => x && String(x.data || '') >= daQuando();

  // Le assenze e le sostituzioni di questo dispositivo, solo con i campi da pubblicare
  function locali() {
    return {
      assenze: leggiLocale('sostituzioni.assenze', []).filter(recente).map(a => ({ id: a.id, data: a.data, docente: a.docente, ore: a.ore })),
      // nelFoglio / nelRegistro: se l'ora è stata segnata nel foglio del conteggio e nel foglio «Sostituzioni»;
      // servono a chi annulla la sostituzione da un altro dispositivo (Sostituzioni.annullaVoce)
      // (le vigilanze di uno sciopero NON si pubblicano come sostituzioni: direbbero chi sciopera, vedi «scioperi» qui sotto)
      // spostato: il sostituto era in compresenza nella classe «da» (issue #7): si pubblica SOLO la classe lasciata,
      // mai chi resta con la classe (per esempio il sostegno: dato delicato, il file lo leggono anche gli studenti)
      registro: leggiLocale('sostituzioni.registro', []).filter(s => recente(s) && !s.sciopero)
        .map(s => Object.assign({ id: s.id, data: s.data, ora: s.ora, classe: s.classe, assente: s.assente, sostituto: s.sostituto,
          nelFoglio: !!s.nelFoglio, nelRegistro: !!s.nelRegistro, riportata: !!s.riportata },
          s.spostato && s.spostato.da ? { spostato: { da: s.spostato.da } } : {},
          // reindirizzato: docente liberato da un'uscita didattica (nessuna ora in più), serve allo storico (storico-sostituzioni.js)
          s.reindirizzato ? { reindirizzato: true } : {})),
      // cambi d'aula (sostituzioni/js/cambi-aula.js): senza il motivo, che è testo libero
      cambi: leggiLocale('sostituzioni.cambiAula', []).filter(recente)
        .map(c => ({ id: c.id, data: c.data, ora: c.ora, classe: c.classe, da: c.da, a: c.a, docente: c.docente })),
      // sostituzioni di altri dispositivi annullate da qui (tasto «✕ Annulla» nella tabella dell'app)
      annullate: leggiLocale('sostituzioni.annullate', []).filter(recente),
      // assenze di altri dispositivi tolte da qui: solo { id, data, docente } (niente recupero)
      assenzeAnnullate: leggiLocale('sostituzioni.assenzeAnnullate', []).filter(recente)
        .map(a => ({ id: a.id || '', data: a.data, docente: a.docente })),
      // uscite didattiche (sostituzioni/js/uscite.js): solo quali classi sono fuori e quando (niente descrizione)
      // (le simulazioni non ancora confermate restano sul dispositivo)
      // scioperi e assemblee confermati (sostituzioni/js/scioperi.js): SOLO gli effetti sulle classi (entrata posticipata,
      // uscita anticipata, vigilanza e chi vigila). Mai chi sciopera: è un dato sindacale.
      scioperi: leggiLocale('sostituzioni.scioperi', []).filter(e => recente(e) && e.confermato && e.esito)
        // (con nome della classe e codice DOC… di chi vigila: l'app li usa se il suo orario ha ID diversi, vedi supplenze.js)
        .map(e => ({ id: e.id, data: e.data, tipo: e.tipo, riduzione: e.esito.riduzione, classi: e.esito.classi.map(c => ({ classe: c.classe, nomeClasse: c.nomeClasse || '',
          nonEntra: !!c.nonEntra, entra: c.entra, esce: c.esce, vigilanza: (c.vigilanza || []).map(v => Object.assign({ ora: v.ora, docente: v.docente, codice: v.codice || '' },
            v.da ? { da: v.da, nomeDa: v.nomeDa || '' } : {})) })) })),
      uscite: leggiLocale('sostituzioni.uscite', []).filter(u => recente(u) && u.confermata !== false)
        .map(u => ({ id: u.id, data: u.data, classi: u.classi, ore: u.ore }))
    };
  }
  const firma = L => JSON.stringify(L);

  // Una stessa assenza/sostituzione senza ID (pubblicata con la versione vecchia) si riconosce da data, ora e classe
  const segnoA = a => 'A|' + a.data + '|' + a.docente;
  const segnoR = s => 'R|' + s.data + '|' + s.ora + '|' + s.classe;
  const segnoC = c => 'C|' + c.data + '|' + c.ora + '|' + c.classe;
  const segnoU = u => 'U|' + u.data + '|' + (u.classi || []).join(',');
  const segnoS = e => 'S|' + e.data;   // uno sciopero / assemblea per giorno

  /*
    Sostituzioni annullate: elenco di { id, data, ora, classe }. Una sostituzione è "colpita" se ha lo stesso ID
    (o, solo se l'annullata non ha ID, la stessa data, ora e classe): così una sostituzione NUOVA nella stessa ora
    (con un altro ID) non viene tolta per sbaglio.
  */
  function colpita(annullate) {
    const id = new Set(annullate.filter(t => t.id).map(t => t.id));
    const segni = new Set(annullate.filter(t => !t.id).map(segnoR));
    return s => (s.id && id.has(s.id)) || segni.has(segnoR(s));
  }

  // Assenze annullate: elenco di { id, data, docente }; come per le sostituzioni conta l'ID (se c'è)
  function assenzaColpita(assenzeAnnullate) {
    const id = new Set(assenzeAnnullate.filter(t => t.id).map(t => t.id));
    const segni = new Set(assenzeAnnullate.filter(t => !t.id).map(segnoA));
    return a => (a.id && id.has(a.id)) || segni.has(segnoA(a));
  }

  /*
    Toglie da QUESTO dispositivo le sostituzioni e le assenze annullate da qualcun altro. Restituisce quante voci ha tolto.
    - sostituzioni: si tolgono dal registro, senza togliere ore dal foglio del conteggio (l'ha già fatto chi le ha annullate);
    - assenze: si tolgono dalle assenze di qui. Se erano a recupero (ore tolte nel foglio da QUESTO dispositivo), le ore
      vanno restituite: se non l'ha già fatto chi le ha tolte, lo fa questo dispositivo appena può (coda
      "sostituzioni.daSistemare", vedi Sostituzioni.sistemaInSospeso). Lo stesso per le sostituzioni di quelle assenze
      che gli altri non potevano ancora vedere (non pubblicate): si tolgono e, se erano nel foglio, −1 al sostituto.
    Avvisa il motore delle sostituzioni, se è aperto in questa pagina, con un evento "storage" finto
    (quelli veri arrivano solo dalle altre schede).
  */
  function applicaAnnullate(annullate, assenzeAnnullate) {
    let tolte = 0;
    const coda = [];
    if (Array.isArray(annullate) && annullate.length) {
      const registro = leggiLocale('sostituzioni.registro', []);
      const colpisce = colpita(annullate);
      const resta = registro.filter(s => !colpisce(s));
      if (resta.length !== registro.length) {
        scriviLocale('sostituzioni.registro', resta);
        tolte += registro.length - resta.length;
      }
    }
    if (Array.isArray(assenzeAnnullate) && assenzeAnnullate.length) {
      const assenze = leggiLocale('sostituzioni.assenze', []);
      const colpisce = assenzaColpita(assenzeAnnullate);
      const via = assenze.filter(colpisce);
      if (via.length) {
        scriviLocale('sostituzioni.assenze', assenze.filter(a => !colpisce(a)));
        // recupero già segnato nel foglio: ore da restituire (conRiga = scritto anche nel foglio «Recuperi»)
        via.filter(a => a.permessoSegnate).forEach(a => coda.push({ tipo: 'recupero', chiave: 'R|' + a.id,
          id: a.id, data: a.data, docente: a.docente, ore: a.permessoSegnate, conRiga: !!a.rigaRecupero }));
        // le sostituzioni di quelle assenze ancora qui (le altre le ha già annullate chi ha tolto l'assenza)
        const registro = leggiLocale('sostituzioni.registro', []);
        const diVia = s => via.some(a => a.data === s.data && a.docente === s.assente);
        registro.filter(diVia).forEach(s => coda.push(Object.assign({ tipo: 'sostituzione', chiave: 'S|' + s.id }, s)));
        if (registro.some(diVia)) scriviLocale('sostituzioni.registro', registro.filter(s => !diVia(s)));
        tolte += via.length;
      }
    }
    if (coda.length) {
      const prima = leggiLocale('sostituzioni.daSistemare', []);
      const gia = new Set(prima.map(x => x.chiave));
      scriviLocale('sostituzioni.daSistemare', prima.concat(coda.filter(x => !gia.has(x.chiave))));
    }
    if (tolte) {
      try { window.dispatchEvent(new StorageEvent('storage', { key: 'sostituzioni.registro' })); } catch (e) { /* browser vecchio */ }
    }
    return tolte;
  }

  // Unisce due elenchi di annullate senza doppioni (tiene solo quelle recenti);
  // segno = come riconoscerle se non hanno l'ID (sostituzioni: data, ora, classe; assenze: data, docente)
  function unisciAnnullate(a, b, segno) {
    const visti = new Set();
    return a.concat(b).filter(t => {
      const k = t && (t.id || (segno || segnoR)(t));
      if (!t || !recente(t) || visti.has(k)) return false;
      visti.add(k);
      return true;
    });
  }

  /*
    Rilegge il file pubblicato, ci unisce i dati di questo dispositivo e lo riscrive.
    Restituisce { assenze, registro } = quante ce ne sono nel file pubblicato.
  */
  async function unisciEPubblica(email) {
    if (!configurato()) throw new Error('in config.js manca il file delle sostituzioni pubblicate o la cartella di Drive');
    await NomiDocenti.gettone(PERMESSI(), email);   // un solo permesso per leggere e scrivere
    // se il file non si riesce a leggere NON si pubblica: si rischierebbe di cancellare le sostituzioni degli altri
    let testo;
    try { testo = await Dati.leggiDrive(CONFIG.fileSostituzioniPubblicate); }
    catch (e) { throw new Error('non riesco a leggere le sostituzioni già pubblicate (' + (e && e.message ? e.message : e) + '): riprova tra poco'); }
    let remoto = { assenze: [], registro: [], cambi: [], annullate: [], uscite: [], scioperi: [], assenzeAnnullate: [] };
    try {
      const o = JSON.parse(testo || '{}');
      remoto = { assenze: Array.isArray(o.assenze) ? o.assenze : [], registro: Array.isArray(o.registro) ? o.registro : [],
        cambi: Array.isArray(o.cambi) ? o.cambi : [], annullate: Array.isArray(o.annullate) ? o.annullate : [],
        uscite: Array.isArray(o.uscite) ? o.uscite : [], scioperi: Array.isArray(o.scioperi) ? o.scioperi : [],
        assenzeAnnullate: Array.isArray(o.assenzeAnnullate) ? o.assenzeAnnullate : [] };
    } catch (e) { throw new Error('il file delle sostituzioni pubblicate non è leggibile: controllalo su Drive prima di pubblicare'); }
    // prima di unire: le sostituzioni annullate da altri spariscono anche dal registro di questo dispositivo,
    // altrimenti le ripubblicheremmo noi
    const annullate = unisciAnnullate(remoto.annullate, leggiLocale('sostituzioni.annullate', []));
    const assenzeAnnullate = unisciAnnullate(remoto.assenzeAnnullate, leggiLocale('sostituzioni.assenzeAnnullate', []), segnoA)
      .map(a => ({ id: a.id || '', data: a.data, docente: a.docente }));
    applicaAnnullate(annullate, assenzeAnnullate);
    const nonAnnullata = (colpisce => s => !colpisce(s))(colpita(annullate));
    const assenzaValida = (colpisce => a => !colpisce(a))(assenzaColpita(assenzeAnnullate));
    const L = locali();
    const idLocali = new Set(L.assenze.map(x => x.id).concat(L.registro.map(x => x.id), L.cambi.map(x => x.id), L.uscite.map(x => x.id), L.scioperi.map(x => x.id)));
    const primaDaQui = new Set(leggiLocale(CHIAVE_DA_QUI, []));
    const segniLocali = new Set(L.assenze.map(segnoA).concat(L.registro.map(segnoR), L.cambi.map(segnoC), L.uscite.map(segnoU), L.scioperi.map(segnoS)));
    // tengo quelle degli altri: non annullate qui, non rifatte qui, e non troppo vecchie
    const tieni = (x, segno) => recente(x) && !(x.id && (idLocali.has(x.id) || primaDaQui.has(x.id))) && !segniLocali.has(segno(x));
    const unito = {
      pubblicato: new Date().toISOString(),
      assenze: remoto.assenze.filter(x => tieni(x, segnoA)).concat(L.assenze).filter(assenzaValida),
      registro: remoto.registro.filter(x => tieni(x, segnoR)).concat(L.registro).filter(nonAnnullata),
      cambi: remoto.cambi.filter(x => tieni(x, segnoC)).concat(L.cambi),
      uscite: remoto.uscite.filter(x => tieni(x, segnoU)).concat(L.uscite),
      scioperi: remoto.scioperi.filter(x => tieni(x, segnoS)).concat(L.scioperi),
      annullate,
      assenzeAnnullate
    };
    await PubblicaDrive.pubblicaSostituzioni(JSON.stringify(unito), email);
    // il registro di tutto l'anno per «Le mie sostituzioni» (cartella dei soli docenti): in sottofondo, non blocca mai
    if (typeof StoricoSostituzioni !== 'undefined') StoricoSostituzioni.aggiorna(unito, daQuando(), email);
    scriviLocale(CHIAVE_DA_QUI, [...idLocali]);
    scriviLocale(CHIAVE_FIRMA, firma(L));
    return { assenze: unito.assenze.length, registro: unito.registro.length, cambi: unito.cambi.length };
  }

  /* ---------------- pubblicazione automatica (app) ---------------- */
  let automatica = null;   // { email, inCorso, timer, barra }
  function barra() {
    let b = document.getElementById('barraPubblica');
    if (!b) {
      b = document.createElement('div');
      b.id = 'barraPubblica'; b.className = 'barra-pubblica'; b.hidden = true;
      b.setAttribute('role', 'status'); b.setAttribute('aria-live', 'polite');
      b.innerHTML = '<span id="testoPubblica"></span> <button type="button" id="tastoPubblica">Pubblica ora</button>';
      document.body.append(b);
      b.querySelector('#tastoPubblica').addEventListener('click', () => pubblicaOra(true));
    }
    return b;
  }
  function mostra(testo, conTasto) {
    const b = barra();
    b.querySelector('#testoPubblica').textContent = testo;
    b.querySelector('#tastoPubblica').hidden = !conTasto;
    b.hidden = false;
    clearTimeout(b._nascondi);
    if (!conTasto) b._nascondi = setTimeout(() => { b.hidden = true; }, 4000);
  }
  async function pubblicaOra(dalTocco) {
    if (!automatica || automatica.inCorso) return;
    automatica.inCorso = true;
    mostra('⏳ Pubblico le sostituzioni…', false);
    try {
      const r = await unisciEPubblica(automatica.email);
      mostra(`✔ Pubblicato: lo vedono tutti (${r.registro} ${r.registro === 1 ? 'sostituzione' : 'sostituzioni'}, ${r.assenze} ${r.assenze === 1 ? 'assenza' : 'assenze'}, ${r.cambi} ${r.cambi === 1 ? 'cambio' : 'cambi'} d'aula).`, false);
    } catch (e) {
      automatica.pausaFino = Date.now() + 60000;   // se non è riuscita, riprovo da sola solo tra un minuto
      mostra('Sostituzioni non ancora pubblicate' + (dalTocco ? ': ' + (e && e.message ? e.message : e) : '') + '.', true);
    } finally { automatica.inCorso = false; }
  }
  function controlla() {
    if (!automatica || automatica.inCorso || Date.now() < (automatica.pausaFino || 0)) return;
    if (firma(locali()) === leggiLocale(CHIAVE_FIRMA, null)) return;   // niente di nuovo da pubblicare
    // c'è qualcosa di nuovo: aspetto qualche secondo (magari si sta assegnando un'altra ora), poi pubblico
    clearTimeout(automatica.timer);
    automatica.timer = setTimeout(() => {
      if (NomiDocenti.gettoneDisponibile(PERMESSI())) pubblicaOra(false);
      else mostra('Ci sono sostituzioni nuove da pubblicare.', true);   // serve un tocco per la finestra di Google
    }, 4000);
  }
  // Da chiamare dopo l'accesso, solo per chi può fare le sostituzioni
  function avviaAutomatica(email) {
    if (automatica || !configurato()) return;
    automatica = { email, inCorso: false, timer: null };
    // la prima volta su questo dispositivo: ciò che c'è adesso conta come "già visto", così non si pubblica da solo
    if (leggiLocale(CHIAVE_FIRMA, null) === null) scriviLocale(CHIAVE_FIRMA, firma(locali()));
    setInterval(controlla, 5000);
    window.addEventListener('storage', e => { if (e.key && e.key.startsWith('sostituzioni.')) controlla(); });
  }

  return { unisciEPubblica, avviaAutomatica, configurato, applicaAnnullate, colpita, assenzaColpita };
})();
