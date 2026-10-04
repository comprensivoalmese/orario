/*
  autorizzazioni.js – CHI PUÒ FARE COSA, in un unico elenco: la scheda «Autorizzazioni» del Foglio Database
  (CONFIG.fileDatabaseOrario, oppure CONFIG.fileAutorizzazioni se si vuole un file a parte).

  Una riga per persona: Cognome, Nome, email (colonna «Email», «Utente» o «Account») e una colonna per ogni autorizzazione:
  - «Orario Facile»: può aprire Orario Facile (preparare l'orario, compresenze…) e nell'app vede «Passa a Orario Facile»;
  - «Sostituzioni»: può fare le sostituzioni e i cambi d'aula (nell'app «Sostituzioni smart» e «Cambi d'aula»);
  - «40 ore»: vede la scheda «40+40» di Orario Facile (attività funzionali dei docenti, js/quaranta-ore.js).
  Nelle colonne va SI (oppure X, ✓, 1): vuoto o NO = non autorizzato. Le colonne si trovano dal titolo.

  Finché la scheda non esiste (passaggio dal sistema di prima) valgono le regole vecchie:
  Orario Facile = i codici di CONFIG.editori (ruoli.js), Sostituzioni = il foglio «Autorizzazioni» del file delle
  sostituzioni (sostituzioni/js/registro-drive.js). Quando la scheda c'è, conta solo lei.

  Il foglio si legge con il permesso Google di chi ha fatto l'accesso (lo stesso dei nomi veri, vedi nomi.js).
  Scelta della scuola (27/09/2026): un FILE A PARTE (CONFIG.fileAutorizzazioni), condiviso in lettura SOLO con le persone
  autorizzate e in modifica solo con chi gestisce l'app. Chi non può aprire il file non ha nessuna autorizzazione
  (anche se era abilitato con le regole di prima); chi può aprirlo ha quelle con SI nella sua riga.
  È un controllo fatto nel browser (il sito è pubblico): serve a mostrare a ciascuno solo quello che gli compete.
  La vera protezione restano i permessi di Google Drive (chi può modificare i Fogli) e di GitHub.
*/
const Autorizzazioni = (() => {
  const SCHEDA = 'Autorizzazioni';
  const TITOLI = ['Nome', 'Cognome', 'Email', 'Orario Facile', 'Sostituzioni', '40 ore', 'Note'];
  const semplice = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9@.]/g, '');
  const si = v => /^(si|sì|s|x|✓|✔|1|true|vero|yes)$/i.test(String(v == null ? '' : v).trim());
  const file = () => (typeof CONFIG !== 'undefined' && (CONFIG.fileAutorizzazioni || CONFIG.fileDatabaseOrario)) || '';
  const url = percorso => 'https://sheets.googleapis.com/v4/spreadsheets/' + encodeURIComponent(file()) + percorso;
  const permesso = () => [NomiDocenti.PERMESSO_DRIVE];

  let letta = null;   // { righe: [...], esiste: true/false } l'ultima lettura della scheda (solo in memoria)

  // Legge la scheda «Autorizzazioni». esiste = false se la scheda non c'è (si usano le regole di prima)
  // (in un file SOLO per le autorizzazioni va bene anche la prima scheda, qualunque nome abbia, se ha la colonna Email)
  const fileDedicato = () => !!CONFIG.fileAutorizzazioni && CONFIG.fileAutorizzazioni !== CONFIG.fileNomiDocenti && CONFIG.fileAutorizzazioni !== CONFIG.fileDatabaseOrario;
  async function leggi(t) {
    const prendi = zona => fetch(url('/values/' + encodeURIComponent(zona)), { cache: 'no-cache', headers: { Authorization: 'Bearer ' + t } });
    let r = await prendi(`'${SCHEDA}'!A1:Z500`);
    if (r.status === 400 && fileDedicato()) {
      r = await prendi('A1:Z500');   // senza nome = la prima scheda del file
      if (r.ok) {
        const righe = (await r.json()).values || [];
        // il file è «compilato» se c'è almeno un indirizzo email (in qualsiasi colonna)
        return righe.some(x => x.some(c => EMAIL.test(String(c || '')))) ? { esiste: true, righe } : { esiste: false, righe: [] };
      }
    }
    if (r.status === 400) return { esiste: false, righe: [] };          // scheda assente
    // 403/404: questo account non può aprire il file = nessuna autorizzazione (vedi di)
    if (!r.ok) throw Object.assign(new Error('errore ' + r.status), { stato: r.status });
    return { esiste: true, righe: (await r.json()).values || [] };
  }

  const EMAIL = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;
  // titolo della colonna delle email: «Email», «Mail», «Utente», «Account»…
  const titoloEmail = x => x.includes('mail') || x.includes('utente') || x.includes('account');
  // Dalla tabella alla persona con questa email: { orarioFacile, sostituzioni, nome } (null se non c'è)
  function cerca(righe, email) {
    const mia = semplice(email);
    // la riga dei titoli: quella con «Orario…» o «Sostitu…» (o con il titolo dell'email), altrimenti la prima
    const intest = (righe.find(r => r.some(c => { const s = semplice(c); return s.includes('orario') || s.includes('sostitu') || titoloEmail(s); })) || righe[0] || []).map(semplice);
    const col = f => intest.findIndex(f);
    const cMail = col(titoloEmail), cOF = col(x => x.includes('orario')), cSost = col(x => x.includes('sostitu')), c40 = col(x => x.includes('40'));
    const cNome = col(x => x.includes('nome') && !x.includes('cognome')), cCognome = col(x => x.includes('cognome'));
    const emailDentro = c => (String(c || '').toLowerCase().match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/g) || []).map(semplice);
    const riga = righe.find(r => (cMail >= 0 ? emailDentro(r[cMail]) : r.flatMap(emailDentro)).includes(mia));
    if (!riga) return null;
    return {
      orarioFacile: cOF >= 0 && si(riga[cOF]),
      sostituzioni: cSost >= 0 && si(riga[cSost]),
      quarantaOre: c40 >= 0 && si(riga[c40]),
      nome: [cNome >= 0 ? riga[cNome] : '', cCognome >= 0 ? riga[cCognome] : ''].filter(Boolean).join(' ').trim()
    };
  }

  /*
    Le autorizzazioni di chi ha fatto l'accesso: { orarioFacile, sostituzioni, nome, fonte }
    fonte: 'foglio' (scheda Autorizzazioni), 'config' (regole di prima), 'attesa' (manca ancora il permesso di Google).
    chiedi = true: se manca il permesso di Google lo chiede (solo dopo un tocco, altrimenti il browser blocca la finestra).
  */
  async function di(email, chiedi) {
    const nessuna = { orarioFacile: false, sostituzioni: false, quarantaOre: false, nome: '' };
    if (!email) return Object.assign(nessuna, { fonte: 'config' });
    if (typeof NomiDocenti === 'undefined' || !file() || !CONFIG.googleClientId) return vecchie(email);
    let t = NomiDocenti.gettoneDisponibile(permesso());
    if (!t && chiedi) { try { t = await NomiDocenti.gettone(permesso(), email); } catch (e) { t = null; } }
    if (!t) return Object.assign(nessuna, { fonte: 'attesa' });
    try { letta = await leggi(t); }
    catch (e) {
      // il Foglio non si apre con questo account: nessuna autorizzazione (chi deve lavorare deve poterlo leggere)
      if (e.stato === 403 || e.stato === 404) return Object.assign(nessuna, { fonte: 'foglio' });
      return vecchie(email);   // senza rete: le regole di prima
    }
    if (!letta.esiste) return vecchie(email);
    return Object.assign(nessuna, cerca(letta.righe, email) || {}, { fonte: 'foglio' });
  }

  // Le regole di prima (finché non c'è la scheda): Orario Facile = CONFIG.editori, Sostituzioni = foglio del file sostituzioni
  async function vecchie(email) {
    const of = typeof Ruoli !== 'undefined' ? await Ruoli.puoModificare(email) : false;
    let sost = of;
    if (typeof RegistroDrive !== 'undefined' && RegistroDrive.configurato && RegistroDrive.configurato() && RegistroDrive.pronto()) {
      try { sost = (await RegistroDrive.abilitazioneVecchia(email)).abilitato; } catch (e) { sost = of; }
    }
    return { orarioFacile: of, sostituzioni: sost, quarantaOre: false, nome: '', fonte: 'config' };
  }

  // Vero se la scheda «Autorizzazioni» esiste (dopo una lettura); null = non ancora letta
  const esiste = () => letta ? letta.esiste : null;

  /*
    Crea la scheda «Autorizzazioni» nel Foglio Database (tasto in Orario Facile, scheda Esporta), SPOSTANDOCI l'elenco di
    prima: le persone del foglio «Autorizzazioni» del file delle sostituzioni (con SI in «Sostituzioni») e chi la crea
    (con SI in tutte e due le colonne, così non resta chiuso fuori). Poi le colonne si completano a mano nel Foglio.
    Restituisce il numero di persone scritte. Serve il permesso di modificare il Foglio Database.
  */
  async function crea(email) {
    const SCRIVERE = 'https://www.googleapis.com/auth/spreadsheets';
    const t = await NomiDocenti.gettone([NomiDocenti.PERMESSO_DRIVE, SCRIVERE], email);
    const chiama = async (base, percorso, opzioni) => {
      const r = await fetch(base + percorso, Object.assign({ headers: { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' } }, opzioni || {}));
      if (!r.ok) throw Object.assign(new Error(r.status === 403 ? 'il tuo account non può modificare il Foglio Database' : 'errore ' + r.status + ' da Google'), { stato: r.status });
      return r.json();
    };
    const baseDb = url('');
    const info = await chiama(baseDb, '?fields=sheets.properties(title,index,sheetId)');
    if ((info.sheets || []).some(s => s.properties.title === SCHEDA)) throw new Error('la scheda «Autorizzazioni» c\'è già: completala direttamente nel Foglio');
    // file a parte: si usa la prima scheda (se è già compilata non si tocca niente)
    const prima = fileDedicato() ? (info.sheets || []).map(s => s.properties).sort((a, b) => a.index - b.index)[0] : null;
    if (prima) {
      const g = await chiama(baseDb, '/values/' + encodeURIComponent('A1:Z5'));
      if ((g.values || []).some(r => r.some(c => EMAIL.test(String(c || '')) || titoloEmail(semplice(c))))) throw new Error('il file delle autorizzazioni è già compilato: completalo direttamente nel Foglio');
    }
    // l'elenco di prima, dal file delle sostituzioni (se si riesce a leggerlo)
    const persone = [];
    const aggiungi = (nome, cognome, mail, of, sost) => {
      const k = semplice(mail); if (!k) return;
      const g = persone.find(p => semplice(p[2]) === k);
      if (g) { if (of) g[3] = 'SI'; if (sost) g[4] = 'SI'; return; }
      persone.push([nome || '', cognome || '', mail, of ? 'SI' : '', sost ? 'SI' : '', '', '']);
    };
    if (CONFIG.fileSostituzioni) {
      try {
        const baseS = 'https://sheets.googleapis.com/v4/spreadsheets/' + encodeURIComponent(CONFIG.fileSostituzioni);
        const fs = await chiama(baseS, '?fields=sheets.properties(title)');
        const f = (fs.sheets || []).map(s => s.properties.title).find(x => /^(autorizza|abilita)/i.test(semplice(x)));
        if (f) {
          const righe = (await chiama(baseS, '/values/' + encodeURIComponent(`'${f.replace(/'/g, "''")}'`))).values || [];
          const intest = (righe.find(r => r.some(c => semplice(c).includes('mail'))) || []).map(semplice);
          const cN = intest.findIndex(x => x.includes('nome') && !x.includes('cognome')), cC = intest.findIndex(x => x.includes('cognome'));
          righe.forEach(r => {
            const mail = (r.map(c => String(c || '')).join(' ').match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i) || [])[0];
            if (mail) aggiungi(cN >= 0 ? r[cN] : '', cC >= 0 ? r[cC] : '', mail.toLowerCase(), false, true);
          });
        }
      } catch (e) { /* file delle sostituzioni non leggibile: si parte da chi crea la scheda */ }
    }
    aggiungi('', '', String(email).toLowerCase(), true, true);
    // nel file a parte si rinomina la prima scheda, altrimenti se ne aggiunge una in fondo
    const richiesta = prima ? { updateSheetProperties: { properties: { sheetId: prima.sheetId, title: SCHEDA }, fields: 'title' } }
      : { addSheet: { properties: { title: SCHEDA, index: (info.sheets || []).length } } };
    await chiama(baseDb, ':batchUpdate', { method: 'POST', body: JSON.stringify({ requests: [richiesta] }) });
    const valori = [TITOLI].concat(persone);
    await chiama(baseDb, '/values/' + encodeURIComponent(`'${SCHEDA}'!A1:G${valori.length}`) + '?valueInputOption=RAW', { method: 'PUT', body: JSON.stringify({ values: valori }) });
    letta = null;
    return persone.length;
  }

  return { di, esiste, cerca, crea, SCHEDA, TITOLI, si, file };
})();
