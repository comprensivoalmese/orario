/*
  xlsx.js – crea un file Excel VERO (.xlsx) senza librerie: lo usa la scheda «40+40» (scheda-40ore.js) per gli estratti
  destinati alle scuole di completamento. Si apre con Excel, LibreOffice, Fogli Google e sul telefono.

  Un .xlsx, come un .docx, è un archivio ZIP di file XML: lo ZIP lo scrive Docx.zip() (../sostituzioni/js/docx.js).

  Uso:  const blob = Xlsx.crea([
          { nome: 'Riepilogo',                       // nome del foglio (al massimo 31 caratteri, senza : \ / ? * [ ])
            larghezze: [28, 12, 40],                 // larghezza delle colonne (in caratteri)
            blocca: 1,                               // righe in alto sempre visibili (facoltativo)
            righe: [
              [{ v: 'Titolo', stile: 'titolo' }],
              [{ v: 'Docente', stile: 'intest' }, { v: 'Ore', stile: 'intest' }],
              ['Rossi Mario', 2.5],                  // una cella può essere anche solo il valore
              [{ v: 'Riga evidenziata', stile: 'evid' }, { v: 1, stile: 'evid' }]
            ] }
        ]);
  Stili: 'titolo' (grande, grassetto), 'intest' (grassetto su grigio), 'evid' (sfondo giallo), 'evidGrassetto',
  'grassetto'. I numeri si scrivono con una o due cifre decimali (0,5 · 1,75).
  Altro (facoltativo):
  - una cella con formula: { f: 'SUM(D5:D9)', stile: 'grassetto' } (senza «=», con i nomi inglesi delle funzioni: Excel la
    calcola all'apertura);
  - nascoste: [7] = colonne nascoste (contando da 0), per esempio una colonna tecnica che serve a rileggere il file;
  - elenchi: [{ zona: 'G6:G40', valori: ['SI', 'NO'] }] = menu a tendina nelle celle della zona.
  Lo usano la scheda «40+40» di Orario Facile (estratti per le scuole di completamento) e l'app («Le mie 40+40»).
*/
const Xlsx = (() => {
  const xml = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');   // caratteri che l'XML non accetta
  // A, B, … Z, AA, AB…
  const lettera = n => { let s = ''; n++; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };

  // Formati delle celle (l'ordine conta: è il numero «s» di ogni cella). [carattere, sfondo, numero?, a capo?]
  const STILI = {
    normale: 0, grassetto: 1, intest: 2, evid: 3, evidGrassetto: 4, titolo: 5,
    numero: 6, numeroEvid: 7, numeroGrassetto: 8, numeroIntest: 9
  };
  const XF = [
    [0, 0, false, true], [1, 0, false, true], [1, 2, false, true], [0, 3, false, true], [1, 3, false, true], [2, 0, false, false],
    [0, 0, true, false], [0, 3, true, false], [1, 0, true, false], [1, 2, true, true]
  ];
  const STILI_XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<numFmts count="1"><numFmt numFmtId="164" formatCode="0.0#"/></numFmts>' +
    '<fonts count="3"><font><sz val="10"/><name val="Arial"/></font><font><b/><sz val="10"/><name val="Arial"/></font><font><b/><sz val="13"/><name val="Arial"/></font></fonts>' +
    '<fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>' +
    '<fill><patternFill patternType="solid"><fgColor rgb="FFD9E1F2"/><bgColor indexed="64"/></patternFill></fill>' +
    '<fill><patternFill patternType="solid"><fgColor rgb="FFFFF2A8"/><bgColor indexed="64"/></patternFill></fill></fills>' +
    '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    `<cellXfs count="${XF.length}">` + XF.map(([f, s, num, acapo]) =>
      `<xf numFmtId="${num ? 164 : 0}" fontId="${f}" fillId="${s}" borderId="0" xfId="0"${num ? ' applyNumberFormat="1"' : ''}${f ? ' applyFont="1"' : ''}${s ? ' applyFill="1"' : ''}` +
      (acapo ? ' applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>' : '><alignment vertical="top"/></xf>')).join('') + '</cellXfs>' +
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';

  // Lo stile di una cella numerica: la versione «numero» dello stile scelto
  function stileDi(stile, numero) {
    if (!numero) return STILI[stile] || 0;
    return { evid: STILI.numeroEvid, evidGrassetto: STILI.numeroEvid, grassetto: STILI.numeroGrassetto, intest: STILI.numeroIntest }[stile] || STILI.numero;
  }

  function foglio(f) {
    const righe = (f.righe || []).map((riga, r) => `<row r="${r + 1}">` + (riga || []).map((c, k) => {
      const cella = c !== null && typeof c === 'object' ? c : { v: c };
      if (cella.f) return `<c r="${lettera(k)}${r + 1}" s="${stileDi(cella.stile, true)}"><f>${xml(cella.f)}</f></c>`;
      if (cella.v === '' || cella.v == null) return cella.stile ? `<c r="${lettera(k)}${r + 1}" s="${stileDi(cella.stile, false)}"/>` : '';
      const num = typeof cella.v === 'number' && isFinite(cella.v);
      const s = stileDi(cella.stile, num);
      return num ? `<c r="${lettera(k)}${r + 1}" s="${s}"><v>${cella.v}</v></c>`
        : `<c r="${lettera(k)}${r + 1}" s="${s}" t="inlineStr"><is><t xml:space="preserve">${xml(cella.v)}</t></is></c>`;
    }).join('') + '</row>').join('');
    const blocca = f.blocca ? `<sheetViews><sheetView workbookViewId="0"><pane ySplit="${f.blocca}" topLeftCell="A${f.blocca + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>`
      : '<sheetViews><sheetView workbookViewId="0"/></sheetViews>';
    const nascoste = new Set(f.nascoste || []);
    const nCol = Math.max((f.larghezze || []).length, ...[...nascoste].map(n => n + 1), 0);
    const colonne = nCol ? '<cols>' + Array.from({ length: nCol }, (x, i) =>
      `<col min="${i + 1}" max="${i + 1}" width="${(f.larghezze || [])[i] || 10}" customWidth="1"${nascoste.has(i) ? ' hidden="1"' : ''}/>`).join('') + '</cols>' : '';
    const elenchi = (f.elenchi || []).length ? `<dataValidations count="${f.elenchi.length}">` + f.elenchi.map(e =>
      `<dataValidation type="list" allowBlank="1" showDropDown="0" showErrorMessage="1" sqref="${e.zona}"><formula1>"${xml(e.valori.join(','))}"</formula1></dataValidation>`).join('') + '</dataValidations>' : '';
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      blocca + colonne + `<sheetData>${righe}</sheetData>` + elenchi +
      '<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/>' +
      (f.orizzontale ? '<pageSetup orientation="landscape" paperSize="9"/>' : '<pageSetup paperSize="9"/>') + '</worksheet>';
  }

  // Nome del foglio valido e senza doppioni
  function nomiFogli(fogli) {
    const usati = new Set();
    return fogli.map(f => {
      let n = String(f.nome || 'Foglio').replace(/[:\\\/\?\*\[\]]/g, '').replace(/^'+|'+$/g, '').trim().slice(0, 31) || 'Foglio';
      let base = n, i = 2;
      while (usati.has(n.toLowerCase())) { n = base.slice(0, 28) + ' ' + i++; }
      usati.add(n.toLowerCase());
      return n;
    });
  }

  function crea(fogli) {
    const nomi = nomiFogli(fogli);
    const file = [
      { nome: '[Content_Types].xml', testo: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
        fogli.map((f, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('') + '</Types>' },
      { nome: '_rels/.rels', testo: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' },
      { nome: 'xl/workbook.xml', testo: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' +
        nomi.map((n, i) => `<sheet name="${xml(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('') + '</sheets><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>' },
      { nome: 'xl/_rels/workbook.xml.rels', testo: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        fogli.map((f, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('') +
        `<Relationship Id="rId${fogli.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
      { nome: 'xl/styles.xml', testo: STILI_XML }
    ].concat(fogli.map((f, i) => ({ nome: `xl/worksheets/sheet${i + 1}.xml`, testo: foglio(f) })));
    return Docx.zip(file, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  }

  return { crea };
})();
