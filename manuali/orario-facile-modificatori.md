# Manuale Orario Facile — Modificatori

*Team Wolf — risolvo problemi*

Guida per chi costruisce l'orario, lo pubblica e gestisce le sostituzioni dei docenti assenti. Serve il ruolo di
**modificatore**: l'account Google della scuola da solo non basta.

Indirizzo: **https://comprensivoalmese.github.io/orario/orario-facile/**
Sostituzioni: scheda 10 di Orario Facile

## In breve

1. Apri Orario Facile e accedi con l'account della scuola. Se vedi "Solo consultazione", copia il tuo **codice** e
   mandalo a chi gestisce le abilitazioni.
2. Una volta abilitato, lavora sulle schede: **Impostazioni** → **Discipline** → **Aule** → **Quadro orario** →
   **Docenti e cattedre** → **Criteri** → **Orario** (genera e correggi a mano) → **Salvataggio**.
3. Per pubblicare per tutti: scheda **Orario** → tasto **📤 Pubblica orario** (salva l'orario su Google Drive e il
   backup del giorno nella cartella «backup orario»).
4. Per le sostituzioni: scheda **Sostituzioni** → carica il foglio del conteggio ore (o collegalo da Drive) → segna
   il docente assente → assegna i sostituti proposti.
   Per farle vedere a tutti nell'app: tasto **📤 Pubblica sostituzioni** in cima alla scheda.
5. Per registrare le sostituzioni sul Foglio Google condiviso serve essere nell'elenco **Abilitazioni** di quel
   foglio (email, non codice).

## Ruoli: fruitori e modificatori

Tutti quelli della scuola possono **consultare** l'orario nell'app Luis@i (i "fruitori"). Solo i
**modificatori** possono aprire **Orario Facile** per costruire l'orario e fare le sostituzioni.

1. Chi apre Orario Facile per la prima volta accede con l'account Google della scuola.
2. Se non è ancora un modificatore vede la schermata **"Solo consultazione"**, con il link all'orario e un
   **codice di 16 caratteri** da copiare.
3. Manda quel codice a chi gestisce le abilitazioni (uno del gruppo con accesso al repository).
4. Chi gestisce aggiunge il codice all'elenco `editori` in `app/js/config.js` e pubblica la modifica su GitHub.
5. Da quel momento, con lo stesso account, la persona entra direttamente in Orario Facile.

> **Perché un codice e non l'email.** Il repository è pubblico, quindi non si possono scrivere le email dei colleghi
> nei file. Il codice si ricava dall'email con un calcolo a senso unico: non permette di risalire all'indirizzo, ma
> identifica sempre la stessa persona.

> **Se l'elenco è vuoto.** Finché `editori` è vuoto, **chiunque della scuola** può usare Orario Facile.

## I due livelli di permesso da tenere distinti

Essere "modificatore" nell'app e poter **pubblicare** le modifiche per tutti sono due cose diverse:

