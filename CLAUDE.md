# CLAUDE.md – orario (IC Almese)

## Il progetto
Sito web con l'**orario scolastico di una scuola DADA** (Didattiche per Ambienti Di Apprendimento):
nelle scuole DADA le aule sono assegnate alle materie/ai docenti e sono **gli studenti a spostarsi**.
Il sito deve quindi mostrare chiaramente, per ogni ora: classe, materia, docente e **aula**.

Viene pubblicato con **GitHub Pages** direttamente da `main`, cartella radice:
https://comprensivoalmese.github.io/orario/ (pagina iniziale con i link alle due app).
Non rompere mai questi requisiti: percorsi relativi, niente build, `.nojekyll` presente,
`localStorage` sempre dentro `try/catch` (su github.io è condiviso tra tutti i repo dello stesso utente,
quindi usa chiavi con prefisso, es. `orariofacile.` e `orariodada.`).

Le parti del progetto:
- **`app/` – Luis@i** (prima si chiamava Orario DADA): app di *visualizzazione* per smartphone, tablet e monitor di classe (PWA installabile,
  accesso con Google limitato a @comprensivoalmese.it). Dettagli in `app/LEGGIMI.md`.
- **`orario-facile/` – Orario Facile**: app per *creare* l'orario. Il suo backup JSON salvato come
  `dati/orario.json` viene letto direttamente dall'app di visualizzazione: se cambi il formato del backup,
  aggiorna anche `daOrarioFacile()` in `app/js/dati.js`.
- **Integrazione**: sullo stesso dispositivo l'app legge direttamente la bozza di Orario Facile dal
  `localStorage` (chiave `orariofacile.v2`) e si aggiorna con l'evento `storage`. Non cambiare quella chiave
  senza aggiornare `CHIAVE_BOZZA` in `app/js/dati.js`. Orario Facile ha il pulsante "Vedi nell'app" e, in Esporta,
  "Scarica orario.json" (vecchio metodo: il file va caricato in `dati/`, ora serve solo da riserva).
