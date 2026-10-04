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
  let foglio = null, risultato = null, errore = '', inCorso = false, stato = '';
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
      risultato = QuarantaOre.calcola(foglio, QuarantaOre.classiDaOrario(D));
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
      ${foglio ? `<label class="q40-tutti"><input type="checkbox" data-q40="tutti" ${foglio.visibileTutti ? 'checked' : ''}> Visibile a tutti i docenti (ognuno le proprie, nell'app)</label>` : ''}
    </div>`;
    if (stato) h += `<p class="hint" role="status">${esc(stato)}</p>`;
    if (errore) h += `<p class="q40-errore" role="alert">⚠️ ${esc(errore)} <button class="btn" data-q40="rileggi">Collega di nuovo a Google</button></p>`;
    if (risultato) {
      if (risultato.avvisi.length) h += `<details class="q40-avvisi"><summary>⚠️ ${risultato.avvisi.length} cose da controllare nel Foglio</summary><ul>${risultato.avvisi.map(a => `<li>${esc(a)}</li>`).join('')}</ul></details>`;
      h += tabella();
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
        <td>${esc(d.tipo)}</td>${td(d.oreSett)}${td(d.dovute)}${td(d.prime)}${td(d.seconde)}${td(d.formazione)}
        ${td(d.residuoPrime, true)}${td(d.residuoSeconde, true)}${td(d.residuo, true)}
        <td class="q40-vis"><input type="checkbox" data-q40="visibile" aria-label="Visibile a ${esc(nome(d))}" ${d.visibile ? 'checked' : ''} ${d.riga ? '' : 'disabled'}></td></tr>`;
      if (aperto) r += `<tr class="q40-dettaglio"><td colspan="11">${dettaglio(d)}</td></tr>`;
      return r;
    }).join('');
    return `<div class="q40-tabella-box"><table class="q40-tabella"><caption>Prospetto 40+40 per docente${foglio.anno ? ' – ' + esc(foglio.anno) : ''}
        <span class="hint">(tocca un nome per il dettaglio; in rosso le ore oltre il dovuto)</span></caption>
      <thead><tr><th scope="col">Docente</th><th scope="col">Tipo</th><th scope="col">Ore sett.</th><th scope="col">Dovute (per ciascuna)</th>
        <th scope="col">Prime 40</th><th scope="col">Seconde 40</th><th scope="col">Formazione</th>
        <th scope="col">Restano prime</th><th scope="col">Restano seconde</th><th scope="col">Restano in tutto</th><th scope="col">Visibile</th></tr></thead>
      <tbody>${righe}</tbody></table></div>`;
  }
  function dettaglio(d) {
    if (!d.dettaglio.length) return '<p class="hint">Nessun impegno: controlla le classi del docente nell\'orario.</p>';
    return `<p class="hint">Classi (cattedre + sostegno): ${esc(d.classi.join(' ') || 'nessuna')}${d.nonConta ? ` · scrutini ed esami: ${ore(d.nonConta)} ore (non contano)` : ''}</p>
      <table class="q40-mini"><thead><tr><th scope="col">Giorno</th><th scope="col">Orario</th><th scope="col">Impegno</th><th scope="col">Ore</th><th scope="col">Conta in</th></tr></thead><tbody>` +
      d.dettaglio.map(x => `<tr class="q40-${x.conta}"><td>${esc(dataIt(x.data))}</td><td>${esc(x.orario)}</td><td>${esc(x.impegno)}</td><td class="num">${ore(x.ore)}</td><td>${esc(CONTA[x.conta] || x.conta)}</td></tr>`).join('') +
      '</tbody></table>';
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
        else if (az === 'apri') { const c = b.closest('tr').dataset.codice; aperti.has(c) ? aperti.delete(c) : aperti.add(c); disegna(); }
      });
      box.addEventListener('change', e => {
        const b = e.target.closest('input[data-q40]');
        if (!b) return;
        if (b.dataset.q40 === 'visibile') cambiaVisibile(b.closest('tr').dataset.codice, b.checked);
        else if (b.dataset.q40 === 'tutti') cambiaTutti(b.checked);
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
