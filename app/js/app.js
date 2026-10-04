/*
  app.js – avvio dell'app, schermata iniziale, pulsanti, modalità monitor e aggiornamenti.

  SCHERMATA INIZIALE (scelta in base a chi apre l'app):
  1. Monitor di classe  -> l'orario di oggi della sua AULA (in DADA le aule sono fisse,
                           sono gli studenti a spostarsi), a caratteri grandi.
  2. Tutti gli altri (anche i docenti riconosciuti dall'email) -> l'orario di oggi di tutta la scuola:
                           ore in riga, classi in colonna, con i nomi dei docenti. Il proprio orario
                           si apre con «Il mio orario».
  Nel weekend o a lezioni finite si mostra il giorno di scuola successivo.
*/
(() => {
  const $ = sel => document.querySelector(sel);
  const $$ = sel => Array.from(document.querySelectorAll(sel));
  const CHIAVE_MONITOR = 'orariodada.monitor';
  const CHIAVE_NOMI = 'orariodada.nomi';     // '' = nomi veri automatici, 'negato:<email>:<data>' (vedi caricaNomiDaSoli)
  const CHIAVE_BREVE = 'orariodada.breve';   // di chi si è scelto di vedere la giornata in "In breve"
  const CHIAVE_INGRESSO = 'orariodada.ingresso'; // schermo all'ingresso: secondi della rotazione ('' = no)
  const USO_INGRESSO = '__ingresso';         // valore della voce "Schermo all'ingresso" nel menu
  const NOMI_GIORNI = ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato'];

  let D = null;             // dati dell'orario
  let utente = null;        // chi ha fatto l'accesso
  let mioDocente = null;    // il docente corrispondente all'utente (se c'è)
  let nomi = null;          // nomi veri dei docenti (Map codice → {cognome, nome}), solo in memoria
  let aulaMonitor = '';     // id dell'aula se questo dispositivo è un monitor di classe
  let secondiIngresso = 0;  // > 0 se questo dispositivo è lo schermo all'ingresso (viste a rotazione)
  let avvisoGiorno = null;  // { giorno, testo } es. "le lezioni di oggi sono finite"
  let ultimoMinuto = -1;
  let timerInattivita = null;
  let breveAperta = false;  // true quando si vede la vista "In breve" al posto della tabella
  let breveMio = false;     // true se la vista è stata aperta con «Il mio orario» (giornata del docente)
  let calendarioAperta = false;  // true quando si vede il calendario «Impegni» al posto della tabella (js/calendario.js)
  let smartAperta = false;  // true quando si vede la pagina «Sostituzioni smart» al posto della tabella
  let dataBreve = '';       // data scelta nella tendina "Giorno" di "In breve" ('' = oggi o il prossimo giorno di scuola)
  // pagina: solo per lo schermo all'ingresso, quali colonne mostrare (null = tutte)
  // modificate: caselle cambiate all'ultimo minuto, da evidenziare (vedi modifiche.js)
  // sostituzioni: assenze e sostituzioni della settimana, da evidenziare (vedi supplenze.js)
  // puoAnnullare: nella tabella compare «✕ Annulla» sulle sostituzioni (solo per chi può fare le sostituzioni)
  const stato = { colonne: 'classe', giorno: '', filtri: { classe: '', docente: '', aula: '' }, pagina: null, modificate: null, sostituzioni: null,
    puoAnnullare: false };

  const leggi = k => { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } };
  const scrivi = (k, v) => { try { v ? localStorage.setItem(k, v) : localStorage.removeItem(k); } catch (e) { /* ignorato */ } };
  const minuti = hhmm => { const [h, m] = String(hhmm).split(':').map(Number); return h * 60 + (m || 0); };
  const semplifica = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

  // Giorno e ora di scuola in questo momento (null se non è giorno/ora di lezione)
  function adesso() {
    const d = new Date(), giorno = NOMI_GIORNI[d.getDay()], m = d.getHours() * 60 + d.getMinutes();
    if (!D.giorni.includes(giorno)) return { giorno: null, ora: null, minuto: m };
    const ora = D.ore.find(o => minuti(o.inizio) <= m && m < minuti(o.fine));
    return { giorno, ora: ora ? ora.n : null, minuto: m };
  }

  // Oggi, oppure il prossimo giorno di scuola se oggi non c'è lezione o le lezioni sono finite
  function giornoIniziale() {
    const a = adesso(), oggi = new Date().getDay();
    if (a.giorno) {
      const ultima = Math.max(0, ...D.lezioni.filter(l => l.giorno === a.giorno).map(l => l.ora));
      const o = D.ore.find(x => x.n === ultima);
      if (o && a.minuto < minuti(o.fine)) return { giorno: a.giorno, testo: '' };
    }
    for (let i = 1; i <= 7; i++) {
      const g = NOMI_GIORNI[(oggi + i) % 7];
      if (D.giorni.includes(g)) {
        const quando = (i === 1 ? 'domani, ' : '') + g.toLowerCase();
        return { giorno: g, testo: a.giorno ? `Le lezioni di oggi sono finite: ecco l'orario di ${quando}.` : `Oggi non c'è scuola: ecco l'orario di ${quando}.` };
      }
    }
    return { giorno: D.giorni[0], testo: '' };
  }

  function schermataIniziale() {
    apriBreve(false);
    apriSmart(false);
    apriCalendario(false);
    const gi = giornoIniziale();
    stato.giorno = gi.giorno;
    avvisoGiorno = gi.testo ? gi : null;
    stato.filtri = { classe: '', docente: '', aula: '' };
    stato.pagina = null;
    // Schermo all'ingresso: parte la rotazione delle viste (ridisegna lei la pagina)
    if (secondiIngresso) { avviaRotazione(); return; }
    Ingresso.ferma();
    document.body.classList.remove('ingresso-in-pausa');
    // Tutti (anche i docenti riconosciuti dall'email) partono dall'orario di tutta la scuola, con i nomi dei docenti:
    // il proprio orario si apre con «Il mio orario». Solo i monitor di classe partono dalla loro aula.
    if (aulaMonitor) { stato.colonne = 'aula'; stato.filtri.aula = aulaMonitor; }
    else stato.colonne = 'classe';
    aggiorna();
    mostraOraCorrente();
  }

  /* ---------- schermo all'ingresso: viste a rotazione (vedi ingresso.js) ---------- */
  function avviaRotazione() {
    document.body.classList.remove('ingresso-in-pausa');
    Ingresso.avvia({
      secondi: secondiIngresso,
      calcolaPassi: () => {
        // A ogni giro ricontrolla il giorno (es. finite le lezioni si passa a domani)
        const gi = giornoIniziale();
        stato.giorno = gi.giorno;
        avvisoGiorno = gi.testo ? gi : null;
        return Ingresso.passi(D, stato.giorno, $('#contenuto').clientWidth - 32);
      },
      mostra: (passo, indice, quanti) => {
        stato.colonne = passo.colonne;
        stato.pagina = passo.pagina;
        aggiorna();
        Ingresso.indicatore($('#indicatoreIngresso'), passo, indice, quanti, secondiIngresso);
      }
    });
  }

  // Qualcuno tocca lo schermo: la rotazione si ferma e si può usare l'app normalmente;
  // dopo qualche minuto senza tocchi riparte da sola (vedi tocco)
  function pausaRotazione() {
    Ingresso.ferma();
    stato.pagina = null;
    document.body.classList.add('ingresso-in-pausa');
    aggiorna();
  }

  // Secondi della rotazione validi (da 5 a 600), altrimenti quelli di config.js
  function secondiValidi(valore) {
    const n = parseInt(valore, 10);
    return n >= 5 && n <= 600 ? n : (CONFIG.secondiRotazioneIngresso || 20);
  }

  // L'utente sceglie ogni quanti secondi cambiano le viste: se il numero va bene lo salva
  // e fa ripartire la rotazione, altrimenti spiega cosa scrivere e rimette il valore di prima
  function impostaSecondi(valore) {
    const n = Number(String(valore).replace(',', '.'));
    const esito = $('#esitoSecondi');
    if (!Number.isInteger(n) || n < 5 || n > 600) {
      esito.textContent = 'Scrivi un numero intero di secondi, da 5 a 600.';
      esito.classList.add('errore-secondi');
      $('#sceltaSecondi').value = String(secondiIngresso);
      return;
    }
    secondiIngresso = n;
    scrivi(CHIAVE_INGRESSO, String(n));
    $('#sceltaSecondi').value = String(n);
    esito.classList.remove('errore-secondi');
    esito.textContent = `Fatto: la vista cambia ogni ${n} secondi.`;
    schermataIniziale();
  }

  // Valore della tendina "Uso di questo dispositivo"
  const valoreUso = () => secondiIngresso ? USO_INGRESSO : aulaMonitor;

  // Porta in vista la riga dell'ora in corso (utile sui telefoni)
  function mostraOraCorrente() {
    const riga = $('#tabella .ora-corrente') || $('#tabella .cella-corrente');
    const box = $('#contenitoreTabella');
    if (riga && box) box.scrollTop = Math.max(0, riga.offsetTop - box.clientHeight / 3);
  }

  // Nomi veri dei docenti: si cambiano solo in memoria, nella tabella dei docenti (D.docente). Le lezioni
  // indicano il docente con il suo id, quindi tutte le viste mostrano i nomi senza altre modifiche.
  // Il codice originale (DOC01…) resta in e.codice; nulla di tutto questo viene salvato sul dispositivo.
  function applicaNomi() {
    if (!D) return;
    D.docente.forEach(e => {
      if (e.codice === undefined) e.codice = e.nome;
      const v = nomi && nomi.get(String(e.codice).trim().toUpperCase());
      e.nome = v ? (v.cognome + ' ' + v.nome).trim() : e.codice;
    });
    D.docente.sort((a, b) => a.nome.localeCompare(b.nome, 'it', { numeric: true }));
    const b = $('#btnNomi');
    b.textContent = nomi ? '🙈 Codici' : '👁 Nomi';
    b.setAttribute('aria-pressed', String(!!nomi));
    b.title = nomi ? 'Torna a mostrare i codici dei docenti (DOC01…)' : 'Mostra i nomi dei docenti al posto dei codici (DOC01…)';
    // (cambia solo la scritta: l'icona dell'occhio resta, come nelle altre voci del menu)
    $('#btnNomiMenu .testo-voce').textContent = nomi ? 'Mostra solo i codici dei docenti' : 'Mostra i nomi dei docenti';
  }

  /*
    Nomi veri caricati in automatico (come premere «👁 Nomi»), solo per chi ha il permesso sul file dei nomi.
    Ogni volta che si apre l'app i nomi si caricano da soli. Eccezioni:
    - «🙈 Codici» premuto in questa apertura (soloCodici, solo in memoria: riaprendo l'app i nomi tornano);
    - chiave orariodada.nomi = 'negato:<email>:<data>': Google ha detto che questo account non può aprire il file
      dei nomi; si riprova dopo GIORNI_RIPROVA giorni (nel frattempo il file potrebbe essere stato condiviso).
    I nomi restano sempre e solo in memoria.
  */
  let attesaTocco = false;   // i nomi aspettano il primo tocco (il browser ha bloccato la finestra di Google)
  let soloCodici = false;    // l'utente ha scelto «🙈 Codici» in questa apertura dell'app
  const GIORNI_RIPROVA = 7;
  let avvisoNomi = '';       // perché i nomi non si sono caricati (si mostra in alto, vedi aggiorna)
  // da quale file si leggono i nomi: se cambia (per esempio dal vecchio file al Foglio database) un rifiuto vecchio non vale più
  const fonteNomi = () => CONFIG.fileNomiDocenti || CONFIG.fileDatabaseOrario || '';
  function nomiNegati() {
    const v = String(leggi(CHIAVE_NOMI) || ''), p = v.split(':');
    if (p[0] !== 'negato' || p[1] !== utente.email.toLowerCase() || p[3] !== fonteNomi()) return false;
    const quando = Date.parse(p[2] || '');   // le versioni vecchie non avevano la data: si riprova subito
    return !isNaN(quando) && Date.now() - quando < GIORNI_RIPROVA * 864e5;
  }
  async function caricaNomiDaSoli() {
    if (nomi || !utente || aulaMonitor || secondiIngresso) return;
    if (typeof NomiDocenti === 'undefined' || !NomiDocenti.configurato() || !CONFIG.googleClientId) return;
    // Senza nomi veri serve comunque il permesso di Google per le sostituzioni pubblicate su Drive
    if (nomiNegati()) avvisoNomi = 'Nomi dei docenti non caricati: il tuo account non può leggere la scheda Docenti del Foglio database.';
    if (soloCodici || nomiNegati()) { permessoDrive(); return; }
    try {
      nomi = await NomiDocenti.carica(utente.email);
    } catch (e) {
      const msg = String(e && e.message || '');
      // Solo se Google dice che QUESTO ACCOUNT non può aprire il file (messaggi di nomi.js) smettiamo di riprovare
      if (/il tuo account non ha il permesso|file non trovato/i.test(msg)) {
        scrivi(CHIAVE_NOMI, 'negato:' + utente.email.toLowerCase() + ':' + new Date().toISOString().slice(0, 10) + ':' + fonteNomi());
        permessoDrive();   // il permesso di Google c'è già (il file dei nomi no): leggiamo le sostituzioni
      } else if (/bloccato la finestra|popup/i.test(msg) && !attesaTocco) {
        // Il browser apre la finestra di Google solo dopo un tocco: riproviamo al primo tocco sullo schermo
        attesaTocco = true;
        // «click» e non «pointerdown»: sui telefoni il browser permette la finestra di Google solo quando il dito si stacca
        const riprova = () => { document.removeEventListener('click', riprova, true); document.removeEventListener('keydown', riprova, true); attesaTocco = false; caricaNomiDaSoli(); };
        document.addEventListener('click', riprova, true); document.addEventListener('keydown', riprova, true);
      }
      // qualsiasi problema (tranne la finestra di Google che aspetta un tocco): lo si scrive in alto, così si capisce
      // perché restano i codici DOC01… (vedi aggiorna)
      if (!/bloccato la finestra|popup/i.test(msg)) { avvisoNomi = 'Nomi dei docenti non caricati: ' + msg + '.'; aggiorna(); }
      return;
    }
    avvisoNomi = '';
    applicaNomi();
    mioDocente = Dati.docentePerEmail(utente.email);
    preparaControlli();
    aggiorna();
    // Adesso c'è il permesso di Google: si possono leggere orario e sostituzioni pubblicati su Drive
    if (CONFIG.fileOrarioPubblicato || CONFIG.fileSostituzioniPubblicate || CONFIG.fileCompresenze) ricaricaDati(false);
  }

  /*
    Permesso di Google per leggere da Drive le sostituzioni (e l'orario) pubblicati, anche per chi NON vede i nomi veri
    (non può aprire il file dei nomi, oppure ha scelto «Codici»): basta un account della scuola, perché i file
    pubblicati sono condivisi con l'Istituto. Se il permesso c'è già si rileggono subito i dati; se il browser blocca
    la finestra di Google si riprova al primo tocco sullo schermo. Monitor e schermo all'ingresso non lo chiedono.
  */
  let attesaToccoDrive = false;
  async function permessoDrive() {
    if (!utente || aulaMonitor || secondiIngresso || typeof NomiDocenti === 'undefined' || !CONFIG.googleClientId) return;
    if (!(CONFIG.fileOrarioPubblicato || CONFIG.fileSostituzioniPubblicate || CONFIG.fileCompresenze)) return;
    try {
      await NomiDocenti.gettone([NomiDocenti.PERMESSO_DRIVE], utente.email);   // se c'è già non apre niente
      ricaricaDati(false);
    } catch (e) {
      ricaricaDati(false);   // intanto si aggiorna il resto (orario da GitHub, ultima copia delle sostituzioni)
      if (/bloccato la finestra|popup/i.test(String(e && e.message || '')) && !attesaToccoDrive) {
        attesaToccoDrive = true;
        const riprova = () => { document.removeEventListener('click', riprova, true); document.removeEventListener('keydown', riprova, true); attesaToccoDrive = false; permessoDrive(); };
        document.addEventListener('click', riprova, true); document.addEventListener('keydown', riprova, true);
      }
    }
  }

  /* ---------- costruzione dei controlli ---------- */
  function preparaControlli() {
    controlla40();
    // Menu a tendina dei filtri
    Viste.FILTRI.forEach(k => {
      const sel = $('#filtro-' + k);
      sel.innerHTML = `<option value="">Tutti</option>` +
        D[k].map(e => `<option value="${Viste.esc(e.id)}">${Viste.esc(e.nome)}</option>`).join('');
    });
    $('#filtro-classe').options[0].textContent = 'Tutte';
    $('#filtro-aula').options[0].textContent = 'Tutte';
    // Pulsanti dei giorni (abbreviati sui telefoni)
    $('#giorni').innerHTML = D.giorni.map(g =>
      `<button type="button" data-giorno="${Viste.esc(g)}"><span class="giorno-lungo">${Viste.esc(g)}</span><span class="giorno-corto" aria-hidden="true">${Viste.esc(g.slice(0, 3))}</span></button>`).join('');
    // Uso del dispositivo: personale, schermo all'ingresso o monitor di un'aula
    $('#sceltaMonitor').innerHTML = `<option value="">Dispositivo personale</option>` +
      `<option value="${USO_INGRESSO}">📺 Schermo all'ingresso (viste a rotazione)</option>` +
      `<optgroup label="Monitor dell'aula">` +
      D.aula.map(a => `<option value="${Viste.esc(a.id)}">${Viste.esc(a.nome)}</option>`).join('') + '</optgroup>';
    // Ogni quanti secondi cambia vista lo schermo all'ingresso
    $('#sceltaSecondi').value = String(secondiIngresso || secondiValidi(CONFIG.secondiRotazioneIngresso));
    $('#gruppoRotazione').hidden = !secondiIngresso;
    // Intestazione
    $('#infoScuola').textContent = [D.scuola, D.anno].filter(Boolean).join(' · ');
    $('#nomeUtente').textContent = utente.nome;
    $('#emailUtente').textContent = utente.email;
    $('#btnUtente').textContent = utente.nome.split(/\s+/).map(p => p[0]).slice(0, 2).join('').toUpperCase();
    $('#btnUtente').setAttribute('aria-label', 'Menu di ' + utente.nome);
    $('#btnMioOrario').hidden = !mioDocente;
    // Le voci di Gestione si vedono solo con l'autorizzazione giusta (scheda «Autorizzazioni», vedi autorizzazioni.js)
    controllaAutorizzazioni();
    $('#btnSchermoIntero').hidden = !document.fullscreenEnabled;
    // Tema: la voce "secondo l'ora" mostra gli orari impostati in config.js
    $('#sceltaTema').value = Tema.scelta();
    $('#opzioneTemaOra').textContent = `Secondo l'ora (scuro dalle ${CONFIG.oraInizioScuro} alle ${CONFIG.oraFineScuro})`;
    // Scelta tra la bozza di Orario Facile e l'orario pubblicato
    $('#gruppoFonte').hidden = !D.bozzaDisponibile;
    $('#sceltaFonte').value = D.fonte;
  }

  /* ---------- disegno della pagina ---------- */
  function aggiorna() {
    aggiornaSostegno();   // il sostegno si vede solo per docenti e chi modifica (vedi sopra)
    const a = adesso();
    ultimoMinuto = a.minuto;
    // Momento della giornata (mattina, pomeriggio, sera): colora il tasto «In breve»
    document.body.dataset.momento = Breve.momento(a.minuto);
    // Stato dei pulsanti
    $$('[data-colonne]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.colonne === stato.colonne)));
    Viste.FILTRI.forEach(k => { $('#filtro-' + k).value = stato.filtri[k]; });
    $('#btnAzzera').disabled = !Viste.FILTRI.some(k => stato.filtri[k]);
    $('#giorni').hidden = stato.colonne === 'giorno';
    $$('[data-giorno]').forEach(b => {
      b.setAttribute('aria-pressed', String(b.dataset.giorno === stato.giorno));
      b.classList.toggle('e-oggi', b.dataset.giorno === a.giorno);
    });
    document.body.classList.toggle('modalita-monitor', !!aulaMonitor);
    document.body.classList.toggle('modalita-ingresso', !!secondiIngresso);
    $('#titoloMonitor').textContent = aulaMonitor ? Dati.nome('aula', aulaMonitor) : secondiIngresso ? 'Orario delle lezioni' : '';
    $('#indicatoreIngresso').hidden = !(secondiIngresso && Ingresso.attiva());

    // Messaggi
    const avvisi = [];
    if (secondiIngresso && !Ingresso.attiva()) {
      avvisi.push(`Rotazione delle viste in pausa: riparte da sola dopo ${CONFIG.minutiRitornoMonitor} minuti senza tocchi.`);
    }
    if (avvisoNomi && !aulaMonitor && !secondiIngresso) avvisi.push(avvisoNomi);
    const settimanaSenzaFiltro = stato.colonne === 'giorno' && !Viste.FILTRI.some(k => stato.filtri[k]);
    if (settimanaSenzaFiltro) avvisi.push('Per vedere la settimana scegli una classe, un docente o un\'aula.');
    else if (avvisoGiorno && stato.colonne !== 'giorno' && stato.giorno === avvisoGiorno.giorno) avvisi.push(avvisoGiorno.testo);

    // Assenze e sostituzioni della settimana registrate su questo dispositivo (Sostituzioni o Sostituzioni smart)
    stato.sostituzioni = Supplenze.settimana(D);
    // Riquadro dall'alto con le sostituzioni che riguardano chi ha fatto l'accesso (js/avviso-per-te.js)
    if (typeof AvvisoPerTe !== 'undefined') AvvisoPerTe.aggiorna({ D, sost: stato.sostituzioni, mio: mioDocente,
      spento: !!aulaMonitor || !!secondiIngresso, apriMioOrario: () => $('#btnMioOrario').click() });
    // (solo per le sostituzioni vere: le ore spente e le vigilanze di uno sciopero non contano)
    if ([...stato.sostituzioni.segnate.values()].some(s => !s.sciopero) && !settimanaSenzaFiltro) {
      avvisi.push('🔄 Questa settimana ci sono sostituzioni: le lezioni con la cornice arancione hanno un sostituto, ' +
        'quelle con la cornice rossa tratteggiata aspettano ancora il sostituto.');
    }

    const adessoTabella = { giorno: a.giorno, ora: a.ora };
    let n = 0;
    if (!settimanaSenzaFiltro) n = Viste.disegna($('#tabella'), D, stato, adessoTabella);
    if (!settimanaSenzaFiltro && n === 0) avvisi.push('Nessuna lezione per questa scelta. Prova a cambiare giorno o filtri.');
    $('#contenitoreTabella').hidden = settimanaSenzaFiltro || n === 0;
    $('#avviso').hidden = !avvisi.length;
    $('#avviso').textContent = avvisi.join(' ');

    const riquadro = Viste.riquadroAdesso(D, stato, a);
    $('#adesso').innerHTML = riquadro;
    $('#adesso').hidden = !riquadro;

    aggiornaOrologio();
    $('#piede').innerHTML = [
      D.aggiornato ? 'Orario aggiornato al ' + Viste.esc(new Date(D.aggiornato).toLocaleDateString('it-IT')) : '',
      D.offline ? '<strong>Senza connessione: stai vedendo l\'ultima copia salvata.</strong>' : '',
      utente.metodo === 'demo' ? '<strong>Modalità dimostrativa: accesso non verificato.</strong>' : '',
      D.fonte === 'bozza' ? 'Stai vedendo l’orario di <a href="../orario-facile/" target="_blank" rel="noopener">Orario Facile</a> salvato su questo dispositivo: si aggiorna da solo mentre lo modifichi.' : '',
      // versione dell'app: serve a capire se il dispositivo ha l'ultima (vedi versioneApp in config.js)
      CONFIG.versioneApp ? 'Versione app ' + Viste.esc(CONFIG.versioneApp) : '',
      // copyright e licenza (vedi LICENZA.md nella radice del sito)
      '© 2026 <a href="https://www.comprensivoalmese.it" target="_blank" rel="noopener">IC Almese</a> – Gruppo Wolf' +
        ' · <a href="https://github.com/comprensivoalmese/orario/blob/main/LICENZA.md" target="_blank" rel="noopener">Tutti i diritti riservati</a>'
    ].filter(Boolean).join(' · ');
    if (breveAperta) disegnaBreve();
    if (smartAperta) Smart.aggiorna();
    aggiornaMioOrario();
    aggiornaIntervallo();
    disegnaModifiche();
  }

  /* ---------- modifiche dell'ultimo minuto (vedi modifiche.js) ---------- */
  let modifiche = null;   // { giorno, elenco, nuove, daVedere }
  let provaStorie = false; // true con .../app/?provastorie: modifiche finte per provare le storie

  // Confronta l'orario appena caricato con l'ultimo visto; se "avvisa" è vero, manda anche la notifica
  function controllaModifiche(avvisa) {
    // Con .../app/?provastorie si vedono tre modifiche FINTE, solo su questo dispositivo (vedi modifiche.js)
    if (provaStorie) {
      modifiche = Modifiche.prova(D, giornoIniziale().giorno);
      stato.modificate = Modifiche.caselle(modifiche);
      return;
    }
    modifiche = Modifiche.controlla(D, giornoIniziale().giorno);
    stato.modificate = Modifiche.caselle(modifiche);   // per evidenziare le celle nella tabella
    const mie = modificheDaMostrare();
    if (avvisa && modifiche.nuove && modifiche.daVedere && mie.length) notificaModifiche(mie);
  }

  // Le modifiche che interessano questo dispositivo: sul monitor di un'aula solo quelle di quell'aula;
  // al docente per prime quelle che lo riguardano
  function modificheDaMostrare() {
    if (!modifiche) return [];
    const coinvolge = (x, campo, id) => [...x.prima, ...x.dopo].some(l => l[campo] === id);
    let elenco = modifiche.elenco;
    if (aulaMonitor) elenco = elenco.filter(x => coinvolge(x, 'a', aulaMonitor));
    if (mioDocente) elenco = elenco.map(x => Object.assign({ tua: coinvolge(x, 'd', mioDocente.id) }, x)).sort((a, b) => b.tua - a.tua);
    return elenco;
  }

  // "Matematica · DOC03 · 📍 110ITA4" (più lezioni nella stessa casella separate da +)
  const descriviLezioni = elenco => elenco.map(l =>
    [l.m || '—', l.d ? Dati.nome('docente', l.d) : '', l.a ? '📍 ' + Dati.nome('aula', l.a) : '']
      .filter(Boolean).map(Viste.esc).join(' · ')).join(' + ');

  // Il contenuto di una "storia" (vedi storie.js): com'era prima e com'è adesso, a caratteri grandi
  function corpoStoria(x) {
    const o = D.ore.find(k => k.n === x.ora);
    const blocco = l => `<span class="storia-lezione"><strong class="storia-materia">${Viste.esc(l.m || '—')}</strong>` +
      (l.d ? `<span>${Viste.esc(Dati.nome('docente', l.d))}</span>` : '') +
      (l.a ? `<span class="storia-aula">📍 ${Viste.esc(Dati.nome('aula', l.a))}</span>` : '') + '</span>';
    const prima = x.prima.length
      ? `<div class="storia-prima"><span class="storia-etichetta">Prima</span><del>${descriviLezioni(x.prima)}</del></div>` : '';
    const dopo = x.dopo.length
      ? `<div class="storia-dopo"><span class="storia-etichetta">${x.prima.length ? 'Adesso' : 'Nuova lezione'}</span>${x.dopo.map(blocco).join('')}</div>`
      : '<div class="storia-dopo"><strong class="storia-materia">Lezione tolta</strong></div>';
    return (x.prova ? '<p class="storia-prova">🧪 Prova · modifica finta</p>' : '') +
      `<p class="storia-quando">${x.ora}ª ora${o ? ` · ${Viste.esc(o.inizio)}–${Viste.esc(o.fine)}` : ''}</p>` +
      `<p class="storia-classe">${Viste.esc(Dati.nome('classe', x.classe))}</p>` +
      prima + (prima ? '<p class="storia-freccia" aria-hidden="true">↓</p>' : '') + dopo +
      (x.tua ? '<p class="storia-riguarda">Ti riguarda</p>' : '');
  }

  // Le modifiche trasformate in storie: prima quelle da vedere, poi quelle già viste
  function storieDaMostrare() {
    return modificheDaMostrare()
      .map(x => ({
        id: x.id, vista: x.vista, tua: x.tua, cerchio: x.ora + 'ª', sotto: Dati.nome('classe', x.classe),
        titolo: `${x.ora}ª ora · ${Dati.nome('classe', x.classe)}`, corpo: corpoStoria(x)
      }))
      .sort((a, b) => a.vista - b.vista);
  }

  function apriStorie(indice) {
    Storie.apri(storieDaMostrare(), indice, {
      quandoVista: id => Modifiche.segnaVista(id),
      // alla chiusura rileggo le modifiche (ora "viste"), ridisegno i cerchi e ci riporto il focus
      quandoChiusa: () => {
        controllaModifiche(false);
        disegnaModifiche();
        const cerchio = $('#modifiche .storia-cerchio');
        if (cerchio) cerchio.focus();
      }
    });
  }

  // Il riquadro in alto: la fila di storie (come su Instagram) e l'elenco scritto delle modifiche
  function disegnaModifiche() {
    const box = $('#modifiche');
    const elenco = modificheDaMostrare();
    if (!modifiche || !elenco.length) { box.hidden = true; box.innerHTML = ''; return; }
    const daVedere = elenco.some(x => !x.vista);
    // Sui monitor e sullo schermo all'ingresso nessuno tocca: l'elenco resta sempre aperto
    const schermoPubblico = aulaMonitor || secondiIngresso;
    const quando = modifiche.giorno === adesso().giorno ? 'di oggi' : 'di ' + modifiche.giorno.toLowerCase();
    const righe = elenco.map(x => {
      const prima = descriviLezioni(x.prima), dopo = descriviLezioni(x.dopo);
      const cosa = !x.prima.length ? `<strong class="mod-dopo">${dopo}</strong> <span class="mod-tipo">lezione aggiunta</span>`
        : !x.dopo.length ? `<del class="mod-prima">${prima}</del> <span class="mod-tipo">lezione tolta</span>`
        : `<del class="mod-prima">${prima}</del> <span aria-hidden="true">→</span><span class="solo-lettori"> diventa </span> <strong class="mod-dopo">${dopo}</strong>`;
      return `<li${x.tua ? ' class="mod-tua"' : ''}><span class="mod-dove">${x.ora}ª ora · ${Viste.esc(Dati.nome('classe', x.classe))}:</span> ${cosa}` +
        `${x.tua ? ' <span class="mod-tipo mod-riguarda">ti riguarda</span>' : ''}</li>`;
    }).join('');
    // La notifica si propone solo sui dispositivi personali, e solo se non è già stata decisa
    const proponiNotifica = 'Notification' in window && Notification.permission === 'default' && !aulaMonitor && !secondiIngresso && !modifiche.prova;
    box.classList.toggle('tutte-viste', !daVedere && !schermoPubblico);
    box.classList.toggle('in-prova', !!modifiche.prova);
    box.innerHTML =
      (modifiche.prova ? '<p class="modifiche-prova">🧪 <strong>Prova:</strong> queste modifiche sono finte e le vedi solo tu. ' +
        '<a href="./">Esci dalla prova</a></p>' : '') +
      `<div class="modifiche-testa"><h2 id="titoloModifiche">${daVedere ? '⚠️ ' : ''}Modifiche all'orario ${quando}</h2>` +
      (daVedere && !schermoPubblico ? '<button type="button" id="btnModificheViste" class="pulsante leggero">Segna tutte come viste</button>' : '') +
      '</div>' +
      Storie.fila(storieDaMostrare()) +
      `<details class="modifiche-dettagli"${schermoPubblico ? ' open' : ''}><summary>Vedi l'elenco</summary>` +
      `<ul class="modifiche-elenco">${righe}</ul></details>` +
      (proponiNotifica ? '<button type="button" id="btnModificheNotifiche" class="pulsante leggero">🔔 Avvisami anche con una notifica</button>' : '');
    box.hidden = false;
  }

  // Notifica del telefono/PC (arriva solo mentre l'app è aperta, anche in secondo piano)
  function notificaModifiche(elenco) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    // Il docente viene avvisato solo per le modifiche che lo riguardano
    if (mioDocente && !elenco.some(x => x.tua)) return;
    const n = elenco.length;
    const opzioni = {
      body: `${n} ${n === 1 ? 'modifica' : 'modifiche'} all'orario: ` +
        elenco.slice(0, 3).map(x => `${x.ora}ª ora ${Dati.nome('classe', x.classe)}`).join(', ') + (n > 3 ? '…' : ''),
      icon: 'icone/icona-192.png', tag: 'orario-modifiche'
    };
    // Sui telefoni Android le notifiche passano dal service worker
    if (navigator.serviceWorker && navigator.serviceWorker.controller) {
      navigator.serviceWorker.ready.then(r => r.showNotification('Orario cambiato', opzioni)).catch(() => {});
    } else {
      try { new Notification('Orario cambiato', opzioni); } catch (e) { /* non supportato */ }
    }
  }

  /* ---------- LIM: schermata dell'intervallo (vedi intervallo.js) ---------- */
  let intervalloChiuso = '';          // l'intervallo di oggi che qualcuno ha chiuso con il tasto "Chiudi"
  let apertaPerIntervallo = false;    // true se l'app è stata aperta dallo script della LIM (?intervallo)

  // Chiude la finestra se l'aveva aperta lo script della LIM (se il browser non lo permette, resta aperta)
  function chiudiFinestraIntervallo() {
    if (apertaPerIntervallo) window.close();
  }

  // Sulle LIM (monitor d'aula), durante l'intervallo mostra dove vanno le classi nell'ora dopo
  function aggiornaIntervallo() {
    const box = $('#schermataIntervallo');
    const a = adesso();
    // intervallo = { inizio, fine } se adesso siamo in un intervallo (vedi intervalliLim in config.js)
    const intervallo = aulaMonitor && a.giorno ? Intervallo.inCorso(new Date(), CONFIG.intervalliLim) : null;
    const mostra = intervallo && intervalloChiuso !== a.giorno + intervallo.inizio &&
      Intervallo.disegna(box, D, a.giorno, aulaMonitor, intervallo, Dati.nome);
    if (mostra) {
      box.hidden = false;
      document.body.classList.add('intervallo-aperto');
    } else if (!box.hidden) {
      box.hidden = true;
      document.body.classList.remove('intervallo-aperto');
      if (!intervallo) chiudiFinestraIntervallo();   // intervallo finito
    }
  }

  /* ---------- vista "In breve" ---------- */
  // Di chi mostrare la giornata: la scelta salvata, altrimenti il docente che ha fatto
  // l'accesso, altrimenti il filtro attivo nella tabella (null = va scelto)
  function soggettoBreve() {
    // Aperta con «Il mio orario»: sempre la giornata del docente che ha fatto l'accesso
    if (breveMio && mioDocente) return { tipo: 'docente', id: mioDocente.id };
    const valido = s => s && D.mappa[s.tipo] && D.mappa[s.tipo].has(s.id) ? s : null;
    const salvato = leggi(CHIAVE_BREVE), i = salvato.indexOf('|');
    return valido(i > 0 ? { tipo: salvato.slice(0, i), id: salvato.slice(i + 1) } : null) ||
      (mioDocente ? { tipo: 'docente', id: mioDocente.id } : null) ||
      valido(['docente', 'classe', 'aula'].filter(k => stato.filtri[k]).map(k => ({ tipo: k, id: stato.filtri[k] }))[0]);
  }

  function disegnaBreve() {
    const gi = giornoIniziale(), s = soggettoBreve();
    Breve.disegna($('#vistaBreve'), {
      D, adesso: adesso(), giorno: gi.giorno, avviso: gi.testo, soggetto: s, nomeUtente: utente.nome,
      eIo: !!(s && mioDocente && s.tipo === 'docente' && s.id === mioDocente.id), data: dataBreve,
      sostituzioni: stato.sostituzioni   // sostituzioni e cambi d'aula della settimana (supplenze.js)
    });
  }

  // Apre (true) o chiude (false) la vista "In breve"; sui monitor di classe non si apre.
  // mio = true: aperta con «Il mio orario», cioè con la giornata del docente che ha fatto l'accesso
  /* ---------- pagina "Sostituzioni smart" (js/smart.js) ---------- */
  // Apre (true) o chiude (false) la pagina; sui monitor e sullo schermo all'ingresso non si apre.
  // modo: 'sostituzioni' (Sostituzioni smart) oppure 'cambi' (pagina «Cambi d'aula», stessa vista)
  // annulla (facoltativo): la sostituzione da annullare, scelta con «✕ Annulla» nella tabella
  function apriSmart(apri, modo, annulla) {
    if (apri) { apriBreve(false); apriCalendario(false); }
    smartAperta = !!apri && !aulaMonitor && !secondiIngresso;
    document.body.classList.toggle('smart-aperta', smartAperta);
    $('#vistaSmart').hidden = !smartAperta;
    aggiornaMioOrario();   // con la pagina aperta «Oggi» non è cerchiato
    if (!smartAperta) { aggiorna(); return; }   // la tabella mostra subito le sostituzioni appena fatte
    window.scrollTo(0, 0);
    $('#vistaSmart').focus({ preventScroll: true });
    Smart.apri($('#vistaSmart'), { orario: () => D, chiudi: () => { apriSmart(false); $('#btnUtente').focus(); }, email: utente.email,
      modo: modo || 'sostituzioni', annulla: annulla || null });
  }

  /*
    Ore di SOSTEGNO (compresenze.js): dato delicato, si vedono solo se chi ha fatto l'accesso è un docente riconosciuto
    (mioDocente) oppure può modificare l'orario; gli studenti vedono solo le altre compresenze. Si ricontrolla a ogni
    ridisegno (i nomi veri, e quindi il docente, possono arrivare dopo): se cambia, si rilegge la griglia del sostegno.
  */
  let puoModificareOrario = false;

  /*
    AUTORIZZAZIONI (js/autorizzazioni.js, scheda «Autorizzazioni» del Foglio Database):
    - «Orario Facile» → voce «Passa a Orario Facile» e tasto «✎ Modifica» delle compresenze;
    - «Sostituzioni»  → voci «Sostituzioni smart» e «Cambi d'aula» (e pubblicazione automatica delle sostituzioni).
    Il Foglio si legge con il permesso di Google: finché manca (fonte 'attesa') le voci restano nascoste e si riprova
    a ogni preparaControlli (per esempio appena arrivano i nomi veri, che portano il permesso). Poi la risposta si ricorda.
  */
  let autorizz = null, autorizzInCorso = false, pubblicazioneAvviata = false;
  function controllaAutorizzazioni() {
    if (!utente) return;
    applicaAutorizzazioni();
    if (autorizzInCorso || (autorizz && autorizz.fonte !== 'attesa')) return;
    autorizzInCorso = true;
    Autorizzazioni.di(utente.email)
      .then(a => { autorizz = a; })
      .catch(() => { /* resta com'era: si riprova al prossimo giro */ })
      .finally(() => { autorizzInCorso = false; applicaAutorizzazioni(); });
  }
  function applicaAutorizzazioni() {
    const a = autorizz || {}, pubblico = !!aulaMonitor || !!secondiIngresso;
    const of = !!a.orarioFacile && !pubblico, sost = !!a.sostituzioni && !pubblico;
    $('#linkOrarioFacile').hidden = !of;
    $('#btnCompresenze').hidden = !of || !CONFIG.fileCompresenze;
    // «Sostituzioni smart»: sparisce anche per chi il controllo delle sostituzioni ha già rifiutato su questo dispositivo
    $('#btnSostSmart').hidden = !sost || Smart.negato(utente.email);
    $('#btnCambiAula').hidden = $('#btnSostSmart').hidden;   // stessi autorizzati delle sostituzioni
    // stessi autorizzati anche per il tasto «✕ Annulla» sulle sostituzioni della tabella (viste.js; mai su monitor e ingresso)
    const annullare = !$('#btnSostSmart').hidden;
    if (stato.puoAnnullare !== annullare) { stato.puoAnnullare = annullare; if (D) aggiorna(); }
    // chi fa le sostituzioni da qui le pubblica da solo per tutti (js/pubblica-sostituzioni.js)
    if (sost && !pubblicazioneAvviata && typeof PubblicaSostituzioni !== 'undefined') { pubblicazioneAvviata = true; PubblicaSostituzioni.avviaAutomatica(utente.email); }
    // il sostegno (dato delicato) lo vede anche chi ha un'autorizzazione, oltre ai docenti riconosciuti
    const prima = puoModificareOrario;
    puoModificareOrario = !!(a.orarioFacile || a.sostituzioni);
    if (prima !== puoModificareOrario) aggiornaSostegno();
  }

  /*
    «Le mie 40+40» (js/quaranta-ore.js): la voce del menu compare solo al docente riconosciuto il cui codice c'è nel file
    pubblicato da Orario Facile (cioè abilitato con «Visibile» o «Visibile a tutti»). Si legge senza aprire la finestra di
    Google: se il permesso non c'è ancora si riprova al prossimo giro (preparaControlli / aggiornaSostegno).
  */
  let mie40 = null, letto40 = false, lettura40 = false;
  const codice40 = () => mioDocente ? String(mioDocente.codice || mioDocente.nome || '').trim().toUpperCase() : '';
  function controlla40() {
    aggiornaMioServizio();
    if (!utente || !codice40() || aulaMonitor || secondiIngresso || letto40 || lettura40 || typeof QuarantaOre === 'undefined') return;
    lettura40 = true;
    QuarantaOre.leggiPubblicato(utente.email, true)
      .then(j => {
        if (j === null && !NomiDocenti.gettoneDisponibile([NomiDocenti.PERMESSO_DRIVE])) return;   // manca il permesso: si riprova
        letto40 = true;
        mie40 = j && j.docenti && j.docenti[codice40()] ? { dati: j.docenti[codice40()], aggiornato: j.aggiornato } : null;
        $('#btn40ore').hidden = !mie40;
      })
      .catch(() => { letto40 = true; })
      .finally(() => { lettura40 = false; });
  }
  /*
    «Le mie sostituzioni» (js/storico-sostituzioni.js): per ogni docente riconosciuto, le sostituzioni fatte nell'anno
    (registro nella cartella dei soli docenti). Usa la stessa finestra delle 40+40, con un altro titolo.
  */
  function apriMieSostituzioni() {
    chiudiMenu();
    const box = $('#contenuto40ore');
    $('#titolo40ore').textContent = 'Le mie sostituzioni';
    box.innerHTML = '<p>Carico il registro delle sostituzioni…</p>';
    $('#finestra40ore').showModal();
    StoricoSostituzioni.mie(codice40(), utente.email)
      .then(m => { box.innerHTML = StoricoSostituzioni.html(m); })
      .catch(e => { box.innerHTML = `<p>Non riesco a leggere il registro (${Viste.esc(e.message || e)}). Riprova tra poco.</p>`; });
  }
  function aggiornaMioServizio() {
    $('#btnMieSostituzioni').hidden = !utente || !codice40() || !!aulaMonitor || !!secondiIngresso || typeof StoricoSostituzioni === 'undefined';
  }

  function apri40() {
    chiudiMenu();
    $('#titolo40ore').textContent = 'Le mie 40+40';
    const box = $('#contenuto40ore');
    const mostra = () => { box.innerHTML = mie40 ? QuarantaOre.htmlDocente(mie40.dati, mie40.aggiornato) : '<p>Le tue 40+40 non sono (più) visibili.</p>'; };
    mostra();
    $('#finestra40ore').showModal();
    // si rilegge il file, così si vede l'ultima versione pubblicata
    QuarantaOre.leggiPubblicato(utente.email).then(j => {
      mie40 = j && j.docenti && j.docenti[codice40()] ? { dati: j.docenti[codice40()], aggiornato: j.aggiornato } : null;
      $('#btn40ore').hidden = !mie40;
      mostra();
    }).catch(() => { /* resta quello di prima */ });
  }

  function aggiornaSostegno() {
    controlla40();
    const vede = !!utente && !aulaMonitor && !secondiIngresso && (puoModificareOrario || !!mioDocente);
    // Il calendario «Impegni» è SOLO PER I DOCENTI (scelta della scuola, 02/10/2026): stessa regola del sostegno
    // (docente riconosciuto dall'email oppure autorizzato a Orario Facile / sostituzioni); gli studenti non vedono il tasto
    $('#btnCalendario').hidden = !vede;
    if (!vede && calendarioAperta) apriCalendario(false);
    if (Compresenze.vedeSostegno() === vede) return;
    Compresenze.impostaSostegno(vede);
    const ridisegna = () => { Compresenze.applica(D); aggiorna(); };
    if (vede) Compresenze.scarica().then(ridisegna); else ridisegna();
  }

  function apriBreve(apri, mio) {
    if (apri && smartAperta) apriSmart(false);   // le viste non stanno aperte insieme
    if (apri && calendarioAperta) apriCalendario(false);
    if (!breveAperta) dataBreve = '';   // ogni volta che si apre la vista si riparte da oggi
    breveAperta = apri && !aulaMonitor;
    breveMio = breveAperta && !!mio && !!mioDocente;
    document.body.classList.toggle('breve-aperta', breveAperta);
    $('#vistaBreve').hidden = !breveAperta;
    $('#btnBreve').setAttribute('aria-pressed', String(breveAperta && !breveMio));
    aggiornaMioOrario();
    if (breveAperta) { disegnaBreve(); window.scrollTo(0, 0); $('#vistaBreve').focus({ preventScroll: true }); }
  }

  /* ---------- vista «Impegni»: il calendario degli impegni dell'anno (js/calendario.js) ---------- */
  // Apre (true) o chiude (false) il calendario; sui monitor e sullo schermo all'ingresso non si apre.
  function apriCalendario(apri) {
    if (apri) { apriBreve(false); apriSmart(false); }
    calendarioAperta = !!apri && !aulaMonitor && !secondiIngresso && !$('#btnCalendario').hidden;   // solo docenti
    document.body.classList.toggle('calendario-aperta', calendarioAperta);
    $('#vistaCalendario').hidden = !calendarioAperta;
    $('#btnCalendario').setAttribute('aria-pressed', String(calendarioAperta));
    aggiornaMioOrario();
    if (!calendarioAperta) return;
    window.scrollTo(0, 0);
    $('#vistaCalendario').focus({ preventScroll: true });
    // chi è autorizzato a Orario Facile vede anche «Importa dal Piano delle attività» (aggiornamento di ogni anno)
    Calendario.apri($('#vistaCalendario'), { chiudi: () => { apriCalendario(false); $('#btnCalendario').focus(); },
      puoImportare: !!(autorizz && autorizz.orarioFacile), email: utente.email });
  }

  // Tasti della barra accesi (vedi css/barra.css):
  // - "Il mio orario" quando è aperta la vista "In breve" con la giornata del docente
  // - "Oggi" quando la tabella mostra il giorno di oggi (o il prossimo giorno di scuola)
  function aggiornaMioOrario() {
    $('#btnMioOrario').setAttribute('aria-pressed', String(breveAperta && breveMio));
    const oggi = !breveAperta && !smartAperta && !calendarioAperta && stato.colonne !== 'giorno' && !!D && stato.giorno === giornoIniziale().giorno;
    $('#btnOggi').setAttribute('aria-pressed', String(oggi));
  }

  function aggiornaOrologio() {
    const d = new Date();
    $('#orologio').textContent = d.toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short' }) + ' ' +
      d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
  }

  /* ---------- modalità monitor ---------- */
  // id = aula del monitor, USO_INGRESSO = schermo all'ingresso, '' = dispositivo personale
  function impostaMonitor(id) {
    secondiIngresso = id === USO_INGRESSO ? secondiValidi(leggi(CHIAVE_INGRESSO)) : 0;
    scrivi(CHIAVE_INGRESSO, secondiIngresso ? String(secondiIngresso) : '');
    aulaMonitor = id && D.mappa.aula.has(id) ? id : '';
    scrivi(CHIAVE_MONITOR, aulaMonitor);
    $('#sceltaMonitor').value = valoreUso();
    $('#gruppoRotazione').hidden = !secondiIngresso;
    $('#sceltaSecondi').value = String(secondiIngresso || secondiValidi(CONFIG.secondiRotazioneIngresso));
    $('#esitoSecondi').textContent = '';
    schermataIniziale();
  }

  // Sul monitor, dopo qualche minuto senza tocchi, si torna all'orario dell'aula.
  // Sullo schermo all'ingresso un tocco mette in pausa la rotazione, che riparte dopo
  // qualche minuto senza tocchi. (evento manca quando la chiama l'app all'avvio)
  function tocco(evento) {
    clearTimeout(timerInattivita);
    if (!aulaMonitor && !secondiIngresso) return;
    if (secondiIngresso) {
      if (!evento) return;                         // nessun tocco vero: la rotazione continua
      if (Ingresso.attiva()) pausaRotazione();
    }
    timerInattivita = setTimeout(() => { chiudiMenu(); schermataIniziale(); }, CONFIG.minutiRitornoMonitor * 60000);
  }

  /* ---------- menu utente ---------- */
  // All'apertura il focus va sul riquadro del menu e non sulla prima tendina:
  // sui telefoni una tendina che riceve il focus si aprirebbe da sola coprendo il menu.
  // Con la tastiera si passa alle voci con il tasto Tab.
  function apriMenu() { $('#menu').hidden = false; $('#btnUtente').setAttribute('aria-expanded', 'true'); $('#menu').focus(); }
  function chiudiMenu() { $('#menu').hidden = true; $('#btnUtente').setAttribute('aria-expanded', 'false'); }

  function collegaEventi() {
    $$('[data-colonne]').forEach(b => b.addEventListener('click', () => { stato.colonne = b.dataset.colonne; aggiorna(); }));
    Viste.FILTRI.forEach(k => $('#filtro-' + k).addEventListener('change', e => { stato.filtri[k] = e.target.value; aggiorna(); }));
    $('#btnAzzera').addEventListener('click', () => { stato.filtri = { classe: '', docente: '', aula: '' }; aggiorna(); });
    // Un'aula segnata sulla piantina (tabella o «In breve»): toccandola si apre la piantina del piano (js/piantine.js)
    document.addEventListener('click', e => {
      const b = e.target.closest('[data-piantina]');
      if (b) { e.preventDefault(); Piantine.mostra(b.dataset.piantina); }
    });
    // Quadratino «Compresenze»: spuntato si vedono anche le ore di compresenza, altrimenti solo le curricolari
    $('#mostraCompresenze').checked = Compresenze.mostra();
    $('#mostraCompresenze').addEventListener('change', e => { Compresenze.impostaMostra(e.target.checked); Compresenze.applica(D); aggiorna(); });
    $('#giorni').addEventListener('click', e => {
      const b = e.target.closest('[data-giorno]');
      if (b) { stato.giorno = b.dataset.giorno; aggiorna(); }
    });
    // "In breve": il tasto apre e chiude; dentro la vista, "Tabella" chiude e la tendina sceglie di chi è la giornata
    // (se la vista è aperta con «Il mio orario», «In breve» passa alla giornata scelta nella tendina)
    $('#btnBreve').addEventListener('click', () => apriBreve(!breveAperta || breveMio));
    $('#vistaBreve').addEventListener('click', e => {
      if (e.target.closest('#btnChiudiBreve')) { apriBreve(false); $('#btnBreve').focus(); }
    });
    $('#vistaBreve').addEventListener('change', e => {
      // Tendina "Giorno": la giornata di un'altra data
      if (e.target.id === 'sceltaDataBreve') {
        dataBreve = e.target.value;
        disegnaBreve();
        $('#sceltaDataBreve').focus();
        return;
      }
      if (e.target.id !== 'sceltaBreve') return;
      scrivi(CHIAVE_BREVE, e.target.value);
      breveMio = false;   // scelta un'altra giornata: non è più «Il mio orario»
      $('#btnBreve').setAttribute('aria-pressed', 'true');
      aggiornaMioOrario();
      disegnaBreve();
      $('#sceltaBreve').focus();
    });
    // «Sostituzioni smart» nel menu: la pagina si apre subito (così Google può chiedere il permesso, se serve)
    $('#btnSostSmart').addEventListener('click', () => { chiudiMenu(); apriSmart(true, 'sostituzioni'); });
    // «Cambi d'aula» nel menu: stessa pagina, solo il modulo dei cambi d'aula
    $('#btnCambiAula').addEventListener('click', () => { chiudiMenu(); apriSmart(true, 'cambi'); });
    // «Impegni»: il tasto apre e chiude il calendario
    $('#btnCalendario').addEventListener('click', () => apriCalendario(!calendarioAperta));
    $('#btnOggi').addEventListener('click', () => { apriBreve(false); apriSmart(false); apriCalendario(false); const gi = giornoIniziale(); stato.giorno = gi.giorno; if (stato.colonne === 'giorno') stato.colonne = 'classe'; aggiorna(); mostraOraCorrente(); });
    // «Il mio orario»: apre la vista a schede di "In breve" con la giornata del docente (di nuovo: chiude)
    $('#btnMioOrario').addEventListener('click', () => apriBreve(!(breveAperta && breveMio), true));
    $('#btnHome').addEventListener('click', schermataIniziale);

    $('#btnUtente').addEventListener('click', () => $('#menu').hidden ? apriMenu() : chiudiMenu());
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#menu').hidden) { chiudiMenu(); $('#btnUtente').focus(); } });
    document.addEventListener('click', e => { if (!$('#menu').hidden && !e.target.closest('#menu, #btnUtente')) chiudiMenu(); });
    $('#sceltaMonitor').addEventListener('change', e => { impostaMonitor(e.target.value); chiudiMenu(); });
    // Secondi della rotazione: si scrivono nel campo (conferma con Invio o uscendo dal campo)
    // oppure si regolano con − e + (di 5 in 5). Il menu resta aperto per altre prove.
    $('#sceltaSecondi').addEventListener('change', e => impostaSecondi(e.target.value));
    $('#menoSecondi').addEventListener('click', () => impostaSecondi(Math.max(5, (Math.ceil(secondiIngresso / 5) - 1) * 5)));
    $('#piuSecondi').addEventListener('click', () => impostaSecondi(Math.min(600, (Math.floor(secondiIngresso / 5) + 1) * 5)));
    $('#btn40ore').addEventListener('click', apri40);
    $('#btnMieSostituzioni').addEventListener('click', apriMieSostituzioni);
    $('#btnChiudi40ore').addEventListener('click', () => $('#finestra40ore').close());
    $('#btnSchermoIntero').addEventListener('click', () => {
      document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen().catch(() => {});
      chiudiMenu();
    });
    $('#btnRicarica').addEventListener('click', async () => { chiudiMenu(); await ricaricaDati(true); });
    // "Nomi" (barra o menu): li legge dal file riservato su Drive (serve il permesso sul file); "Codici" li toglie
    // «Codici» vale solo finché l'app resta aperta: alla prossima apertura i nomi tornano da soli
    const cambiaNomi = async () => {
      chiudiMenu();
      if (nomi) { nomi = null; soloCodici = true; }
      else {
        try { nomi = await NomiDocenti.carica(utente.email); soloCodici = false; scrivi(CHIAVE_NOMI, ''); }
        catch (e) { $('#avviso').hidden = false; $('#avviso').textContent = 'Non riesco a mostrare i nomi: ' + e.message + '.'; return; }
      }
      applicaNomi();
      mioDocente = Dati.docentePerEmail(utente.email);
      preparaControlli();
      aggiorna();
    };
    $('#btnNomi').addEventListener('click', cambiaNomi);
    $('#btnNomiMenu').addEventListener('click', cambiaNomi);
    $('#sceltaTema').addEventListener('change', e => Tema.imposta(e.target.value));
    $('#sceltaFonte').addEventListener('change', e => { Dati.impostaFonte(e.target.value); chiudiMenu(); ricaricaDati(true); });
    // Quando Orario Facile (aperto in un'altra scheda) salva, l'app si aggiorna subito
    window.addEventListener('storage', e => { if (e.key === Dati.CHIAVE_BOZZA) ricaricaDati(false); });
    // Quando si assegna una sostituzione (in Orario Facile o in un'altra scheda) la tabella si aggiorna subito
    window.addEventListener('storage', e => { if (Supplenze.CHIAVI.includes(e.key)) aggiorna(); });
    $('#btnEsci').addEventListener('click', () => Accesso.esci());
    // Riquadro delle modifiche: un cerchio apre le storie, "Segna tutte come viste" ingrigisce i cerchi
    // (le celle restano evidenziate), "Avvisami" chiede il permesso per le notifiche
    // «✕ Annulla» su una sostituzione della tabella (solo per chi è autorizzato, vedi viste.js): si apre la pagina
    // Sostituzioni, che chiede conferma e la annulla (anche nel foglio del conteggio e nel foglio «Sostituzioni»)
    // «✕ Togli assenza» (stesso stile): la pagina Sostituzioni chiede conferma e toglie l'assenza per tutti
    // Compresenza compatta (una riga «＋ docente · tipo», viste.js): toccandola si apre e si vede il testo intero
    const apriCompatta = e => {
      const c = e.target.closest('.lezione-compatta');
      if (!c || e.target.closest('button')) return false;
      const aperta = c.classList.toggle('aperta');
      c.setAttribute('aria-expanded', aperta ? 'true' : 'false');
      return true;
    };
    $('#contenitoreTabella').addEventListener('keydown', e => {
      if ((e.key === 'Enter' || e.key === ' ') && e.target.classList.contains('lezione-compatta') && apriCompatta(e)) e.preventDefault();
    });
    $('#contenitoreTabella').addEventListener('click', e => {
      if (apriCompatta(e)) return;
      const b = e.target.closest('.annulla-sost');
      if (!b || !stato.sostituzioni) return;
      if (b.dataset.togliAssenza) {
        const [id, data, docente] = b.dataset.togliAssenza.split('|');
        const assenza = [...stato.sostituzioni.segnate.values()].map(x => x.assenza).filter(Boolean)
          .find(a => id ? a.id === id : a.data === data && a.docente === docente);
        if (assenza) apriSmart(true, 'sostituzioni', { assenza });
        return;
      }
      const [id, data, ora, classe] = b.dataset.annullaSost.split('|');
      const voce = [...stato.sostituzioni.segnate.values()].map(x => x.voce).filter(Boolean)
        .find(v => id ? v.id === id : v.data === data && String(v.ora) === ora && v.classe === classe);
      if (voce) apriSmart(true, 'sostituzioni', voce);
    });
    $('#modifiche').addEventListener('click', e => {
      const cerchio = e.target.closest('[data-storia]');
      if (cerchio) {
        apriStorie(Number(cerchio.dataset.storia));
      } else if (e.target.closest('#btnModificheViste')) {
        Modifiche.segnaVista();
        controllaModifiche(false);
        disegnaModifiche();
      } else if (e.target.closest('#btnModificheNotifiche')) {
        Notification.requestPermission().then(disegnaModifiche, disegnaModifiche);
      }
    });
    // "Chiudi" nella schermata dell'intervallo: non ricompare fino al prossimo intervallo
    $('#schermataIntervallo').addEventListener('click', e => {
      if (!e.target.closest('#chiudiIntervallo')) return;
      const box = $('#schermataIntervallo');
      intervalloChiuso = adesso().giorno + box.dataset.intervallo;
      box.hidden = true;
      document.body.classList.remove('intervallo-aperto');
      chiudiFinestraIntervallo();
    });

    ['pointerdown', 'keydown'].forEach(t => document.addEventListener(t, tocco, { passive: true }));
  }

  /* ---------- aggiornamenti automatici ---------- */
  async function ricaricaDati(manuale) {
    try {
      const fontePrima = D.fonte, filtri = Object.assign({}, stato.filtri);
      // le sostituzioni pubblicate su Drive e il Foglio delle compresenze (se configurati in config.js)
      await Promise.all([Supplenze.scarica(), Compresenze.scarica(), Piantine.prepara()]);
      D = await Dati.carica();
      applicaNomi();
      Compresenze.applica(D);
      mioDocente = Dati.docentePerEmail(utente.email);
      preparaControlli();
      if (aulaMonitor && !D.mappa.aula.has(aulaMonitor)) aulaMonitor = '';
      controllaModifiche(true);
      $('#sceltaMonitor').value = valoreUso();
      // Cambiata la fonte (bozza <-> pubblicato): classi, docenti e aule sono diversi, si riparte
      if (D.fonte !== fontePrima) { schermataIniziale(); return; }
      // Stessa fonte aggiornata: tengo la vista, ma solo i filtri che esistono ancora
      Viste.FILTRI.forEach(k => { stato.filtri[k] = D.mappa[k].has(filtri[k]) ? filtri[k] : ''; });
      if (!D.giorni.includes(stato.giorno)) stato.giorno = giornoIniziale().giorno;
      aggiorna();
    } catch (e) {
      if (manuale) { $('#avviso').hidden = false; $('#avviso').textContent = 'Non è stato possibile aggiornare l’orario.'; }
    }
  }

  function avviaTimer() {
    // Ogni 20 secondi: se è cambiato il minuto ridisegno (per spostare l'evidenziazione dell'ora)
    setInterval(() => { if (adesso().minuto !== ultimoMinuto) aggiorna(); }, 20000);
    setInterval(() => {
      // il permesso di Google dura un'ora: se è scaduto lo si richiede (permessoDrive rilegge poi i dati)
      const scaduto = CONFIG.fileSostituzioniPubblicate && typeof NomiDocenti !== 'undefined' &&
        !NomiDocenti.gettoneDisponibile([NomiDocenti.PERMESSO_DRIVE]);
      if (scaduto && !aulaMonitor && !secondiIngresso) permessoDrive(); else ricaricaDati(false);
    }, CONFIG.minutiAggiornamentoDati * 60000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) aggiorna(); });
  }

  /* ---------- avvio ---------- */
  // Il robot del caricamento resta almeno un secondo dall'apertura (così l'animazione si vede),
  // poi sfuma lasciando il posto all'app o alla schermata di accesso
  const DURATA_MINIMA_ROBOT = 1000;
  let timerRobot = null;
  function nascondiCaricamento() {
    const box = $('#caricamento');
    clearTimeout(timerRobot);
    // performance.now() = millisecondi passati da quando la pagina ha cominciato a caricarsi
    timerRobot = setTimeout(() => {
      box.classList.add('uscita');
      timerRobot = setTimeout(() => { box.hidden = true; box.classList.remove('uscita'); }, 400);
    }, Math.max(0, DURATA_MINIMA_ROBOT - performance.now()));
  }
  function mostraCaricamento() {
    clearTimeout(timerRobot);
    const box = $('#caricamento');
    box.classList.remove('uscita');
    box.hidden = false;
  }

  function mostraErroreAvvio(testo) {
    $('#caricamento').innerHTML = `<p>${Viste.esc(testo)}</p><button type="button" class="pulsante" onclick="location.reload()">Riprova</button>`;
  }

  async function dopoAccesso(s) {
    utente = s;
    mostraCaricamento();
    try {
      // l'orario e (se configurate in config.js) le sostituzioni pubblicate su Drive, insieme
      [D] = await Promise.all([Dati.carica(), Supplenze.scarica()]);
    } catch (e) {
      mostraErroreAvvio('Impossibile caricare l\'orario. Controlla la connessione.');
      return;
    }
    applicaNomi();
    Compresenze.applica(D);   // le compresenze, se è spuntato il quadratino (dall'ultima copia; il Foglio si rilegge con il permesso di Google)
    mioDocente = Dati.docentePerEmail(utente.email);

    // Monitor: si attiva con ?monitor=NomeAula nell'indirizzo, oppure dal menu
    const parametri = new URLSearchParams(location.search);
    const param = parametri.get('monitor');
    let scelta = leggi(CHIAVE_MONITOR);
    if (param !== null) {
      const a = D.aula.find(x => x.id === param || semplifica(x.nome) === semplifica(param));
      scelta = a ? a.id : '';
      scrivi(CHIAVE_MONITOR, scelta);
      scrivi(CHIAVE_INGRESSO, '');
    }
    // Schermo all'ingresso: si attiva con ?ingresso (o ?ingresso=30 per 30 secondi), oppure dal menu
    const paramIngresso = parametri.get('ingresso');
    if (paramIngresso !== null) {
      scrivi(CHIAVE_INGRESSO, String(secondiValidi(paramIngresso)));
      scrivi(CHIAVE_MONITOR, '');
      scelta = '';
    }
    aulaMonitor = scelta && D.mappa.aula.has(scelta) ? scelta : '';
    secondiIngresso = !aulaMonitor && leggi(CHIAVE_INGRESSO) ? secondiValidi(leggi(CHIAVE_INGRESSO)) : 0;
    // LIM: lo script di Windows apre l'app all'intervallo con ?intervallo (vedi app/lim/)
    apertaPerIntervallo = parametri.has('intervallo');
    provaStorie = parametri.has('provastorie');
    controllaModifiche(false);   // modifiche arrivate mentre l'app era chiusa: riquadro sì, notifica no
    const conStorie = parametri.has('storie');   // aperta toccando la notifica: mostra subito le storie

    preparaControlli();
    $('#sceltaMonitor').value = valoreUso();
    collegaEventi();
    Campanella.avvia(() => D);   // tasto campanella (vedi campanella.js)
    nascondiCaricamento();       // il robot sfuma sopra l'app già pronta
    $('#app').hidden = false;
    schermataIniziale();
    avviaTimer();
    tocco();
    caricaNomiDaSoli();   // nomi veri dei docenti in automatico (se l'account può aprire il file dei nomi)
    if (conStorie && modificheDaMostrare().length) apriStorie(0);
    // Tocco sulla notifica mentre l'app è già aperta: il service worker chiede di mostrare le storie
    if (navigator.serviceWorker) {
      navigator.serviceWorker.addEventListener('message', e => {
        if (e.data && e.data.tipo === 'apriStorie' && modificheDaMostrare().length) apriStorie(0);
      });
    }
  }

  // Service worker: permette di installare l'app e di usarla senza connessione
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    // Se la pagina era già gestita da una versione precedente, quando arriva quella nuova si ricarica
    // una volta da sola: così chi apre l'app (anche installata) vede sempre l'ultima versione
    const cUnaVersionePrima = !!navigator.serviceWorker.controller;
    let ricaricata = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!cUnaVersionePrima || ricaricata) return;
      ricaricata = true;
      location.reload();
    });
    navigator.serviceWorker.register('sw.js').then(reg => {
      // Ricontrolla se c'è una versione nuova ogni volta che si torna sull'app (es. riaperta dalla schermata Home)
      document.addEventListener('visibilitychange', () => { if (!document.hidden) reg.update().catch(() => {}); });
    }).catch(() => { /* l'app funziona anche senza */ });
  }

  // Se bisogna fare l'accesso, il robot lascia il posto alla schermata di accesso;
  // altrimenti resta finché l'orario è pronto (vedi dopoAccesso)
  if (!Accesso.sessione()) nascondiCaricamento();
  Accesso.avvia(dopoAccesso);
})();
