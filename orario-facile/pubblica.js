/*
  pubblica.js – i tasti «📤 Pubblica orario» (scheda Orario) e «📤 Pubblica sostituzioni» (scheda Sostituzioni).

  Salvano su Google Drive, nella cartella CONFIG.cartellaPubblicazione, i file che l'app Luis@i legge
  (il lavoro su Drive lo fa app/js/pubblica-drive.js):
  - Pubblica orario: orario-pubblicato.json (lo stesso contenuto di «Scarica orario.json») e il backup completo
    del giorno "backup orario GG-MM-AAAA.json" nella cartella «backup orario» (lo stesso giorno si sostituisce);
  - Pubblica sostituzioni: sostituzioni-pubblicate.json con le assenze e le sostituzioni delle ultime due settimane
    e di quelle future, SOLO con i dati che l'app mostra (giorno, ore, classe, codici dei docenti: niente permessi,
    niente nomi veri).
  Usa S, avvisa() e chiedi() di Orario Facile (index.html) e Archivio di sostituzioni/js/archivio.js.
*/
(() => {
  const $id = id => document.getElementById(id);
  // email di chi ha fatto l'accesso: Google propone subito quell'account
  const email = () => {
    const s = typeof Accesso !== 'undefined' && Accesso.sessione ? Accesso.sessione() : null;
    return s ? s.email : '';
  };
  const oggi = () => new Date().toISOString().slice(0, 10);

  // Messaggio finale: se il file è nuovo (o non ancora collegato) spiega come collegarlo all'app
  function esito(f, cosa, voceConfig) {
    let testo = cosa + ' su Google Drive.';
    if (!f.collegato) {
      testo += ` L'app non legge ancora questo file: in app/js/config.js alla voce ${voceConfig} va scritto il codice ${f.id}`;
      // La nostra scuola non permette «Chiunque abbia il link»: va bene anche condiviso con l'Istituto,
      // perché l'app lo legge con l'account di chi ha fatto l'accesso (vedi leggiDrive in app/js/dati.js)
      testo += f.condiviso ? '.' : ' e il file deve essere condiviso con l\'Istituto (o con «Chiunque abbia il link», se la scuola lo permette).';
    }
    return testo;
  }

  // Esegue una pubblicazione: tasto spento e messaggio accanto mentre lavora
  async function lavora(tasto, stato, azione) {
    // la spiegazione originale accanto al tasto (senza il «✔ Pubblicato» della volta prima)
    if (!stato.dataset.testo) stato.dataset.testo = stato.textContent;
    const etichetta = tasto.textContent, spiegazione = stato.dataset.testo;
    tasto.disabled = true;
    tasto.textContent = '⏳ Pubblicazione in corso…';
    try {
      const messaggio = await azione();
      stato.textContent = '✔ Pubblicato alle ' + new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }) + '. ' + spiegazione;
      avvisa(messaggio);
    } catch (e) {
      avvisa('Pubblicazione non riuscita: ' + (e && e.message ? e.message : e) + '.');
    } finally {
      tasto.disabled = false;
      tasto.textContent = etichetta;
    }
  }

  /* ---------- Pubblica orario ---------- */
  const tastoOrario = $id('btnPubblicaOrario');
  if (tastoOrario) tastoOrario.addEventListener('click', () => {
    if (!PubblicaDrive.configurato()) return avvisa('In app/js/config.js manca la cartella di Drive (cartellaPubblicazione).');
    // un orario vuoto non si pubblica per errore
    let lezioni = 0;
    try { lezioni = Dati.normalizza(S).lezioni.length; } catch (e) { lezioni = 0; }
    if (!lezioni) return avvisa('L\'orario è vuoto: prima generalo o importalo, poi pubblicalo.');
    chiedi(`Pubblicare questo orario (${lezioni} lezioni)? Entro pochi minuti l'app Luis@i lo mostrerà su tutti i dispositivi. ` +
      'Verrà salvato anche il backup di oggi nella cartella «backup orario».', () =>
      lavora(tastoOrario, $id('statoPubblicaOrario'), async () => {
        // stesso contenuto di «Scarica orario.json»: il backup completo con la data di pubblicazione
        const orario = JSON.stringify(Object.assign({}, S, { pubblicato: oggi() }), null, 1);
        const backup = JSON.stringify(S, null, 1);
        const f = await PubblicaDrive.pubblicaOrario(orario, backup, email());
        return esito(f, `Orario pubblicato e backup salvato come «${f.backup}»`, 'fileOrarioPubblicato');
      }), 'Pubblica');
  });

  /* ---------- Pubblica sostituzioni ---------- */
  const tastoSost = $id('btnPubblicaSostituzioni');
  if (tastoSost) tastoSost.addEventListener('click', () => {
    if (!PubblicaDrive.configurato()) return avvisa('In app/js/config.js manca la cartella di Drive (cartellaPubblicazione).');
    // dalle ultime due settimane in poi: il file resta piccolo (l'app mostra solo la settimana in corso)
    const d = new Date(); d.setDate(d.getDate() - 14);
    const da = d.toISOString().slice(0, 10);
    const recenti = x => x && String(x.data || '') >= da;
    const assenze = Archivio.leggi('assenze', []).filter(recenti);
    const registro = Archivio.leggi('registro', []).filter(recenti);
    chiedi(`Pubblicare ${assenze.length} assenze e ${registro.length} sostituzioni di questo computer? ` +
      'Si uniscono a quelle già pubblicate da altri dispositivi (per esempio da «Sostituzioni smart»): ' +
      'l\'app Luis@i le mostrerà nella tabella dell\'orario su tutti i dispositivi.', () =>
      lavora(tastoSost, $id('statoPubblicaSostituzioni'), async () => {
        // app/js/pubblica-sostituzioni.js: rilegge il file pubblicato e cambia solo le sostituzioni di questo computer
        const r = await PubblicaSostituzioni.unisciEPubblica(email());
        return `Sostituzioni pubblicate: nel file ora ci sono ${r.registro} sostituzioni e ${r.assenze} assenze (comprese quelle degli altri dispositivi).`;
      }), 'Pubblica');
  });

  /* ---------- Importa nel registro dei docenti (una volta sola) ---------- */
  // Le sostituzioni del foglio «Sostituzioni» (con i nomi veri, letti solo in memoria) entrano nello storico
  // «sostituzioni-docenti.json» della cartella dei soli docenti, con i codici: vedi app/js/storico-sostituzioni.js
  const tastoStorico = $id('btnImportaStorico');
  if (tastoStorico) tastoStorico.addEventListener('click', () => {
    if (typeof StoricoSostituzioni === 'undefined' || typeof RegistroDrive === 'undefined' || !RegistroDrive.configurato())
      return avvisa('Manca il file delle sostituzioni (fileSostituzioni in app/js/config.js) o storico-sostituzioni.js.');
    chiedi('Copiare nel registro dei docenti le sostituzioni scritte nel foglio «Sostituzioni» su Drive? ' +
      'Ogni docente le vedrà nell\'app in «Le mie sostituzioni» (solo le proprie, senza il nome del collega assente). ' +
      'Quelle già presenti non si toccano.', () =>
      lavora(tastoStorico, $id('statoImportaStorico'), async () => {
        const righe = await RegistroDrive.tutte(email());
        const nomi = await NomiDocenti.carica(email());
        // dal registro di questo computer si sa se una sostituzione era «senza ore in più» (spostato, uscita, sciopero)
        const locale = new Map(Archivio.leggi('registro', []).map(s => [s.id, { senzaOre: !!(s.spostato || s.reindirizzato || s.sciopero) }]));
        const r = await StoricoSostituzioni.importa(righe, nomi, id => locale.get(id), email());
        let testo = `Registro dei docenti: ${r.aggiunte} sostituzioni aggiunte, ${r.gia} c'erano già (righe del foglio: ${righe.length}).`;
        if (r.ignote.length) testo += ` Non ho riconosciuto questi docenti (controlla come sono scritti nel foglio): ${r.ignote.join(', ')}.`;
        return testo;
      }), 'Importa');
  });
})();
