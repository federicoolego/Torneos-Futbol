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
 *  · ⚽ Fútbol → Publicar en GitHub (commit)      → commitea data/torneos.json directo al repo
 *                                                  (GitHub Pages se republica solo).
 *
 * PUBLICAR EN GITHUB — alta (una sola vez)
 *  1. GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens.
 *     Repository access: SOLO Torneos-Futbol · Permissions → Contents: Read and write · con vencimiento.
 *  2. En el Sheet: ⚽ Fútbol → Configurar token de GitHub → pegar el token
 *     (queda en Propiedades del script, NO en el código).
 *  3. ⚽ Fútbol → Publicar en GitHub. La primera vez Google pide permiso para "conectarse a un servicio externo".
 *  4. Opcional: ⚽ Fútbol → Activar publicación diaria automática.
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

// Destino del commit (publicarEnGitHub). El token NO va acá: se guarda con "Configurar token de GitHub".
var GITHUB = { owner: 'federicoolego', repo: 'Torneos-Futbol', branch: 'main', path: 'data/torneos.json' };
// ===========================================================================


function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('⚽ Fútbol')
    .addItem('Ver / copiar / descargar JSON', 'mostrarJson')
    .addItem('Guardar torneos.json en Drive', 'guardarJsonEnDrive')
    .addSeparator()
    .addItem('Publicar en GitHub (commit)', 'publicarEnGitHub')
    .addItem('Configurar token de GitHub', 'configurarTokenGitHub')
    .addItem('Activar publicación diaria automática', 'activarPublicacionDiaria')
    .addItem('Desactivar publicación diaria', 'desactivarPublicacionDiaria')
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


// ============================== PUBLICAR EN GITHUB ==============================

/** Guarda el token en las propiedades del script (no queda en el código ni en el Sheet). */
function configurarTokenGitHub() {
  var ui = SpreadsheetApp.getUi();
  var r = ui.prompt('Token de GitHub',
    'Pegá el fine-grained token con permiso "Contents: Read and write" sobre ' + GITHUB.owner + '/' + GITHUB.repo + '.',
    ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  var token = r.getResponseText().trim();
  if (!token) return;
  PropertiesService.getScriptProperties().setProperty('GITHUB_TOKEN', token);
  ui.alert('⚽ Fútbol', '✅ Token guardado. Ya podés usar "Publicar en GitHub".', ui.ButtonSet.OK);
}

/** Desde el menú: publica y muestra el resultado. */
function publicarEnGitHub() {
  var ui = SpreadsheetApp.getUi();
  try {
    ui.alert('⚽ Fútbol', publicarEnGitHub_(), ui.ButtonSet.OK);
  } catch (e) {
    ui.alert('⚽ Fútbol', '❌ ' + e.message, ui.ButtonSet.OK);
  }
}

/** Para el trigger diario (sin diálogos). Si falla, te manda un mail. */
function publicarEnGitHubAuto() {
  try {
    Logger.log(publicarEnGitHub_());
  } catch (e) {
    Logger.log('ERROR: ' + e.message);
    MailApp.sendEmail(Session.getEffectiveUser().getEmail(), '⚽ Fútbol: falló la publicación en GitHub', e.message);
  }
}

function activarPublicacionDiaria() {
  desactivarPublicacionDiaria_();
  ScriptApp.newTrigger('publicarEnGitHubAuto').timeBased().everyDays(1).atHour(6).create();
  SpreadsheetApp.getUi().alert('⚽ Fútbol', '✅ Publicación diaria activada (~6 AM). Si no hay cambios en los datos, no hace commit.', SpreadsheetApp.getUi().ButtonSet.OK);
}

function desactivarPublicacionDiaria() {
  var n = desactivarPublicacionDiaria_();
  SpreadsheetApp.getUi().alert('⚽ Fútbol', n ? '✅ Publicación diaria desactivada.' : 'No había ninguna publicación diaria activa.', SpreadsheetApp.getUi().ButtonSet.OK);
}

function desactivarPublicacionDiaria_() {
  var n = 0;
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'publicarEnGitHubAuto') { ScriptApp.deleteTrigger(t); n++; }
  });
  return n;
}

/**
 * Commitea data/torneos.json al repo vía la API de contenidos de GitHub.
 *  · Si el archivo existe, manda su sha (GitHub lo exige para actualizar).
 *  · Si lo único que cambió es "actualizado" (la fecha), NO commitea: evita commits vacíos.
 * Devuelve un texto con el resultado; ante un error lanza Error con un mensaje claro.
 */
