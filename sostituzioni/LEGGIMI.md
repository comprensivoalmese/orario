# Sostituzioni docenti

Scheda **«Sostituzioni»** (la n. 10) di **Orario Facile**, per organizzare la **sostituzione dei docenti assenti**
usando il foglio del conteggio ore (chi è a **debito** e chi è a **credito** di ore).

Indirizzo diretto: **https://comprensivoalmese.github.io/orario/orario-facile/#sostituzioni**
(il vecchio indirizzo `.../sostituzioni/` porta lì).

## Privacy: il foglio non viene pubblicato

Il foglio del conteggio ore contiene i nomi completi dei docenti, quindi **non va mai caricato su GitHub**
(il repository è pubblico).

- **Foglio su Google Drive** (consigliato): il Foglio Google «ORE 26-27 conteggio ore» (ID in `app/js/config.js`,
  campo `fileConteggioOre`) si legge da solo dopo «👁 Nomi», oppure con **"☁️ Carica dal Drive"**. Quando si assegna
  una sostituzione, la scheda scrive **+1** nella cella del docente che sostituisce, nella colonna della settimana
  (settimana 1 = quella del 9 settembre 2026); annullandola toglie 1. Le celle con una formula non vengono toccate:
  quelle ore restano "da riportare" a mano. Serve un vero Foglio Google (non un Excel caricato), la Google Sheets API
  attiva nel progetto Google Cloud e il permesso di modifica sul foglio per chi assegna. Codice: `js/drive.js`.
  **Prima di ogni scrittura** la scheda rilegge nel foglio COGNOME e NOME di quella riga: se le righe sono state
  riordinate, aggiunte o tolte ritrova quella giusta, altrimenti non scrive. Se il file dei nomi dice che il codice
  corrisponde a un'altra persona, non scrive e chiede di correggere l'abbinamento. L'avviso dice sempre in quale
  cella ha scritto (es. "settimana 3, cella G16: ora 1") oppure perché non ha potuto.
- Si carica dalla scheda con **"Carica il foglio"**: viene letto **solo nel browser** di quel computer,
  senza essere inviato a nessuno.
- Assenze, sostituzioni e foglio restano salvati **solo su quel dispositivo** (memoria del browser).
  Il pulsante "Cancella i dati delle sostituzioni da questo dispositivo" li toglie.
- Nel repo ci sono solo i **facsimili** con nomi inventati: `esempio/conteggio-ore-esempio.ods` e `.xlsx`.
- Se tenete una copia del foglio vero dentro la cartella del repo, mettetela in `privato/`:
  quella cartella è esclusa da git (vedi `.gitignore`).

## Chi può fare le sostituzioni e dove vengono scritte

Il Foglio Google **delle sostituzioni** (ID in `app/js/config.js`, campo `fileSostituzioni`) ha due fogli:

- **«Autorizzazioni»**: nomi ed **email** di chi può fare le sostituzioni. In cima alla scheda il riquadro
  **"Abilitazione alle sostituzioni"** controlla l'email di chi è entrato (pulsante *🔐 Verifica la mia abilitazione*;
  si controlla da solo se il permesso di Google c'è già, per esempio dopo «👁 Nomi»).
  Chi non è nell'elenco, o non può aprire il file, può **consultare** ma non registrare assenze né assegnare sostituzioni.
  Per autorizzare qualcuno basta aggiungere una riga con la sua email (in qualsiasi colonna; nome e cognome
  si prendono dalle colonne "Nome" e "Cognome"). Va bene anche se il foglio si chiama «Abilitazioni».
- **«Sostituzioni»**: ogni sostituzione assegnata diventa una **riga** (Data, Giorno, Ora, Classe, Aula, Materia,
  Docente assente, Docente sostituto, Inserita da, Inserita il, ID); annullandola la riga viene cancellata.
  Se il foglio è vuoto l'app scrive prima l'intestazione; se ci sono già delle colonne, riempie quelle con lo stesso nome.

