# Productos NFC — Plan de negocio

**Creado:** 2026-07-21
**Inventario inicial:** 100 etiquetas NFC

---

## 1. Qué es

Una etiqueta NFC pegada en una superficie. El cliente acerca el celular y pasa algo.
No hay app que descargar: iPhone y Android leen NFC de fábrica desde la pantalla
de bloqueo.

Las 100 etiquetas no son un producto — son **hardware que hace vendibles cinco
productos**, tres de los cuales ya teníamos construidos.

## 2. Por qué NFC y no seguir con QR

| | QR | NFC |
|---|---|---|
| Costo unitario | ~$2 (impresión) | ~$10–15 |
| Fricción | abrir cámara, encuadrar, tocar aviso | acercar el celular |
| Con poca luz | falla | funciona |
| Se despega / ensucia | sí, y deja de leer | va bajo el vidrio o laminado |
| Percepción | "papelito" | "esto se ve caro" |

El punto de venta real no es la tecnología, es la **conversión**: acercar el
celular convierte mejor que encuadrar un QR, sobre todo en reseñas, donde cada
punto de conversión es una estrella más en Google.

Y el punto de venta secundario: **justifica cobrar más por el mismo producto.**

## 3. Los cinco productos

| # | Producto | Estado | Setup | Mensual |
|---|---|---|---|---|
| 1 | Máquina de reseñas NFC | ya construido | $1,500 | $300 |
| 2 | Menú digital NFC | ya construido | $3,000 | $400 |
| 3 | Tarjeta de presentación | **nuevo** | $400–500 c/u | — |
| 4 | Reloj checador | **nuevo** | $2,000 | $500 |
| 5 | Tarjeta de lealtad NFC | ya construido | $1,500 | $500 |

Los precios de 1, 2 y 5 son los actuales **+$500 de setup** por el hardware y la
instalación. La mensualidad no cambia: el NFC no cuesta más al mes.

## 4. Economía unitaria de las 100 etiquetas

Costo del lote: ~$1,000–1,500 MXN.

| Escenario | Etiquetas | Ingreso |
|---|---|---|
| 40 tarjetas de presentación a $450 | 40 | $18,000 únicos |
| 3 restaurantes × 12 mesas (menú) | 36 | $9,000 setup + $1,200/mes |
| 8 negocios con reseñas | 8 | $12,000 setup + $2,400/mes |
| 2 empresas con checador | 4 | $4,000 setup + $1,000/mes |
| Reserva / pruebas / reposición | 12 | — |

El lote se paga con **las primeras 4 tarjetas de presentación.** Todo lo demás
es margen. Guarda 12 de reserva: se pierden, se despegan y un cliente siempre
pide una más.

## 5. Cuál vender primero

**Tarjeta de presentación.** Motivos:

- Es el que menos código requiere (ya está hecho, es un `.vcf`).
- Venta de una sola conversación, sin comité ni prueba piloto.
- Se vende a **tus propios prospectos**: le das la tuya al dueño de un negocio,
  la acerca a su celular, se le queda el ojo cuadrado, y ya abriste la plática
  del bot de WhatsApp. Es lead magnet y producto al mismo tiempo.
- Rota inventario rápido, que es exactamente lo que quieres para saber si el NFC
  vende antes de comprar 500 más.

**Luego reseñas**, porque el producto ya existe y solo estás cambiando el soporte
físico. Cero desarrollo, precio más alto.

**El checador al último**, aunque suene el más "software". Requiere dar de alta
empleados, explicar PINs, y su valor se demuestra hasta la primera quincena.
Ciclo de venta largo.

## 6. Mercado

| Competidor | Qué hace | Precio |
|---|---|---|
| Popl / Linq / V1CE | tarjetas NFC de presentación | $30–100 USD c/u + suscripción |
| Vendedores de Mercado Libre | tarjeta NFC genérica sin panel | $150–300, sin servicio |
| Checadores biométricos (ZKTeco) | hardware dedicado | $3,000–8,000 + instalación |
| **Nadie en Tuxtla vendiendo esto integrado** | — | — |

**Nuestra ventaja:** venta cara a cara, en pesos, con la etiqueta ya grabada y
pegada, y la posibilidad de cambiarle el destino después sin tocarla.

## 7. La objeción del checador — cómo responderla

El cliente va a preguntar: *"¿y si el empleado checa desde su casa?"*

No mientas. La respuesta honesta vende mejor:

> "Puede. El sistema registra su ubicación y te lo marca en rojo como 'fuera del
> área' en el reporte. No lo bloquea — te lo evidencia. Si buscas control estricto
> con huella, eso es un checador biométrico de $6,000. Esto es para saber a qué
> hora llega tu gente y tener el registro, que es el 90% del problema real."

Filtra al cliente equivocado antes de venderle, en vez de después.

## 8. Riesgos

| Riesgo | Mitigación |
|---|---|
| Etiquetas grabadas con el dominio equivocado | Definir `BASE_URL` **antes** del primer lote. Probar 1 antes de grabar 100. |
| Cliente despega la etiqueta y se la lleva | Es reasignable desde el panel: se desactiva y listo. |
| Un iPhone viejo (< iPhone 7) no lee NFC en background | Dejar el QR impreso junto al tag como respaldo. Es gratis. |
| Etiqueta sobre metal no lee | Comprar variante "on-metal" para talleres y refaccionarias. Verificar en la primera visita. |
| Nadie sabe qué es "acercar el celular" | La etiqueta lleva impreso "Acerca tu celular aquí". No lo des por obvio. |

## 9. Siguientes pasos

- [ ] Grabar 1 etiqueta de prueba y verificarla en Android **e** iPhone
- [ ] Definir el dominio final (`nfc.ambarrojo.mx`) y desplegar en el VPS
- [ ] Grabar las 100 y separar 12 de reserva
- [ ] Hacer 10 tarjetas de presentación: 2 del equipo, 8 para vender esta semana
- [ ] Reporte semanal de asistencia por WhatsApp (n8n) — cierra la venta del checador
- [ ] Exportar asistencia a CSV para nómina
