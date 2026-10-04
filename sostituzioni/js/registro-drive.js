/*
  registro-drive.js – il Foglio Google delle sostituzioni (ID in app/js/config.js, campo "fileSostituzioni").

  Il foglio ha due fogli (schede in basso):
  - "Autorizzazioni" (va bene anche "Abilitazioni"): nomi ed email di chi può fare le sostituzioni.
    L'email si cerca in qualsiasi cella; nome e cognome si prendono dalle colonne con quei titoli.
  - "Cambi aula": una riga per ogni cambio d'aula (se il foglio non c'è, l'app lo crea da sola).
  - "Recuperi": una riga per ogni assenza «a recupero» con le ore già tolte nel foglio del conteggio (anche questo
    lo crea l'app). Serve a chi annulla l'assenza da un ALTRO dispositivo: legge qui quante ore restituire.
    Sta qui e non nel file pubblicato perché il recupero è un dato personale (il file pubblicato lo leggono tutti).
  - "Sostituzioni": qui l'app scrive una riga per ogni sostituzione assegnata
    (e la cancella se la sostituzione viene annullata). Se il foglio è vuoto, l'app scrive
    prima la riga di intestazione; se c'è già, riempie le colonne con lo stesso nome.

  La vera protezione la fa Google: chi non ha il permesso di aprire il file non può leggerlo,
  e chi non ha il permesso di modificarlo non può scriverci.
  Usa i permessi di Google di app/js/nomi.js (NomiDocenti.gettone), che restano solo in memoria.
*/
const RegistroDrive = (() => {
  const API = 'https://sheets.googleapis.com/v4/spreadsheets/';
  const PERMESSO_FOGLI = 'https://www.googleapis.com/auth/spreadsheets';
  // Nomi accettati per i due fogli (senza badare a maiuscole, spazi e accenti)
  const FOGLIO_AUTORIZZAZIONI = ['autorizzazioni', 'abilitazioni', 'autorizzati', 'abilitati'];
  /*
    I registri che l'app scrive nel file, uno per foglio (scheda):
    - nomi: i nomi accettati per il foglio (senza badare a maiuscole, spazi e accenti)
    - colonne: l'intestazione che l'app scrive se il foglio è vuoto
    - nuovo: se il foglio non c'è, l'app lo crea con questo nome (null = errore)
  */
  const REGISTRI = {
    sostituzioni: {
      nomi: ['sostituzioni', 'registro', 'registrosostituzioni'],
      colonne: ['Data', 'Giorno', 'Ora', 'Classe', 'Aula', 'Materia', 'Docente assente', 'Docente sostituto', 'Inserita da', 'Inserita il', 'ID'],
      nuovo: null
    },
    cambi: {
      nomi: ['cambiaula', 'cambidaula', 'cambiaule', 'cambi'],
      colonne: ['Data', 'Giorno', 'Ora', 'Classe', 'Materia', 'Docente', 'Aula prevista', 'Nuova aula', 'Motivo', 'Inserito da', 'Inserito il', 'ID'],
      nuovo: 'Cambi aula'
    },
    recuperi: {
      nomi: ['recuperi', 'recupero', 'orerecupero'],
      colonne: ['Data', 'Giorno', 'Docente', 'Ore di recupero', 'Inserita da', 'Inserita il', 'ID'],
      nuovo: 'Recuperi'
    }
  };

  const permessi = () => [NomiDocenti.PERMESSO_DRIVE, PERMESSO_FOGLI];
  const id = () => (typeof CONFIG !== 'undefined' && CONFIG.fileSostituzioni) || '';
  const configurato = () => !!id() && typeof NomiDocenti !== 'undefined';
  // Vero se c'è già il permesso di Google in memoria (si può controllare senza aprire finestre)
  const pronto = () => configurato() && !!NomiDocenti.gettoneDisponibile(permessi());
  // "Docente assente" -> "docenteassente": per confrontare le intestazioni senza badare a spazi e maiuscole
  const semplice = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9@.]/g, '');
  const tra = nome => `'${nome.replace(/'/g, "''")}'`;

  function spiega(stato, testo) {
    if (/has not been used|is disabled|accessNotConfigured|SERVICE_DISABLED/i.test(testo))
      return 'nel progetto Google Cloud va attivata la "Google Sheets API"';
    if (stato === 404) return 'foglio delle sostituzioni non trovato, oppure il tuo account non può aprirlo';
    if (stato === 403) return 'il tuo account non ha il permesso su questo foglio delle sostituzioni';
    if (stato === 401) return 'il permesso di Google è scaduto: riprova';
    return 'errore ' + stato + ' da Google';
  }

  async function chiama(percorso, opzioni) {
    const o = opzioni || {};
    const t = await NomiDocenti.gettone(permessi(), o.email);
    const r = await fetch(API + encodeURIComponent(id()) + percorso, {
      method: o.metodo || 'GET',
      headers: Object.assign({ Authorization: 'Bearer ' + t }, o.corpo ? { 'Content-Type': 'application/json' } : {}),
      body: o.corpo ? JSON.stringify(o.corpo) : undefined
    });
    const testo = await r.text();
    if (!r.ok) { const e = new Error(spiega(r.status, testo)); e.stato = r.status; throw e; }
    return testo ? JSON.parse(testo) : {};
  }

  // I fogli (schede) del file: [{ titolo, idFoglio }]
  let fogliRicordati = null;
  async function fogli(email) {
    if (!fogliRicordati) {
      const info = await chiama('?fields=sheets.properties(title,sheetId)', { email });
      fogliRicordati = info.sheets.map(s => ({ titolo: s.properties.title, idFoglio: s.properties.sheetId }));
    }
    return fogliRicordati;
  }
  // Trova il foglio con uno dei nomi accettati. Se non c'è: lo crea con il nome "nuovo" (se indicato),
  // altrimenti l'errore elenca i fogli che ci sono davvero
  async function trova(nomi, email, nuovo) {
    const tutti = await fogli(email);
    const f = tutti.find(x => nomi.includes(semplice(x.titolo)));
    if (!f && nuovo) {
      const r = await chiama(':batchUpdate', { metodo: 'POST', email, corpo: { requests: [{ addSheet: { properties: { title: nuovo } } }] } });
      const p = r.replies[0].addSheet.properties;
      const creato = { titolo: p.title, idFoglio: p.sheetId };
      tutti.push(creato);
      return creato;
    }
    if (!f) {
      const primo = nomi[0].charAt(0).toUpperCase() + nomi[0].slice(1);
      throw new Error(`nel file delle sostituzioni manca il foglio "${primo}" (ci sono: ${tutti.map(x => '«' + x.titolo + '»').join(', ')})`);
    }
    return f;
  }

  /*
    Chi può fare le sostituzioni. Dal 27/09/2026 lo decide la colonna «Sostituzioni» della scheda «Autorizzazioni» del
    Foglio Database (app/js/autorizzazioni.js); finché quella scheda non c'è, vale il foglio «Autorizzazioni» di questo file
    (abilitazioneVecchia, qui sotto). Restituisce { abilitato: true/false, nome } oppure lancia un errore con la spiegazione.
  */
  async function abilitazione(email) {
    if (typeof Autorizzazioni !== 'undefined') {
      const a = await Autorizzazioni.di(email, true);
      if (a.fonte === 'foglio') return { abilitato: a.sostituzioni, nome: a.nome, motivo: a.sostituzioni ? '' : 'nella scheda Autorizzazioni del Foglio Database non hai l\'autorizzazione «Sostituzioni»' };
    }
    return abilitazioneVecchia(email);
  }

  /*
    Il controllo di prima: l'email è nel foglio "Autorizzazioni" di questo file?
    Se l'account non può aprire il file (403/404), vuol dire che non è abilitato.
  */
  async function abilitazioneVecchia(email) {
    const mia = semplice(email);
    if (!mia) return { abilitato: false, nome: '' };
    let righe;
    try {
      const f = await trova(FOGLIO_AUTORIZZAZIONI, email);
      righe = (await chiama('/values/' + encodeURIComponent(tra(f.titolo)), { email })).values || [];
    } catch (e) {
      if (e.stato === 403 || e.stato === 404) return { abilitato: false, nome: '', motivo: 'il tuo account non può aprire il foglio delle autorizzazioni' };
      throw e;
    }
    // L'email si cerca in QUALSIASI cella (così va bene anche se la colonna ha un altro titolo
    // o se sopra l'intestazione c'è una riga con un titolo)
    // (una cella può contenere anche altro testo, es. "Mario Rossi <mario.rossi@…>": si guardano le email dentro)
    const emailDentro = c => (String(c || '').toLowerCase().match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/g) || []).map(semplice);
    const riga = righe.find(r => r.some(c => emailDentro(c).includes(mia)));
    if (!riga) return { abilitato: false, nome: '' };
    // Per il nome: la riga di intestazione è la prima che contiene "mail", altrimenti la prima riga
    const intestazione = (righe.find(r => r.some(c => semplice(c).includes('mail'))) || righe[0] || []).map(semplice);
    // (attenzione: "cognome" contiene la parola "nome", quindi lo escludiamo)
    const cNome = intestazione.findIndex(x => (x.includes('nome') && !x.includes('cognome')) || x.includes('docente'));
    const cCognome = intestazione.findIndex(x => x.includes('cognome'));
    const nome = [cNome >= 0 ? riga[cNome] : '', cCognome >= 0 ? riga[cCognome] : '']
      .filter(Boolean).join(' ').trim();
    return { abilitato: true, nome };
  }

  // Intestazione di un foglio registro: se è vuota scrive quella dell'app. Restituisce l'elenco delle colonne
  async function intestazione(f, email, colonneApp) {
    const r = await chiama('/values/' + encodeURIComponent(tra(f.titolo) + '!1:1'), { email });
    const esistente = ((r.values || [])[0] || []).map(x => String(x || '').trim());
    if (esistente.some(Boolean)) return esistente;
    await chiama('/values/' + encodeURIComponent(tra(f.titolo) + '!A1') + '?valueInputOption=RAW',
      { metodo: 'PUT', corpo: { values: [colonneApp] }, email });
    return colonneApp.slice();
  }

  /*
    Aggiunge una riga a un registro: tipo 'sostituzioni' (foglio «Sostituzioni») oppure 'cambi' (foglio «Cambi aula»).
    dati = { Data, Giorno, Ora, Classe, …, ID }: ogni valore va nella colonna con lo stesso nome
    (senza badare a maiuscole e spazi).
  */
  async function aggiungi(dati, email, tipo) {
    const reg = REGISTRI[tipo || 'sostituzioni'];
    const f = await trova(reg.nomi, email, reg.nuovo);
    const colonne = await intestazione(f, email, reg.colonne);
    const perNome = new Map(Object.entries(dati).map(([k, v]) => [semplice(k), v]));
    const riga = colonne.map(c => { const v = perNome.get(semplice(c)); return v === undefined ? '' : String(v); });
    // Se qualche dato non ha una colonna con lo stesso nome, lo mettiamo in fondo (così non si perde)
    Object.entries(dati).forEach(([k, v]) => { if (!colonne.some(c => semplice(c) === semplice(k))) riga.push(k + ': ' + v); });
    await chiama('/values/' + encodeURIComponent(tra(f.titolo) + '!A1') + ':append?valueInputOption=RAW&insertDataOption=INSERT_ROWS',
      { metodo: 'POST', corpo: { values: [riga] }, email });
  }

  // Cancella da un registro (tipo come in aggiungi) la riga con questo ID (colonna "ID"). Restituisce true se l'ha trovata
  async function togli(idSostituzione, email, tipo) {
    const reg = REGISTRI[tipo || 'sostituzioni'];
    const f = await trova(reg.nomi, email, reg.nuovo);
    const righe = (await chiama('/values/' + encodeURIComponent(tra(f.titolo)), { email })).values || [];
    const cId = (righe[0] || []).findIndex(x => semplice(x) === 'id');
    if (cId < 0) return false;
    const n = righe.findIndex((r, i) => i > 0 && String(r[cId] || '') === String(idSostituzione));
    if (n < 0) return false;
    await chiama(':batchUpdate', {
      metodo: 'POST', email,
      corpo: { requests: [{ deleteDimension: { range: { sheetId: f.idFoglio, dimension: 'ROWS', startIndex: n, endIndex: n + 1 } } }] }
    });
    return true;
  }

  /*
    Legge da un registro (tipo come in aggiungi) la riga con questo ID: restituisce un oggetto
    { 'Data': …, 'Ore di recupero': …, … } con i titoli delle colonne, oppure null se la riga non c'è.
  */
  async function leggi(idVoce, email, tipo) {
    const reg = REGISTRI[tipo || 'sostituzioni'];
    const f = await trova(reg.nomi, email, reg.nuovo);
    const righe = (await chiama('/values/' + encodeURIComponent(tra(f.titolo)), { email })).values || [];
    const titoli = righe[0] || [];
    const cId = titoli.findIndex(x => semplice(x) === 'id');
    if (cId < 0) return null;
    const riga = righe.find((r, i) => i > 0 && String(r[cId] || '') === String(idVoce));
    if (!riga) return null;
    const o = {};
    titoli.forEach((t, i) => { o[String(t).trim()] = riga[i] === undefined ? '' : riga[i]; });
    return o;
  }

  // Tutte le righe di un registro come oggetti { 'Data': …, 'Docente sostituto': …, 'ID': … } (titoli delle colonne).
  // La usa l'importazione nello storico dei docenti (storico-sostituzioni.js): i nomi veri restano solo in memoria.
  async function tutte(email, tipo) {
    const reg = REGISTRI[tipo || 'sostituzioni'];
    const f = await trova(reg.nomi, email, reg.nuovo);
    const righe = (await chiama('/values/' + encodeURIComponent(tra(f.titolo)), { email })).values || [];
    const titoli = (righe[0] || []).map(t => String(t).trim());
    return righe.slice(1).map(r => { const o = {}; titoli.forEach((t, i) => { o[t] = r[i] === undefined ? '' : r[i]; }); return o; });
  }

  return { configurato, pronto, abilitazione, abilitazioneVecchia, aggiungi, togli, leggi, tutte, permessi };
})();
