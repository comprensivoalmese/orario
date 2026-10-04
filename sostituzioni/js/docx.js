/*
  docx.js – crea un documento Word VERO (.docx) senza librerie, così si apre anche sul telefono
  (Word, Google Documenti, Pages…). Lo usa la «comunicazione alle famiglie» di js/scioperi.js.

  Un .docx è un archivio ZIP con dentro alcuni file XML. Qui li scriviamo «senza compressione» (metodo store):
  basta calcolare per ogni file il suo codice di controllo CRC-32.

  Uso:  const blob = Docx.crea([
          { tipo: 'p', testo: 'Alle famiglie', grassetto: true },
          { tipo: 'p', testo: 'Testo…', allinea: 'destra' },
          { tipo: 'tabella', righe: [['Classe', 'Entrata'], ['1A', 'alle 10:05']] }   // la prima riga è l'intestazione
        ]);
*/
const Docx = (() => {
  // ---------- CRC-32 (il codice di controllo che ogni file dello ZIP deve avere) ----------
  const TABELLA_CRC = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
    return t;
  })();
  function crc32(dati) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < dati.length; i++) c = TABELLA_CRC[(c ^ dati[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  // ---------- ZIP senza compressione ----------
  // tipo = tipo del file (Word se manca); lo usa anche app/js/xlsx.js per gli Excel
  function zip(file, tipo) {   // file = [{ nome, testo }]
    const cod = new TextEncoder();
    const parti = [], centrale = [];
    let posizione = 0;
    const n16 = v => [v & 0xFF, (v >>> 8) & 0xFF];
    const n32 = v => [v & 0xFF, (v >>> 8) & 0xFF, (v >>> 16) & 0xFF, (v >>> 24) & 0xFF];
    file.forEach(f => {
      const nome = cod.encode(f.nome), dati = cod.encode(f.testo), crc = crc32(dati);
      // intestazione locale di ogni file
      const locale = new Uint8Array([0x50, 0x4B, 0x03, 0x04, ...n16(20), ...n16(0x0800), ...n16(0), ...n16(0), ...n16(0x21),
        ...n32(crc), ...n32(dati.length), ...n32(dati.length), ...n16(nome.length), ...n16(0)]);
      parti.push(locale, nome, dati);
      // voce dell'indice finale (directory centrale)
      centrale.push(new Uint8Array([0x50, 0x4B, 0x01, 0x02, ...n16(20), ...n16(20), ...n16(0x0800), ...n16(0), ...n16(0), ...n16(0x21),
        ...n32(crc), ...n32(dati.length), ...n32(dati.length), ...n16(nome.length), ...n16(0), ...n16(0), ...n16(0), ...n16(0),
        ...n32(0), ...n32(posizione)]), nome);
      posizione += locale.length + nome.length + dati.length;
    });
    const lungCentrale = centrale.reduce((n, p) => n + p.length, 0);
    const fine = new Uint8Array([0x50, 0x4B, 0x05, 0x06, ...n16(0), ...n16(0), ...n16(file.length), ...n16(file.length),
      ...n32(lungCentrale), ...n32(posizione), ...n16(0)]);
    return new Blob([...parti, ...centrale, fine], { type: tipo || 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
  }

  // ---------- Il contenuto in WordprocessingML ----------
  const xml = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const ALLINEA = { destra: 'right', centro: 'center', sinistra: 'left' };
  function testo(t, grassetto) {
    // le righe andate a capo diventano <w:br/>
    return String(t == null ? '' : t).split('\n').map((riga, i) =>
      `${i ? '<w:r><w:br/></w:r>' : ''}<w:r>${grassetto ? '<w:rPr><w:b/></w:rPr>' : ''}<w:t xml:space="preserve">${xml(riga)}</w:t></w:r>`).join('');
  }
  function paragrafo(b) {
    const pPr = (b.allinea ? `<w:jc w:val="${ALLINEA[b.allinea] || 'left'}"/>` : '') + '<w:spacing w:after="120"/>';
    return `<w:p><w:pPr>${pPr}</w:pPr>${testo(b.testo, b.grassetto)}</w:p>`;
  }
  function tabella(b) {
    const bordo = v => `<w:${v} w:val="single" w:sz="4" w:space="0" w:color="444444"/>`;
    const cella = (t, testa) => `<w:tc><w:tcPr><w:tcW w:w="0" w:type="auto"/></w:tcPr><w:p>${testo(t, testa)}</w:p></w:tc>`;
    return `<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/><w:tblBorders>${['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(bordo).join('')}</w:tblBorders></w:tblPr>` +
      b.righe.map((r, i) => `<w:tr>${r.map(t => cella(t, i === 0)).join('')}</w:tr>`).join('') + '</w:tbl><w:p/>';
  }

  function crea(blocchi) {
    const corpo = blocchi.map(b => b.tipo === 'tabella' ? tabella(b) : paragrafo(b)).join('');
    const documento = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${corpo}
<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>`;
    return zip([
      { nome: '[Content_Types].xml', testo: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>' },
      { nome: '_rels/.rels', testo: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>' },
      { nome: 'word/document.xml', testo: documento }
    ]);
  }

  return { crea, zip };
})();