function publicarEnGitHub_() {
  var token = PropertiesService.getScriptProperties().getProperty('GITHUB_TOKEN');
  if (!token) throw new Error('Falta el token. Usá ⚽ Fútbol → Configurar token de GitHub.');

  var res = generarJson_();
  var url = 'https://api.github.com/repos/' + GITHUB.owner + '/' + GITHUB.repo + '/contents/' + GITHUB.path;
  var headers = {
    Authorization: 'Bearer ' + token,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28'
  };

  // 1) ¿Qué hay hoy en el repo? (sha + contenido)
  var get = UrlFetchApp.fetch(url + '?ref=' + encodeURIComponent(GITHUB.branch), { headers: headers, muteHttpExceptions: true });
  var code = get.getResponseCode();
  var sha = null;
  if (code === 200) {
    var actual = JSON.parse(get.getContentText());
    sha = actual.sha;
    var previo = Utilities.newBlob(Utilities.base64Decode(String(actual.content).replace(/\s/g, ''))).getDataAsString('UTF-8');
    if (sinFecha_(previo) === sinFecha_(res.json)) {
      return 'Sin cambios: el repo ya tiene estos datos (no se hizo commit).' + textoAvisos_(res.avisos);
    }
  } else if (code !== 404) {                       // 404 = el archivo todavía no existe: se crea
    throw new Error(errorGitHub_(code, get));
  }

  // 2) Commit
  var hoy = Utilities.formatDate(new Date(), SpreadsheetApp.getActive().getSpreadsheetTimeZone(), 'yyyy-MM-dd HH:mm');
  var body = {
    message: 'Actualizar torneos.json desde el Sheet (' + hoy + ')',
    content: Utilities.base64Encode(res.json, Utilities.Charset.UTF_8),
    branch: GITHUB.branch
  };
  if (sha) body.sha = sha;

  var put = UrlFetchApp.fetch(url, {
    method: 'put',
    headers: headers,
    contentType: 'application/json',
    payload: JSON.stringify(body),
    muteHttpExceptions: true
  });
  code = put.getResponseCode();
  if (code !== 200 && code !== 201) throw new Error(errorGitHub_(code, put));

  var commit = JSON.parse(put.getContentText()).commit || {};
  return '✅ Commit hecho en ' + GITHUB.owner + '/' + GITHUB.repo + ' (' + GITHUB.branch + ').\n' +
    (commit.html_url || '') + '\n\nGitHub Pages se republica solo en ~1 minuto.' + textoAvisos_(res.avisos);
}

/** El JSON sin la línea "actualizado" (para comparar contenido real). */
function sinFecha_(json) {
  return String(json).replace(/"actualizado":\s*"[^"]*",?/, '').replace(/\r/g, '').trim();
}

function textoAvisos_(avisos) {
  return avisos.length ? '\n\n⚠️ Avisos:\n- ' + avisos.join('\n- ') : '';
}

function errorGitHub_(code, resp) {
  var detalle = '';
  try { detalle = JSON.parse(resp.getContentText()).message || ''; } catch (e) { /* sin detalle */ }
  var causa = {
    401: 'Token inválido o vencido. Generá uno nuevo y usá "Configurar token de GitHub".',
    403: 'Sin permiso o límite de la API. Revisá que el token tenga "Contents: Read and write" sobre este repo.',
    404: 'No encuentro el repo/rama/ruta, o el token no tiene acceso al repo (' + GITHUB.owner + '/' + GITHUB.repo + ', rama ' + GITHUB.branch + ').',
    409: 'Conflicto: alguien cambió el archivo justo ahora. Volvé a intentar.',
    422: 'GitHub rechazó la petición (¿rama inexistente o sha desactualizado?).'
  }[code] || 'Error inesperado.';
  return 'GitHub respondió ' + code + '. ' + causa + (detalle ? ' (' + detalle + ')' : '');
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

  if (cols['categoria'] === undefined && cols['categorias'] === undefined) {
    avisos.push('En "' + nombreHoja + '" no encontré la columna CATEGORÍA (F5, F8, F11, Futsal...). Se exporta vacía.');
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
    var categoriaCruda = texto_(get('categoria') || get('categorias'));
    var marcas = {
      zona: marcado_(get('zona')),
      octavos: marcado_(get('octavos')),
      cuartos: marcado_(get('cuartos')),
      semifinal: marcado_(get('semifinal')),
      final: marcado_(get('final'))
    };

    // La columna # viene pre-numerada (1..10) aunque la fila esté vacía: no cuenta como dato.
    var vacia = anio === null && !equipo && !torneo && !puestoCrudo && !categoriaCruda &&
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

    // CATEGORÍA (modalidad): F5, F8, F11, Futsal... Si la columna existe pero la fila no la tiene, avisa.
    var categoria = categoria_(categoriaCruda);
    if (!categoria && (cols['categoria'] !== undefined || cols['categorias'] !== undefined)) {
      avisos.push('"' + nombreHoja + '" fila ' + (i + 1) + ': sin CATEGORÍA → se exporta vacía.');
    }

    torneos.push({
      id: id,
      anio: anio,
      equipo: equipo,
      torneo: torneo,
      categoria: categoria,
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
 * CATEGORÍA → texto normalizado (misma lógica que app.js).
 *  "futbol 5" / "Fútbol 5" / "f-5" → "F5" · "salon" / "futsal" → "Futsal" · cualquier otro texto → tal cual.
 *  Vacío → null.
 */
function categoria_(crudo) {
  var raw = texto_(crudo);
  if (!raw) return null;
  var k = quitarTildes_(raw).toLowerCase().replace(/[^a-z0-9]/g, '');
  var m = /^(?:f|fut|futbol)(\d{1,2})$/.exec(k);
  if (m) return 'F' + m[1];
  if (/^(futsal|futbolsalon|futbolsala|salon)$/.test(k)) return 'Futsal';
  return raw;
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
  var orden = ['id', 'anio', 'equipo', 'torneo', 'categoria', 'zona', 'octavos', 'cuartos', 'semifinal', 'final', 'puesto'];
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