- **Pubblicazione su Google Drive**: i tasti «📤 Pubblica orario» (scheda Orario) e «📤 Pubblica sostituzioni» (scheda
  Sostituzioni) di Orario Facile (`orario-facile/pubblica.js` + `app/js/pubblica-drive.js`) salvano nella cartella
  `CONFIG.cartellaPubblicazione` i file `orario-pubblicato.json`, `sostituzioni-pubblicate.json` e il backup del giorno
  nella cartella «backup orario». L'app li legge con `CONFIG.fileOrarioPubblicato`/`fileSostituzioniPubblicate` +
  il permesso Google di chi ha fatto l'accesso (`Dati.leggiDrive()` in dati.js, `Supplenze.scarica()`): la scuola blocca la
  condivisione «Chiunque abbia il link», quindi `CONFIG.googleApiKey` resta vuota e basta la condivisione con l'Istituto.
  Se non si può leggere Drive, legge l'ultima copia salvata o `dati/orario.json` come prima.
  Nei file pubblicati solo codici DOC01…: mai nomi veri, mai il flag «permesso» delle assenze.
  Le sostituzioni si pubblicano con `app/js/pubblica-sostituzioni.js` (`unisciEPubblica`): rilegge il file e cambia solo
  quelle di questo dispositivo (ID ricordati in `sostituzioni.pubblicateDaQui`), mai sovrascrivere il file intero;
  nell'app `avviaAutomatica()` pubblica da sola le modifiche fatte da «Sostituzioni smart». Nel file pubblicato ci sono
  `assenze`, `registro` e `cambi` (cambi d'aula, chiave locale `sostituzioni.cambiAula`, senza il motivo); l'app li unisce
  ai dati locali in `Supplenze.settimana()` (`cambioAula()` per la tabella, `avviso-per-te.js` per il riquadro).
- **Foglio database** (su Drive si chiama «Database» dal 27/09/2026; `orario-facile/database.js`, formato in `orario-facile/DATABASE.md`): l'archivio unico dell'orario è
  un Foglio Google (`CONFIG.fileDatabaseOrario`) che Orario Facile carica e su cui salva (scheda Esporta). Legge/scrive
  solo le colonne «dati» in posizioni fisse (le formule e i colori li crea una volta `strumenti/crea-database.ps1`);
  la griglia «Orario» è docente × ora con la scrittura breve `1A`, `1A STO`, `1A ITA @MENSA`, `+2B SOS`, `… *`.
  Se cambi il formato, aggiorna insieme database.js, DATABASE.md e lo script. I nomi veri del Foglio restano solo in memoria.
- **Compresenze** (`app/js/compresenze.js`): ore in cui un secondo docente è in classe con il titolare (potenziamento L2,
  tempo prolungato, Alternativa in parallelo a Religione, sostegno…). Arrivano dal Foglio Google «Compresenze»
  (`CONFIG.fileCompresenze`, primo foglio: Codice docente, Classe, Giorno, Ora, Tipo; ogni ora deve avere un docente, le righe
  incomplete si ignorano) e dalle celle «+» di Orario Facile (`v.co`, `compresenzeOF` in dati.js). L'app le aggiunge a
  `D.lezioni` (con `compresenza: true`) solo se è spuntato il quadratino «Compresenze»; nella tabella (`viste.js`), se nella cella c'è anche il
  titolare, ogni compresenza è una riga sottile «＋ docente · tipo» (`.lezione-compatta`, si apre toccandola) per non allungare la riga su telefono; le curricolari restano in
  `D.lezioniCurricolari` (le usa modifiche.js). Sul dispositivo si salva solo una copia con i codici.
  La gestione è STRUTTURALE e sta in Orario Facile (l'app serve al quotidiano): scheda «8 Compresenze»
  (`orario-facile/scheda-compresenze.js` e `.css`, indirizzo `#compresenze`; nell'app solo il collegamento «✎ Modifica» per i
  modificatori). È la maschera d'inserimento: legge e riscrive con la Sheets API il primo foglio del Foglio Compresenze
  e la scheda «Gruppi» (gruppi, ore previste e docenti previsti di QUESTA scuola: cambiano da scuola a scuola, quindi
  [nella pagina tutte le schede – Gruppi e ore previste, un gruppo per scheda, Sostegno – sono uguali (`blocco()`, `.comp-blocco`), si
  aprono e chiudono dalla testata e all'apertura sono CHIUSE (`blocchiAperti`, solo in memoria); i gruppi «senza classe» (Ricevimento
  parenti, Disponibilità supplenze) hanno «📥 Carica da file» (`caricaSenzaClasse`: una riga per ora con Docente/Giorno/Ora/Luogo,
  l'ora anche come orario d'inizio «10:05», oppure una colonna per giorno con le ore; per i docenti del file le ore si sostituiscono)];
  stanno su Drive e non nel codice; `CONFIG.gruppiCompresenze` contiene solo i gruppi proposti, senza numeri né codici).
  Un gruppo con «nelle ore di» una materia (Alternativa → Religione) conta da solo le ore previste nell'orario.
  **Alternativa: disponibilità e bozza di copertura** (dal 07/10/2026, riquadro dentro il gruppo Alternativa della scheda 8;
  calcoli in `orario-facile/alternativa.js`, interfaccia in `scheda-compresenze.js`): «Carica le disponibilità» legge il file delle
  risposte del modulo, da file oppure direttamente dal Foglio Google delle risposte (link nel riquadro + «🔄 Aggiorna dal Foglio»: chi
  c'era tiene i suoi dati dei criteri, il link si ricorda sul dispositivo) (Cognome e Nome, giorni con le ore «3, 4, 6», «Oppure: Nessuna disponibilità»; serve «👁 Nomi» per riconoscere i
  docenti dal nome, `ctx.nomi()`), le salva nella scheda **«Disponibilità Alternativa»** del Foglio (`CONFIG.fileAlternativa`, vuoto =
  Foglio Compresenze; nomi veri e punteggi: solo su Drive) e controlla ogni ora: «nell'elenco» = per quel giorno e ora c'è una classe con
  Religione dove il docente è libero e non è della classe (`motivoLibero`, la stessa regola della tendina). «▶ Simula la copertura»
  assegna le ore di Religione ancora senza docente con un flusso a costo minimo (BigInt, ordine dei criteri rispettato): sempre prima
  coprire più ore possibile, poi i criteri spuntati e ordinati (▲▼): 1 priorità per le esclusioni degli anni passati, 2 accontentare il
  maggior numero di docenti, 3 continuità sulla classe dell'anno scorso (le classi «salgono» di un anno: la 1A di allora è la 2A di oggi),
  4 punteggio di graduatoria (più alto o più basso = precedenza); infine equilibrio delle ore (limite per docente automatico o scelto).
  **Esclusioni e limiti** (spunte con soglie modificabili): si escludono i docenti con meno di 18 ore di cattedra (COE e part time;
  cattedra = lezioni curricolari dell'orario + gruppi «completamento» e «potenziamento», che completano la cattedra) e non si superano
  24 ore in tutto (cattedra + altre ore eccedenti con classe, sostegno incluso + Alternativa già scritta; ricevimento e disponibilità
  per le supplenze non contano). Per ogni docente il riquadro mostra «ore: 14 + 4 compl. = 18 su 24» (`altOre` in scheda-compresenze.js).
  «Carica la graduatoria interna» (.xlsx/.ods/.csv; `Alternativa.leggiGraduatoria`/`abbinaPunteggi`) trova da sola intestazioni, nome e colonna del
  punteggio (si può cambiare colonna) e scrive i punteggi ai docenti riconosciuti dal nome; il file non si conserva. Le schede dei gruppi
  (Alternativa, Potenziamento L2…) si contraggono toccando il titolo (`gruppiChiusi`).
  Regole della graduatoria (scelte della scuola, 07-08/10/2026): senza punti nel file (in cima alla graduatoria per la L. 104, colonna
  «Precedenza L. 104» = SI) il punteggio resta VUOTO e va scritto a mano quando si ha quello reale: per l'Alternativa la 104 NON dà
  precedenza e il motivo non si mostra (intanto vale 0, un vecchio «L.104» salvato nel Foglio torna vuoto); 0 punti = anno di prova
  (resta 0); chi non è nell'elenco (tempo determinato o altra scuola) vale 0.
  **Modifiche a mano della bozza** (`alt.vincoli`, `altModifica`): per ogni ora un menu per scegliere un altro docente (resta fisso 🔒 e il resto si
  ricalcola), ✕ toglie il docente da quell'ora, ⛔ lo toglie da tutta la bozza, ↺ annulla una modifica, «Azzera le modifiche» riparte da capo.
  Per ogni docente si scrivono (nel riquadro o nel Foglio) esclusioni, classi dell'anno scorso e punteggio. «Applica la bozza» scrive le
  righe nel gruppo (poi «Salva sul Foglio»). Prove: `.claude/test-alternativa.html` e `.claude/test-scheda-alternativa.html` (locali).
  **Sostegno** (dato sanitario, GDPR): griglia «Sostegno» (un docente per riga, giorni × ore, in ogni cella la classe) e scheda
  «Sostegno classi» (spunta e ore previste) nel Foglio Compresenze o in `CONFIG.fileSostegno`; nell'app solo per docenti e
  modificatori, solo in memoria; «Scarica orario.json» di Orario Facile toglie le compresenze «SOS…». Mai su GitHub.
- **Piantine** (`app/js/piantine.js`, `app/css/piantine.css`, editor `orario-facile/scheda-piantine.js` nella scheda 3 Aule):
  un'immagine per piano su Drive (`CONFIG.piantine`: piano = lettera/cifra iniziale dei codici delle aule, nome, file = ID),
  MAI su GitHub (tavole tecniche); la posizione di ogni aula (Piano, X %, Y %) nelle colonne D-F della scheda «Aule» del
  Foglio Database. Nell'app un'aula segnata diventa un tasto (`data-piantina`) che apre «📍 Dov'è».
  Le immagini possono essere PNG/JPG (segnaposto sul punto) o, meglio, SVG semplificati a rettangoli: `<rect class="stanza"
  data-nome data-cx data-cy>` (centro in %) si toccano (in Orario Facile l'aula va al centro della stanza; nell'app la stanza
  dell'aula è gialla e le altre aule del piano si toccano), `class="servizio"` = scale, bagni… non si toccano. L'SVG viene
  ripulito (`svgPulito`: niente script né attributi on…) prima di entrare nella pagina. Aula in un altro edificio: nella
  colonna «Piano» un testo che non è un piano (es. «Edificio mensa», «Campo sportivo»): toccandola compare solo dove si trova.
- **Dati della scuola in Orario Facile**: `orario-facile/index.html` contiene i dati 2026/27
  (`CSV_SCUOLA_CLASSI`, `CSV_SCUOLA_DOCENTI` e `datiScuola()`), caricati alla prima apertura e con il pulsante
  "Dati scuola 2026/27". **Privacy**: il repo è pubblico, quindi i docenti compaiono solo con un codice
  (DOC01, DOC02…, assegnati in ordine casuale: niente iniziali, niente ordine alfabetico). La corrispondenza codice → nome
  sta nella scheda Docenti del Foglio database (colonne Cognome e Nome), sul Drive della scuola, visibile a tutti gli
  account dell'Istituto (docenti **e studenti**: scelta della scuola, 27/09/2026) ma mai su GitHub; non pubblicare mai
  nel repo nomi completi, iniziali, PDF o fogli con i nomi dei docenti.
  Per vedere i nomi: `app/js/nomi.js` (`NomiDocenti.carica(email)`) legge con il permesso dell'utente la scheda Docenti
  di `CONFIG.fileDatabaseOrario` (oppure il vecchio file `CONFIG.fileNomiDocenti`, se è ancora indicato) e restituisce
  una Map codice → {cognome, nome}; i nomi stanno
  solo in memoria (in Orario Facile: pulsante «👁 Nomi», `NOMI`, `nomeDoc()`; nell'app: pulsante «👁 Nomi» nella barra (da 960 px in su) e voce nel menu utente,
  `applicaNomi()` in app.js, che cambia solo `D.docente[].nome` e tiene il codice in `.codice`), mai in localStorage, backup o CSV.
- **Autorizzazioni** (dal 27/09/2026, `app/js/autorizzazioni.js`): file a parte «Autorizzazioni» (`CONFIG.fileAutorizzazioni`,
  prima scheda), condiviso in lettura SOLO con gli autorizzati: chi non può aprirlo non ha autorizzazioni. Colonne: Nome, Cognome, Email, **Orario Facile** (SI/NO), **Sostituzioni** (SI/NO).
  Orario Facile: la porta (`porta.js`) fa entrare solo chi ha SI in «Orario Facile» (esito ricordato fino a sera sul dispositivo);
  sostituzioni: `RegistroDrive.abilitazione` usa la colonna «Sostituzioni»; app: le voci di Gestione si vedono solo con
  l'autorizzazione giusta (`controllaAutorizzazioni` in app.js). Finché la scheda non c'è valgono le regole di prima (qui sotto).
  Si crea con «Crea la scheda Autorizzazioni» (Orario Facile → Esporta), che ci sposta l'elenco del file delle sostituzioni.
- **Ruoli** (regole di prima, ancora usate finché manca la scheda Autorizzazioni): *modificatori* (possono usare Orario Facile) e *fruitori* (solo l'app). `app/js/ruoli.js` +
  `CONFIG.editori` in `app/js/config.js` (codici SHA-256 di 16 caratteri, **mai email in chiaro**: repo pubblico;
  lista vuota = tutti modificatori). Orario Facile è protetto da `orario-facile/porta.js`/`porta.css`, che riusano
  `app/js/accesso.js` (stessa sessione `orariodada.sessione`). È un controllo lato browser: la vera protezione
  dell'orario pubblicato sono i permessi del repo GitHub.
- **Sostituzioni docenti**: è la scheda 10 di Orario Facile (`#p-sostituzioni`, `renderSostituzioni()`), ma il suo codice
  sta in file separati in `sostituzioni/` (css/, js/) per non gonfiare `orario-facile/index.html` e ridurre i conflitti.
  Orario Facile li carica con `<script src="../sostituzioni/js/...">` insieme a `../app/js/dati.js` e chiama
  `Sostituzioni.monta(contenitore, () => Dati.normalizza(S))`: se cambi il formato di `S` o l'interfaccia di `Dati`,
  controlla anche la scheda. Id HTML con prefisso `sost-`, classi CSS `.sost`/`sost-` (Orario Facile ha già un `#fileFoglio`).
  Legge il foglio del conteggio ore (.ods/.xlsx/.csv) **solo nel browser** e salva in `localStorage` con chiavi
  `sostituzioni.`; nel repo solo facsimili con nomi inventati in `sostituzioni/esempio/`. `sostituzioni/index.html`
  rimanda a `orario-facile/#sostituzioni`. Dettagli in `sostituzioni/LEGGIMI.md`.
  Copie di file riservati vanno in `privato/` (esclusa da git).
  Anche l'app legge `sostituzioni.assenze` e `sostituzioni.registro` (`app/js/supplenze.js`) per evidenziare nella tabella
  le sostituzioni della settimana: se cambi il formato di assenze o registro, aggiorna anche quel file.
  Il foglio del conteggio può stare su Google Drive (`CONFIG.fileConteggioOre`): `sostituzioni/js/drive.js` lo legge e
  scrive +1/-1 nella settimana del sostituto quando si assegna o si annulla una sostituzione (`segnaNelFoglio()`).
  **Annullare dalla tabella**: chi è autorizzato alle sostituzioni vede «✕ Annulla» sulle sostituzioni della tabella
  (`app/js/viste.js`, `stato.puoAnnullare`); si apre la pagina smart che chiede conferma e chiama `annullaVoce()` del motore:
  −1 nel foglio del conteggio e riga tolta dal foglio «Sostituzioni», anche per le sostituzioni registrate su un ALTRO dispositivo.
  Quelle vanno nell'elenco `annullate` (chiave `sostituzioni.annullate` e campo `annullate` del file pubblicato):
  `supplenze.js` le nasconde e `PubblicaSostituzioni.applicaAnnullate()` le toglie dal registro del dispositivo che le aveva
  registrate (senza un secondo −1). Il file pubblicato ora ha anche `nelFoglio`/`nelRegistro`/`riportata` per ogni sostituzione.
  **Assenze e sostituzioni di tutti** (scheda di Orario Facile e pagina smart): `caricaTutte()` unisce il file pubblicato e i dati
  di qui (senza le annullate; `tutte.elenco` = sostituzioni, `tutte.assenze` = assenze); «Annulla per tutti» chiama `annullaPerTutti()`
  = `annullaVoce()` + `pubblicaSubito()`. **Togliere un'assenza è reversibile per tutti** (dal 27/09/2026): «Togli»/«Togli per tutti»
  e il tasto «✕ Togli assenza» della tabella dell'app (`togliAssenza()` se è di qui, `togliAssenzaPerTutti()` se è di un altro
  dispositivo) annullano anche le sue sostituzioni (−1 a chi sostituiva), restituiscono le ore di recupero nel foglio del conteggio
  e pubblicano subito. Le assenze di altri dispositivi tolte finiscono in `assenzeAnnullate` (chiave e campo del file pubblicato):
  tutti le nascondono e `applicaAnnullate()` le toglie al dispositivo d'origine. Le ore di recupero NON sono nel file pubblicato
  (dato personale): stanno nella scheda «Recuperi» del file delle sostituzioni (`RegistroDrive`, tipo 'recuperi', riga per ID,
  `aggiornaRigaRecupero`); chi toglie l'assenza le legge lì (`restituisciRecupero`); se la riga non c'è, le restituisce il
  dispositivo d'origine (coda `sostituzioni.daSistemare`, `sistemaInSospeso()`). Ridurre le ore di un'assenza annulla (con −1)
  le sostituzioni delle ore tolte.
  **Chi può fare le sostituzioni** lo decide il Foglio Google `CONFIG.fileSostituzioni` (`sostituzioni/js/registro-drive.js`):
  foglio «Autorizzazioni» (nomi ed email degli autorizzati) e foglio «Sostituzioni» (una riga per sostituzione assegnata,
  con i **nomi veri** dei docenti presi da `fileNomiDocenti` e tenuti solo in memoria). Su GitHub e in `localStorage`
  restano **solo i codici DOC01…**: i nomi veri stanno solo nei file su Drive.
  **Uscite didattiche** (`sostituzioni/js/uscite.js`, caso «🚌 Uscita didattica» della scheda, chiave `sostituzioni.uscite`):
  classi fuori + accompagnatori (assenze con `uscita`/`come: 'accompagna'`, senza recupero); le lezioni delle classi fuori non
  si coprono (`oreDaCoprire`); i docenti «liberati» coprono senza +1 (`reindirizzato` nel registro, esclusi dalle ore da riportare);
  le ore liberate all'inizio/fine giornata vanno a recupero (`come: 'recupero'`), quelle in mezzo «a disposizione»; almeno 1 ora
  resta sempre. Pubblicate solo data/classi/ore (`uscite` nel file pubblicato); nell'app «🚌 Uscita didattica» (`sost.uscita`).
  **Scioperi e assemblee sindacali** (`sostituzioni/js/scioperi.js`, caso «✊ Sciopero / assemblea», SOLO in Orario Facile; chiave
  `sostituzioni.scioperi`, solo codici): si carica il file delle adesioni (Docente, data_presa_visione, adesione; letto solo nel
  browser con `Foglio.leggiTabelle`, nomi solo in memoria; `classifica()`: per l'ASSEMBLEA solo «Adesione confermata», CCNL art. 31,
  gli altri in servizio, coperture = sostituzioni con lezione e opzione docenti a recupero +1); sciopero: potenziali = presa visione + adesione confermata / «non ha
  ancora maturato una decisione» / vuota. `calcola()` guarda anche le compresenze (`Compresenze.lezioni(D)`, sostegno compreso):
  ore iniziali scoperte = entrata posticipata (orari da `dati/campanella.json`), finali = uscita anticipata, intermedie = vigilanza
  (priorità: curricolare di una classe in compresenza, poi orario di tutta la scuola ridotto di 1-3 ore con chi perde le
  ultime ore; MAI ore in più: niente liberi né docenti a debito, nessun +1). Conferma = sostituzioni con `sciopero`/`vigilanza` nel registro, NON pubblicate; nel file
  pubblicato solo `scioperi` con gli effetti sulle classi (entra/esce/vigilanza e chi vigila, `da` se spostato). **Mai pubblicare
  chi sciopera** (dato sindacale, GDPR art. 9). L'app legge soltanto: `Supplenze.testoSciopero()` per tabella, In breve e avviso.
  Nell'app la parola «sciopero» non si vede MAI (scelta della scuola, 02/10/2026): ore in cui la classe non c'è = `.lezione-spenta`
  (grigia, senza etichetta, materia e docente in grigio). Il piano pubblicato ha anche `nomeClasse`/`nomeDa` e il `codice` DOC…
  di chi vigila: `Supplenze.settimana()` li usa se gli ID dell'orario dell'app sono diversi (orario caricato a parte in Orario Facile).
  **Sostituzioni smart** (`app/js/smart.js`, menu dell'app): versione semplice della scheda che usa lo stesso motore con
  `Sostituzioni.collega(funzioneOrario, { avvisa, ridisegna })` (restituisce le funzioni del motore). Se cambi il motore,
  controlla sia la scheda (`monta`) sia la pagina smart (`collega`); la costante `VERSIONE` in cima a sostituzioni.js
  si vede nella scheda e serve a capire se una pagina aperta è aggiornata.
  **Orario delle sostituzioni**: sempre quello UFFICIALE pubblicato (`Dati.caricaPubblicato()`), mai la bozza di Orario
  Facile (scelta della scuola, 02/10/2026): la scheda 10 lo scarica in `renderSostituzioni()`, la pagina smart se l'app mostra la bozza.
  **Compresenze nelle sostituzioni** (issue #7, fatto il 02/10/2026): il motore legge le compresenze (`Compresenze.lezioni`,
  sostegno compreso, solo in memoria); le ore di compresenza non sono mai «da coprire» ma si possono segnare come assenze;
  `spostamentoDi()`: con il sostegno si sposta il docente di cattedra (il sostegno resta), con potenziamento e altre si sposta
  il compresente, l'Alternativa è l'ultima possibilità. Chi è spostato non prende +1 (`spostato: { da }` nel registro,
  `senzaOreInPiu()`; NON `reindirizzato`, che è delle uscite). `candidati()` ordina a gruppi (classe: ora buca → spostabili →
  liberi; poi gli altri nello stesso ordine; Alternativa ultima) e dà a ogni proposta `motivo` e `opzioni`. Nell'app
  `Supplenze.lezioni()` (usata da viste.js e brief.js) nasconde il docente spostato nella classe lasciata e mette al suo posto
  il solo sostegno con la stessa materia (senza docente per chi non vede il sostegno). Dettagli in `sostituzioni/LEGGIMI.md`.
- **Impegni** (`app/js/calendario.js`, `app/css/calendario.css`, tasto «Impegni» nella barra dell'app): calendario mensile
  in stile Google Calendar degli impegni collegiali, colori per scuola (istituto, infanzia, primaria, secondaria). I dati vengono
  dal foglio «Piano …» del Piano annuale delle attività (non dai fogli «secondaria» o «calendario regionale»).
  **Mai su GitHub e SOLO PER I DOCENTI** (scelte della scuola, 02/10/2026): il tasto si vede con la regola del sostegno
  (`aggiornaSostegno` in app.js: docente riconosciuto o autorizzato); su Drive il file va in `CONFIG.cartellaImpegni`, cartella
  condivisa solo con i docenti. Dei GLO solo il plesso, mai le classi; niente nomi di persone.
  **Ogni anno** chi è autorizzato a Orario Facile usa «Importa dal Piano delle attività» nel calendario: il foglio .xlsx/.ods
  (o Foglio Google) sta nella cartella di Drive del Foglio Database (se lo si sceglie dal computer l'app ce lo salva),
  `app/js/piano-attivita.js` lo legge (foglio «Piano …», colonne trovate dalle intestazioni ISTITUTO/INFANZIA/PRIMARIA/
  SECONDARIA e GIORNO/ORARIO, data vuota = giorno sopra), anteprima, poi «Pubblica per tutti» scrive
  `impegni-pubblicati.json` in `CONFIG.cartellaImpegni` (vuota = `cartellaPubblicazione`) (`app/js/impegni-drive.js`, usa chiama/cerca/scriviFile di
  pubblica-drive.js). Il calendario legge Drive, poi la copia sul dispositivo (`orariodada.impegni`); se no resta vuoto.
- **40+40 ore** (attività funzionali dei docenti, art. 44 c. 3 CCNL 2019-21; dal 04/10/2026): calcolo in `app/js/quaranta-ore.js`,
  scheda 11 «40+40» di Orario Facile (`orario-facile/scheda-40ore.js` e `.css`, indirizzo `#quaranta`), visibile SOLO a chi ha SI
  nella colonna «40 ore» del file Autorizzazioni (`Autorizzazioni.di().quarantaOre`). Dati nel Foglio «40 ore» (`CONFIG.file40ore`,
  con i NOMI: su Drive solo per gli autorizzati): scheda «Impegni» (righe = blocchi di tempo con le CLASSI impegnate: spazio = in
  parallelo, «/» = uno dopo l'altro con il tempo diviso in parti uguali, vuoto = tutti; GLO = 0,5 ore per gruppo), «Docenti» (tipo di
  cattedra COI/COE/PAR, ore, scuola di completamento, in servizio dal, Visibile al docente) e «Impostazioni» (Visibile a tutti, tabella
  Tipo → Conta in). Le classi dei docenti NON stanno nel Foglio: arrivano dall'orario ufficiale pubblicato + sostegno (mai potenziamento).
  Regola: per giorno e conteggio si somma la durata dell'UNIONE dei blocchi con una classe del docente. Dovute: COI 40+40, COE/PAR
  40×ore/18 (O.M. 446/1997 art. 7 c. 7); formazione obbligatoria (sicurezza, privacy) a parte, nelle ore che restano delle 80.
  ESONERI e FORMAZIONE (dal 04/10/2026): il docente scarica dall'app («Le mie 40+40» → «📥 Scarica il mio Excel», `excelDocente`)
  le sue ore in A e B con la colonna «Esonero» (SI) e una colonna nascosta «chiave» = `data|impegno`; lo rimanda e chi è
  autorizzato lo reimporta con «📥 Importa proposte di esonero» (`leggiEsoneriDaExcel`): righe nella scheda «Esoneri» del Foglio
  (Codice, Docente, Data, Impegno, Ore, Importato il, Approvato; quelle di quel docente si sostituiscono, le già approvate restano
  approvate). Contano SOLO gli esoneri con SI in «Approvato» (tasti «✓ Approva» / «Approva tutte» nel dettaglio del docente,
  `scriviApprovato`, oppure a mano nel Foglio); le proposte in attesa si vedono in giallo e nel riquadro degli avvisi. «✕ Togli» (dettaglio del docente, `togliEsoneri`)
  cancella la riga; il riquadro «Esoneri per impegno» (`esoneriPerImpegno`, casella Cerca, Excel) dice chi è esonerato da ogni impegno.
  **Piano di esoneri (simulazione)** (dal 08/10/2026; calcolo in `orario-facile/piano-esoneri.js`, riquadro «🧮 Piano di esoneri» sotto il
  prospetto): propone a chi ha ore in più gli esoneri per rientrare nella soglia. Criteri da spuntare/regolare (ricordati in
  `orariofacile.pianoEsoneri`): riserva % diversa per A e B (soglia = dovute × (1 − riserva), opzione «formazione tolta dalla B»);
  impegni non svuotati (max % orientativa di esonerati per impegno, anche per tipo, e minimo di presenti); stesso giorno (la stessa
  persona per tutti gli impegni della giornata); richieste dei docenti (proposte nel Foglio) accolte per prime; scaletta dei TIPI di
  impegno (▲▼, in alto i più importanti, «mai» = nessun esonero) e singoli incontri protetti (🔒, elenco con ricerca, `pref.protetti`
  = chiavi «data|impegno»: nessun esonero da quell'incontro); ✕ su ogni proposta la toglie e rifà subito il piano (`pianoTolte`, opzione
  `vietati` = «codice#data|impegno»; ↺ la rimette, «Azzera»). Algoritmo: giri a turno (un esonero o una giornata per docente a
  volta, così i posti si dividono in modo equo), conto esatto con `calcola` (sovrapposizioni), rifinitura (toglie gli esoneri di
  troppo, scambia un impegno lungo con uno più corto non più importante) e nuovo giro con i posti liberati. Si vede per docente e per
  impegno (presenze), si scarica in Excel e si salva con `scriviEsoneriTutti` (una sola scrittura) come proposte o già approvato.
  Prove locali: `.claude/test-piano-esoneri.html`, `.claude/test-scheda-piano.html`, `.claude/test-presenze.html`.
  **Presenze agli incontri già svolti** (dal 08/10/2026): scheda «Presenze» del Foglio «40 ore» (Data, Impegno, Codice, Docente, Presente
  SI/NO, Note; letta da `leggiFoglio` se c'è, `presenzeDaRighe`). Un'ASSENZA toglie le ore come un esonero ma resta a parte: `assente`
  nel dettaglio, `assenze` (ore) per docente, colonna «Assenze» nel prospetto, codice 3 nel file pubblicato e «assente (non conta)» nell'app.
  «📥 Carica presenze» (`leggiPresenzeDaTabelle`) capisce: una riga per docente e incontro (colonna Presente/Assente: SI/NO, P/A, AG, X…),
  elenco dei soli assenti (colonna «Assenti») o dei soli presenti (modulo firme: chi manca è assente), griglia docenti × incontri (data nel
  titolo della colonna); incontri riconosciuti da data + nome/tipo, docenti da codice o nome; per gli incontri del file `scriviPresenze`
  sostituisce le righe di prima. «📄 Modello presenze» (`modelloPresenze`) = Excel con gli incontri fino a oggi e i docenti attesi
  (Presente già a SI). Nel piano di esoneri la spunta «Fotografia a oggi» (`soloFuturi`, data `oggi` non ricordata) esonera solo dagli
  incontri successivi; gli altri contano come sono andati. Le ore di formazione obbligatoria di ogni docente si scrivono nel prospetto (colonna «Ore formazione» della scheda Docenti,
  creata se manca) e si sommano alla formazione degli impegni. `app/js/xlsx.js` (spostato da orario-facile/) sa scrivere formule,
  colonne nascoste e menu a tendina; nell'app servono anche `../sostituzioni/js/docx.js` (lo ZIP) e `js/xlsx.js`.
  Le spunte «Visibile» si scrivono nel Foglio e si pubblicano subito: `quaranta-ore.json` nella `cartellaImpegni`, SOLO codici e solo
  i docenti abilitati; nell'app la voce di menu «Le mie 40+40» (`#btn40ore`, `controlla40()` in app.js) compare al docente il cui codice
  c'è nel file e mostra solo le sue (sezione **«Il mio servizio»** del menu, solo per il docente riconosciuto dall'email).
  Nella stessa sezione **«Le mie sostituzioni»** (`app/js/storico-sostituzioni.js`): registro di tutto l'anno
  `sostituzioni-docenti.json` nella `cartellaImpegni` (solo data, ora, nome della classe, CODICE di chi ha sostituito e
  «senza ore in più»; mai il docente assente), aggiornato in sottofondo da `PubblicaSostituzioni.unisciEPubblica` a ogni
  pubblicazione (aggiunge le nuove, toglie le annullate e, nelle ultime due settimane, quelle sparite dal file pubblicato). «Scarica estratto» crea per ogni scuola di completamento un Excel (`app/js/xlsx.js`, che usa
  `Docx.zip`) con i soli docenti in comune: riepilogo, piano con le righe evidenziate, un foglio per docente.
- **Vigilanza durante l'intervallo** (idea discussa il 29/09/2026, non ancora fatta): all'inizio dell'intervallo le classi
  si spostano; l'insegnante uscente resta nella sua aula e vigila la classe che vi entra (2ª ora → classe della 3ª per
  9:55–10:05, 4ª → 5ª per 11:50–12:05). Proposta e domande aperte in `app/LEGGIMI.md` (sezione LIM). Se qualcuno lo
  chiede, ricordalo e riparti da lì (`js/intervallo.js` calcola già chi arriva in ogni aula).

## Licenza
© 2026 Istituto Comprensivo di Almese (www.comprensivoalmese.it), realizzato dal Gruppo Wolf: **tutti i diritti
riservati**, permessi d'uso solo scritti e decisi dalla scuola (`LICENZA.md` in italiano, `LICENSE` per GitHub). Non togliere gli avvisi nel piè di pagina (pagina iniziale, app in
`$('#piede')` di app.js, Orario Facile) né i commenti in cima alle pagine HTML. I dati della scuola (`dati/`, nomi)
non si concedono mai a terzi. Se si aggiunge codice di altri, controllare che la sua licenza lo permetta e citarlo.

## Il gruppo
- Gruppo **Wolf**; repository `comprensivoalmese/orario` (organizzazione GitHub della scuola; prima era
  `alessandrotrino-creator/iclaudecanti`), studenti **principianti** in programmazione e git.
- Tutti lavorano su tutto, direttamente su `main`.
- **Parla sempre in italiano**: risposte, commenti nel codice, messaggi di commit, documentazione.
- Spiega passo passo e con parole semplici cosa stai facendo e perché; niente gergo senza spiegarlo.

## Tecnologie
- **Solo HTML, CSS e JavaScript puri.** Niente framework, niente Node.js, niente passaggi di build:
  il sito deve funzionare aprendo `index.html` nel browser e su GitHub Pages così com'è.
- Nessuna libreria esterna salvo necessità reale; in quel caso chiedi prima al gruppo.

## Struttura
```
index.html        pagina iniziale del sito (link alle due app)
404.html          pagina per indirizzi inesistenti su GitHub Pages
.nojekyll         dice a GitHub Pages di pubblicare i file così come sono
app/              Luis@i, app di visualizzazione (css/, js/, icone/, sw.js, manifest; lim/ = script per le LIM Windows)
orario-facile/    l'app Orario Facile (un unico index.html autonomo + modelli CSV)
sostituzioni/     codice della scheda Sostituzioni di Orario Facile (css/, js/, esempio/ con facsimili)
potenziamento/    linee guida per assegnare le ore di potenziamento di italiano L2 (linee-guida-L2.md):
                  da seguire quando si costruisce in Orario Facile l'orario dei docenti di potenziamento;
                  le ore di potenziamento stanno nel Foglio Compresenze (gruppo «Potenziamento L2», scheda 8 di
                  Orario Facile); il vecchio Foglio «Orario potenziamento» è archiviato (27/09/2026)
strumenti/        script da usare sul PC (Windows + Excel), es. crea-database.ps1 per creare il Foglio database
dati/orario.json  l'orario letto da app/ (formato dell'app o backup di Orario Facile)
dati/campanella.json  orari della campanella per il tasto 🔔 dell'app (vedi app/js/campanella.js)
img/              immagini
```
- Tieni i **dati dell'orario separati dal codice** (file JSON in `dati/`), così si possono aggiornare senza toccare JS/HTML.
- Preferisci più file piccoli a un unico file enorme: riduce i conflitti tra chi lavora in parallelo.
- Con GitHub Pages usa **percorsi relativi** (`css/base.css`, non `/css/base.css`).
- `app/js/config.js` è l'unico file di configurazione dell'app (dominio, ID client Google, tempi).
- Nota: `fetch()` dei JSON non funziona aprendo il file con doppio clic (`file://`); per provare in locale
  usa un server semplice (es. estensione Live Server o `python -m http.server`).

## Regole di codice (richieste dall'insegnante)
1. **Codice commentato**: commenti in italiano che spiegano *cosa* fa ogni blocco, pensati per principianti.
2. **Accessibilità**: HTML semantico (`header`, `nav`, `main`, `table` con `th`/`scope`, `caption`),
   `alt` su tutte le immagini, contrasto adeguato, uso completo da tastiera, `lang="it"`.
3. **Responsive**: deve funzionare bene su telefono (approccio mobile-first, `meta viewport`,
   tabelle dell'orario leggibili su schermi stretti).
- **Nomi in italiano** per classi CSS, id, variabili e funzioni, in minuscolo con trattini per il CSS
  (`.menu-principale`) e camelCase per JS (`mostraOrario`). Niente accenti nei nomi.
- Indentazione di 2 spazi.

## Git: come lavora Claude
Claude gestisce le versioni in autonomia:
1. **Prima di modificare qualsiasi cosa**: `git pull --rebase`.
2. Commit **piccoli e frequenti**, un argomento per commit, messaggio in italiano chiaro
   (es. "Aggiunge filtro per aula nell'orario").
3. Appena una modifica è completa: commit e **push su `main` senza chiedere** (si può usare `./sync.sh "messaggio"`).
4. Se il push viene rifiutato perché qualcuno ha pubblicato prima: `git pull --rebase` e riprova.
5. **Conflitti**: risolvili tu mantenendo le modifiche di entrambi quando possibile, poi spiega al gruppo
   in modo semplice cosa è stato unito e come. Se due modifiche sono davvero incompatibili, chiedi.
6. Mai `git push --force`, mai riscrivere la cronologia già pubblicata, mai commit di merge (usa sempre il rebase).
