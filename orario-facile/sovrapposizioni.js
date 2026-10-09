/*
  Sovrapposizioni con le scuole di completamento: come risolverle (scheda 40+40 di Orario Facile).
  © 2026 Istituto Comprensivo di Almese – Gruppo Wolf. Tutti i diritti riservati.

  QuarantaOre.calcola trova le «incompatibilità» (campo conflitti di ogni docente in COE): un nostro impegno che si sovrappone a
  uno dell'altra scuola, oppure che lascia meno minuti del margine per spostarsi. Qui, per ognuna (in ordine di data), si prova:
    1. RIORDINO: se il nostro impegno è una sequenza di classi («1A / 2A / 3A», consigli di classe) si scambia la posizione della
       classe del docente con un'altra, così il suo turno cade in un orario libero (il docente c'è e nessuno perde ore);
    2. ESONERO dal nostro impegno, se i criteri del piano di esoneri lo permettono (tipo non «mai», incontro non protetto, non oltre
       il massimo di esonerati, conta nelle 40+40: scrutini ed esami no). Se il docente ha già un esonero approvato da un altro
       incontro futuro e senza esonero scenderebbe sotto le ore dovute, si SCAMBIA: torna a quell'incontro e si esonera da questo;
    3. ORARIO: lo stesso impegno spostato più presto o più tardi nello stesso giorno (a passi di 15 minuti, al massimo 3 ore; quelli
       del pomeriggio non prima delle 14:00, nessuno dopo le 20:00);
    4. GIORNO: lo stesso orario in un altro giorno feriale vicino (da una settimana prima a due dopo, mai nel passato).
  Ogni prova si controlla rifacendo il conto (calcola): la sovrapposizione deve sparire e non ne deve nascere nessuna nuova, e
  l'impegno spostato non deve accavallarsi con un altro nostro impegno delle stesse classi. Quelle che restano sono «non risolvibili».
  Le proposte scartate a mano (vietate, «tipo#codice#data|impegno») non si ripropongono: si cerca un'altra strada.
*/
const Sovrapposizioni = (() => {
  const hhmm = m => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
  const semplice = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
  const arrot = x => Math.round(x * 100) / 100;
  const giornoIso = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const chiaveConflitto = (codice, c) => [codice, c.data, c.nostro, c.loro].join('|');
  const classiDi = testo => (String(testo || '').toUpperCase().match(/\b[1-5]\s?[A-Z]\b/g) || []).map(x => x.replace(/\s/g, ''));

  /*
    opz = { foglio, risultato, classi (Map codice → Set), calcola (QuarantaOre.calcola), pref (criteri del piano di esoneri),
            oggi ('aaaa-mm-gg'), vietate: [id delle proposte scartate] }
    Restituisce { proposte, nonRisolte, passate, daVerificare, impegni (il piano con le modifiche), esoneri (Map come foglio.esoneri) }
  */
  function analizza(opz) {
    const { foglio, classi, calcola, pref = {}, oggi = '' } = opz;
    const vietate = new Set(opz.vietate || []);
    // la copia di lavoro: le modifiche si accumulano qui (impegni copiati riga per riga, esoneri copiati per docente)
    const lavoro = Object.assign({}, foglio, {
      impegni: foglio.impegni.map(x => Object.assign({}, x)),
      esoneri: new Map([...(foglio.esoneri || new Map())].map(([k, m]) => [k, new Map([...m].map(([c, x]) => [c, Object.assign({}, x)]))]))
    });
    const conflittiDi = r => {
      const m = new Map();
      r.docenti.forEach(d => (d.conflitti || []).filter(c => c.tipo !== 'senzaOrario').forEach(c => m.set(chiaveConflitto(d.codice, c), { d, c })));
      return m;
    };
    let r = calcola(lavoro, classi), attuali = conflittiDi(r);
    const proposte = [], nonRisolte = [], passate = [], daVerificare = [], provati = new Set();
    r.docenti.forEach(d => (d.conflitti || []).filter(c => c.tipo === 'senzaOrario').forEach(c => daVerificare.push({ codice: d.codice, conflitto: c })));

    // una prova: la modifica fatta su «lavoro» (fai) va bene se la sovrapposizione sparisce e non ne nasce un'altra; se no si annulla
    const prova = (k, fai, disfa) => {
      fai();
      const r2 = calcola(lavoro, classi), dopo = conflittiDi(r2);
      if (!dopo.has(k) && [...dopo.keys()].every(x => attuali.has(x))) { r = r2; attuali = dopo; return true; }
      disfa(); return false;
    };

    // ---- criteri del piano di esoneri: chi si può esonerare da cosa ----
    const regola = p => (pref.perTipo || {})[semplice(p.tipo || 'Altro')] || {};
    const protetti = new Set(pref.protetti || []);
    const attesi = new Map(), carico = new Map();
    r.docenti.forEach(d => d.dettaglio.forEach(x => {
      if (x.conta !== 'prime' && x.conta !== 'seconde') return;
      const k = x.data + '|' + x.impegno; attesi.set(k, (attesi.get(k) || 0) + 1); if (x.esonero) carico.set(k, (carico.get(k) || 0) + 1);
    }));
    const tetto = (k, p) => {
      const n = attesi.get(k) || 0; if (!pref.usaPresenze) return n;
      const pc = regola(p).pct === '' || regola(p).pct == null ? Number(pref.pct) || 0 : Number(regola(p).pct);
      return Math.max(0, Math.min(Math.round(pc / 100 * n), n - (Number(pref.minimo) || 0)));
    };
    const impDi = k => r.impegni.find(p => p.chiave === k);
    const perche = (k, codice) => {
      const p = impDi(k); if (!p) return 'impegno non trovato';
      if (p.conta !== 'prime' && p.conta !== 'seconde') return 'non si può esonerare (' + (p.conta === 'no' ? 'scrutini o esami' : 'non conta nelle 40+40') + ')';
      if (regola(p).mai) return `il tipo «${p.tipo}» è segnato «mai» nella scaletta`;
      if (protetti.has(k)) return 'incontro protetto 🔒';
      if ((carico.get(k) || 0) + 1 > tetto(k, p)) return 'ha già il massimo di esonerati';
      if (vietate.has('esonero#' + codice + '#' + k)) return 'esonero scartato da te';
      return '';
    };

    // ---- le righe del nostro piano che fanno l'impegno di quel docente ----
    const righeDi = (codice, k) => {
      const mie = classi.get(codice) || new Set();
      return lavoro.impegni.filter(x => x.data + '|' + x.impegno === k && (!classiDi(x.classi).length || classiDi(x.classi).some(c => mie.has(c))));
    };
    // un nostro impegno (riga) spostato in [ini, fin] di quel giorno si accavalla con un altro nostro delle stesse classi (o di tutti)?
    const accavalla = (riga, dd, ini, fin) => lavoro.impegni.some(y => y !== riga && y.data === dd && y.ini != null && y.fin != null && y.ini < fin && ini < y.fin &&
      y.data + '|' + y.impegno !== riga.data + '|' + riga.impegno &&
      (!classiDi(y.classi).length || !classiDi(riga.classi).length || classiDi(y.classi).some(c => classiDi(riga.classi).includes(c))));

    const ordinati = () => [...attuali.entries()].sort((a, b) => (a[1].c.data + a[0]).localeCompare(b[1].c.data + b[0]));
    let giro = 0;
    while (giro++ < 200) {
      const prossimo = ordinati().find(([k]) => !provati.has(k));
      if (!prossimo) break;
      const [k, { d, c }] = prossimo;
      provati.add(k);
      const kImp = c.data + '|' + c.nostro, base = { codice: d.codice, conflitto: c, chiave: kImp };
      if (oggi && c.data <= oggi) { passate.push(base); continue; }
      const righe = righeDi(d.codice, kImp), mie = classi.get(d.codice) || new Set();
      let fatto = false;

      // 1) RIORDINO della sequenza di classi
      for (const riga of righe) {
        if (fatto) break;
        const gruppi = String(riga.classi || '').split('/').map(g => g.trim());
        if (gruppi.length < 2 || riga.ini == null || riga.fin == null) continue;
        const suoi = gruppi.map((g, i) => classiDi(g).some(x => mie.has(x)) ? i : -1).filter(i => i >= 0);
        for (const i of suoi) {
          if (fatto) break;
          for (let j = 0; j < gruppi.length && !fatto; j++) {
            if (j === i || suoi.includes(j)) continue;
            const id = 'riordino#' + d.codice + '#' + kImp + '#' + j;
            if (vietate.has(id)) continue;
            const prima = riga.classi, nuovi = gruppi.slice(); [nuovi[i], nuovi[j]] = [nuovi[j], nuovi[i]];
            if (prova(k, () => { riga.classi = nuovi.join(' / '); }, () => { riga.classi = prima; })) {
              proposte.push(Object.assign({ id, tipo: 'riordino', riga: riga.riga, prima, dopo: riga.classi,
                testo: `Riordino: ${gruppi[i]} al posto di ${gruppi[j]} nella sequenza (${prima} → ${riga.classi})` }, base));
              fatto = true;
            }
          }
        }
      }
      // 2) ESONERO (anche scambiato con un altro esonero già approvato)
      if (!fatto) {
        const no = perche(kImp, d.codice);
        const p = impDi(kImp), x = d.dettaglio.find(y => y.data + '|' + y.impegno === kImp);
        if (!no && p && x) {
          const id = 'esonero#' + d.codice + '#' + kImp;
          const es = lavoro.esoneri.get(d.codice) || new Map();
          // serve uno scambio? solo se senza scenderebbe sotto le ore dovute
          let scambio = null;
          if (d[p.conta] - x.ore < d.dovute) {
            const conflittiSuoi = new Set((d.conflitti || []).map(y => y.data + '|' + y.nostro));
            const altri = d.dettaglio.filter(y => y.esonero && y.conta === p.conta && (!oggi || y.data > oggi) && !conflittiSuoi.has(y.data + '|' + y.impegno) &&
              !vietate.has('scambio#' + d.codice + '#' + kImp + '#' + y.data + '|' + y.impegno));
            altri.sort((a, b) => Math.abs(a.ore - x.ore) - Math.abs(b.ore - x.ore));
            if (altri.length) scambio = { chiave: altri[0].data + '|' + altri[0].impegno, ore: altri[0].ore, data: altri[0].data, impegno: altri[0].impegno };
          }
          const tolto = scambio ? es.get(scambio.chiave) : null;
          const ok = prova(k, () => {
            if (!lavoro.esoneri.has(d.codice)) lavoro.esoneri.set(d.codice, es);
            es.set(kImp, { approvato: true, riga: 0, nuovo: true });
            if (scambio) es.delete(scambio.chiave);
          }, () => { es.delete(kImp); if (scambio) es.set(scambio.chiave, tolto); });
          if (ok) {
            carico.set(kImp, (carico.get(kImp) || 0) + 1);
            if (scambio) carico.set(scambio.chiave, (carico.get(scambio.chiave) || 1) - 1);
            const dopo = r.docenti.find(y => y.codice === d.codice) || d;
            const manca = arrot(dopo.dovute - dopo[p.conta]);
            proposte.push(Object.assign({ id: scambio ? 'scambio#' + d.codice + '#' + kImp + '#' + scambio.chiave : id, tipo: 'esonero', ore: x.ore, conta: p.conta, scambio,
              testo: scambio ? `Esonero da «${c.nostro}» (${x.ore} h) al posto dell'esonero da «${scambio.impegno}» del ${scambio.data.split('-').reverse().join('/')} (${scambio.ore} h), che torna a fare`
                : `Esonero da «${c.nostro}» (${x.ore} h)` + (manca > 0.009 ? ` – poi gli mancano ${manca} h nelle ${p.conta === 'prime' ? 'prime' : 'seconde'} 40` : '') }, base));
            fatto = true;
          }
        }
        if (!fatto) base.motivoEsonero = no || 'l\'esonero non basta';
      }
      // 3) ORARIO nello stesso giorno e 4) un altro GIORNO
      const spostabili = righe.filter(x => x.ini != null && x.fin != null);
      if (!fatto && spostabili.length) {
        const passi = []; for (let m = 15; m <= 180; m += 15) passi.push(m, -m);
        for (const delta of passi) {
          if (fatto) break;
          const id = 'orario#' + kImp + '#' + delta;
          if (vietate.has(id)) continue;
          // un impegno del pomeriggio non va prima delle 14:00 (ci sono le lezioni); nessuno finisce dopo le 20:00
          if (spostabili.some(x => x.ini + delta < (x.ini >= 13 * 60 ? 14 * 60 : 8 * 60) || x.fin + delta > 20 * 60 || accavalla(x, x.data, x.ini + delta, x.fin + delta))) continue;
          const prima = spostabili.map(x => [x.ini, x.fin]);
          if (prova(k, () => spostabili.forEach(x => { x.ini += delta; x.fin += delta; }), () => spostabili.forEach((x, i) => { [x.ini, x.fin] = prima[i]; }))) {
            proposte.push(Object.assign({ id, tipo: 'orario', righe: spostabili.map(x => x.riga),
              testo: `Spostare «${c.nostro}» del ${c.data.split('-').reverse().join('/')}: ${spostabili.map((x, i) => hhmm(prima[i][0]) + '–' + hhmm(prima[i][1]) + ' → ' + hhmm(x.ini) + '–' + hhmm(x.fin)).join('; ')}` }, base));
            fatto = true;
          }
        }
        if (!fatto) {
          const g0 = new Date(c.data + 'T12:00:00'), giorni = [];
          for (let n = 1; n <= 14; n++) [n, -n].forEach(s => { if (s >= -7) { const g = new Date(g0); g.setDate(g.getDate() + s); if (g.getDay() > 0 && g.getDay() < 6) giorni.push(giornoIso(g)); } });
          for (const dd of giorni) {
            if (fatto) break;
            if (oggi && dd <= oggi) continue;
            const id = 'giorno#' + kImp + '#' + dd;
            if (vietate.has(id)) continue;
            // lo stesso impegno quel giorno non deve esserci già
            if (lavoro.impegni.some(y => y.data === dd && y.impegno === c.nostro)) continue;
            if (spostabili.some(x => accavalla(x, dd, x.ini, x.fin))) continue;
            const prima = spostabili.map(x => x.data), kNuova = dd + '|' + c.nostro;
            // gli esoneri di quell'impegno seguono la nuova data
            const sposta = (da, a) => lavoro.esoneri.forEach(m => { if (m.has(da)) { m.set(a, m.get(da)); m.delete(da); } });
            if (prova(k, () => { spostabili.forEach(x => { x.data = dd; }); sposta(kImp, kNuova); },
              () => { spostabili.forEach((x, i) => { x.data = prima[i]; }); sposta(kNuova, kImp); })) {
              proposte.push(Object.assign({ id, tipo: 'giorno', righe: spostabili.map(x => x.riga), nuovaData: dd,
                testo: `Spostare «${c.nostro}» dal ${c.data.split('-').reverse().join('/')} al ${dd.split('-').reverse().join('/')} (stesso orario; controlla che sia un giorno di scuola)` }, base));
              fatto = true;
            }
          }
        }
      }
      if (!fatto && attuali.has(k)) nonRisolte.push(Object.assign(base, { motivo: [base.motivoEsonero ? 'esonero: ' + base.motivoEsonero : '',
        spostabili.length ? 'nessun altro orario o giorno libero per tutti' + (vietate.size ? ' (o scartato da te)' : '') : 'impegno senza orario: non si può spostare'].filter(Boolean).join('; ') }));
    }
    return { proposte, nonRisolte, passate, daVerificare, impegni: lavoro.impegni, esoneri: lavoro.esoneri, risultato: r };
  }

  return { analizza, hhmm };
})();
