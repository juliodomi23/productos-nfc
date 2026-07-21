# Productos NFC — Ámbar Rojo Studios

Capa NFC que conecta **una etiqueta física** con **cualquiera de los 5 productos**.

## La decisión que importa

No son 5 aplicaciones. Es **una sola** con una tabla `tags`. Cada etiqueta guarda
una URL fija (`https://nfc.ambarrojo.mx/t/<codigo>`) y el servidor decide a dónde
va según cómo esté configurada.

Consecuencia práctica: **una etiqueta ya pegada en una mesa se puede reasignar a
otro producto desde el panel, sin despegarla ni volver a grabarla.** Ese es todo
el motivo de que este servicio exista.

| Producto | Cómo se resuelve |
|---|---|
| Máquina de reseñas | redirect a `maquina-resenas/` (ya existe) |
| Menú digital | redirect a `menu-digital/` (ya existe) |
| Tarjeta de lealtad | redirect a `tarjetas-lealtad/` (ya existe) |
| **Reloj checador** | **nativo aquí** (nuevo) |
| **Tarjeta de presentación** | **nativo aquí** (nuevo) |

Los tres primeros ya estaban construidos y probados. No se reescribieron.

## Correr

```bash
cd app
npm install
npm test        # 26 pruebas, sin frameworks
npm start       # http://localhost:3040
npm run verificar -- https://nfc.ambarrojo.mx   # chequeo previo al despliegue
```

`npm run verificar` es el que hay que correr **antes de grabar las 100 etiquetas**.
Comprueba lo que las pruebas unitarias no ven: que la URL quepa en un NTAG213, que
la página abra en Android e iPhone con las metas correctas, cuánto pesa y tarda,
que HTTPS esté puesto, que la contraseña de superadmin ya no sea la del repo y que
`TZ` esté en `America/Mexico_City`.

Docker: `docker compose up -d` (puerto 3040, volumen `nfc_data`).

## Stack

Express 4 + `node:sqlite` (módulo nativo de Node 22, cero dependencias de base de
datos) + páginas como funciones que devuelven HTML. Sin build, sin bundler.
Idéntico a `maquina-resenas` y `menu-digital` para que sea un solo stack que mantener.

## Flujo de trabajo con las 100 etiquetas

1. **Generar el lote.** `/superadmin` → "Generar lote" → 100 → copias las URLs.
2. **Grabar las etiquetas.** App *NFC Tools* (Android/iOS) → Write → URL.
   Marca **bloquear/read-only** solo cuando ya hayas verificado una de prueba:
   un tag bloqueado con la URL mal escrita es basura.
3. **Asignar.** Cada etiqueta empieza sin producto y muestra "sin asignar" al
   escanearla — eso confirma que quedó bien grabada antes de venderla.
4. **Vender.** Al cerrar con el cliente, lo das de alta y asignas sus etiquetas.

Ese orden importa: grabas las 100 de una sentada y las asignas conforme vendes,
en vez de grabar de a una por cliente.

## Estructura

```
app/
├── server.js          Router universal /t/:codigo + montaje
├── db.js              Esquema y acceso a datos
├── checador.js        Reloj checador: geocerca, alternancia, página
├── vcard.js           Tarjeta de presentación: página y generación .vcf
├── limite.js          Rate-limit en memoria (con poda de llaves)
├── superadminApi.js   API de Ámbar Rojo (clientes, lotes, asignación)
├── superadminPage.js  UI de Ámbar Rojo
├── panelApi.js        API del cliente (empleados, checadas, vcards)
├── panelPage.js       UI del cliente
├── ui.js              HTML/CSS e iconos SVG compartidos
├── test.js            npm test
└── verificar-nfc.js   npm run verificar
```

## Rutas

| Ruta | Quién |
|---|---|
| `GET /t/:codigo` | público — router universal |
| `GET /t/:codigo/contacto.vcf` | público — descarga de contacto |
| `POST /t/:codigo/checar` | público — registra asistencia |
| `/superadmin` | Ámbar Rojo (Basic auth) |
| `/:slug/panel` | cliente (Basic auth) |
| `GET /salud` | monitoreo |

## Config por tipo de etiqueta

Campo `config` (JSON) al asignar:

```jsonc
// checador
{ "sucursal": "Centro", "lat": 16.7516, "lon": -93.1161, "radio_m": 120 }
// vcard
{ "vcard_id": 3 }
```

`radio_m` es una **perilla de calibración, no un default sagrado**: el GPS de un
celular dentro de un local se va 30–50 m con facilidad. Si empiezan a salir
checadas marcadas "fuera" de gente que sí estaba ahí, súbelo. Empieza en 120.

## Lo que este sistema NO hace

Dilo en la venta, no lo escondas:

- **El checador no es control de acceso biométrico.** Un NFC pasivo barato no rota
  su URL: el empleado ve el link y puede abrirlo desde su casa. La geocerca lo
  detecta y lo marca "fuera del área", pero **no lo bloquea**. Sirve para PyME
  con confianza, no para nómina auditada ante la STPS.
- **El PIN es la única credencial del empleado.** Un compañero que lo vea puede
  checar por él. Suficiente para 5–20 empleados, no para 200.
- **SQLite, un solo archivo.** Aguanta de sobra decenas de miles de escaneos.
  Si un día un cliente necesita alta disponibilidad, ahí se migra a Postgres —
  no antes.

## Estado

MVP funcional con 26 pruebas en verde, verificado en navegador real (checador y
vCard probados end-to-end en viewport móvil).

Corregido tras la auditoría del 2026-07-21 (ver `_auditoria/`):
- `TZ=America/Mexico_City` en Docker — sin esto la nómina salía 6 h adelantada
- La alternancia del checador ya no se invierte para siempre si alguien olvida
  checar salida (ventana de turno de 16 h, configurable)
- Rate-limit en el PIN: 20 fallos por IP+etiqueta en 15 min
- Las vCards se leen y se asignan siempre filtrando por `cliente_id`
- La hora que se muestra al checar es la del servidor, no la del celular
- Iconos SVG en vez de emoji (se veían rotos en Android de gama media)
- `autofocus` y refoco en el PIN para dispositivo compartido
- Aviso al arrancar si falta `TZ` o si la contraseña sigue siendo la del repo

Falta antes de vender:
- Grabar y probar una etiqueta física real (nadie ha tocado un NFC todavía).
- Reporte semanal de asistencia por WhatsApp vía n8n — el workflow ya puede
  consumir `GET /:slug/api/checadas?dias=7` con Basic auth; falta armarlo.
- Desplegar en el VPS y apuntar `nfc.ambarrojo.mx`.

Export a Excel para nómina: `GET /:slug/api/checadas.csv?dias=30` (botón en el panel).
