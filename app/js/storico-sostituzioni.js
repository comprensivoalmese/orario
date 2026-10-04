/*
  storico-sostituzioni.js – il REGISTRO DI TUTTO L'ANNO delle sostituzioni fatte da ogni docente, per la voce
  «Le mie sostituzioni» dell'app (sezione «Il mio servizio» del menu): ogni docente vede solo le proprie.

  Perché un file a parte: il file delle sostituzioni pubblicate (CONFIG.fileSostituzioniPubblicate) tiene solo le
  ultime due settimane e il futuro, e lo leggono tutti (anche gli studenti). Lo storico invece:
  - si chiama «sostituzioni-docenti.json» e sta nella cartella dei SOLI DOCENTI (CONFIG.cartellaImpegni);
  - contiene solo: data, ora, NOME della classe, CODICE del docente che ha sostituito (DOC01…) e se l'ora era
    «senza ore in più» (docente spostato da una compresenza o liberato da un'uscita didattica). NIENTE nome del docente
    assente, niente motivi, niente nomi veri;
  - si aggiorna da solo a ogni pubblicazione delle sostituzioni (PubblicaSostituzioni.unisciEPubblica chiama aggiorna()):
    le voci nuove si aggiungono, le annullate si tolgono; per le date delle ultime due settimane vale il file pubblicato
    (se una sostituzione lì non c'è più, è stata tolta e sparisce anche dallo storico).
  I codici e i nomi delle classi si ricavano dall'orario ufficiale pubblicato (Dati.caricaPubblicato), perché nel registro
  ci sono gli ID interni dell'orario.
*/
const StoricoSostituzioni = (() => {
  const API = 'https://www.googleapis.com/drive/v3/files';
  const NOME = 'sostituzioni-docenti.json';
  const cartella = () => (typeof CONFIG !== 'undefined' && (CONFIG.cartellaImpegni || CONFIG.cartellaPubblicazione)) || '';
  const tra = s => "'" + String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";

  let idTrovato = '';
  async function trova(t) {
    if (idTrovato) return idTrovato;
    const q = `name = ${tra(NOME)} and ${tra(cartella())} in parents and trashed = false`;
    const r = await fetch(API + '?fields=files(id)&supportsAllDrives=true&includeItemsFromAllDrives=true&q=' + encodeURIComponent(q),
      { headers: { Authorization: 'Bearer ' + t }, cache: 'no-cache' });
    if (!r.ok) throw new Error('errore ' + r.status);
    const j = await r.json();
    idTrovato = j.files && j.files[0] ? j.files[0].id : '';
    return idTrovato;
  }
  async function leggiCon(t) {
    const id = await trova(t);
    if (!id) return { voci: {} };
    const r = await fetch(API + '/' + encodeURIComponent(id) + '?alt=media&supportsAllDrives=true', { headers: { Authorization: 'Bearer ' + t }, cache: 'no-cache' });
    if (!r.ok) throw new Error('errore ' + r.status);
    const j = await r.json();
    return j && j.voci ? j : { voci: {} };
  }

  /*
    Aggiorna lo storico con il file appena pubblicato (unito = { registro, annullate }); daQuando = la data da cui
    il file pubblicato è completo (le ultime due settimane). Non lancia mai errori: lo storico non deve bloccare la
    pubblicazione delle sostituzioni.
  */
  async function aggiorna(unito, daQuando, email) {
    try {
      if (!cartella() || typeof PubblicaDrive === 'undefined' || typeof Dati === 'undefined') return false;
      const t = await NomiDocenti.gettone([NomiDocenti.PERMESSO_DRIVE], email);
      const D = await Dati.caricaPubblicato();
      const codice = new Map(D.docente.map(e => [e.id, String(e.codice !== undefined ? e.codice : e.nome).trim().toUpperCase()]));
      const classe = new Map(D.classe.map(c => [c.id, c.nome]));
      const storico = await leggiCon(t);
      const voci = storico.voci;
      const chiave = s => s.id || (s.data + '|' + s.ora + '|' + s.classe);
      const ora = new Set();
      (unito.registro || []).forEach(s => {
        const k = chiave(s), cod = codice.get(s.sostituto) || s.codiceSostituto || '';
        if (!/^DOC\d+/.test(cod)) return;
        ora.add(k);
        voci[k] = [s.data, s.ora, classe.get(s.classe) || s.nomeClasse || s.classe, cod, s.spostato || s.reindirizzato ? 1 : 0];
      });
      // tolte: annullate (anche da altri dispositivi) e, nelle ultime due settimane, quelle sparite dal file pubblicato
      const annullate = new Set((unito.annullate || []).map(a => a.id).filter(Boolean));
      Object.keys(voci).forEach(k => {
        if (annullate.has(k) || (voci[k][0] >= daQuando && !ora.has(k))) delete voci[k];
      });
      await PubblicaDrive.scriviFile(NOME, cartella(), JSON.stringify({ tipo: 'storico-sostituzioni', aggiornato: new Date().toISOString(), voci }), email);
      return true;
    } catch (e) {
      return false;
    }
  }

  /*
    IMPORTAZIONE UNA TANTUM (Orario Facile, scheda Sostituzioni, tasto «🗂 Importa nel registro dei docenti»): porta nello
    storico le sostituzioni già scritte nel foglio «Sostituzioni» del file delle sostituzioni (quelle di settembre, prima
    che ci fosse lo storico). righe = RegistroDrive.tutte(); nomi = Map codice → { cognome, nome } (NomiDocenti.carica);
    flagLocale(id) = { senzaOre } dal registro di questo dispositivo, se lo conosce (spostato, uscita, vigilanza di sciopero).
    Le voci già presenti nello storico non si toccano. Restituisce { aggiunte, gia, ignote: [nomi non riconosciuti] }.
  */
  const semplice = s => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z ]/g, ' ').split(/\s+/).filter(Boolean).sort().join(' ');
  function dataIso(v) {
    const m = String(v || '').match(/(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})/);
    if (!m) return '';
    return (m[3].length === 2 ? '20' + m[3] : m[3]) + '-' + String(m[2]).padStart(2, '0') + '-' + String(m[1]).padStart(2, '0');
  }
  async function importa(righe, nomi, flagLocale, email) {
    const t = await NomiDocenti.gettone([NomiDocenti.PERMESSO_DRIVE], email);
    const storico = await leggiCon(t);
    const voci = storico.voci;
    const perNome = new Map();
    (nomi || new Map()).forEach((n, codice) => perNome.set(semplice((n.cognome || '') + ' ' + (n.nome || '')), codice));
    const esito = { aggiunte: 0, gia: 0, ignote: [] };
    righe.forEach(r => {
      const id = String(r['ID'] || '').trim();
      const data = dataIso(r['Data']), ora = parseInt(String(r['Ora'] || ''), 10), classe = String(r['Classe'] || '').trim();
      const chi = String(r['Docente sostituto'] || '').trim();
      if (!data || !ora || !classe || !chi) return;
      const k = id || (data + '|' + ora + '|' + classe);
      if (voci[k]) { esito.gia++; return; }
      const codice = /^DOC\d+$/i.test(chi) ? chi.toUpperCase() : perNome.get(semplice(chi));
      if (!codice) { if (!esito.ignote.includes(chi)) esito.ignote.push(chi); return; }
      const f = (id && flagLocale && flagLocale(id)) || {};
      voci[k] = [data, ora, classe, codice, f.senzaOre ? 1 : 0];
      esito.aggiunte++;
    });
    if (esito.aggiunte) await PubblicaDrive.scriviFile(NOME, cartella(), JSON.stringify({ tipo: 'storico-sostituzioni', aggiornato: new Date().toISOString(), voci }), email);
    return esito;
  }

  // Nell'app: le sostituzioni di un docente (codice), dalla più recente. senzaChiedere: vedi QuarantaOre.leggiPubblicato
  async function mie(codice, email, senzaChiedere) {
    let t = NomiDocenti.gettoneDisponibile([NomiDocenti.PERMESSO_DRIVE]);
    if (!t && senzaChiedere) return null;
    if (!t) t = await NomiDocenti.gettone([NomiDocenti.PERMESSO_DRIVE], email);
    const s = await leggiCon(t);
    const k = String(codice || '').toUpperCase();
    return {
      aggiornato: s.aggiornato || '',
      elenco: Object.values(s.voci).filter(v => v[3] === k).map(([data, ora, classe, , senzaOre]) => ({ data, ora, classe, senzaOre: !!senzaOre }))
        .sort((a, b) => (b.data + String(b.ora).padStart(2, '0')).localeCompare(a.data + String(a.ora).padStart(2, '0')))
    };
  }

  // HTML della finestra «Le mie sostituzioni»: totali (dell'anno e del mese) e l'elenco, mese per mese
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function html(m) {
    if (!m.elenco.length) return '<p>Non risultano sostituzioni fatte da te da quando c\'è questo registro.</p>' +
      '<p class="q40-nota">Il registro si aggiorna da solo ogni volta che vengono pubblicate le sostituzioni.</p>';
    const conOre = m.elenco.filter(x => !x.senzaOre).length;
    const mese = new Date().toISOString().slice(0, 7);
    const nelMese = m.elenco.filter(x => x.data.startsWith(mese)).length;
    const gruppi = new Map();
    m.elenco.forEach(x => { const k = x.data.slice(0, 7); if (!gruppi.has(k)) gruppi.set(k, []); gruppi.get(k).push(x); });
    const nomeMese = k => { const [a, n] = k.split('-').map(Number); const s = new Date(a, n - 1, 1).toLocaleDateString('it-IT', { month: 'long', year: 'numeric' }); return s.charAt(0).toUpperCase() + s.slice(1); };
    const giorno = iso => { const [a, n, g] = iso.split('-').map(Number); return new Date(a, n - 1, g).toLocaleDateString('it-IT', { weekday: 'short', day: '2-digit', month: '2-digit' }); };
    return `<p class="sost-totali"><strong>${m.elenco.length}</strong> ${m.elenco.length === 1 ? 'sostituzione' : 'sostituzioni'} in tutto:
        <strong>${conOre}</strong> come ore in più${m.elenco.length - conOre ? `, <strong>${m.elenco.length - conOre}</strong> senza ore in più (spostato da una compresenza o liberato da un'uscita)` : ''}.
        Questo mese: <strong>${nelMese}</strong>.</p>` +
      [...gruppi.entries()].map(([k, v]) => `<table class="q40-dettaglio"><caption>${esc(nomeMese(k))} (${v.length})</caption>
        <thead><tr><th scope="col">Giorno</th><th scope="col">Ora</th><th scope="col">Classe</th><th scope="col">Ore in più</th></tr></thead><tbody>` +
        v.map(x => `<tr><td>${esc(giorno(x.data))}</td><td>${esc(x.ora)}ª</td><td>${esc(x.classe)}</td><td>${x.senzaOre ? 'no' : '+1'}</td></tr>`).join('') + '</tbody></table>').join('') +
      `<p class="q40-nota">Il registro si aggiorna a ogni pubblicazione delle sostituzioni${m.aggiornato ? ' (ultima: ' + esc(new Date(m.aggiornato).toLocaleDateString('it-IT')) + ')' : ''}.
        Il conteggio ufficiale delle ore resta quello della segreteria: per differenze rivolgiti a chi gestisce le sostituzioni.</p>`;
  }

  return { aggiorna, importa, mie, html, NOME };
})();
