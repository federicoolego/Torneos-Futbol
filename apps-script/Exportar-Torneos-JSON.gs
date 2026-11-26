/**
 * ⚽ Fútbol · Exportar torneos a JSON
 * ---------------------------------------------------------------------------
 * Lee las pestañas LOLO y FEDE de este Google Sheet y arma el JSON que consume
 * la app (data/torneos.json).
 *
 * CÓMO INSTALARLO
 *  1. En el Sheet: Extensiones → Apps Script.
 *  2. Borrá lo que haya, pegá este archivo completo y guardá (💾).
 *  3. Recargá el Sheet: aparece el menú "⚽ Fútbol".
 *  4. La primera vez Google pide permisos (leer el Sheet y, si usás la opción
 *     de guardar, escribir en Drive). Es normal: es tu propio script.
 *
 * CÓMO SE USA
 *  · ⚽ Fútbol → Ver / copiar / descargar JSON   → abre un cuadro con el JSON.
 *  · ⚽ Fútbol → Guardar torneos.json en Drive    → crea o pisa "torneos.json"
 *                                                  en la misma carpeta del Sheet.
 *
 * IMPORTANTE: tiene que ser un Google Sheet nativo. Si el archivo en Drive sigue
 * siendo un .xlsx, abrilo con Google Sheets y usá Archivo → Guardar como Google Sheets.
 */

// ============================== CONFIGURACIÓN ==============================
// Una entrada por pestaña. "clave" y "nombre" son los que usa la app.
// Para sumar a otra persona: agregá una pestaña con las mismas columnas y una línea acá.
var JUGADORES = [
  { clave: 'lolo', nombre: 'Lolo', hoja: 'LOLO' },
  { clave: 'fede', nombre: 'Fede', hoja: 'FEDE' }
];

var NOMBRE_ARCHIVO = 'torneos.json';
// ===========================================================================


function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('⚽ Fútbol')
    .addItem('Ver / copiar / descargar JSON', 'mostrarJson')
    .addItem('Guardar torneos.json en Drive', 'guardarJsonEnDrive')
    .addToUi();
}


/** Abre un cuadro con el JSON listo para copiar o descargar. */
function mostrarJson() {
  var res = generarJson_();
  var html = HtmlService.createHtmlOutput(dialogoHtml_(res.json, res.avisos))
    .setWidth(760)
    .setHeight(560);
  SpreadsheetApp.getUi().showModalDialog(html, '⚽ torneos.json');
}


/** Guarda (o pisa) torneos.json en la carpeta donde está este Sheet. */
function guardarJsonEnDrive() {
  var ui = SpreadsheetApp.getUi();
  var res = generarJson_();

  var archivoSheet = DriveApp.getFileById(SpreadsheetApp.getActive().getId());
  var carpetas = archivoSheet.getParents();
  var carpeta = carpetas.hasNext() ? carpetas.next() : DriveApp.getRootFolder();

  var existentes = carpeta.getFilesByName(NOMBRE_ARCHIVO);
  var url;
  if (existentes.hasNext()) {
    var f = existentes.next();
    f.setContent(res.json);
    url = f.getUrl();
  } else {
    url = carpeta.createFile(NOMBRE_ARCHIVO, res.json, MimeType.PLAIN_TEXT).getUrl();
  }

  var msg = '✅ Guardado: ' + NOMBRE_ARCHIVO + '\n' + url;
  if (res.avisos.length) msg += '\n\n⚠️ Avisos:\n- ' + res.avisos.join('\n- ');
  ui.alert('⚽ Fútbol', msg, ui.ButtonSet.OK);
}


/** También sirve para probarlo desde el editor (Ejecutar → probarEnLog). */
function probarEnLog() {
  var res = generarJson_();
  Logger.log(res.json);
  if (res.avisos.length) Logger.log('AVISOS:\n' + res.avisos.join('\n'));
}


// ============================== NÚCLEO ==============================

/** Devuelve { json: String, avisos: String[] } */
function generarJson_() {
  var ss = SpreadsheetApp.getActive();
  var avisos = [];
  var jugadores = [];

  JUGADORES.forEach(function (j) {
    var sheet = ss.getSheetByName(j.hoja);
    if (!sheet) {
      avisos.push('No encontré la pestaña "' + j.hoja + '". Se exporta vacía.');
      jugadores.push({ clave: j.clave, nombre: j.nombre, torneos: [] });
      return;
    }
    var valores = sheet.getDataRange().getValues();
    var torneos = filasATorneos_(valores, j.hoja, avisos);
    jugadores.push({ clave: j.clave, nombre: j.nombre, torneos: torneos });
  });

  var hoy = Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), 'yyyy-MM-dd');
  return { json: formatear_({ actualizado: hoy, jugadores: jugadores }), avisos: avisos };
}


