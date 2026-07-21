# Guía de las etiquetas NFC — de la caja al cliente

Todo lo que hay que hacer con las 100 etiquetas, en orden.

---

## 0. Cómo funciona esto realmente

Cada etiqueta guarda **una sola cosa: una URL de texto**. Nada más. No guarda el
menú, ni las reseñas, ni los sellos. Solo:

```
https://nfc.ambarrojo.mx/t/7qhufh8
```

El celular la lee, abre esa URL, y **el servidor decide qué mostrar**. Por eso una
etiqueta ya pegada se puede cambiar de producto desde el panel sin despegarla.

La consecuencia importante: **el dominio queda grabado en el plástico.** Si mañana
cambias `nfc.ambarrojo.mx` por otra cosa, las 100 etiquetas quedan muertas. Se
define una vez, antes de grabar, y no se toca nunca.

---

## 1. Antes de grabar nada

### Verifica qué compraste

Busca en el empaque el chip. Lo normal en un lote barato es **NTAG213**:

| Chip | Capacidad | ¿Sirve? |
|---|---|---|
| NTAG213 | 144 bytes (~130 caracteres de URL) | Sí, de sobra |
| NTAG215 | 504 bytes | Sí |
| NTAG216 | 888 bytes | Sí |

Nuestra URL usa ~35 caracteres. Cualquiera sirve. Si el vendedor no dice el chip,
la app NFC Tools te lo dice al acercar la etiqueta (pestaña "Otro" → "Información").

### Prueba que tu celular lee NFC

**Android:** Ajustes → Conexiones (o Dispositivos conectados) → NFC → activado.
**iPhone XS o más nuevo:** ya está activo siempre, no hay que hacer nada.
**iPhone 7 al X:** funciona, pero el usuario tiene que abrir el "Lector NFC" desde
el Centro de Control. No lee solo. Es una limitación del celular, no tuya.

### Dónde está la antena — esto importa más de lo que parece

No es "acercar el celular", es **acercar el punto correcto del celular**:

- **iPhone:** arriba del todo, junto a las cámaras. Se acerca el borde superior.
- **Android:** casi siempre en el centro de la espalda, un poco arriba. Varía por
  modelo.

Cuando un cliente diga "no me funciona", el 80% de las veces es esto. Enséñale.

---

## 2. Grabar

### App

**NFC Tools** (gratis, Android e iOS). Es la estándar.

### Pasos

1. Levanta el servidor y entra a `/superadmin`.
2. "Generar lote" → cantidad **100** → etiqueta base opcional (ej. "Mesa").
3. Copia las 100 URLs del cuadro de texto.
4. En NFC Tools: pestaña **Escribir** → **Añadir un registro** → **URL/URI**.
5. Pega la primera URL → **Escribir** → acerca la etiqueta hasta que vibre.

### Graba UNA y pruébala antes de las otras 99

En serio. Acércala a un Android y a un iPhone. Debe abrir el navegador y mostrar
**"Etiqueta sin asignar"** con su código. Esa pantalla es la señal de que quedó
bien grabada.

Si sale bien, sigue con las demás. Si no, ajustaste el error una vez y no cien.

### Sobre bloquear las etiquetas

NFC Tools ofrece "Bloquear la etiqueta" (read-only). Es **irreversible**: la
etiqueta ya no se puede reescribir jamás.

**Recomendación: no las bloquees.** No lo necesitas — el destino se cambia desde
el panel, no reescribiendo el tag. Bloquear solo te quita la única red de
seguridad que tienes si algo salió mal.

Bloquéalas únicamente si un cliente las va a dejar accesibles al público en un
lugar sin vigilancia, donde alguien podría reescribirlas por vandalismo.

---

## 3. Dónde se pegan

| Producto | Dónde va | Cuidado |
|---|---|---|
| Menú digital | Mesa, bajo el vidrio o laminada | Una por mesa, con el número de mesa impreso |
| Reseñas | Mostrador, junto a la caja | Que se vea al pagar, que es cuando está contento |
| Lealtad | Mostrador, junto a la de reseñas | Distínguelas visualmente o se confunden |
| Checador | Pared junto a la entrada, a 1.40 m | Que no esté sobre estructura metálica |
| Tarjeta de presentación | Es la tarjeta misma | — |

### El enemigo es el metal

El metal detrás de la etiqueta **bloquea el NFC por completo**. Mesa de metal,
marco de aluminio, caja registradora, poste de acero: no lee.

Solución: etiquetas **"on-metal"** o "anti-metal" (traen una capa de ferrita).
Cuestan un poco más. Si vas a vender a talleres, refaccionarias o cocinas
industriales, compra unas cuantas aparte.

