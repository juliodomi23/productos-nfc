# Desplegar productos-nfc en EasyPanel

Dominio: **nfc.ambarrojostudios.cloud** · Puerto interno: **3040** · Servicio tipo **Compose**

EasyPanel se encarga del proxy inverso y del HTTPS (Let's Encrypt) solo. No hay
que tocar nginx ni certbot.

---

## 1. Subir el código a GitHub

EasyPanel despliega desde un repo. Este proyecto todavía no es un repo git, así
que hay que subirlo una vez:

```bash
cd "productos-nfc/app"
git init
git add .
git commit -m "productos-nfc: capa NFC"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/productos-nfc.git
git push -u origin main
```

El `.gitignore` ya excluye `node_modules`, `.env` y las bases de datos, así que no
se sube nada sensible.

> Nota: el `docker-compose.yml` está en `productos-nfc/app/`. Si prefieres que el
> repo empiece ahí (compose en la raíz del repo), corre `git init` dentro de `app/`
> como arriba. Si subes toda la carpeta `productos-nfc/`, en EasyPanel indica la
> ruta del compose: `app/docker-compose.yml`.

---

## 2. Crear el servicio en EasyPanel

1. En tu proyecto de EasyPanel: **+ Create Service → Compose**.
2. **Source**: conecta el repo de GitHub del paso 1 (branch `main`).
3. Si el compose no está en la raíz del repo, pon la ruta: `app/docker-compose.yml`.

---

## 3. Variables de entorno (pestaña Environment del servicio)

| Variable | Valor |
|---|---|
| `SUPERADMIN_PASS` | la contraseña fuerte que te pasé (¡obligatoria!) |
| `BASE_URL` | `https://nfc.ambarrojostudios.cloud` |
| `TZ` | `America/Mexico_City` |
| `SUPERADMIN_USER` | `admin` (o el que quieras) |

**El servicio NO arranca si `SUPERADMIN_PASS` queda vacía o con la clave del repo.**
Lo puse a propósito: es la clave que protege la reasignación de tus etiquetas. Si
EasyPanel marca que el contenedor murió al arrancar, casi siempre es esto — revisa
los logs, dirá `✗ SUPERADMIN_PASS vacía o con un valor por defecto inseguro`.

---

## 4. Dominio + HTTPS (pestaña Domains del servicio)

1. **Add Domain**: `nfc.ambarrojostudios.cloud`
2. **Port**: `3040` (el puerto interno de la app)
3. Activa HTTPS / Let's Encrypt (EasyPanel lo hace solo).
4. En tu DNS (Hostinger), crea el registro `A` de `nfc` → IP del VPS, si no existe.

---

## 5. Desplegar y verificar

1. **Deploy** en EasyPanel. Espera a que construya.
2. Revisa los **logs** del servicio. Debes ver:
   ```
   productos-nfc escuchando en http://localhost:3040
   Hora local del servidor: 21/7/2026, 9:52:00 a. m. (TZ=America/Mexico_City)
   ```
   La hora debe ser la de Tuxtla, no 6 h adelante. Si sale adelantada, `TZ` no llegó.
3. Desde tu PC, corre la verificación contra el dominio real:
   ```bash
   cd productos-nfc/app
   SUPERADMIN_PASS='la-clave-real' npm run verificar -- https://nfc.ambarrojostudios.cloud
   ```
   Debe terminar en **"Todo en orden. Puedes grabar las etiquetas."**

---

## 6. Prueba manual con tu celular (lo último antes de grabar)

1. Abre `https://nfc.ambarrojostudios.cloud/superadmin` → debe pedir usuario y clave.
2. Genera un lote de **1** etiqueta, copia la URL, ábrela en tu celular.
   Debe decir **"Etiqueta sin asignar"** con su código, y con candado de HTTPS.

Si eso pasa, ya puedes grabar las 100 (ver `docs/GUIA-ETIQUETAS.md`).

---

## Datos, respaldos y actualizaciones

- Los datos viven en el volumen `nfc_data` (la base SQLite en `/data/nfc.db`).
  No se borra al re-desplegar.
- **Respaldos**: ver `../_respaldos/`. Hoy no corre ninguno — prográmalo antes de
  cobrar la primera mensualidad.
- **Actualizar**: haces `git push` y le das **Deploy** de nuevo en EasyPanel. El
  volumen (y los datos) se conservan.