/**
 * Convierte la matriz de valores de una pestaña en la lista de torneos.
 * Detecta la fila de encabezados (la que tiene TORNEO y EQUIPO) y mapea las columnas
 * por NOMBRE, así no se rompe si movés columnas o cambia la fila donde arranca la tabla.
 */
function filasATorneos_(valores, nombreHoja, avisos) {
  var filaEnc = -1, cols = {};

  for (var r = 0; r < Math.min(valores.length, 15); r++) {
    var mapa = {};
    for (var c = 0; c < valores[r].length; c++) {
      var h = clave_(valores[r][c]);
      if (h) mapa[h] = c;
    }
    if (mapa['torneo'] !== undefined && mapa['equipo'] !== undefined) { filaEnc = r; cols = mapa; break; }
  }
  if (filaEnc < 0) {
    avisos.push('En "' + nombreHoja + '" no encontré la fila de encabezados (EQUIPO / TORNEO).');
    return [];
  }

  var idCol = cols['#'] !== undefined ? cols['#'] : cols['n'];
  var torneos = [];
  var secuencia = 0;

  for (var i = filaEnc + 1; i < valores.length; i++) {
    var fila = valores[i];
    var get = function (nombre) { return cols[nombre] === undefined ? '' : fila[cols[nombre]]; };

    var anio = anio_(get('ano'));
    var equipo = texto_(get('equipo'));
    var torneo = texto_(get('torneo'));
    var puestoCrudo = texto_(get('puesto'));
    var marcas = {
      zona: marcado_(get('zona')),
      octavos: marcado_(get('octavos')),
      cuartos: marcado_(get('cuartos')),
      semifinal: marcado_(get('semifinal')),
      final: marcado_(get('final'))
    };

    // La columna # viene pre-numerada (1..10) aunque la fila esté vacía: no cuenta como dato.
    var vacia = anio === null && !equipo && !torneo && !puestoCrudo &&
      !(marcas.zona || marcas.octavos || marcas.cuartos || marcas.semifinal || marcas.final);
    if (vacia) continue;

    secuencia++;
    var id = idCol !== undefined && typeof fila[idCol] === 'number' ? fila[idCol] : secuencia;

    var puesto = null;
    if (puestoCrudo) {
      puesto = puesto_(puestoCrudo);
      if (!puesto) {
        avisos.push('"' + nombreHoja + '" fila ' + (i + 1) + ': PUESTO no reconocido ("' + puestoCrudo + '"). Se exporta vacío.');
      }
    }
    if (!puestoCrudo) {
      avisos.push('"' + nombreHoja + '" fila ' + (i + 1) + ': sin PUESTO → la app lo muestra "En curso" y no lo cuenta en las estadísticas.');
    }

    torneos.push({
      id: id,
      anio: anio,
      equipo: equipo,
      torneo: torneo,
      zona: marcas.zona,
      octavos: marcas.octavos,
      cuartos: marcas.cuartos,
      semifinal: marcas.semifinal,
      final: marcas.final,
      puesto: puesto
    });
  }
  return torneos;
}


// ============================== HELPERS ==============================

/** "Año" → "ano", "SEMIFINAL" → "semifinal", "#" → "#". Sin tildes, sin símbolos, en minúscula. */
function clave_(v) {
  var s = String(v === null || v === undefined ? '' : v).trim();
  if (s === '#') return '#';
  return quitarTildes_(s).toLowerCase().replace(/[^a-z0-9]/g, '');
}

function quitarTildes_(s) {
  return s.normalize ? s.normalize('NFD').replace(/[\u0300-\u036f]/g, '') : s;
}

function texto_(v) {
  return String(v === null || v === undefined ? '' : v).trim();
}

/** El año es un número (2026). Si la celda quedó como fecha, toma el año de la fecha. */
function anio_(v) {
  if (v === '' || v === null || v === undefined) return null;
  if (Object.prototype.toString.call(v) === '[object Date]') return v.getFullYear();
  var n = parseInt(String(v).replace(/[^0-9]/g, ''), 10);
  return isNaN(n) ? null : n;
}

/** ✅ (o ✔, ☑, X, SI, TRUE) = true. Vacío = false. */
function marcado_(v) {
  if (v === true) return true;
  var s = texto_(v);
  if (!s) return false;
  return /✅|✔|☑|✓/.test(s) || /^(x|si|sí|true|1)$/i.test(s);
}

