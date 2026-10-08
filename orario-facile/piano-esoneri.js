/*
  piano-esoneri.js – SIMULAZIONE di un piano di esoneri dalle 40+40, deciso in modo centralizzato (scheda 40+40 di Orario Facile).

  Il problema: molti docenti hanno in programma più ore di quelle dovute (prime 40 = A, seconde 40 = B). Bisogna esonerarli da
  qualche impegno, ma senza svuotare i consigli di classe, senza toccare gli impegni più importanti e, se possibile, liberando
  giornate intere (così il docente non deve venire a scuola per un solo impegno).

  I CRITERI (si spuntano e si regolano nella scheda):
    usaRiserva   – soglia con riserva: il docente resta sotto il (100 − riserva)% delle ore dovute, con riserve diverse per A e B,
                   per avere margine in caso di consigli straordinari (es. 5% di 40 = 2 ore libere);
                   formazioneInB: le ore di formazione obbligatoria si tolgono dalla soglia delle seconde 40 (stanno nelle 80);
    usaPresenze  – ogni impegno resta «pieno»: al massimo una certa percentuale (orientativa, anche diversa per tipo) di esonerati
                   e almeno un numero minimo di presenti;
    stessoGiorno – si cerca di esonerare la stessa persona da tutti gli impegni dello stesso giorno;
    protetti     – singoli incontri da cui non si esonera nessuno (es. un solo collegio), anche se il loro tipo lo permetterebbe;
    usaPriorita  – una scaletta dei tipi di impegno: in alto i più importanti (es. Collegio docenti), da cui si esonera solo se
                   proprio serve; per ogni tipo si può anche dire «mai»;
    vietati      – proposte tolte a mano dal piano («codice#data|impegno»): il docente non va esonerato da quell'incontro;
    soloFuturi   – con «oggi» (la data della fotografia) si esonera solo dagli incontri successivi: quelli già svolti contano
                   per come sono andati (presenze registrate: le assenze non contano già nelle ore del docente);
    richieste    – si preferiscono gli impegni da cui il docente ha chiesto l'esonero (le sue proposte nel Foglio).

  Come si calcola (spiegato semplice): a turno, ogni docente che ha ancora ore in più sceglie UN esonero (un impegno, oppure una
  giornata intera) tra quelli possibili, prendendo il «più conveniente» secondo i criteri; poi tocca al docente successivo. Così
  i posti liberi negli impegni si dividono in modo equo e non se li prende tutti il primo. Si ripete finché nessuno ha più ore
  in più o non ci sono più esoneri possibili. Alla fine si rifà il conto esatto (con le sovrapposizioni di orario) e, se serve,
  si fa un altro giro.

  Uso: PianoEsoneri.tipi(risultato) → i tipi di impegno nell'ordine proposto;
       PianoEsoneri.simula(risultato, opzioni, verifica) → { docenti, impegni, riepilogo }
       (risultato = QuarantaOre.calcola(); verifica(scelte) = conto esatto con gli esoneri scelti, facoltativo).
*/
const PianoEsoneri = (() => {
  const semplice = s => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  const arrot = n => Math.round(n * 100) / 100;
  const chiave = x => x.data + '|' + x.impegno;
  const conta = x => x.conta === 'prime' || x.conta === 'seconde';
  const POCO = 0.009;   // sotto questa quantità di ore il bisogno è soddisfatto (evita gli errori di arrotondamento)

  // l'ordine proposto della scaletta: in alto i più importanti (da cui si esonera per ultimi)
  const ORDINE_PROPOSTO = ['collegio', 'assemble', 'colloqui', 'dipartiment', 'programmaz', 'pless', 'glo', 'cdc', 'consig'];
  const OPZIONI_PROPOSTE = {
    usaRiserva: true, riservaA: 5, riservaB: 5, formazioneInB: false,
    usaPresenze: true, pct: 30, minimo: 3,
    stessoGiorno: true, usaPriorita: true, richieste: true,
    ordine: [], perTipo: {}, protetti: [], vietati: [], soloFuturi: true, oggi: ''
  };

  // I tipi di impegno che contano nelle 40+40, nell'ordine proposto: [{ id, tipo, conta, quanti }]
  function tipi(risultato) {
    const visti = new Map();
    risultato.impegni.filter(conta).forEach(p => {
      const t = p.tipo || 'Altro', id = semplice(t);
      if (!visti.has(id)) visti.set(id, { id, tipo: t, conta: p.conta, quanti: 0 });
      visti.get(id).quanti++;
    });
    const rango = t => { const i = ORDINE_PROPOSTO.findIndex(x => t.id.includes(x)); return i < 0 ? 50 : i; };
    return [...visti.values()].sort((a, b) => rango(a) - rango(b) || a.tipo.localeCompare(b.tipo, 'it'));
  }

  function simula(risultato, opzioni, verifica) {
    const opz = Object.assign({}, OPZIONI_PROPOSTE, opzioni || {});
    const impDi = new Map(risultato.impegni.map(p => [p.chiave, p]));
    const tipoDi = k => semplice((impDi.get(k) || {}).tipo || 'Altro');
    const regola = k => (opz.perTipo || {})[tipoDi(k)] || {};
    // nessun esonero: il tipo è «mai» oppure il singolo incontro è protetto (🔒 nella scheda)
    const protetti = new Set(opz.protetti || []);
    const vietato = k => !!regola(k).mai || protetti.has(k);
    // proposte tolte a mano dal piano: «codice#data|impegno» (quel docente non va esonerato da quell'incontro)
    const proposteTolte = new Set(opz.vietati || []);
    const vietatoPer = (codice, k) => vietato(k) || proposteTolte.has(codice + '#' + k);
    // gli incontri già svolti non si possono più esonerare: si esonera solo da quelli dopo «oggi» (la data della fotografia)
    const passato = x => opz.soloFuturi && opz.oggi && x.data <= opz.oggi;
    // posizione nella scaletta: 0 = il più importante
    const ordine = opz.ordine && opz.ordine.length ? opz.ordine : tipi(risultato).map(t => t.id);
    const N = Math.max(1, ordine.length);
    const posizione = k => { const i = ordine.indexOf(tipoDi(k)); return i < 0 ? N : i; };

    // quanti docenti sono attesi a ogni impegno e quanti sono già esonerati (esoneri approvati)
    const attesi = new Map(), gia = new Map();
    risultato.docenti.forEach(d => d.dettaglio.filter(conta).forEach(x => {
      const k = chiave(x);
      attesi.set(k, (attesi.get(k) || 0) + 1);
      if (x.esonero) gia.set(k, (gia.get(k) || 0) + 1);
    }));
    // quanti esonerati al massimo per ogni impegno: la percentuale orientativa (del tipo, se c'è) e il minimo di presenti
    const percentuale = k => { const p = regola(k).pct; return p === '' || p == null || isNaN(Number(p)) ? Number(opz.pct) || 0 : Number(p); };
    const tetto = k => {
      const n = attesi.get(k) || 0;
      if (!opz.usaPresenze) return n;
      return Math.max(0, Math.min(Math.round(percentuale(k) / 100 * n), n - (Number(opz.minimo) || 0)));
    };
    const carico = new Map(gia);   // esonerati per impegno: quelli già approvati + quelli scelti qui

    // la soglia di ogni docente (le ore che può fare al massimo) e quante ne ha in più
    const soglia = d => {
      const fa = opz.usaRiserva ? 1 - (Number(opz.riservaA) || 0) / 100 : 1, fb = opz.usaRiserva ? 1 - (Number(opz.riservaB) || 0) / 100 : 1;
      return { prime: arrot(d.dovute * fa), seconde: Math.max(0, arrot(d.dovute * fb - (opz.formazioneInB ? d.formazione || 0 : 0))) };
    };
    const scelte = new Map(risultato.docenti.map(d => [d.codice, new Map()]));   // codice → Map chiave → voce del dettaglio
    const bisogno = new Map();
    const calcolaBisogno = (d, ore) => { const s = soglia(d); return { prime: Math.max(0, arrot(ore.prime - s.prime)), seconde: Math.max(0, arrot(ore.seconde - s.seconde)) }; };
    risultato.docenti.forEach(d => bisogno.set(d.codice, calcolaBisogno(d, d)));

    // il «costo» di esonerare un docente da un impegno (più basso = più conveniente)
    const costo = (x, k) =>
      (opz.usaPriorita ? (N - posizione(k)) * 10 : 0) +                                  // gli impegni importanti costano di più
      (opz.usaPresenze ? ((carico.get(k) || 0) + 1) / Math.max(1, tetto(k)) : 0) -        // un impegno già con molti esonerati costa di più
      (opz.richieste && x.proposto ? 5 : 0);                                              // se il docente l'ha chiesto, costa meno

    // UN passo per un docente: sceglie l'esonero migliore (un impegno o una giornata) e lo segna. false se non ce ne sono
    function passo(d) {
      const b = bisogno.get(d.codice), mie = scelte.get(d.codice);
      const libere = d.dettaglio.filter(x => {
        const k = chiave(x);
        return conta(x) && b[x.conta] > POCO && !x.esonero && !x.assente && !passato(x) && !mie.has(k) && x.ore > 0 && !vietatoPer(d.codice, k) && (carico.get(k) || 0) < tetto(k);
      });
      if (!libere.length) return false;
      const gruppi = new Map();
      libere.forEach(x => { const g = opz.stessoGiorno ? x.data : chiave(x); if (!gruppi.has(g)) gruppi.set(g, []); gruppi.get(g).push(x); });
      let migliore = null;
      gruppi.forEach(u => {
        // dentro la giornata: prima gli impegni più convenienti, finché servono
        const ordinati = u.slice().sort((p, q) => costo(p, chiave(p)) - costo(q, chiave(q)) || p.ore - q.ore);
        const resto = { prime: b.prime, seconde: b.seconde }, presi = [];
        let utile = 0, oltre = 0, spesa = 0;
        ordinati.forEach(x => {
          if (resto[x.conta] <= POCO) return;
          const usa = Math.min(x.ore, resto[x.conta]);
          utile += usa; oltre += x.ore - usa; resto[x.conta] -= x.ore; spesa += costo(x, chiave(x)) * x.ore; presi.push(x);
        });
        if (!presi.length || utile <= 0) return;
        let punti = spesa / utile + oltre;                                                  // costo per ora utile + ore esonerate «in più»
        if (opz.stessoGiorno) {
          if ([...mie.keys()].some(k => k.startsWith(presi[0].data + '|'))) punti -= 3;      // completa una giornata già iniziata
          punti -= presi.length - 1;                                                       // libera più impegni nello stesso giorno
        }
        if (!migliore || punti < migliore.punti) migliore = { punti, presi };
      });
      if (!migliore) return false;
      migliore.presi.forEach(x => {
        const k = chiave(x);
        mie.set(k, x); carico.set(k, (carico.get(k) || 0) + 1);
        b[x.conta] = Math.max(0, arrot(b[x.conta] - x.ore));
      });
      return true;
    }
    // i giri: a turno, prima chi ha più ore in più
    function giri() {
      for (let volte = 0; volte < 1000; volte++) {
        const coda = risultato.docenti.filter(d => { const b = bisogno.get(d.codice); return b.prime > POCO || b.seconde > POCO; })
          .sort((p, q) => { const a = bisogno.get(p.codice), c = bisogno.get(q.codice); return (c.prime + c.seconde) - (a.prime + a.seconde); });
        let mosso = false;
        coda.forEach(d => { if (passo(d)) mosso = true; });
        if (!mosso) break;
      }
    }
    giri();
    // conto esatto (le ore di impegni nello stesso orario contano una volta sola): se qualcuno è ancora sopra, un altro giro
    let esatto = null;
    for (let i = 0; i < 3 && verifica; i++) {
      esatto = verifica(scelte);
      let ancora = false;
      risultato.docenti.forEach(d => {
        const e = esatto.get(d.codice); if (!e) return;
        const b = calcolaBisogno(d, e);
        bisogno.set(d.codice, b);
        if (b.prime > POCO || b.seconde > POCO) ancora = true;
      });
      if (!ancora) break;
      const prima = [...scelte.values()].reduce((s, m) => s + m.size, 0);
      giri();
      if ([...scelte.values()].reduce((s, m) => s + m.size, 0) === prima) break;   // niente di nuovo: inutile ricontare
      esatto = verifica(scelte);
    }

    /*
      RIFINITURA: un esonero di troppo lascia il docente sotto la soglia più del necessario (es. servivano 7 ore e se ne
      sono tolte 8,5) e toglie una presenza a un impegno. Si prova a rimettere ogni esonero, cominciando dagli impegni più
      importanti e più lunghi: se senza quell'esonero il docente resta comunque entro la soglia, l'esonero si toglie.
    */
    const costoFisso = (x, k) => (opz.usaPriorita ? (N - posizione(k)) * 10 : 0) - (opz.richieste && x.proposto ? 5 : 0);
    function rifinisci() {
      risultato.docenti.forEach(d => {
        const mie = scelte.get(d.codice); if (!mie.size) return;
        const s = soglia(d), e = esatto && esatto.get(d.codice);
        const tolte = c => [...mie.values()].filter(x => x.conta === c).reduce((t, x) => t + x.ore, 0);
        const ore = e ? { prime: e.prime, seconde: e.seconde } : { prime: d.prime - tolte('prime'), seconde: d.seconde - tolte('seconde') };
        [...mie.entries()].sort(([ka, xa], [kb, xb]) => costoFisso(xb, kb) - costoFisso(xa, ka) || xb.ore - xa.ore).forEach(([k, x]) => {
          if (ore[x.conta] + x.ore <= s[x.conta] + POCO) { mie.delete(k); carico.set(k, (carico.get(k) || 1) - 1); ore[x.conta] += x.ore; }
        });
        // SCAMBI: un esonero lungo si cambia con uno più corto (non più importante) se basta lo stesso. Con «stesso giorno» non
        // si toccano le giornate con più esoneri, che restano libere per intero
        const liberi = d.dettaglio.filter(y => { const k = chiave(y); return conta(y) && !y.esonero && !y.assente && !passato(y) && !mie.has(k) && y.ore > 0 && !vietatoPer(d.codice, k) && (carico.get(k) || 0) < tetto(k); });
        [...mie.entries()].sort(([, xa], [, xb]) => xb.ore - xa.ore).forEach(([k, x]) => {
          if (opz.stessoGiorno && [...mie.values()].filter(z => z.data === x.data).length > 1) return;
          const migliore = liberi.filter(y => y.conta === x.conta && y.ore < x.ore && !mie.has(chiave(y)) && (carico.get(chiave(y)) || 0) < tetto(chiave(y)) &&
              ore[x.conta] + x.ore - y.ore <= s[x.conta] + POCO && costoFisso(y, chiave(y)) <= costoFisso(x, k))
            .sort((p, q) => q.ore - p.ore || costoFisso(p, chiave(p)) - costoFisso(q, chiave(q)))[0];
          if (!migliore) return;
          const ky = chiave(migliore);
          mie.delete(k); carico.set(k, (carico.get(k) || 1) - 1);
          mie.set(ky, migliore); carico.set(ky, (carico.get(ky) || 0) + 1);
          ore[x.conta] += x.ore - migliore.ore;
        });
      });
    }
    // dopo la rifinitura i posti liberati negli impegni servono a chi è ancora sopra la soglia: un altro giro (al massimo due volte)
    const quante = () => [...scelte.values()].reduce((s, m) => s + m.size, 0);
    const stimate = d => { const m = [...scelte.get(d.codice).values()], t = c => m.filter(x => x.conta === c).reduce((s, x) => s + x.ore, 0); return { prime: d.prime - t('prime'), seconde: d.seconde - t('seconde') }; };
    for (let volta = 0; volta < 2; volta++) {
      rifinisci();
      if (verifica) esatto = verifica(scelte);
      let ancora = false;
      risultato.docenti.forEach(d => {
        const b = calcolaBisogno(d, esatto ? (esatto.get(d.codice) || d) : stimate(d));
        bisogno.set(d.codice, b);
        if (b.prime > POCO || b.seconde > POCO) ancora = true;
      });
      if (!ancora) break;
      const prima = quante();
      giri();
      if (quante() === prima) break;
      if (verifica) esatto = verifica(scelte);
    }

    // il risultato, per docente e per impegno
    const docenti = risultato.docenti.map(d => {
      const mie = [...scelte.get(d.codice).values()].sort((a, b) => chiave(a).localeCompare(chiave(b)));
      const s = soglia(d), e = esatto && esatto.get(d.codice);
      const dopo = e ? { prime: arrot(e.prime), seconde: arrot(e.seconde) }
        : { prime: arrot(d.prime - mie.filter(x => x.conta === 'prime').reduce((t, x) => t + x.ore, 0)), seconde: arrot(d.seconde - mie.filter(x => x.conta === 'seconde').reduce((t, x) => t + x.ore, 0)) };
      const manca = { prime: Math.max(0, arrot(dopo.prime - s.prime)), seconde: Math.max(0, arrot(dopo.seconde - s.seconde)) };
      return { codice: d.codice, nome: d.nome, dovute: d.dovute, soglia: s, prima: { prime: d.prime, seconde: d.seconde }, dopo, manca,
        nuovi: mie.map(x => ({ data: x.data, orario: x.orario, impegno: x.impegno, ore: x.ore, conta: x.conta, richiesto: !!x.proposto, tipo: (impDi.get(chiave(x)) || {}).tipo || '' })) };
    });
    const impegni = [...attesi.keys()].map(k => {
      const p = impDi.get(k) || {}, n = attesi.get(k) || 0, g = gia.get(k) || 0, c = carico.get(k) || 0;
      return { chiave: k, data: p.data || k.split('|')[0], orario: p.orario || '', impegno: p.impegno || k.split('|')[1], tipo: p.tipo || '', conta: p.conta,
        attesi: n, gia: g, nuovi: c - g, esonerati: c, presenti: n - c, tetto: tetto(k), pct: n ? Math.round(c / n * 100) : 0, protetto: vietato(k) };
    }).sort((a, b) => a.chiave.localeCompare(b.chiave));
    const interessati = docenti.filter(d => d.prima.prime - d.soglia.prime > POCO || d.prima.seconde - d.soglia.seconde > POCO);
    const riepilogo = {
      docentiOltre: interessati.length,
      docentiSistemati: interessati.filter(d => d.manca.prime <= POCO && d.manca.seconde <= POCO).length,
      esoneri: docenti.reduce((s, d) => s + d.nuovi.length, 0),
      ore: arrot(docenti.reduce((s, d) => s + d.nuovi.reduce((t, x) => t + x.ore, 0), 0)),
      giornate: docenti.reduce((s, d) => s + new Set(d.nuovi.map(x => x.data)).size, 0),
      mancano: docenti.filter(d => d.manca.prime > POCO || d.manca.seconde > POCO)
    };
    return { docenti, impegni, riepilogo, opzioni: opz };
  }

  return { tipi, simula, OPZIONI_PROPOSTE };
})();
