# ⚽ Fútbol · Estadísticas

Dashboard de los torneos de fútbol de **Lolo** y **Fede**. Misma línea visual y mismo login que
*Estadísticas de Pádel*, pero sin base de datos: toda la info sale de **un solo archivo**, `data/torneos.json`.

## 📂 Estructura

```
Estadisticas-Futbol/
├── index.html                  # Login + tabs (una por jugador del JSON)
├── css/                        # styles.css · admin.css (login/modal) · theme.css (claro/oscuro)
├── js/
│   ├── theme.js                # Tema claro/oscuro
│   ├── supabase-client.js      # Cliente Supabase (SOLO para el login)
│   ├── auth-gate.js            # Login obligatorio (idéntico al de Pádel)
│   └── app.js                  # Dashboards: filtros, KPIs, gráficos, tabla, WhatsApp
├── data/torneos.json           # ← única fuente de datos
└── apps-script/
    └── Exportar-Torneos-JSON.gs  # Script para el Google Sheet que genera el JSON
```

## 🔄 Flujo de actualización

1. Cargás el torneo en el Google Sheet (pestaña **LOLO** o **FEDE**).
2. En el Sheet: **⚽ Fútbol → Ver / copiar / descargar JSON**.
3. Pegás el contenido en `data/torneos.json` (o reemplazás el archivo) y hacés commit.

Instalación del script: ver el encabezado de `apps-script/Exportar-Torneos-JSON.gs`.

## 🧾 Formato del JSON

```json
{
  "actualizado": "2026-11-26",
  "jugadores": [
    {
      "clave": "lolo",
      "nombre": "Lolo",
      "torneos": [
        {"id": 1, "anio": 2026, "equipo": "Sanchez F.C", "torneo": "Torneo Amistad - GRUD",
         "zona": true, "octavos": false, "cuartos": false, "semifinal": true, "final": true,
         "puesto": "campeon"}
      ]
    }
  ]
}
```

- `zona / octavos / cuartos / semifinal / final`: `true` si hay ✅ en el Excel.
- `puesto`: `campeon` · `subcampeon` · `semifinal` · `cuartos` · `octavos` · `zona` · `null` (sin puesto todavía).
  Equivale al dropdown del Excel: 🥇Campeón · 🥈Subcampeón · Semifinal · 4️⃣tos · 8️⃣vos · Zona.
- Las pestañas de la app se arman solas con `jugadores`. Para sumar una persona: nueva pestaña en el Sheet,
  una línea en `JUGADORES` del script y listo.

## 📊 Cómo se calculan las estadísticas

- Un torneo cuenta como **jugado** cuando tiene `puesto` (igual que `COUNTA(PUESTO)` del Excel).
  Los que no tienen puesto aparecen en la tabla como **En curso** y no entran en KPIs ni gráficos.
- **Podios** = campeón + subcampeón. **% Podios** = podios / jugados.
- **Finales jugadas** = campeón + subcampeón (o ✅ en FINAL). **% Finales ganadas** = campeones / finales.
- **Semifinales alcanzadas** = torneos que llegaron a semis o más lejos.
- El Excel guarda solo el **año** (no la fecha): el gráfico de títulos usa el orden de los torneos (año + `#`).

## ▶️ Verlo localmente

```bash
python -m http.server 8000   # y abrir http://localhost:8000
```
En GitHub Pages funciona directo.

## 🔒 Seguridad

El login (Supabase Auth) bloquea la interfaz, pero `data/torneos.json` es un archivo estático:
quien conozca la URL puede leerlo sin loguearse. Es el mismo comportamiento del modo Local de la app de Pádel.
Si los datos tienen que ser realmente privados, hay que servirlos desde un backend con sesión.