| Permesso | Cosa permette | Chi lo concede |
|---|---|---|
| **Modificatore** (ruolo nell'app) | aprire Orario Facile, modificare l'orario *nel proprio browser*, fare sostituzioni | chi modifica `editori` in `config.js` |
| **Collaboratore del repository GitHub** | caricare (commit) i file su GitHub, cioè **pubblicare per tutti** l'orario aggiornato | chi amministra il repository (Impostazioni → Collaborators) |

Un modificatore che non è anche collaboratore del repository può preparare l'orario e le sostituzioni, ma per farle
vedere a tutti deve passare il file a chi ha accesso a GitHub (o farsi aggiungere come collaboratore).

## Le schede di Orario Facile

| # | Scheda | A cosa serve |
|---|---|---|
| 1 | Impostazioni e classi | giorni di lezione, ore al mattino/pomeriggio, elenco classi |
| 2 | Discipline | sigla e colore di ogni materia |
| 3 | Aule | elenco aule, quali sono condivisibili da più classi (palestra, laboratorio) |
| 4 | Quadro orario settimanale | quante ore di ogni materia per ogni classe |
| 5 | Docenti e cattedre | materie, classi, ore e aule di ogni docente, indisponibilità |
| 6 | Criteri e vincoli | vincoli rigidi (mai violati) e preferenze (pesate) per la generazione automatica |
| 7 | Orario | genera e corregge a mano: trascina, blocca con il lucchetto, vede per classe/docente/aula |
| 8 | Salvataggio ed esportazione | pubblicare nell'app, backup, CSV, importazione da Excel |
| 9 | Sostituzioni docenti | gestire l'assenza di un docente e le proposte di sostituzione |

### Costruire e correggere l'orario (scheda 7)

- **Genera orario** crea una proposta automatica; **✨ Ottimizza** la migliora (qualità: Veloce, Normale, Accurata).
- Per correggere a mano: **trascina** una lezione in un'altra casella, oppure clicca una casella e poi la destinazione.
- Il **lucchetto 🔒** protegge una casella dalle rigenerazioni: diventa un'**assegnazione fissa**.
- In alto: ore collocate, caselle vuote, ore non collocate, conflitti, con l'elenco dettagliato dei problemi.
- **Controlla fattibilità** verifica se l'orario è risolvibile prima di generare.
- Viste: **Per classe**, **Per docente**, **Per aula**, **Quadro generale**; da lì anche **Stampa / PDF**.

### Aule delle compresenze (scheda Compresenze)

- Scelti giorno e ora, nella tendina **Aula** ogni aula ha un pallino: 🟢 libera, 🔴 occupata (tra parentesi chi la usa).
- La **palestra** resta 🟢 se c'è al massimo 1 classe, la **mensa** se ci sono meno di 3 classi.
- Se si sceglie un'aula occupata, sotto la riga compare un avviso.

## Pubblicare l'orario per tutti

Il lavoro si salva da solo nel browser. Per farlo vedere a **tutti**:

1. Scheda **Orario** → tasto grande **📤 Pubblica orario** → **Pubblica**.
2. La prima volta Google chiede il permesso di scrivere su Drive: scegli l'account della scuola e consenti.
3. Orario Facile salva nella cartella di Drive dell'orario (`cartellaPubblicazione` in `app/js/config.js`):
   - `orario-pubblicato.json`, l'orario che l'app mostra a tutti (è sempre lo stesso file, che viene aggiornato);
   - nella cartella **backup orario** il backup completo del giorno, `backup orario GG-MM-AAAA.json`
     (se pubblichi di nuovo lo stesso giorno, il backup di quel giorno viene sostituito).
4. Entro pochi minuti tutti i dispositivi vedono il nuovo orario (l'app lo ricontrolla ogni 5 minuti).

Per pubblicare serve il permesso di **modifica** sulla cartella di Drive: chiedilo a chi la possiede.
Per ripristinare un backup: scaricalo da Drive e usa **Importa backup** nella scheda Salvataggio.

**Sostituzioni per tutti.** Nella scheda **Sostituzioni** il tasto **📤 Pubblica sostituzioni** salva nella stessa
cartella `sostituzioni-pubblicate.json`: l'app mostra quelle assenze e sostituzioni nella tabella dell'orario su tutti
i dispositivi. Si pubblicano solo giorno, ore, classe e codici dei docenti (niente permessi, niente nomi veri).
Ricordati di ripubblicare dopo ogni cambiamento.

> Il vecchio metodo resta disponibile: **Scarica orario.json** e caricamento del file nella cartella `dati/` su GitHub.
> Quel file ora serve solo di riserva, se Drive non risponde.

> **Anteprima prima di pubblicare.** Sullo stesso computer, mentre lavori in Orario Facile, l'app Luis@i (in
> un'altra scheda del browser) mostra già la tua bozza e si aggiorna da sola: pulsante **📱 Vedi nell'app**.

Nella stessa scheda ci sono anche: **backup completo** (.json), le **tabelle CSV** (orario classi, orario docenti,
elenco cattedre) e l'**importazione** da modelli Excel o da un orario .xlsm già esistente.

## Vedere i nomi veri dei docenti

Nell'orario i docenti compaiono come codici (`DOC01`, `DOC02`…) perché il repository è pubblico. Il pulsante
**👁 Nomi** collega ogni codice al nome vero, leggendolo da un Foglio Google riservato (serve il permesso su quel
file, con l'account della scuola).

> **Regola da rispettare sempre.** I nomi restano solo in memoria nel browser: non vanno mai salvati in file
> scaricati, backup, CSV o altri documenti che potrebbero finire nel repository pubblico su GitHub.

## Sostituzioni docenti

È la scheda 10 di Orario Facile, per organizzare la sostituzione dei docenti assenti usando il foglio del conteggio
ore (chi è a debito e chi è a credito).

### Privacy: il foglio non va mai su GitHub

- **Foglio su Google Drive** (consigliato): si legge con **👁 Nomi** o **☁️ Carica dal Drive**. Ogni sostituzione
  assegnata scrive **+1** nella cella del sostituto, nella settimana giusta; annullandola toglie 1.
- **Carica il foglio** (.ods, .xlsx, .csv): viene letto solo nel browser di quel computer, non è inviato a nessuno.

Assenze, sostituzioni e foglio restano salvati solo sul dispositivo usato.

### Chi può registrare le sostituzioni

Foglio Google dedicato, con due schede:

- **Abilitazioni**: nomi ed **email** di chi può registrare sostituzioni. **🔐 Verifica la mia abilitazione**
  controlla l'email di chi è entrato. Per abilitare qualcuno si aggiunge una riga nel foglio.
- **Sostituzioni**: ogni sostituzione assegnata diventa una riga, con i **nomi veri**, presi dal file riservato e
  mai scritti su GitHub o nel dispositivo.

### Come si usa

1. Carica il foglio del conteggio ore.
2. Controlla gli abbinamenti (**👁 Nomi**); se dubbio, scegli dall'elenco a mano.
3. Scegli il giorno e spunta le ore di assenza.
4. In "Ore da coprire", per ogni ora premi **Assegna** sul docente proposto.
   Per **annullare** una sostituzione: *Annulla la sostituzione* nella scheda, oppure **✕ Annulla** sulla sostituzione
   nella tabella dell'app Luis@i (funziona anche se l'ha registrata un collega). Al sostituto si toglie 1 ora nel foglio del conteggio.
   Nel riquadro **Assenze e sostituzioni di tutti** premi *👥 Mostra le assenze e le sostituzioni di tutti*: vedi anche quelle
   dei colleghi; con **Annulla per tutti** togli solo quella sostituzione, per tutti (il tasto rosso in fondo cancella solo i dati
   di questo computer).
   Per **togliere un'assenza** (docente segnato per sbaglio o tornato a scuola): *Togli* nell'elenco degli assenti, *Togli per
   tutti* nel riquadro, oppure **✕ Togli assenza** nella tabella dell'app. Si annullano anche le sue sostituzioni (−1 a chi
   sostituiva), le ore di recupero tornano al docente nel foglio del conteggio e l'assenza sparisce per tutti.
5. A fine settimana copia le ore in "Da aggiungere nel foglio", premi **"Segna come già riportate"** e ricarica.

Si possono stampare le sostituzioni del giorno e scaricare il registro in CSV.

### Come vengono proposti i docenti

Le sostituzioni si fanno sempre sull'**orario ufficiale pubblicato**, mai sulla bozza. Oltre ai docenti liberi, la scheda
propone anche quelli **spostabili**, già in classe con un altro docente: con il **sostegno** si sposta il docente di
cattedra (il sostegno resta con la classe), con il **potenziamento** si sposta il compresente, l'**Alternativa** è l'ultima
possibilità. Chi è spostato **non prende +1** nel conteggio. Per ogni ora scoperta l'ordine è:

1. docenti della classe con un'ora buca;
2. docenti della classe spostabili;
3. altri docenti della classe liberi;
4. altri docenti con un'ora buca;
5. altri docenti spostabili;
6. altri docenti liberi;
7. docenti di Alternativa.

Nello stesso gruppo prima chi è a scuola quel giorno e ha **più ore a debito**. Sotto ogni nome c'è il **motivo** della
proposta (per esempio «Priorità 2: stessa classe – coperto da sostegno…»). Il saldo usato è: totale del foglio +
sostituzioni già fatte ma non ancora riportate. In caso di compresenza, la scheda lo segnala.
Tra le ore di assenza ci sono anche le ore di compresenza; negli altri giorni della settimana si spuntano le singole ore.

## Calendario degli impegni: aggiornarlo ogni anno

Gli impegni collegiali (collegi, consigli, GLO, scrutini…) si vedono nell'app Luis@i con il tasto **Impegni**, solo dai
docenti (gli studenti non vedono il tasto).
A inizio anno, quando il Collegio Docenti ha deliberato il nuovo Piano annuale delle attività:

1. apri Luis@i → **Impegni** → **Importa dal Piano delle attività** (il tasto lo vede solo chi è autorizzato a Orario Facile);
2. scegli il foglio dell'anno tra quelli della cartella di Drive dei fogli di Orario Facile, oppure **scegli il file dal
   computer** (.xlsx o .ods): l'app lo salva anche in quella cartella;
3. controlla l'**anteprima** nel calendario (e le eventuali «righe non importate»);
4. premi **Pubblica per tutti**.

Il foglio deve essere fatto come quello del 2026/27: un foglio che si chiama «Piano …» (per esempio «Piano 27-28») con le
colonne GIORNO, ORARIO, ISTITUTO, INFANZIA, PRIMARIA e SECONDARIA. Ogni colonna ha il suo colore nel calendario. Dei GLO
si pubblica solo il plesso, mai le classi.

## Lavorare in gruppo sul codice

Il gruppo lavora tutti insieme direttamente su `main`:

- Prima di iniziare a modificare: `git pull --rebase`.
- Commit piccoli e frequenti, un argomento per commit.
- Per consegnare: `./sync.sh "cosa ho fatto"`.
- Configurazione consigliata una volta sola: `git config pull.rebase true` e `git config rebase.autoStash true`.

## Limiti e attenzioni

> **Il controllo dei ruoli è lato browser.** Orario Facile è fatto di file pubblici: il controllo
> "modificatore / solo consultazione" avviene nel browser, e separa bene i ruoli nell'uso normale — ma una persona
> esperta potrebbe aggirarlo sul proprio computer. Non potrebbe comunque cambiare l'orario di tutti: le modifiche
> restano nel suo browser finché non vengono caricate su GitHub, e per farlo serve essere collaboratori del
> repository.

> **Il file dell'orario resta scaricabile.** L'accesso Google impedisce di usare l'app a chi non è della scuola, ma
> `dati/orario.json` resta scaricabile da chi conosce l'indirizzo esatto: GitHub Pages pubblica tutto. Va bene per un
> orario senza nomi reali; per più riservatezza servirebbe un servizio con controllo d'accesso.

## Domande frequenti

**Ho aperto Orario Facile ma vedo "Solo consultazione".** Copia il codice mostrato e mandalo a chi gestisce le
abilitazioni: verrà aggiunto all'elenco `editori`.

**Ho premuto «Pubblica orario» ma l'app non lo mostra.** Aspetta 5 minuti o ricarica l'app; se Orario Facile ha scritto
«L'app non legge ancora questo file», il codice del file va inserito in `app/js/config.js` (`fileOrarioPubblicato`).

**Ho pubblicato l'orario.json ma l'app non lo mostra.** Aspetta qualche minuto (si aggiorna ogni 5 minuti);
controlla di aver caricato il file nella cartella `dati/` giusta e premuto "Commit changes".

**Non vedo i nomi veri dei docenti.** Serve il permesso di lettura sul Foglio Google riservato dei nomi: se il
pulsante "👁 Nomi" non funziona, chiedi l'accesso a chi gestisce quel foglio.

**Non riesco a registrare una sostituzione.** Serve essere nell'elenco **Abilitazioni** del Foglio Google delle
sostituzioni (per email, non per codice): controlla con "🔐 Verifica la mia abilitazione".

---
*Guida basata sulla documentazione del progetto «orario» (repository comprensivoalmese/orario) (`CLAUDE.md`, `sostituzioni/LEGGIMI.md`), aggiornata al
25/09/2026.*
