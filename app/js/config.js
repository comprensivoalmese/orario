/*
  config.js – impostazioni dell'app (l'unico file da modificare per configurarla)
*/
window.CONFIG = {
  // Indirizzo pubblico dell'app, usato per condividerla con i colleghi.
  // Se cambia, va rigenerato anche il QR code in icone/qr-app.svg (vedi LEGGIMI.md).
  indirizzoApp: 'https://comprensivoalmese.github.io/orario/app/',

  // Versione dell'app, scritta in fondo alla pagina. Quando si pubblicano modifiche importanti conviene
  // cambiarla qui E nel nome CACHE di sw.js: così tutti i dispositivi scaricano l'app da capo.
  versioneApp: '2026-10-04.3',

  // Solo gli account di questo dominio possono entrare
  dominio: 'comprensivoalmese.it',

  // Chi può MODIFICARE l'orario (Orario Facile, sostituzioni): gli altri possono solo consultarlo.
  // Un codice per persona, ricavato dalla sua email (vedi js/ruoli.js): chi non è abilitato
  // lo vede nella schermata di Orario Facile. Esempio: editori: ['3f9a0c1d2e4b5a6f', '0b1c2d3e4f5a6b7c'],
  // Lista vuota = per ora chiunque della scuola può modificare.
  // (niente nomi accanto ai codici: il repository è pubblico)
  editori: ['45aa91989fb595e7', 'aa2c03c9e7c12d25', '50a35ca7700865d9', 'a924a1ef335c2fb7', '12b16d331ac9ebc8'],

  // ID client OAuth di Google (lo crea l'amministratore Google Workspace della scuola,
  // vedi app/LEGGIMI.md). Non è un dato segreto: può stare nel repository pubblico.
  // Se si svuota ('') l'app torna in "modalità dimostrativa": chiede solo l'email, SENZA verificarla.
  googleClientId: '709643540266-2kcc07obqusacsm3qlu8trkc2gb4cjh1.apps.googleusercontent.com',

  // Foglio di corrispondenza con i nomi dei docenti (colonne Codice, Cognome, Nome): l'app legge i nomi da qui.
  // Se si svuota (''), i nomi si leggono dalla scheda Docenti del Foglio database (fileDatabaseOrario).
  // Nel repository i docenti sono solo codici (DOC01, DOC02…): i nomi li vede solo chi ha un account della scuola.
  fileNomiDocenti: '1NcknVOHvTXHB2ue94FjFs-iY-vT54tq3tHc7CArTEmI',

  // Foglio Google del conteggio ore ("Conteggio ore"): la scheda Sostituzioni lo legge da solo e,
  // quando si assegna una sostituzione, scrive +1 nella settimana del docente che sostituisce.
  // Deve essere un vero Foglio Google (non un Excel caricato) e chi assegna deve poterlo modificare.
  fileConteggioOre: '111UrbyrZHhI7EphNQUiFlhUe0_kjS8ctu2fNTXBHeuw',

  // Foglio Google delle sostituzioni (vedi sostituzioni/js/registro-drive.js):
  // - foglio "Sostituzioni": qui l'app scrive le sostituzioni assegnate (con i nomi veri dei docenti)
  // - foglio "Cambi aula": i cambi d'aula (lo crea l'app)
  // (il foglio "Autorizzazioni" di questo file è stato tolto il 27/09/2026: chi può fare le sostituzioni lo dice
  //  il file Autorizzazioni, vedi fileAutorizzazioni)
  // Se si svuota (''), la scheda Sostituzioni funziona come prima (nessun controllo, niente scrittura nel foglio).
  fileSostituzioni: '1bd_d8oNdxSo8hIC26ONxN_RYUpV8dMzD2Ax78z76BJA',

  // Foglio Google «database» dell'orario (vedi orario-facile/DATABASE.md): Orario Facile lo carica e ci salva
  // con i tasti «Carica dal Foglio» / «Salva sul Foglio» (scheda Esporta). Contiene i nomi veri dei docenti
  // (scheda Docenti), che l'app mostra a docenti e studenti: sul Drive della scuola, in lettura a tutto l'Istituto,
  // in modifica solo a chi prepara l'orario. Vuoto = tasti non attivi.
  // (dal 27/09/2026 è il Foglio reimportato «pulito»; quello di prima era '1gawzwbqDBwqONiZdnvbEprzYAiUOPc8IxP1fu-CrO30')
  fileDatabaseOrario: '1_lN3MZR31QR6xYXj8qdJ8HtdlYaqCmO8WCHriFTJrZo',
  // AUTORIZZAZIONI (js/autorizzazioni.js): chi può usare Orario Facile e chi può fare le sostituzioni sta nella scheda
  // «Autorizzazioni» del Foglio Database (Nome, Cognome, Email, Orario Facile SI/NO, Sostituzioni SI/NO). Vuoto = Foglio
  // Database; si può indicare un Foglio a parte. Finché la scheda non c'è valgono «editori» qui sopra e il foglio
  // «Autorizzazioni» del file delle sostituzioni.
  // Dal 27/09/2026 è un FILE A PARTE «Autorizzazioni» (prima scheda: Nome, Cognome, Email, Orario Facile, Sostituzioni,
  // Note), condiviso in lettura SOLO con le persone autorizzate e in modifica solo con chi gestisce l'app:
  // chi non può aprirlo non ha nessuna autorizzazione.
  fileAutorizzazioni: '1NLJzaz2cus3ZrVC4u2RkBUJRbIeuyBqzqWyTttsQfuU',

  // Foglio Google «Compresenze» (vedi js/compresenze.js): una riga per ogni ora di compresenza (potenziamento L2,
  // tempo prolungato, Alternativa…), colonne Codice docente, Classe, Giorno, Ora, Tipo. L'app le mostra solo con il
  // quadratino «Compresenze». Sul Drive della scuola, condiviso in lettura con l'Istituto. Vuoto = solo le compresenze
  // scritte in Orario Facile.
  fileCompresenze: '1B-GJOvJoOY6NH0P5oMcYi1tRSCjBqEr54CFXHPPWkks',
  // SOSTEGNO: la griglia «Sostegno» (un docente per riga, in ogni ora la classe) e la scheda «Sostegno classi» (per ogni
  // classe: sostegno sì/no e ore previste). Dato delicato: l'app lo mostra solo a docenti e a chi modifica l'orario, e
  // non va mai su GitHub. Vuoto = schede dentro il Foglio Compresenze. Per nasconderlo anche su Drive agli studenti,
  // si può mettere in un Foglio a parte condiviso solo con i docenti e scrivere qui il suo ID.
  fileSostegno: '',
  // Gruppi PROPOSTI per la scheda «Compresenze» di Orario Facile (orario-facile/scheda-compresenze.js), validi per qualsiasi
  // scuola: si usano solo finché nel Foglio Compresenze non c'è la scheda «Gruppi». Le ore previste e i docenti di ogni gruppo
  // cambiano da scuola a scuola (numero di classi, cattedre di potenziamento, ore eccedenti…): si scrivono nella scheda, che li salva
  // nella scheda «Gruppi» del Foglio, sul Drive della scuola (qui niente numeri, niente codici, niente nomi).
  // tipo = testo della colonna Tipo (e della casella nell'orario); nelleOreDi = materia in parallelo (le ore previste
  // si contano da sole nell'orario, es. Alternativa = quante ore di Religione ci sono); altriNomi = vecchi testi di Tipo.
  gruppiCompresenze: [
    { tipo: 'Potenziamento L2', spiegazione: 'Italiano per alunni stranieri: completa le cattedre di lettere.' },
    { tipo: 'Alternativa', nelleOreDi: 'Religione', spiegazione: 'In parallelo a Religione, alla stessa ora; in qualche classe può non esserci.' },
    { tipo: 'Italiano eccedente (prolungato)', spiegazione: 'Ore aggiuntive di italiano sul tempo prolungato.' },
    { tipo: 'Matematica eccedente (prolungato)', spiegazione: 'Ore aggiuntive di matematica sul tempo prolungato.' },
    { tipo: 'Completamento tempo prolungato', altriNomi: ['Tempo prolungato'], spiegazione: 'Ore di cattedra che mancano nell\'orario: diventano compresenze.' },
    // gruppi SENZA CLASSE (senzaClasse: true): solo docente, giorno e ora; nell'orario di sintesi «R» e «D» colorate.
    // luogo = dove si svolge (se l'aula non è indicata)
    { tipo: 'Ricevimento parenti', senzaClasse: true, luogo: 'Atrio – accoglienza dei genitori', altriNomi: ['Ricevimento'], spiegazione: 'L\'ora in cui il docente riceve i genitori, accolti nell\'atrio: non serve la classe.' },
    { tipo: 'Disponibilità supplenze', senzaClasse: true, altriNomi: ['Disponibilità', 'Disposizione'], spiegazione: 'Le ore in cui il docente è a disposizione per le sostituzioni: non serve la classe.' }
  ],

  // PIANTINE (js/piantine.js): un'immagine per piano, su Google Drive (condivisa in lettura con l'Istituto; mai su GitHub:
  // sono tavole tecniche dell'edificio). piano = la lettera o cifra con cui iniziano i codici delle aule di quel piano
  // (S03ART1 → S, 110ITA4 → 1…), nome = come si chiama, file = ID del file su Drive. La posizione di ogni aula si segna in
  // Orario Facile (scheda Aule) e va nel Foglio Database, scheda «Aule», colonne Piano, X, Y.
  piantine: [
    // disegni SVG semplificati a rettangoli (Drive COMPRENSIVOALMESE, cartella delle piantine)
    { piano: 'S', nome: 'Piano seminterrato', file: '1yCrLP5xUm9iZCKS344AF_18uAVa_Rtsq' },
    { piano: '1', nome: 'Piano terreno', file: '1EXmd-QQkktZa9lWneeHCEqqzQHvOp84E' },
    { piano: '2', nome: 'Primo piano', file: '1GU5IwGB9uAqVOeEmzhtcL6pDGEE0K7py' },
    { piano: '3', nome: 'Secondo piano', file: '1HSu6mgPunhR6zaN9qKu-gkrHonnorczn' },
    // plesso della scuola primaria (altro edificio): codici di piano PT e P1, scritti nella colonna «Piano» del Database
    { piano: 'PT', nome: 'Primaria – piano terra', file: '18gejLSLECUcic3iDjuuvaWBUgB_ssRfR' },
    { piano: 'P1', nome: 'Primaria – primo piano', file: '16NTQFaVrmftTlcYD1brB8GfqaCOI53z1' }
  ],

  // Dove si trova il file con l'orario (formato dell'app oppure backup di Orario Facile).
  // Con la pubblicazione su Drive (vedi sotto) serve solo come riserva, se Drive non risponde.
  urlDati: '../dati/orario.json',

  // PUBBLICAZIONE SU GOOGLE DRIVE (tasti «Pubblica orario» e «Pubblica sostituzioni» di Orario Facile,
  // vedi app/js/pubblica-drive.js). Gli ID non sono segreti: senza i permessi su Drive non servono a niente.
  // - cartellaPubblicazione: la cartella di Drive dove Orario Facile salva i file (la parte del link dopo /folders/).
  //   Dentro c'è anche la cartella «backup orario», con un backup per ogni giorno in cui si pubblica.
  cartellaPubblicazione: '1x3BIvxl3dGcqtGUTr56aCa9xhaSpbSot',
  // - cartellaOrario: se non è vuota, l'orario pubblicato e la cartella «backup orario» stanno qui invece che in
  //   cartellaPubblicazione (le sostituzioni restano in cartellaPubblicazione). Serve per tenere l'orario su un Drive
  //   personale, dove si può condividere con «Chiunque abbia il link»; chi pubblica deve esserne Editor.
  cartellaOrario: '',
  // - fileOrarioPubblicato / fileSostituzioniPubblicate: ID dei file che l'app legge. Li mostra Orario Facile
  //   dopo la prima pubblicazione. Finché sono vuoti l'app continua a leggere urlDati da GitHub.
  // Vuoto per scelta: l'app legge l'orario da GitHub (urlDati). Per tornare a leggerlo da Drive rimettere
  // l'ID del file orario-pubblicato.json sul Drive della scuola: '18OB3AMivfH-T9-tXU3v2za2Ladzd3-fo'.
  fileOrarioPubblicato: '',
  fileSostituzioniPubblicate: '1EPjN8fG3ZNjiN60ytACbtykzUxiXyEx3',
  // - googleApiKey: "chiave API" di Google (non segreta, limitata al sito github.io e alla Google Drive API).
  //   Permetterebbe anche alle LIM di leggere i due file senza accedere a Google, ma solo se sono condivisi con
  //   «Chiunque abbia il link», cosa che la nostra scuola blocca. Per questo resta vuota: l'app legge i file con
  //   il permesso Google di chi ha fatto l'accesso (basta la condivisione con l'Istituto, vedi leggiDrive in dati.js).
  googleApiKey: '',

  // Orari della campanella (tasto con la campanella). Se il file manca, si usano gli orari delle ore
  urlCampanella: '../dati/campanella.json',

  // Impegni dell'anno (riunioni, collegi, scrutini…) per il tasto «Impegni»: vedi js/calendario.js.
  // Ogni anno si importano dal Piano annuale delle attività (tasto «Importa dal Piano delle attività» del calendario,
  // per chi è autorizzato a Orario Facile): il foglio sta nella cartella del Foglio Database, gli impegni letti vanno in
  // «impegni-pubblicati.json» nella cartellaPubblicazione. fileImpegniPubblicati: ID di quel file (facoltativo: se è
  // vuoto lo si cerca per nome). Niente copia su GitHub (repository pubblico).
  // SOLO DOCENTI: l'app mostra il tasto solo ai docenti, ma la vera protezione è la condivisione su Drive. cartellaImpegni =
  // cartella dove si pubblica impegni-pubblicati.json, da condividere SOLO con i docenti (non con tutto l'Istituto, dove ci
  // sono anche gli studenti). Vuota = cartellaPubblicazione (quella di orario e sostituzioni).
  // (dal 02/10/2026: cartella creata apposta per gli impegni, da condividere solo con i docenti)
  cartellaImpegni: '1VBeMvnuJG17h26AIqxXEDA7o8HmRt6om',
  fileImpegniPubblicati: '',

  // 40+40 ORE (attività funzionali dei docenti, js/quaranta-ore.js e orario-facile/scheda-40ore.js): Foglio Google «40 ore»
  // con le schede Impegni (classi e orari), Docenti (tipo di cattedra, ore, scuola di completamento, «Visibile al docente»)
  // e Impostazioni. Contiene i NOMI: su Drive va condiviso SOLO con chi ha SI nella colonna «40 ore» delle Autorizzazioni.
  // Orario Facile pubblica per i docenti «quaranta-ore.json» (solo codici) nella cartellaImpegni. Vuoto = scheda spenta.
  file40ore: '11B4u4jBuVv4kGQyrt3PRINjRtUcZ-c-m6HVZZbssjp4',

  // Per quanti giorni l'accesso resta memorizzato se si spunta "Ricordami"
  giorniRicordami: 30,

  // Monitor di classe: dopo quanti minuti senza tocchi si torna alla schermata iniziale
  minutiRitornoMonitor: 2,

  // LIM delle aule (monitor): durante gli intervalli compare a tutto schermo dove vanno
  // le classi nell'ora successiva, dall'inizio alla fine dell'intervallo (vedi js/intervallo.js).
  // Se si cambiano gli inizi, aggiornare anche lo script app/lim/ che apre l'app sulle LIM Windows.
  intervalliLim: [
    { inizio: '09:55', fine: '10:05' },
    { inizio: '11:50', fine: '12:05' }
  ],

  // Schermo all'ingresso: ogni quanti secondi cambia vista (classi, docenti, aule).
  // Si può cambiare anche dal menu o con l'indirizzo .../app/?ingresso=30
  secondiRotazioneIngresso: 20,

  // Ogni quanti minuti si ricontrolla se l'orario è stato aggiornato
  // (basso, così le modifiche dell'ultimo minuto arrivano presto: il file è piccolo)
  minutiAggiornamentoDati: 5,

  // Tema "secondo l'ora": scuro da oraInizioScuro fino a oraFineScuro (ore intere, 0-23)
  oraInizioScuro: 19,
  oraFineScuro: 7
};