**Nomi veri solo su Drive.** Nel foglio «Sostituzioni» i docenti compaiono con il **nome vero**, preso dal file
riservato dei nomi (`fileNomiDocenti`) e tenuto **solo in memoria**. Dopo la verifica dell'autorizzazione anche la
scheda mostra i nomi veri. Il file dei nomi collega i **codici** DOC01… ai nomi: se l'orario salvato sul dispositivo
usa ancora le iniziali ("F. A."), la scheda lo segnala e bisogna premere «⋯ Altro» → «Dati scuola 2026/27» in Orario Facile. Su GitHub e nella memoria del dispositivo
restano i codici DOC01, DOC02…: non scrivere mai nomi veri nei file del repository.

Serve la Google Sheets API attiva e, per chi assegna, il permesso di **modifica** sul foglio delle sostituzioni:
è Google stesso a impedire di scrivere a chi non ce l'ha. Codice: `js/registro-drive.js`.

## Cambi d'aula

Nella stessa scheda, sotto "Ore da coprire", il riquadro **"Cambi d'aula"** sposta una classe in un'altra aula
**solo in quel giorno** (l'orario base non cambia). C'è anche nella pagina **«Sostituzioni smart»** dell'app.

1. Si sceglie la **classe** e si toccano le **ore** da spostare (ognuna con la sua aula prevista).
2. Vengono proposte solo le **aule libere in tutte le ore scelte**, tenendo conto delle lezioni e degli altri cambi
   di quel giorno (un'aula lasciata da una classe spostata diventa disponibile).
3. **Motivo** facoltativo, poi **Registra il cambio d'aula**. Sotto c'è l'elenco dei cambi del giorno, con *Annulla*.

- Solo per gli autorizzati del foglio «Autorizzazioni», come le sostituzioni.
- Ogni cambio viene scritto nel foglio **«Cambi aula»** del Foglio Google delle sostituzioni (se non c'è, l'app lo crea),
  con il nome vero del docente; annullandolo la riga si cancella.
- I cambi del giorno sono anche nella **stampa** delle sostituzioni.
- Dati nella memoria del browser (chiave `sostituzioni.cambiAula`), condivisi tra Orario Facile e l'app.
  Codice: `js/cambi-aula.js`.

## Sciopero / assemblea sindacale (solo in Orario Facile)

Terzo caso di «Assenze del giorno»: **✊ Sciopero / assemblea**. Si sceglie il tipo (sciopero = tutta la giornata; assemblea =
le ore indicate) e si carica il **file delle adesioni** (.xlsx / .ods / .csv con le colonne Docente, data_presa_visione,
adesione). Il file si legge **solo sul computer**: i nomi servono a trovare i codici DOC… e non si salvano.
- **Potenziali scioperanti**: hanno la data di presa visione e come adesione «Adesione confermata», «Non ha ancora maturato
  una decisione» o niente. Non contano chi non ha la presa visione e chi ha «Adesione negata».
- **Il piano** (anche con le compresenze: sostegno, potenziamento, alternativa): le prime ore scoperte di una classe diventano
  **entrata posticipata** (all'orario della campanella: 3ª ora = 10:05, dopo l'intervallo), le ultime **uscita anticipata**,
  quelle in mezzo **vigilanza** (niente lezione). Chi vigila, in quest'ordine: il docente curricolare di una classe con
  compresenza (il compresente resta con la sua classe), poi, se serve, si accorcia di 1-3 ore
  l'orario di **tutta la scuola** e chi perde le ultime ore copre le ore scoperte. **Mai ore in più** (docenti liberi o a debito):
  si usano solo le ore di chi è già in servizio, e nessuno prende +1.
  Chi non viene usato resta **a disposizione**.
- Si può cambiare tutto: l'elenco dei **potenziali scioperanti** è sempre visibile («✕ Non sciopera», «↩ Rimetti», «+ Aggiungi»: il piano si ricalcola da solo; «🔄 Rigenera il piano» ricalcola senza le scelte fatte a mano), la riduzione dell'orario, chi vigila. Un piano confermato si cambia con «✎ Riapri il piano» (annulla le vigilanze registrate). Poi **✔ Conferma il piano**,
  **🖨️ Stampa il piano**, **📄 Scarica la comunicazione alle famiglie** (vero .docx fatto da `js/docx.js`: si apre anche sul
  telefono; da controllare) o **↺ Azzera**. Se lo sciopero o l'assemblea vengono revocati: **↺ Revoca: togli il piano**
  (annulla le coperture registrate) e poi di nuovo «📤 Pubblica sostituzioni».
- **Assemblea sindacale** (CCNL Istruzione e Ricerca 18/01/2024, art. 31 c. 8-9): contano **solo** i docenti con «Adesione
  confermata» (la dichiarazione di partecipazione è irrevocabile); tutti gli altri sono **regolarmente in servizio**. Si
  sospendono le attività delle sole classi i cui docenti partecipano (entrata posticipata / uscita anticipata) e si fanno gli
  adattamenti di orario di chi è in servizio. Nelle ore coperte **si fa lezione** (sostituzione, non solo vigilanza) e, con
  l'opzione «usa anche i docenti con ore da recuperare», si possono chiamare i docenti a recupero (saldo negativo: +1).
- **Privacy**: l'adesione a uno sciopero è un dato sindacale. Nel file pubblicato e nell'app **non c'è mai chi sciopera**:
  solo, per classe, entrata posticipata, uscita anticipata, «Vigilanza» (classe cerchiata) e chi vigila.
  Dati: chiave `sostituzioni.scioperi`, solo codici; codice: `js/scioperi.js`.
- **Nell'app la parola «sciopero» non si vede mai** (dal 02/10/2026): le ore in cui la classe non c'è (non entra, entra
  dopo, esce prima) sono solo **grigie**, con materia e docente in grigio chiaro e senza etichetta, come ore senza lezione
  («Nessuna lezione» in «In breve», «non si fa» nel riquadro «per te»). La vigilanza resta visibile.
- Il piano pubblicato contiene anche il **nome della classe** (`nomeClasse`, `nomeDa`) e il **codice DOC…** di chi vigila
  (`codice`): se l'orario di Orario Facile è stato caricato a parte e ha ID diversi da quelli dell'app, l'app riconosce
  classi e docenti da questi. Un piano confermato prima del 02/10/2026 non li ha: «✎ Riapri il piano», «✔ Conferma il
  piano» e di nuovo «📤 Pubblica sostituzioni».

## Uscita didattica (i casi: assenza semplice oppure uscita)

In «Assenze del giorno» si sceglie il caso: **👤 Assenza di un docente** (la sostituzione semplice) oppure
**🚌 Uscita didattica**. Per l'uscita si scelgono le **classi che escono**, le **ore** e i **docenti che accompagnano**
(in cima quelli che insegnano nelle classi scelte). Con «Registra l'uscita» gli accompagnatori diventano assenti
(senza recupero: stanno lavorando) e in «Ore da coprire» compare il **piano proposto**:

- le lezioni delle classi fuori **non** si coprono;
- le lezioni degli accompagnatori nelle classi rimaste si coprono prima con i docenti **«liberati»** (la loro classe è
  fuori): sono già a scuola e l'ora è loro, quindi **nessuna ora in più** (niente +1 nel conteggio). Tra i liberati si
  sceglie prima chi ha **lezione prima e dopo** quell'ora; chi ha l'ora liberata all'inizio o alla fine della giornata
  si lascia libero. Se non c'è nessun liberato, si propone il primo docente libero delle proposte normali (+1);
- le ore liberate che restano: all'inizio o alla fine della giornata → **entra dopo / esce prima**, ore **a recupero**
  (−1 per ogni ora nel conteggio); in mezzo ad altre lezioni → **a disposizione**, **niente recupero**;
- **almeno 1 ora** il docente la fa sempre: se tutte le sue ore sono liberate e non copre nessuno, la prima resta a disposizione.

«🧪 Simula l'uscita» è solo una **simulazione** (niente assenze, niente fogli, nessuna autorizzazione, non si pubblica):
si può cambiare chi copre con la tendina, poi **✔ Conferma il piano** (registra gli accompagnatori assenti, assegna le
sostituzioni e le ore a recupero) oppure **↺ Azzera la simulazione**; **🖨️ Stampa il piano** stampa tutto il piano del giorno (anche la simulazione).
**Più giorni consecutivi** (gita): «Fino al giorno» crea un'uscita per ogni giorno di scuola del periodo (campo `gruppo`);
nel piano ci sono i tasti dei giorni e «Conferma / Stampa / Azzera tutti i giorni» (la stampa fa una pagina per giorno). **🗑 Cancella tutte le uscite didattiche** (nel modulo
dell'uscita) toglie tutte le uscite di tutti i giorni con le loro modifiche; quello che non ha scritto nei fogli si toglie
anche senza autorizzazione.
Anche le proposte normali delle singole ore mettono in cima i liberati (🚌), sia qui sia in «Sostituzioni smart».
*Togli* sull'uscita toglie anche le sostituzioni del piano, le assenze degli accompagnatori e i recuperi.
Nell'app le classi fuori si vedono «🚌 Uscita didattica» (file pubblicato: solo data, classi e ore; la descrizione resta
sul dispositivo). Dati: chiave `sostituzioni.uscite`; codice: `js/uscite.js`.

## Come si usa

1. **Carica il foglio** del conteggio ore (.ods, .xlsx oppure .csv, anche scaricato da Fogli Google).
2. Controlla gli **abbinamenti**: nell'orario i docenti sono codici (DOC01, DOC02…). Premi **«👁 Nomi»**
   in alto (serve il permesso sul file riservato dei nomi, su Google Drive): ogni docente viene collegato
   in automatico alla sua riga del foglio. Senza i nomi, o se un abbinamento manca o è dubbio, sceglilo dall'elenco.
3. Scegli il **giorno** e registra il **docente assente** spuntando le ore di assenza.
   La casella **"Permesso"** è spuntata di default: le ore di assenza sono **a debito** del docente, quindi nel foglio
   del conteggio su Drive la scheda legge la cella della settimana e **toglie 1 per ogni ora** (cella vuota → −1).
   Se si cambiano le ore o si toglie la spunta, corregge solo la differenza; togliendo l'assenza restituisce le ore.
   Se il foglio non è su Drive o il docente non è abbinato, un avviso dice quante ore togliere a mano.
   Tra le ore ci sono anche le **ore di compresenza** (potenziamento, sostegno…): un compresente si può segnare assente,
   ma le sue ore non diventano «ore da coprire» (in classe c'è comunque il docente di cattedra).
   **Assente più giorni?** Sotto le ore compaiono gli altri giorni della **stessa settimana** in cui il docente ha
   lezione, con le loro ore: si spuntano le **singole ore** di ogni giorno (una sola volta).
   Le correzioni del foglio del conteggio si fanno una alla volta, in fila, così la stessa cella non viene sbagliata.
4. In **"Ore da coprire"**, per ogni ora compare l'elenco dei docenti liberi: premi **Assegna**.
   In cima ci sono i **pulsanti dei giorni della settimana** con quante ore restano da coprire: servono per
   passare da un giorno all'altro e sistemare tutta la settimana.
   Le sostituzioni assegnate si vedono anche nella **tabella dell'orario** dell'app, sullo stesso dispositivo
   (vedi *Sostituzioni nella tabella* in `app/LEGGIMI.md`).
   **Annullare**: *Annulla la sostituzione* qui, oppure il tasto **✕ Annulla** sulla sostituzione nella tabella dell'app
   (anche da un altro dispositivo: `annullaVoce()` del motore). In tutti i casi si toglie 1 ora al sostituto nel foglio
   del conteggio (se era stata segnata) e la riga dal foglio «Sostituzioni»; prima, se il foglio del conteggio non è
   ancora caricato, lo si legge da Drive. Le sostituzioni di altri dispositivi annullate vanno nell'elenco `annullate`
   (chiave `sostituzioni.annullate`), che viaggia nel file pubblicato e le fa sparire anche dal dispositivo d'origine.
   **Assenze e sostituzioni di tutti** (riquadro sotto «Ore da coprire»): *👥 Mostra le assenze e le sostituzioni di tutti* legge
   il file pubblicato e mostra, giorno per giorno, tutte le assenze e le sostituzioni (di qui e degli altri dispositivi).
   *Annulla per tutti* annulla solo quella sostituzione, corregge il foglio del conteggio e pubblica subito.
   Il tasto rosso in fondo cancella invece i dati SOLO di questo dispositivo.
   **Togliere un'assenza** (*Togli* nell'elenco degli assenti, *Togli per tutti* nel riquadro, **✕ Togli assenza** nella
   tabella dell'app): dopo la conferma si annullano anche le sue sostituzioni (−1 a chi sostituiva nel foglio del conteggio,
   righe tolte dal foglio «Sostituzioni»), si **restituiscono le ore di recupero** al docente e si pubblica subito, così
   l'assenza sparisce per tutti. Funziona anche per le assenze registrate su un altro dispositivo: vanno nell'elenco
   `assenzeAnnullate` del file pubblicato. Le ore di recupero non sono nel file pubblicato (dato personale): per saperle,
   chi toglie l'assenza legge la scheda **«Recuperi»** del file delle sostituzioni (l'app la crea da sola; una riga per ogni
   assenza a recupero). Se la riga non c'è, le ore le restituisce il dispositivo che aveva registrato l'assenza, la prossima
   volta che lì si aprono le sostituzioni (coda `sostituzioni.daSistemare`).
   Se si **tolgono ore** a un'assenza già registrata, le sostituzioni di quelle ore si annullano (con −1 a chi sostituiva).
5. A fine settimana copia nel foglio le ore della tabella **"Da aggiungere nel foglio"** (+1 per ogni ora
   di sostituzione, nella colonna della settimana), poi premi **"Segna come già riportate"** e ricarica il foglio.

Si possono anche stampare le sostituzioni del giorno e scaricare il registro in CSV.

## Come vengono scelti i docenti proposti

Per ogni ora scoperta la scheda cerca i docenti **non assenti** e **non già impegnati** in un'altra sostituzione alla
stessa ora: quelli **liberi** in quell'ora e quelli **spostabili**, cioè già in classe con un altro docente
(compresenza, dal Foglio Compresenze, sostegno compreso). Regole della scuola (02/10/2026, issue #7):

- con il **sostegno** si sposta il **docente di cattedra**: il sostegno resta da solo con la classe (il sostegno non si sposta);
- con il **potenziamento** e le altre compresenze si sposta il **compresente**: resta il docente di cattedra;
- l'**Alternativa** (in parallelo a Religione) è l'ultima possibilità: il docente si sposta con i suoi studenti, Religione resta;
- chi resta in classe deve esserci davvero (non assente, non già spostato altrove in quell'ora).

Chi è **spostato non prende +1** nel foglio del conteggio (era già una sua ora) e, se si annulla, non perde niente
(campo `spostato: { da: classe lasciata }` nel registro). I docenti proposti sono in **gruppi di priorità**:

| Priorità | Chi |
|---|---|
| prima di tutti | i «liberati» di un'uscita didattica |
| 1 | docenti della classe, liberi con un'ora buca |
| 2 | docenti della classe spostabili |
| 3 | altri docenti della classe, liberi |
| 4 | altri docenti, liberi con un'ora buca |
| 5 | altri docenti spostabili |
| 6 | altri docenti liberi |
| 7 | docenti di Alternativa (ultima possibilità) |

«Docente della classe» = insegna in quella classe in qualunque giorno, anche in compresenza. Nello stesso gruppo:
prima chi è **a scuola quel giorno** (gli altri si vedono con "Mostra tutti"), poi chi ha **più ore a debito**, poi chi
ha lezione subito prima o dopo. **Sotto ogni nome c'è il motivo** (es. «Priorità 1: stessa classe – ora buca: è già a
scuola · +1 nel conteggio», «Priorità 2: stessa classe – coperto da sostegno: in 2B resta il docente di sostegno ·
nessuna ora in più»). Il piano delle uscite didattiche non usa gli spostabili.

Il saldo usato è: **TOTALE del foglio + sostituzioni fatte e non ancora riportate nel foglio**.
Se in classe c'è già un altro docente (compresenza), la scheda lo segnala.

**Nell'app** (`app/js/supplenze.js`, `Supplenze.lezioni`): nella classe dove va il docente spostato si vede la
sostituzione; nella classe lasciata, se resta il sostegno, l'ora appare come lezione della stessa materia tenuta dal
solo docente di sostegno (chi non vede il sostegno, per esempio gli studenti, vede la materia senza docente); se si è
spostato un compresente, la sua riga sparisce. Nel file pubblicato c'è solo la classe lasciata, mai chi resta.

## Il foglio: che forma deve avere

Come il foglio "Prospetto" della scuola:

| (n.) | COGNOME | NOME | 1 | 2 | 3 | … | 39 | TOTALE |
|---|---|---|---|---|---|---|---|---|
| 1 | ROSSI | Anna | -4 | -1 | | | | -5 |

- una riga di intestazione con **COGNOME** e **NOME**, poi le **settimane numerate** e **TOTALE**;
- numeri **negativi = ore a debito**, **positivi = ore a credito**;
- la nota "Settimana 1 dal 9 all'11 settembre 2026" (in qualsiasi cella) serve a calcolare la settimana
  di ogni data; se manca si usa lunedì 7 settembre 2026.

## L'orario

Le sostituzioni si fanno sempre sull'**orario ufficiale pubblicato**, mai sulla bozza aperta in Orario Facile
(scelta della scuola, 02/10/2026): la scheda lo scarica con `Dati.caricaPubblicato()` di `app/js/dati.js` (il file su
Drive se in `config.js` c'è `fileOrarioPubblicato`, altrimenti `dati/orario.json`) a ogni apertura. Anche la pagina
«Sostituzioni smart» dell'app, se l'app sta mostrando la bozza, scarica a parte l'orario pubblicato.

## File

Il codice sta in file separati (non dentro `orario-facile/index.html`, che è già molto lungo): così chi lavora
su Orario Facile e chi lavora sulle sostituzioni tocca file diversi e ci sono meno conflitti.

```
sostituzioni/
  index.html              rimanda alla scheda di Orario Facile (per chi ha il vecchio indirizzo)
  css/sostituzioni.css    stile della scheda (usa i colori di Orario Facile, tema scuro, stampa)
  js/foglio.js            lettura del foglio .ods / .xlsx / .csv (senza librerie esterne)
  js/archivio.js          salvataggio nella memoria del browser (chiavi "sostituzioni.")
  js/abbinamenti.js       collegamento tra docenti dell'orario e righe del foglio
  js/drive.js             foglio del conteggio ore su Google Drive (+1 / -1 al sostituto)
  js/registro-drive.js    Foglio Google delle sostituzioni: foglio «Autorizzazioni», registri «Sostituzioni» e «Cambi aula»
  js/cambi-aula.js        modulo «Cambi d'aula» (scheda Sostituzioni e pagina «Sostituzioni smart» dell'app)
  js/uscite.js            modulo «Uscita didattica»: docenti liberati, piano proposto, a disposizione, a recupero
  js/scioperi.js          modulo «Sciopero / assemblea»: file delle adesioni, entrate/uscite, vigilanze, comunicazione
  js/docx.js              crea un vero documento Word (.docx) senza librerie (comunicazione alle famiglie)
  js/sostituzioni.js      la scheda: assenze, proposte, saldi, esportazioni (Sostituzioni.monta)
  esempio/                facsimili del foglio con nomi inventati
```

In `orario-facile/index.html` le righe che la collegano sono poche: il foglio di stile nell'`<head>`, la sezione
`p-sostituzioni`, i `<script>` prima dello script principale, la voce in `TABS` e la funzione `renderSostituzioni()`.

Per provarla sul PC serve un piccolo server (dalla cartella del repo): `py -m http.server 8765`,
poi aprire http://localhost:8765/orario-facile/#sostituzioni

## Compresente spostato su una sostituzione (fatto il 02/10/2026)

Issue [#7](https://github.com/comprensivoalmese/orario/issues/7). Caso: un docente in quell'ora è in compresenza e viene
mandato a sostituire un collega assente in un'altra classe: ha solo cambiato impegno, quindi **nessuna ora in più**.
Prima prendeva sempre +1 e andava corretto a mano. Ora il motore propone i docenti «spostabili» con le regole e le
priorità descritte in *Come vengono scelti i docenti proposti*, li assegna con `spostato` (niente +1, niente −1
all'annullamento) e l'app mostra la classe lasciata come se ci fosse solo chi resta. Si usa un campo nuovo e non
`reindirizzato`, che è delle uscite didattiche («Cancella tutte le uscite» lo usa per riconoscerle).

## Idee per il futuro

- scrivere direttamente il foglio aggiornato invece di copiare le ore a mano;
- condividere assenze e sostituzioni tra più computer (ora ogni computer ha i suoi dati);
- valutare se mostrare la scheda solo a chi organizza le sostituzioni (vicepresidenza).
