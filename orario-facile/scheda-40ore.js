/*
  scheda-40ore.js – scheda «40+40» di Orario Facile: le attività funzionali all'insegnamento dei docenti della secondaria
  (calcolo in ../app/js/quaranta-ore.js, dove sono spiegate anche le regole).

  Si vede SOLO per chi ha SI nella colonna «40 ore» del file Autorizzazioni (controlla()).
  - legge il Foglio «40 ore» (CONFIG.file40ore) e l'orario UFFICIALE pubblicato (classi dei docenti + sostegno);
  - mostra il prospetto per docente (dovute, programmate, residue) e, toccando una riga, il dettaglio degli impegni;
  - la spunta «Visibile» di ogni docente e «Visibile a tutti i docenti» si salvano nel Foglio e si pubblicano subito
    (quaranta-ore.json nella cartella dei soli docenti, con i soli codici): nell'app ogni docente vede solo le proprie;
  - «Scarica estratto» crea per ogni scuola di completamento un Excel con i SOLI docenti in comune (xlsx.js).
  I nomi dei docenti arrivano dal Foglio (che è riservato) e restano solo in memoria.
*/
const Scheda40 = (() => {
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const ore = n => (Math.round(n * 100) / 100).toLocaleString('it-IT');
  const dataIt = iso => { const [a, m, g] = iso.split('-').map(Number); return new Date(a, m - 1, g).toLocaleDateString('it-IT', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' }); };
  const CONTA = { prime: 'prime 40', seconde: 'seconde 40', formazione: 'formazione', no: 'non conta' };

  let box = null, opz = null;
  let foglio = null, risultato = null, classiCorrenti = null, errore = '', inCorso = false, stato = '';
  const aperti = new Set();

  // ---------- chi può vedere la scheda ----------
  let permesso = null;   // null = non ancora saputo
  // Restituisce true/false, oppure null se manca ancora il permesso di Google (si riprova più tardi)
  async function controlla(email) {
    if (typeof Autorizzazioni === 'undefined' || !QuarantaOre.configurato()) { permesso = false; return false; }
    if (!email) return null;   // accesso non ancora fatto (porta.js): si riprova
    try {
      const a = await Autorizzazioni.di(email);
      if (a.fonte === 'attesa') return null;
      permesso = !!a.quarantaOre;
    } catch (e) { return null; }
    return permesso;
  }

  // ---------- caricamento ----------
  async function carica() {
    if (inCorso) return;
    inCorso = true; errore = ''; stato = 'Leggo il Foglio «40 ore» e l\'orario ufficiale…'; disegna();
    try {
      const email = opz.email();
      const D = await opz.orario();
      if (typeof Compresenze !== 'undefined') { Compresenze.impostaSostegno(true); await Compresenze.scarica(); }
      foglio = await QuarantaOre.leggiFoglio(email);
      classiCorrenti = QuarantaOre.classiDaOrario(D);
      risultato = QuarantaOre.calcola(foglio, classiCorrenti);
      stato = '';
    } catch (e) {
      errore = e.message || String(e);
      stato = '';
    }
    inCorso = false;
    disegna();
  }

  // ---------- disegno ----------
  const nome = d => d.nome || (opz.nome && opz.nome(d.codice)) || d.codice;
  function disegna() {
    if (!box) return;
    if (!QuarantaOre.configurato()) { box.innerHTML = '<p class="hint">Manca l\'ID del Foglio «40 ore» in app/js/config.js (voce file40ore).</p>'; return; }
    if (permesso === false) { box.innerHTML = '<p class="hint">Per questa scheda serve SI nella colonna «40 ore» del file Autorizzazioni.</p>'; return; }
    const link = `https://docs.google.com/spreadsheets/d/${encodeURIComponent(QuarantaOre.file())}/edit`;
    let h = `<div class="q40-barra no-print">
      <button class="btn" data-q40="rileggi">🔄 Rileggi il Foglio</button>
      <button class="btn pubblica" data-q40="pubblica" ${risultato ? '' : 'disabled'}>📤 Pubblica per i docenti</button>
      <button class="btn" data-q40="stampa" ${risultato ? '' : 'disabled'}>🖨 Stampa</button>
      <a class="btn" href="${link}" target="_blank" rel="noopener">📄 Apri il Foglio «40 ore»</a>
      <button class="btn" data-q40="importa" ${risultato ? '' : 'disabled'}>📥 Importa proposte di esonero</button>
      <input type="file" id="q40File" accept=".xlsx,.ods" multiple hidden>
      <button class="btn" data-q40="presenze" ${risultato ? '' : 'disabled'}>📥 Carica presenze</button>
      <button class="btn" data-q40="modelloPresenze" ${risultato ? '' : 'disabled'}>📄 Modello presenze</button>
      <input type="file" id="q40Presenze" accept=".xlsx,.ods,.csv" hidden>
      ${foglio ? `<label class="q40-tutti"><input type="checkbox" data-q40="tutti" ${foglio.visibileTutti ? 'checked' : ''}> Visibile a tutti i docenti (ognuno le proprie, nell'app)</label>` : ''}
    </div>`;
    if (stato) h += `<p class="hint" role="status">${esc(stato)}</p>`;
    if (errore) h += `<p class="q40-errore" role="alert">⚠️ ${esc(errore)} <button class="btn" data-q40="rileggi">Collega di nuovo a Google</button></p>`;
    if (risultato) {
      if (risultato.avvisi.length) h += `<details class="q40-avvisi"><summary>⚠️ ${risultato.avvisi.length} cose da controllare nel Foglio</summary><ul>${risultato.avvisi.map(a => `<li>${esc(a)}</li>`).join('')}</ul></details>`;
      h += tabella();
      h += pianoHtml();
      h += esoneri();
      h += scuole();
    }
    box.innerHTML = h;
  }

  function tabella() {
    const td = (n, rosso) => `<td class="num${rosso && n < 0 ? ' q40-oltre' : ''}">${ore(n)}</td>`;
    const righe = risultato.docenti.map(d => {
      const aperto = aperti.has(d.codice);
      let r = `<tr class="q40-riga${aperto ? ' aperta' : ''}" data-codice="${esc(d.codice)}">
        <th scope="row"><button class="q40-apri" data-q40="apri" aria-expanded="${aperto}">${aperto ? '▾' : '▸'} ${esc(nome(d))}</button>
          <span class="q40-codice">${esc(d.codice)}${d.scuola ? ' · COE con ' + esc(d.scuola) : ''}${d.dal ? ' · dal ' + esc(d.dal.split('-').reverse().join('/')) : ''}</span></th>
        <td>${esc(d.tipo)}</td>${td(d.oreSett)}${td(d.dovute)}${td(d.prime)}${td(d.seconde)}
        <td class="num q40-form"><input type="number" min="0" step="0.5" inputmode="decimal" data-q40="formazione" value="${d.oreFormazione || ''}" placeholder="0"
          aria-label="Ore di formazione obbligatoria di ${esc(nome(d))}" ${d.riga ? '' : 'disabled'}>${d.formazione !== (d.oreFormazione || 0) ? `<span class="q40-codice">in tutto ${ore(d.formazione)}</span>` : ''}</td>
        <td class="num">${ore(d.esonerate)}${d.proposte ? `<span class="q40-codice q40-attesa">+${ore(d.proposte)} da approvare</span>` : ''}</td>
        <td class="num">${d.assenze ? ore(d.assenze) : ''}</td>
        ${td(d.residuoPrime, true)}${td(d.residuoSeconde, true)}${td(d.residuo, true)}
        <td class="q40-vis"><input type="checkbox" data-q40="visibile" aria-label="Visibile a ${esc(nome(d))}" ${d.visibile ? 'checked' : ''} ${d.riga ? '' : 'disabled'}></td></tr>`;
      if (aperto) r += `<tr class="q40-dettaglio"><td colspan="13">${dettaglio(d)}</td></tr>`;
      return r;
    }).join('');
    return `<div class="q40-tabella-box"><table class="q40-tabella"><caption>Prospetto 40+40 per docente${foglio.anno ? ' – ' + esc(foglio.anno) : ''}
        <span class="hint">(tocca un nome per il dettaglio; in rosso le ore oltre il dovuto)</span></caption>
      <thead><tr><th scope="col">Docente</th><th scope="col">Tipo</th><th scope="col">Ore sett.</th><th scope="col">Dovute (per ciascuna)</th>
        <th scope="col">Prime 40</th><th scope="col">Seconde 40</th><th scope="col">Formazione obbligatoria (ore)</th><th scope="col">Esonerate</th><th scope="col">Assenze (ore, non contano)</th>
        <th scope="col">Restano prime</th><th scope="col">Restano seconde</th><th scope="col">Restano in tutto</th><th scope="col">Visibile</th></tr></thead>
      <tbody>${righe}</tbody></table></div>`;
  }
  function dettaglio(d) {
    if (!d.dettaglio.length) return '<p class="hint">Nessun impegno: controlla le classi del docente nell\'orario.</p>';
    return `<p class="hint">Classi (cattedre + sostegno): ${esc(d.classi.join(' ') || 'nessuna')}${d.nonConta ? ` · scrutini ed esami: ${ore(d.nonConta)} ore (non contano)` : ''}
        <button class="btn" data-q40="excel" data-codice="${esc(d.codice)}">📥 Excel del docente (per gli esoneri)</button>
        ${d.dettaglio.some(x => x.proposto) ? `<button class="btn" data-q40="approvaTutte" data-codice="${esc(d.codice)}">✓ Approva tutte le proposte</button>` : ''}</p>
      <table class="q40-mini"><thead><tr><th scope="col">Giorno</th><th scope="col">Orario</th><th scope="col">Impegno</th><th scope="col">Ore</th><th scope="col">Conta in</th></tr></thead><tbody>` +
      d.dettaglio.map(x => `<tr class="q40-${x.conta}${x.esonero ? ' q40-esonerato' : ''}${x.proposto ? ' q40-proposto' : ''}${x.assente ? ' q40-assente' : ''}"><td>${esc(dataIt(x.data))}</td><td>${esc(x.orario)}</td><td>${esc(x.impegno)}</td><td class="num">${ore(x.ore)}</td><td>${esc(CONTA[x.conta] || x.conta)}` +
        (x.assente ? ' · assente (presenze registrate: non conta)' : '') +
        (x.esonero ? ` · esonerato <button class="btn piccolo" data-q40="approva" data-valore="" data-codice="${esc(d.codice)}" data-chiave="${esc(x.data + '|' + x.impegno)}">↺ Togli approvazione</button> <button class="btn piccolo" data-q40="togli" data-codice="${esc(d.codice)}" data-chiave="${esc(x.data + '|' + x.impegno)}">✕ Togli</button>` : '') +
        (x.proposto ? ` · esonero proposto <button class="btn piccolo" data-q40="approva" data-valore="SI" data-codice="${esc(d.codice)}" data-chiave="${esc(x.data + '|' + x.impegno)}">✓ Approva</button> <button class="btn piccolo" data-q40="togli" data-codice="${esc(d.codice)}" data-chiave="${esc(x.data + '|' + x.impegno)}">✕ Togli</button>` : '') +
        '</td></tr>').join('') +
      '</tbody></table>';
  }
  /*
    ESONERI PER IMPEGNO: per ogni giorno e impegno chi è esonerato (approvati) e chi lo ha chiesto (proposte in attesa).
    La casella «Cerca» filtra le righe (giorno «05/10», parte del nome dell'impegno o del docente) senza ridisegnare.
  */
  const nomeDi = codice => { const d = risultato.docenti.find(x => x.codice === codice); return d ? nome(d) : codice; };
  function esoneri() {
    const elenco = QuarantaOre.esoneriPerImpegno(foglio);
    if (!elenco.length) return '';
    const orario = k => (risultato.impegni.find(p => p.chiave === k) || {}).orario || '';
    const righe = elenco.map(e => {
      const testo = [dataIt(e.data), e.data.split('-').reverse().join('/'), e.impegno, ...e.approvati.map(nomeDi), ...e.proposti.map(nomeDi)].join(' ').toLowerCase();
      return `<tr data-cerca="${esc(testo)}"><td>${esc(dataIt(e.data))}</td><td>${esc(orario(e.chiave))}</td><td>${esc(e.impegno)}</td>
        <td>${esc(e.approvati.map(nomeDi).join(', ')) || '–'}</td><td class="q40-attesa">${esc(e.proposti.map(nomeDi).join(', '))}</td></tr>`;
    }).join('');
    return `<section class="q40-esoneri"><h3>Esoneri per impegno</h3>
      <div class="q40-barra no-print"><label>Cerca <input type="search" data-q40="cerca" placeholder="giorno (05/10), impegno o docente"></label>
        <button class="btn" data-q40="excelEsoneri">📥 Scarica l'elenco (Excel)</button></div>
      <div class="q40-tabella-box"><table class="q40-mini"><thead><tr><th scope="col">Giorno</th><th scope="col">Orario</th><th scope="col">Impegno</th>
        <th scope="col">Esonerati (approvati)</th><th scope="col">Proposte in attesa</th></tr></thead><tbody>${righe}</tbody></table></div></section>`;
  }
  function excelEsoneri() {
    const I = t => ({ v: t, stile: 'intest' });
    const orario = k => (risultato.impegni.find(p => p.chiave === k) || {}).orario || '';
    const righe = [[{ v: `Esoneri dalle attività funzionali – ${foglio.anno || ''}`, stile: 'titolo' }], [`Estratto del ${new Date().toLocaleDateString('it-IT')}`], [],
      ['Giorno', 'Orario', 'Impegno', 'Docente', 'Ore', 'Stato'].map(I)];
    QuarantaOre.esoneriPerImpegno(foglio).forEach(e => {
      const oreDi = codice => { const d = risultato.docenti.find(x => x.codice === codice); const x = d && d.dettaglio.find(y => y.data + '|' + y.impegno === e.chiave); return x ? x.ore : ''; };
      e.approvati.forEach(c => righe.push([dataIt(e.data), orario(e.chiave), e.impegno, nomeDi(c), oreDi(c), 'approvato']));
      e.proposti.forEach(c => righe.push([dataIt(e.data), orario(e.chiave), e.impegno, nomeDi(c), oreDi(c), { v: 'in attesa', stile: 'evid' }]));
    });
    scarica(Xlsx.crea([{ nome: 'Esoneri', larghezze: [20, 12, 44, 28, 7, 12], blocca: 4, righe }]), `Esoneri 40+40 ${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  function scuole() {
    const elenco = [...new Set(risultato.docenti.filter(d => d.scuola).map(d => d.scuola))].sort((a, b) => a.localeCompare(b, 'it'));
    if (!elenco.length) return `<section class="q40-scuole no-print"><h3>Scuole di completamento</h3><p class="hint">Scrivi il nome dell'altra scuola
      nella colonna «Scuola di completamento» della scheda «Docenti» del Foglio: qui comparirà il tasto per scaricare l'Excel da mandarle,
      con i soli docenti in comune.</p></section>`;
    return `<section class="q40-scuole no-print"><h3>Scuole di completamento</h3><p class="hint">Per ogni scuola un Excel con i SOLI docenti in comune:
      riepilogo, piano con le righe che li riguardano evidenziate, una pagina per docente. Da mandare alla segreteria o al Dirigente.</p><ul>` +
      elenco.map(s => `<li><button class="btn" data-q40="estratto" data-scuola="${esc(s)}">📥 ${esc(s)}</button>
        <span class="hint">${esc(risultato.docenti.filter(d => d.scuola === s).map(nome).join(', '))}</span></li>`).join('') + '</ul></section>';
  }

  /* ---------- PIANO DI ESONERI (simulazione, calcoli in piano-esoneri.js) ----------
     Criteri e regolazioni si ricordano sul dispositivo (orariofacile.pianoEsoneri); il piano si vede, si scarica in Excel
     e si salva nella scheda «Esoneri» del Foglio come proposte (da approvare) oppure già approvato. */
  const CHIAVE_PIANO = 'orariofacile.pianoEsoneri';
  const oggiIso = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  let piano = null, pianoAperto = false;
  let pianoOggi = '';   // data della fotografia scelta a mano (vuota = oggi); non si ricorda, così domani è di nuovo oggi
  let pianoTolte = [];   // proposte tolte a mano: «codice#data|impegno» (valgono finché non si scarta il piano)
  let pref = Object.assign({}, typeof PianoEsoneri !== 'undefined' ? PianoEsoneri.OPZIONI_PROPOSTE : {}, { ordine: [], perTipo: {} });
  try { const p = JSON.parse(localStorage.getItem(CHIAVE_PIANO) || 'null'); if (p) pref = Object.assign(pref, p); } catch (e) { /* si parte dalle proposte */ }
  const salvaPref = () => { try { localStorage.setItem(CHIAVE_PIANO, JSON.stringify(pref)); } catch (e) { /* va bene lo stesso */ } };
  // la scaletta dei tipi: quella salvata, con in fondo i tipi nuovi trovati nel Foglio
  function scaletta() {
    const trovati = PianoEsoneri.tipi(risultato);
    const ordine = pref.ordine.filter(id => trovati.some(t => t.id === id)).concat(trovati.filter(t => !pref.ordine.includes(t.id)).map(t => t.id));
    pref.ordine = ordine;
    return ordine.map(id => trovati.find(t => t.id === id));
  }
  // il conto esatto con gli esoneri scelti (come se fossero approvati): sovrapposizioni di orario comprese
  function verificaEsatta(scelte) {
    const es = new Map([...(foglio.esoneri || new Map())].map(([k, m]) => [k, new Map(m)]));
    scelte.forEach((m, codice) => {
      if (!m.size) return;
      if (!es.has(codice)) es.set(codice, new Map());
      m.forEach((x, k) => es.get(codice).set(k, { approvato: true, riga: 0 }));
    });
    const r = QuarantaOre.calcola(Object.assign({}, foglio, { esoneri: es }), classiCorrenti);
    return new Map(r.docenti.map(d => [d.codice, { prime: d.prime, seconde: d.seconde }]));
  }
  function simulaPiano() {
    scaletta();
    piano = PianoEsoneri.simula(risultato, Object.assign({}, pref, { vietati: pianoTolte.slice(), oggi: pianoOggi || oggiIso() }), verificaEsatta);
    pianoAperto = true;
  }

  function pianoHtml() {
    if (typeof PianoEsoneri === 'undefined') return '';
    const tipi = scaletta();
    const num = (campo, valore, largo) => `<input type="number" min="0" step="1" class="q40-num" style="width:${largo || 58}px" data-q40p="${campo}" value="${esc(valore)}">`;
    const spunta = (campo, testo) => `<label class="q40-criterio"><input type="checkbox" data-q40p="${campo}"${pref[campo] ? ' checked' : ''}> <span>${testo}</span></label>`;
    const righeTipi = tipi.map((t, i) => {
      const r = pref.perTipo[t.id] || {};
      return `<li class="q40-tipo"><span><b>${i + 1}. ${esc(t.tipo)}</b> <span class="hint">${t.conta === 'prime' ? 'A – prime 40' : 'B – seconde 40'} · ${t.quanti} impegni</span></span>
        <span class="q40-tipo-reg"><label>max esonerati <input type="number" min="0" max="100" class="q40-num" style="width:58px" data-q40p="pct:${esc(t.id)}" value="${esc(r.pct == null ? '' : r.pct)}" placeholder="${esc(pref.pct)}">%</label>
        <label><input type="checkbox" data-q40p="mai:${esc(t.id)}"${r.mai ? ' checked' : ''}> mai</label>
        <button class="btn piccolo" data-q40="pianoSu" data-i="${i}"${i ? '' : ' disabled'} title="Più importante" aria-label="Sposta su ${esc(t.tipo)}">▲</button>
        <button class="btn piccolo" data-q40="pianoGiu" data-i="${i}"${i < tipi.length - 1 ? '' : ' disabled'} title="Meno importante" aria-label="Sposta giù ${esc(t.tipo)}">▼</button></span></li>`;
    }).join('');
    let h = `<details class="q40-piano"${pianoAperto ? ' open' : ''}><summary><h3>🧮 Piano di esoneri (simulazione)</h3></summary>
      <p class="hint">Propone a ogni docente con ore in più gli esoneri che servono per rientrare nella soglia, seguendo i criteri qui sotto.
      Prima di salvare puoi vedere il piano e scaricarlo in Excel; salvato, va nella scheda «Esoneri» del Foglio.</p>
      <div class="q40-criteri">
        ${spunta('soloFuturi', `Fotografia a oggi: si esonera solo dagli incontri dopo il <input type="date" data-q40p="oggi" value="${esc(pianoOggi || oggiIso())}">;
          quelli già svolti contano per come sono andati${risultato.registrati && risultato.registrati.size ? ` (presenze registrate per ${risultato.registrati.size} incontri: le assenze non contano)` : ' (carica le presenze per togliere le assenze)'}`)}
        ${spunta('usaRiserva', `Riserva sulle 40: lascia libero il ${num('riservaA', pref.riservaA)}% delle prime 40 (A) e il ${num('riservaB', pref.riservaB)}% delle seconde 40 (B), per i consigli straordinari`)}
        ${spunta('formazioneInB', 'La formazione obbligatoria si toglie dalla soglia delle seconde 40 (sta nelle ore che restano delle 80)')}
        ${spunta('usaPresenze', `Impegni non svuotati: al massimo il ${num('pct', pref.pct)}% di esonerati per impegno (orientativo, si può cambiare per tipo qui sotto) e almeno ${num('minimo', pref.minimo)} presenti`)}
        ${spunta('stessoGiorno', 'Stesso giorno: esonera la stessa persona da tutti gli impegni della giornata, così non deve venire')}
        ${spunta('richieste', 'Accogli per prime le richieste dei docenti (le loro proposte di esonero nel Foglio)')}
        ${spunta('usaPriorita', 'Priorità degli impegni: in alto i più importanti, da cui si esonera solo se proprio serve («mai» = nessun esonero)')}
        <ol class="q40-scaletta">${righeTipi}</ol>
        ${protettiHtml()}
      </div>
      <div class="q40-barra"><button class="btn pubblica" data-q40="pianoSimula">▶ Simula il piano</button>
        ${piano ? '<button class="btn" data-q40="pianoScarta">Scarta il piano</button>' : ''}</div>`;
    if (piano) h += pianoRisultato();
    return h + '</details>';
  }

  /*
    SINGOLI INCONTRI PROTETTI: l'elenco di tutti gli incontri che contano nelle 40+40, ognuno con il lucchetto. Uno spuntato non avrà
    esoneri, anche se il suo tipo li permette (es. solo il collegio di settembre). Le chiavi («data|impegno») restano sul dispositivo.
  */
  let protettiAperto = false;
  function protettiHtml() {
    pref.protetti = pref.protetti || [];
    const elenco = risultato.impegni.filter(p => p.conta === 'prime' || p.conta === 'seconde');
    const n = pref.protetti.filter(k => elenco.some(p => p.chiave === k)).length;
    const righe = elenco.map(p => {
      const si = pref.protetti.includes(p.chiave);
      const testo = [dataIt(p.data), p.data.split('-').reverse().join('/'), p.impegno, p.tipo].join(' ').toLowerCase();
      return `<li data-cerca="${esc(testo)}"><label class="q40-criterio"><input type="checkbox" data-q40p="prot:${esc(p.chiave)}"${si ? ' checked' : ''}>
        <span>${si ? '🔒 ' : ''}<b>${esc(dataIt(p.data))}</b> ${esc(p.orario)} · ${esc(p.impegno)} <span class="hint">(${esc(p.tipo || '')})</span></span></label></li>`;
    }).join('');
    return `<details class="q40-protetti"${protettiAperto ? ' open' : ''}><summary>🔒 Proteggi singoli incontri <span class="hint">(${n} protetti)</span></summary>
      <p class="hint">Gli incontri spuntati non avranno esoneri, anche se il loro tipo nella scaletta li permetterebbe.</p>
      <label>Cerca <input type="search" data-q40="cercaProtetti" placeholder="giorno (05/10), impegno o tipo"></label>
      <ul class="q40-protetti-elenco">${righe}</ul></details>`;
  }

  function pianoRisultato() {
    const r = piano.riepilogo;
    const freccia = (prima, dopo, soglia) => `<td class="num">${ore(prima)} → <b class="${dopo > soglia + 0.009 ? 'q40-oltre' : ''}">${ore(dopo)}</b> <span class="q40-codice">soglia ${ore(soglia)}</span></td>`;
    const mostra = piano.docenti.filter(d => d.nuovi.length || d.manca.prime > 0.009 || d.manca.seconde > 0.009);
    const righe = mostra.map(d => {
      const giorni = new Map(); d.nuovi.forEach(x => { if (!giorni.has(x.data)) giorni.set(x.data, []); giorni.get(x.data).push(x); });
      // ogni proposta ha la ✕: toccandola si toglie e il piano si rifà subito senza di lei
      const elenco = [...giorni.entries()].map(([g, v]) => `<li><b>${esc(dataIt(g))}</b>: ${v.map(x => `${esc(x.impegno)} (${ore(x.ore)} h${x.richiesto ? ', chiesto dal docente' : ''})` +
        ` <button class="btn piccolo q40-togli-proposta" data-q40="pianoTogli" data-codice="${esc(d.codice)}" data-chiave="${esc(x.data + '|' + x.impegno)}" title="Togli questa proposta e rifai il piano" aria-label="Togli l'esonero di ${esc(nomeDi(d.codice))} da ${esc(x.impegno)}">✕</button>`).join('; ')}</li>`).join('');
      const manca = d.manca.prime > 0.009 || d.manca.seconde > 0.009;
      return `<tr><th scope="row">${esc(nomeDi(d.codice))}<span class="q40-codice">${esc(d.codice)} · dovute ${ore(d.dovute)}</span></th>
        ${freccia(d.prima.prime, d.dopo.prime, d.soglia.prime)}${freccia(d.prima.seconde, d.dopo.seconde, d.soglia.seconde)}
        <td><ul class="q40-elenco">${elenco || '<li class="hint">nessun esonero possibile</li>'}</ul></td>
        <td>${manca ? `<span class="q40-oltre">ancora ${ore(d.manca.prime + d.manca.seconde)} h in più</span>` : '✓'}</td></tr>`;
    }).join('');
    const imp = piano.impegni.filter(x => x.esonerati).map(x => {
      const sopra = piano.opzioni.usaPresenze && x.esonerati > x.tetto;   // oltre il massimo (succede solo con esoneri già approvati)
      return `<tr${sopra ? ' class="q40-proposto"' : ''}><td>${esc(dataIt(x.data))}</td><td>${esc(x.orario)}</td><td>${x.protetto ? '🔒 ' : ''}${esc(x.impegno)}</td><td>${esc(x.tipo)}</td>
        <td class="num">${x.attesi}</td><td class="num">${x.gia ? x.gia + ' + ' : ''}${x.nuovi}</td><td class="num">${x.presenti}</td><td class="num">${x.pct}%</td></tr>`;
    }).join('');
    // le proposte tolte a mano, con ↺ per rimetterle
    const tolte = pianoTolte.map((x, i) => {
      const [codice, k] = [x.slice(0, x.indexOf('#')), x.slice(x.indexOf('#') + 1)], j = k.indexOf('|');
      return `<span class="tag">✕ ${esc(nomeDi(codice))} – ${esc(dataIt(k.slice(0, j)))} ${esc(k.slice(j + 1))}
        <button class="btn piccolo" data-q40="pianoRimetti" data-i="${i}" title="Rimetti questa proposta" aria-label="Rimetti">↺</button></span>`;
    }).join('');
    return `${tolte ? `<div class="q40-sintesi"><span class="hint">Proposte tolte da te:</span>${tolte}<button class="btn piccolo" data-q40="pianoAzzera">Azzera</button></div>` : ''}
      <div class="q40-sintesi">
        <span class="tag${r.docentiSistemati === r.docentiOltre ? ' ok' : ''}">${r.docentiSistemati} di ${r.docentiOltre} docenti rientrano nella soglia</span>
        <span class="tag">${r.esoneri} esoneri · ${ore(r.ore)} ore · in ${r.giornate} giornate</span></div>
      ${r.mancano.length ? `<p class="q40-errore">Per ${r.mancano.length} docenti non basta: gli impegni possibili sono protetti («mai», priorità) o hanno già il massimo di esonerati. Prova ad alzare le percentuali o la riserva.</p>` : ''}
      <div class="q40-tabella-box"><table class="q40-mini q40-piano-tab"><caption>Esoneri proposti per docente</caption>
        <thead><tr><th scope="col">Docente</th><th scope="col">A – prime 40</th><th scope="col">B – seconde 40</th><th scope="col">Esoneri proposti</th><th scope="col">Esito</th></tr></thead>
        <tbody>${righe || '<tr><td colspan="5" class="hint">Nessun docente è oltre la soglia.</td></tr>'}</tbody></table></div>
      ${imp ? `<details class="q40-avvisi"><summary>Presenze negli impegni con esonerati (${piano.impegni.filter(x => x.esonerati).length})</summary>
        <div class="q40-tabella-box"><table class="q40-mini"><thead><tr><th scope="col">Giorno</th><th scope="col">Orario</th><th scope="col">Impegno</th><th scope="col">Tipo</th>
        <th scope="col">Attesi</th><th scope="col">Esonerati (già + nuovi)</th><th scope="col">Presenti</th><th scope="col">%</th></tr></thead><tbody>${imp}</tbody></table></div></details>` : ''}
      <div class="q40-barra">
        <button class="btn" data-q40="pianoSalva"${r.esoneri ? '' : ' disabled'}>💾 Salva come proposte (da approvare)</button>
        <button class="btn pubblica" data-q40="pianoApprova"${r.esoneri ? '' : ' disabled'}>✓ Salva e approva</button>
        <button class="btn" data-q40="pianoExcel">📥 Scarica il piano (Excel)</button></div>`;
  }

  function cambioPiano(el) {
    const c = el.dataset.q40p;
    if (c.startsWith('prot:')) {   // un singolo incontro protetto (o non più)
      const k = c.slice(5); pref.protetti = (pref.protetti || []).filter(x => x !== k);
      if (el.checked) pref.protetti.push(k);
    } else if (c.startsWith('pct:') || c.startsWith('mai:')) {
      const id = c.slice(4), r = pref.perTipo[id] = pref.perTipo[id] || {};
      if (c.startsWith('pct:')) r.pct = el.value === '' ? null : Math.max(0, Math.min(100, Number(el.value) || 0)); else r.mai = el.checked;
    } else if (c === 'oggi') { pianoOggi = el.value; piano = null; disegna(); return; }   // la data della fotografia: solo finché la pagina è aperta
    else if (el.type === 'checkbox') pref[c] = el.checked;
    else pref[c] = Math.max(0, Number(el.value) || 0);
    salvaPref(); piano = null; disegna();
  }

  // Salvare il piano nella scheda «Esoneri»: per ogni docente le righe che aveva (approvate o proposte) più le nuove
  function salvaPiano(approva) {
    const elenco = piano.docenti.filter(d => d.nuovi.length).map(d => {
      const dd = risultato.docenti.find(x => x.codice === d.codice) || { dettaglio: [] };
      const oreDi = k => { const x = dd.dettaglio.find(y => y.data + '|' + y.impegno === k); return x ? x.ore : 0; };
      const voci = [...((foglio.esoneri || new Map()).get(d.codice) || new Map()).keys()].map(k => { const i = k.indexOf('|'); return { data: k.slice(0, i), impegno: k.slice(i + 1), ore: oreDi(k) }; });
      d.nuovi.forEach(n => {
        const gia = voci.find(v => v.data === n.data && v.impegno === n.impegno);
        if (gia) { if (approva) gia.approvato = true; } else voci.push({ data: n.data, impegno: n.impegno, ore: n.ore, approvato: approva });
      });
      return { codice: d.codice, nome: nomeDi(d.codice), voci };
    });
    const r = piano.riepilogo;
    const domanda = `Salvare il piano nella scheda «Esoneri» del Foglio? ${r.esoneri} esoneri per ${elenco.length} docenti (${ore(r.ore)} ore). ` +
      (approva ? 'Saranno già APPROVATI e conteranno subito nel calcolo.' : 'Saranno PROPOSTE da approvare (dettaglio del docente o colonna «Approvato»).') +
      ' Gli esoneri che c\'erano restano.';
    const esegui = async () => {
      stato = 'Salvo il piano nel Foglio…'; disegna();
      try {
        await QuarantaOre.scriviEsoneriTutti(foglio, elenco, opz.email());
        ricalcola(); piano = null;
        await pubblica(`Piano salvato: ${r.esoneri} esoneri ${approva ? 'approvati' : 'proposti'} per ${elenco.length} docenti.`);
      } catch (e) { stato = '⚠️ ' + (e.message || e); disegna(); }
    };
    if (typeof chiedi === 'function') chiedi(domanda, esegui, approva ? 'Salva e approva' : 'Salva'); else if (confirm(domanda)) esegui();
  }

  function excelPiano() {
    const I = t => ({ v: t, stile: 'intest' }), o = piano.opzioni;
    const criteri = [
      o.soloFuturi ? `Fotografia al ${o.oggi.split('-').reverse().join('/')}: esoneri solo dagli incontri successivi (quelli svolti contano come sono andati)` : '',
      o.usaRiserva ? `Riserva: ${o.riservaA}% delle prime 40, ${o.riservaB}% delle seconde 40${o.formazioneInB ? ' (formazione tolta dalle seconde 40)' : ''}` : 'Nessuna riserva',
      o.usaPresenze ? `Al massimo ${o.pct}% di esonerati per impegno (orientativo), almeno ${o.minimo} presenti` : 'Nessun limite di esonerati per impegno',
      o.stessoGiorno ? 'Stesso giorno: la stessa persona per tutti gli impegni della giornata' : '',
      o.richieste ? 'Accolte per prime le richieste dei docenti' : '',
      o.usaPriorita ? 'Priorità (dal più importante): ' + scaletta().map(t => t.tipo + ((o.perTipo[t.id] || {}).mai ? ' (mai)' : '')).join(' › ') : '',
      pianoTolte.length ? `Proposte tolte a mano: ${pianoTolte.length}` : '',
      (o.protetti || []).length ? 'Incontri protetti (nessun esonero): ' + o.protetti.map(k => { const i = k.indexOf('|'); return k.slice(0, i).split('-').reverse().join('/') + ' ' + k.slice(i + 1); }).join('; ') : ''
    ].filter(Boolean);
    const intest = [[{ v: `Piano di esoneri dalle 40+40 – ${foglio.anno || ''}`, stile: 'titolo' }], [`Simulazione del ${new Date().toLocaleDateString('it-IT')}`]].concat(criteri.map(c => [c]), [[]]);
    const doc = intest.concat([['Docente', 'Dovute', 'A prima', 'A dopo', 'Soglia A', 'B prima', 'B dopo', 'Soglia B', 'Esoneri', 'Ore esonerate', 'Esito'].map(I)])
      .concat(piano.docenti.filter(d => d.nuovi.length || d.manca.prime || d.manca.seconde).map(d => [nomeDi(d.codice), d.dovute, d.prima.prime, d.dopo.prime, d.soglia.prime,
        d.prima.seconde, d.dopo.seconde, d.soglia.seconde, d.nuovi.length, d.nuovi.reduce((s, x) => s + x.ore, 0),
        d.manca.prime || d.manca.seconde ? { v: `ancora ${ore(d.manca.prime + d.manca.seconde)} h in più`, stile: 'evid' } : 'ok']));
    // un esonero per riga, in ordine di data e orario
    const tutti = [].concat(...piano.docenti.map(d => d.nuovi.map(x => ({ d, x })))).sort((p, q) => (p.x.data + p.x.orario + p.x.impegno).localeCompare(q.x.data + q.x.orario + q.x.impegno));
    const eso = [['Giorno', 'Orario', 'Impegno', 'Tipo', 'Conta in', 'Docente', 'Ore', 'Chiesto dal docente'].map(I)]
      .concat(tutti.map(({ d, x }) => [dataIt(x.data), x.orario, x.impegno, x.tipo, x.conta === 'prime' ? 'A – prime 40' : 'B – seconde 40', nomeDi(d.codice), x.ore, x.richiesto ? 'SI' : '']));
    const pres = [['Giorno', 'Orario', 'Impegno', 'Tipo', 'Attesi', 'Già esonerati', 'Nuovi esonerati', 'Presenti', '% esonerati'].map(I)]
      .concat(piano.impegni.map(x => [dataIt(x.data), x.orario, x.impegno, x.tipo, x.attesi, x.gia, x.nuovi, x.presenti, x.pct]));
    scarica(Xlsx.crea([
      { nome: 'Docenti', larghezze: [28, 8, 8, 8, 8, 8, 8, 8, 9, 12, 22], righe: doc },
      { nome: 'Esoneri', larghezze: [20, 12, 40, 18, 15, 28, 7, 12], blocca: 1, righe: eso },
      { nome: 'Presenze', larghezze: [20, 12, 40, 18, 8, 10, 10, 9, 10], blocca: 1, righe: pres }
    ]), `Piano esoneri 40+40 ${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  // ---------- azioni ----------
  async function pubblica(motivo) {
    stato = (motivo ? motivo + ' ' : '') + 'Pubblico per i docenti…'; disegna();
    try {
      await QuarantaOre.pubblica(foglio, risultato, opz.email());
      const n = risultato.docenti.filter(d => foglio.visibileTutti || d.visibile).length;
      stato = `✅ Pubblicato: ${n} docenti vedono le proprie 40+40 nell'app (menu → «Le mie 40+40»).`;
    } catch (e) { stato = '⚠️ Pubblicazione non riuscita: ' + (e.message || e); }
    disegna();
  }
  async function cambiaVisibile(codice, si) {
    const d = risultato.docenti.find(x => x.codice === codice);
    if (!d) return;
    stato = 'Salvo nel Foglio…'; disegna();
    try {
      await QuarantaOre.scriviVisibile(foglio, d, si, opz.email());
      d.visibile = si;
      const f = foglio.docenti.find(x => x.codice === codice); if (f) f.visibile = si;
      await pubblica('Salvato nel Foglio.');
    } catch (e) { stato = '⚠️ ' + (e.message || e); disegna(); }
  }
  async function cambiaTutti(si) {
    stato = 'Salvo nel Foglio…'; disegna();
    try {
      await QuarantaOre.scriviVisibileTutti(foglio, si, opz.email());
      foglio.visibileTutti = si;
      await pubblica('Salvato nel Foglio.');
    } catch (e) { stato = '⚠️ ' + (e.message || e); disegna(); }
  }

  // Ore di formazione obbligatoria di un docente: nel Foglio (scheda Docenti, «Ore formazione»), poi ricalcolo e pubblicazione
  async function cambiaFormazione(codice, valore) {
    const d = risultato.docenti.find(x => x.codice === codice);
    if (!d) return;
    const n = Math.max(0, Math.round((parseFloat(String(valore).replace(',', '.')) || 0) * 100) / 100);
    stato = 'Salvo nel Foglio…'; disegna();
    try {
      await QuarantaOre.scriviFormazione(foglio, d, n, opz.email());
      const f = foglio.docenti.find(x => x.codice === codice); if (f) f.oreFormazione = n;
      ricalcola();
      await pubblica('Salvato nel Foglio.');
    } catch (e) { stato = '⚠️ ' + (e.message || e); disegna(); }
  }
  function ricalcola() { risultato = QuarantaOre.calcola(foglio, classiCorrenti); }

  // Togliere del tutto un esonero (o una proposta) dal Foglio
  async function togli(codice, chiave) {
    const d = risultato.docenti.find(x => x.codice === codice);
    const esegui = async () => {
      stato = 'Tolgo l\'esonero dal Foglio…'; disegna();
      try {
        await QuarantaOre.togliEsoneri(foglio, codice, d ? nome(d) : '', [chiave], opz.email());
        ricalcola();
        await pubblica('Esonero tolto.');
      } catch (e) { stato = '⚠️ ' + (e.message || e); disegna(); }
    };
    const domanda = `Togliere l'esonero di ${d ? nome(d) : codice} da «${chiave.split('|')[1]}» del ${chiave.split('|')[0].split('-').reverse().join('/')}? L'impegno tornerà a contare.`;
    if (typeof chiedi === 'function') chiedi(domanda, esegui, 'Togli'); else if (confirm(domanda)) esegui();
  }

  // Approvare (o togliere l'approvazione a) una o tutte le proposte di esonero di un docente: colonna «Approvato» del Foglio
  async function approva(codice, chiavi, valore) {
    stato = 'Salvo nel Foglio…'; disegna();
    try {
      for (const k of chiavi) await QuarantaOre.scriviApprovato(foglio, codice, k, valore, opz.email());
      ricalcola();
      await pubblica(valore ? `Esonero approvato (${chiavi.length}).` : 'Approvazione tolta.');
    } catch (e) { stato = '⚠️ ' + (e.message || e); disegna(); }
  }

  // L'Excel di un docente (lo stesso che il docente scarica dall'app): per mandarglielo o per segnare gli esoneri qui
  function scaricaExcel(codice) {
    const d = risultato.docenti.find(x => x.codice === codice);
    if (!d) return;
    scarica(Xlsx.crea(QuarantaOre.excelDocente(Object.assign({}, d, { nome: nome(d) }), foglio.anno)), `Le mie 40+40 - ${nome(d)}.xlsx`);
  }
  function scarica(blob, nomeFile) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = nomeFile.replace(/[\\\/:*?"<>|]/g, '');
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  }

  /*
    PROPOSTE DI ESONERO: gli Excel rimandati dai docenti (anche più di uno insieme). Per ogni file: chi è (codice nel file),
    quali impegni hanno SI in «Esonero». Dopo la conferma le righe vanno nella scheda «Esoneri» del Foglio (quelle di prima
    di quel docente si sostituiscono), il conto si rifà e si ripubblica.
  */
  async function importaEsoneri(files) {
    const proposte = [], errori = [];
    for (const f of files) {
      try {
        const x = QuarantaOre.leggiEsoneriDaExcel(await Foglio.leggiTabelle(f));
        const d = risultato.docenti.find(y => y.codice === x.codice);
        if (!d) { errori.push(`${f.name}: il codice ${x.codice || '?'} non è tra i docenti`); continue; }
        const voci = d.dettaglio.filter(y => x.chiavi.includes(y.data + '|' + y.impegno) && (y.conta === 'prime' || y.conta === 'seconde'))
          .map(y => ({ data: y.data, impegno: y.impegno, ore: y.ore }));
        proposte.push({ d, voci });
      } catch (e) { errori.push(`${f.name}: ${e.message || e}`); }
    }
    if (!proposte.length) { stato = '⚠️ Nessuna proposta importata. ' + errori.join(' · '); disegna(); return; }
    const testo = proposte.map(p => `${nome(p.d)}: ${p.voci.length} impegni, ${ore(p.voci.reduce((s, v) => s + v.ore, 0))} ore`).join('; ');
    const esegui = async () => {
      stato = 'Salvo gli esoneri nel Foglio…'; disegna();
      try {
        for (const p of proposte) await QuarantaOre.scriviEsoneri(foglio, p.d.codice, nome(p.d), p.voci, opz.email());
        ricalcola();
        await pubblica(`Proposte di esonero salvate (${testo}): contano solo dopo l'approvazione (dettaglio del docente o colonna «Approvato» del Foglio).${errori.length ? ' Non letti: ' + errori.join(' · ') + '.' : ''}`);
      } catch (e) { stato = '⚠️ ' + (e.message || e); disegna(); }
    };
    const domanda = `Importare queste proposte di esonero? ${testo}. Per ogni docente sostituiscono quelle importate prima (gli esoneri già approvati restano approvati); le nuove contano solo quando le approvi.` +
      (errori.length ? ` (Non letti: ${errori.join(' · ')})` : '');
    if (typeof chiedi === 'function') chiedi(domanda, esegui, 'Importa'); else if (confirm(domanda)) esegui();
  }

  /*
    PRESENZE agli incontri già svolti: un Excel (verbali, registro firme, il modello qui sotto…) letto con
    QuarantaOre.leggiPresenzeDaTabelle; dopo la conferma vanno nella scheda «Presenze» del Foglio (per gli incontri del file
    sostituiscono quelle di prima), il conto si rifà (le assenze non contano) e si ripubblica.
  */
  async function caricaPresenze(file) {
    let es;
    try { es = QuarantaOre.leggiPresenzeDaTabelle(await Foglio.leggiTabelle(file), risultato); }
    catch (e) { stato = '⚠️ ' + (e.message || e); disegna(); return; }
    let presenti = 0, assenti = 0;
    es.voci.forEach(m => m.forEach(v => { if (v) presenti++; else assenti++; }));
    if (!es.incontri.size) {
      stato = `⚠️ Nel file non ho riconosciuto nessun incontro.${es.nonTrovati.size ? ' Docenti non riconosciuti: ' + [...es.nonTrovati].slice(0, 10).join(', ') + '.' : ''}` +
        (es.giorniSenza.size ? ' Date senza incontri nel piano: ' + [...es.giorniSenza].slice(0, 10).map(d => d.split('-').reverse().join('/')).join(', ') + '.' : '');
      disegna(); return;
    }
    const domanda = `Presenze lette (${es.forma}): ${es.incontri.size} incontri, ${presenti} presenze e ${assenti} assenze.` +
      (es.nonTrovati.size ? ` Non riconosciuti (ignorati): ${[...es.nonTrovati].slice(0, 12).join(', ')}${es.nonTrovati.size > 12 ? '…' : ''}.` : '') +
      (es.giorniSenza.size ? ` Date senza incontri nel piano: ${[...es.giorniSenza].slice(0, 8).map(d => d.split('-').reverse().join('/')).join(', ')}.` : '') +
      ' Salvarle nella scheda «Presenze» del Foglio? Per questi incontri sostituiscono quelle di prima; le assenze non contano nelle 40+40.';
    const esegui = async () => {
      stato = 'Salvo le presenze nel Foglio…'; disegna();
      try {
        await QuarantaOre.scriviPresenze(foglio, risultato, es.voci, opz.email());
        ricalcola(); piano = null;
        await pubblica(`Presenze salvate: ${es.incontri.size} incontri, ${assenti} assenze.`);
      } catch (e) { stato = '⚠️ ' + (e.message || e); disegna(); }
    };
    if (typeof chiedi === 'function') chiedi(domanda, esegui, 'Salva le presenze'); else if (confirm(domanda)) esegui();
  }
  // il modello da compilare: gli incontri fino a oggi con i docenti attesi (Presente già a SI)
  function scaricaModelloPresenze() {
    const fino = oggiIso();
    scarica(Xlsx.crea(QuarantaOre.modelloPresenze(foglio, risultato, fino)), `Presenze 40+40 fino al ${fino.split('-').reverse().join('-')}.xlsx`);
  }

  // ---------- estratto per una scuola di completamento (Excel) ----------
  function estratto(scuola) {
    const comuni = risultato.docenti.filter(d => d.scuola === scuola);
    const oggi = new Date().toLocaleDateString('it-IT');
    const intest = [[{ v: 'Istituto Comprensivo di Almese – Scuola secondaria di primo grado', stile: 'titolo' }],
      [{ v: `Piano annuale delle attività ${foglio.anno || ''} – docenti in comune con: ${scuola}`, stile: 'grassetto' }],
      [`Estratto del ${oggi}: le date possono cambiare con almeno 5 giorni di preavviso.`]];
    const I = t => ({ v: t, stile: 'intest' });
    // 1) riepilogo
    const riep = intest.concat([[], ['Docente', 'Ore settimanali da noi', 'Dovute prime 40 da noi', 'Dovute seconde 40 da noi', 'Programmate prime 40', 'Programmate seconde 40', 'Formazione', 'Scrutini ed esami (ore, non contano)'].map(I)])
      .concat(comuni.map(d => [nome(d), d.oreSett, d.dovute, d.dovute, d.prime, d.seconde, d.formazione, d.nonConta]))
      .concat([[], ['Le attività funzionali delle COE si dividono tra le scuole in proporzione alle ore di servizio (O.M. 446/1997 art. 7 c. 7).'],
        ['Foglio «Piano»: tutto il piano, in giallo le righe che riguardano i docenti in comune (con il loro orario). Poi un foglio per ogni docente.']]);
    // 2) piano con le righe evidenziate
    const piano = intest.slice(0, 2).concat([[], ['Giorno', 'Orario', 'Impegno', 'Classi', 'Conta in', 'Docenti in comune impegnati (orario)'].map(I)]);
    risultato.impegni.forEach(p => {
      const chi = comuni.map(d => { const x = d.dettaglio.find(y => y.data + '|' + y.impegno === p.chiave); return x ? nome(d) + (x.orario ? ` (${x.orario})` : '') : ''; }).filter(Boolean);
      const st = chi.length ? 'evid' : '';
      piano.push([dataIt(p.data), p.orario, p.impegno, p.classi, CONTA[p.conta] || 'non conta', chi.join('; ')].map((v, i) => ({ v, stile: chi.length ? (i === 5 ? 'evidGrassetto' : st) : '' })));
    });
    const fogli = [
      { nome: 'Riepilogo', larghezze: [28, 12, 12, 12, 12, 12, 11, 14], righe: riep },
      { nome: 'Piano', larghezze: [18, 12, 44, 30, 11, 50], blocca: 4, orizzontale: true, righe: piano }
    ];
    // 3) un foglio per docente
    comuni.forEach(d => {
      const r = [[{ v: nome(d), stile: 'titolo' }], [`Impegni presso l'IC di Almese (secondaria) – a.s. ${foglio.anno || ''} – classi: ${d.classi.join(' ')}`], [],
        ['Giorno', 'Orario del docente', 'Impegno', 'Ore', 'Conta in'].map(I)]
        .concat(d.dettaglio.map(x => [dataIt(x.data), x.orario, x.impegno, x.ore, CONTA[x.conta] || x.conta]))
        .concat([[], ['', '', { v: 'Totale prime 40', stile: 'grassetto' }, { v: d.prime, stile: 'grassetto' }],
          ['', '', { v: 'Totale seconde 40', stile: 'grassetto' }, { v: d.seconde, stile: 'grassetto' }]]);
      fogli.push({ nome: nome(d), larghezze: [18, 16, 48, 7, 12], blocca: 4, righe: r });
    });
    const blob = Xlsx.crea(fogli);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `Impegni docenti in comune - ${scuola.replace(/[\\\/:*?"<>|]/g, '')}.xlsx`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  }

  // ---------- montaggio ----------
  function monta(contenitore, opzioni) {
    opz = opzioni;
    if (box !== contenitore) {
      box = contenitore;
      box.classList.add('q40');
      box.addEventListener('click', e => {
        const b = e.target.closest('[data-q40]');
        if (!b || b.tagName === 'INPUT') return;
        const az = b.dataset.q40;
        if (az === 'rileggi') carica();
        else if (az === 'pubblica') pubblica('');
        else if (az === 'stampa') window.print();
        else if (az === 'estratto') estratto(b.dataset.scuola);
        else if (az === 'excel') scaricaExcel(b.dataset.codice);
        else if (az === 'togli') togli(b.dataset.codice, b.dataset.chiave);
        else if (az === 'excelEsoneri') excelEsoneri();
        else if (az === 'approva') approva(b.dataset.codice, [b.dataset.chiave], b.dataset.valore === 'SI');
        else if (az === 'approvaTutte') {
          const d = risultato.docenti.find(x => x.codice === b.dataset.codice);
          if (d) approva(d.codice, d.dettaglio.filter(x => x.proposto).map(x => x.data + '|' + x.impegno), true);
        }
        else if (az === 'importa') box.querySelector('#q40File').click();
        else if (az === 'presenze') box.querySelector('#q40Presenze').click();
        else if (az === 'modelloPresenze') scaricaModelloPresenze();
        // piano di esoneri
        else if (az === 'pianoSimula') { simulaPiano(); disegna(); }
        else if (az === 'pianoScarta') { piano = null; pianoTolte = []; disegna(); }
        // togliere una proposta (o rimetterla) rifà subito il piano
        else if (az === 'pianoTogli') { const x = b.dataset.codice + '#' + b.dataset.chiave; if (!pianoTolte.includes(x)) pianoTolte.push(x); simulaPiano(); disegna(); }
        else if (az === 'pianoRimetti') { pianoTolte.splice(Number(b.dataset.i), 1); simulaPiano(); disegna(); }
        else if (az === 'pianoAzzera') { pianoTolte = []; simulaPiano(); disegna(); }
        else if (az === 'pianoSalva') salvaPiano(false);
        else if (az === 'pianoApprova') salvaPiano(true);
        else if (az === 'pianoExcel') excelPiano();
        else if (az === 'pianoSu' || az === 'pianoGiu') {
          const i = Number(b.dataset.i), j = az === 'pianoSu' ? i - 1 : i + 1;
          if (j >= 0 && j < pref.ordine.length) { [pref.ordine[i], pref.ordine[j]] = [pref.ordine[j], pref.ordine[i]]; salvaPref(); piano = null; disegna(); }
        }
        else if (az === 'apri') { const c = b.closest('tr').dataset.codice; aperti.has(c) ? aperti.delete(c) : aperti.add(c); disegna(); }
      });
      // il riquadro del piano resta aperto o chiuso quando la scheda si ridisegna («toggle» non risale: si ascolta in cattura)
      box.addEventListener('toggle', e => {
        if (!e.target.classList) return;
        if (e.target.classList.contains('q40-piano')) pianoAperto = e.target.open;
        else if (e.target.classList.contains('q40-protetti')) protettiAperto = e.target.open;
      }, true);
      // «Cerca» negli esoneri per impegno: nasconde le righe che non contengono il testo
      box.addEventListener('input', e => {
        // «Cerca» negli incontri da proteggere (piano di esoneri)
        if (e.target.matches('[data-q40="cercaProtetti"]')) {
          const t = e.target.value.trim().toLowerCase();
          box.querySelectorAll('.q40-protetti-elenco li').forEach(r => { r.hidden = !!t && !r.dataset.cerca.includes(t); });
          return;
        }
        if (!e.target.matches('[data-q40="cerca"]')) return;
        const t = e.target.value.trim().toLowerCase();
        box.querySelectorAll('.q40-esoneri tbody tr').forEach(r => { r.hidden = !!t && !r.dataset.cerca.includes(t); });
      });
      box.addEventListener('change', e => {
        if (e.target.id === 'q40File') { const f = [...e.target.files]; e.target.value = ''; if (f.length) importaEsoneri(f); return; }
        if (e.target.id === 'q40Presenze') { const f = e.target.files[0]; e.target.value = ''; if (f) caricaPresenze(f); return; }
        if (e.target.dataset.q40p) { cambioPiano(e.target); return; }
        const b = e.target.closest('input[data-q40]');
        if (!b) return;
        if (b.dataset.q40 === 'visibile') cambiaVisibile(b.closest('tr').dataset.codice, b.checked);
        else if (b.dataset.q40 === 'tutti') cambiaTutti(b.checked);
        else if (b.dataset.q40 === 'formazione') cambiaFormazione(b.closest('tr').dataset.codice, b.value);
      });
    }
    // finché non si sa se chi usa la pagina è autorizzato non si legge niente (verifica40 in index.html ridisegna dopo)
    if (permesso !== true) {
      box.innerHTML = permesso === false ? '<p class="hint">Per questa scheda serve SI nella colonna «40 ore» del file Autorizzazioni.</p>'
        : '<p class="hint">Controllo l\'autorizzazione «40 ore»… (serve aver fatto l\'accesso con l\'account della scuola)</p>';
      return;
    }
    if (!risultato && !errore && !inCorso) carica(); else disegna();
  }

  return { monta, controlla, puo: () => permesso === true };
})();