Verifica la superficie **en la visita de venta**, antes de prometer nada.

### Imprime instrucciones y un QR de respaldo

La etiqueta sola es un círculo blanco. Nadie sabe qué hacer con ella.

Pega junto a cada etiqueta una impresión con:
- **"Acerca tu celular aquí"** (con una flecha)
- Un **QR con la misma URL**

El QR es gratis y resuelve tres casos de golpe: iPhone viejo, Android con NFC
apagado, y el señor que no sabe que su celular tiene NFC. No lo omitas por
estética.

---

## 4. Asignar una etiqueta a un cliente

Cuando cierras la venta, en `/superadmin`:

1. **Alta de cliente**: slug (`tacos-el-primo`), nombre y contraseña del panel.
2. **Asignar etiqueta**: código de la etiqueta + cliente + producto.

Según el producto:

| Producto | Destino | Config JSON |
|---|---|---|
| Menú | `https://menu.ambarrojo.mx/tacos-el-primo?mesa=5` | — |
| Reseñas | `https://resenas.ambarrojo.mx/tacos-el-primo` | — |
| Lealtad | URL del sistema de lealtad | — |
| Checador | (vacío) | `{"sucursal":"Centro","lat":16.7516,"lon":-93.1161,"radio_m":120}` |
| Tarjeta | (vacío) | `{"vcard_id":3}` |

### Cómo sacar lat/lon de una sucursal

Google Maps → clic derecho sobre el punto exacto → el primer renglón del menú son
las coordenadas → clic para copiar. Pégalas tal cual.

`radio_m` en **120** para empezar. Si salen checadas marcadas "fuera del área" de
gente que sí estaba ahí, súbelo. El GPS de un celular dentro de un local se va
30–50 m con facilidad.

---

## 5. Qué pasa cuando alguien escanea

| Situación | Qué ve |
|---|---|
| Etiqueta sin asignar | "Etiqueta sin asignar" + su código. Normal al grabar. |
| Etiqueta desactivada o inexistente | "Etiqueta no encontrada" |
| Menú / reseñas / lealtad | Redirección al producto (no nota el salto) |
| Checador | Pantalla de PIN → "Checar" |
| Tarjeta de presentación | Ficha con botones de llamar, WhatsApp, correo y guardar contacto |

**Todo escaneo se cuenta**, esté asignada o no. Ese contador es dato de venta:
*"tu etiqueta se escaneó 47 veces este mes"* justifica la mensualidad mejor que
cualquier argumento.

---

## 6. Reparto sugerido de las 100

| Uso | Cantidad |
|---|---|
| Tarjetas de presentación (venta rápida) | 40 |
| Menús de restaurante (3 clientes × 12 mesas) | 36 |
| Reseñas | 8 |
| Checador | 4 |
| **Reserva** | **12** |

**Guarda las 12 de reserva.** Se pierden, se despegan, un cliente pide una más y
un mesero se lleva una por error. Si no apartas reserva, la primera reposición te
obliga a comprar un lote nuevo.

---

## 7. Cuando el cliente dice "no funciona"

En orden, es casi siempre uno de estos:

1. **NFC apagado** (Android). Ajustes → Conexiones → NFC.
2. **Está acercando la parte equivocada del celular.** Enséñale dónde está la antena.
3. **iPhone 7–X**: necesita abrir el lector NFC desde el Centro de Control.
4. **Hay metal detrás.** Despega la etiqueta y prueba en la mano. Si ahí sí lee,
   es el metal: necesitas una etiqueta on-metal.
5. **Funda muy gruesa** o con placa metálica para soporte magnético de auto.
6. **La etiqueta se dañó.** Se doblan y se rompen. Reemplázala de la reserva y
   asígnale el mismo producto en el panel — al cliente le da igual el código.

Si nada de esto es, ahí sí revisa el servidor: `GET /salud`.

---

## 8. Checklist de despliegue

- [ ] `BASE_URL` definido y DNS de `nfc.ambarrojo.mx` apuntando al VPS
- [ ] HTTPS con certificado válido (sin esto, Android marca la página como no segura)
- [ ] `SUPERADMIN_PASS` cambiado (el default `ambar-rojo-2026` está en el repo)
- [ ] Servicio arriba: `docker compose up -d`, verificar `GET /salud`
- [ ] Backup del volumen `nfc_data` programado
- [ ] **1 etiqueta de prueba grabada y verificada en Android e iPhone**
- [ ] Las 99 restantes grabadas
- [ ] 12 apartadas como reserva
- [ ] Impresión de "Acerca tu celular aquí" + QR de respaldo lista