/**
 * Dropdown del Excel → código del JSON.
 *  🥇Campeón → campeon · 🥈Subcampeón → subcampeon · Semifinal → semifinal
 *  4️⃣tos → cuartos · 8️⃣vos → octavos · Zona → zona
 */
function puesto_(crudo) {
  var k = quitarTildes_(crudo).toLowerCase().replace(/[^a-z0-9]/g, ''); // saca emojis y símbolos
  var tabla = {
    campeon: 'campeon',
    subcampeon: 'subcampeon',
    semifinal: 'semifinal', semis: 'semifinal',
    '4tos': 'cuartos', cuartos: 'cuartos',
    '8vos': 'octavos', octavos: 'octavos',
    zona: 'zona'
  };
  return tabla[k] || null;
}


/**
 * JSON legible y fácil de editar a mano: un torneo por línea.
 * (JSON.stringify con sangría pone cada campo en su propia línea y se hace larguísimo.)
 */
function formatear_(obj) {
  var out = '{\n';
  out += '  "actualizado": ' + JSON.stringify(obj.actualizado) + ',\n';
  out += '  "jugadores": [\n';
  out += obj.jugadores.map(function (j) {
    var s = '    {\n';
    s += '      "clave": ' + JSON.stringify(j.clave) + ',\n';
    s += '      "nombre": ' + JSON.stringify(j.nombre) + ',\n';
    if (!j.torneos.length) {
      s += '      "torneos": []\n';
    } else {
      s += '      "torneos": [\n';
      s += j.torneos.map(function (t) { return '        ' + lineaTorneo_(t); }).join(',\n');
      s += '\n      ]\n';
    }
    s += '    }';
    return s;
  }).join(',\n');
  out += '\n  ]\n}\n';
  return out;
}


/** Un torneo en una sola línea: {"id": 1, "anio": 2026, ...} */
function lineaTorneo_(t) {
  var orden = ['id', 'anio', 'equipo', 'torneo', 'zona', 'octavos', 'cuartos', 'semifinal', 'final', 'puesto'];
  return '{' + orden.map(function (k) { return '"' + k + '": ' + JSON.stringify(t[k]); }).join(', ') + '}';
}


/** HTML del cuadro: textarea + botones Copiar y Descargar. */
function dialogoHtml_(json, avisos) {
  var avisosHtml = avisos.length
    ? '<div class="av"><b>⚠️ Avisos</b><ul>' + avisos.map(function (a) { return '<li>' + esc_(a) + '</li>'; }).join('') + '</ul></div>'
    : '';
  var jsonB64 = Utilities.base64Encode(json, Utilities.Charset.UTF_8);

  return '' +
    '<style>' +
    'body{font-family:Arial,Helvetica,sans-serif;margin:0;padding:14px;color:#1b2230}' +
    'textarea{width:100%;height:340px;box-sizing:border-box;font:12px/1.4 Consolas,Menlo,monospace;padding:10px;border:1px solid #c9d1d9;border-radius:8px;resize:none}' +
    'button{padding:9px 16px;border:0;border-radius:8px;font-weight:700;cursor:pointer;margin-right:8px}' +
    '.p{background:#16a34a;color:#fff}.s{background:#eef1f5;color:#1b2230}' +
    '.av{background:#fff7e0;border:1px solid #f3d27a;border-radius:8px;padding:8px 12px;margin-bottom:10px;font-size:12px;max-height:90px;overflow:auto}' +
    '.av ul{margin:4px 0 0 18px;padding:0}#ok{margin-left:6px;color:#16a34a;font-weight:700}' +
    '</style>' +
    avisosHtml +
    '<textarea id="t" readonly>' + esc_(json) + '</textarea>' +
    '<p style="margin:10px 0 0">' +
    '<button class="p" onclick="copiar()">📋 Copiar</button>' +
    '<button class="s" onclick="descargar()">⬇️ Descargar torneos.json</button>' +
    '<span id="ok"></span></p>' +
    '<script>' +
    'var B64="' + jsonB64 + '";' +
    'function copiar(){var t=document.getElementById("t");t.select();document.execCommand("copy");' +
    'document.getElementById("ok").textContent="¡Copiado!";setTimeout(function(){document.getElementById("ok").textContent=""},2000)}' +
    'function descargar(){var bin=atob(B64),b=new Uint8Array(bin.length);for(var i=0;i<bin.length;i++)b[i]=bin.charCodeAt(i);' +
    'var a=document.createElement("a");a.href=URL.createObjectURL(new Blob([b],{type:"application/json"}));' +
    'a.download="' + NOMBRE_ARCHIVO + '";document.body.appendChild(a);a.click();a.remove()}' +
    '</script>';
}

function esc_(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
