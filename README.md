# Billetera Virtual

Aplicación web para llevar las finanzas de un domiciliario: cada domicilio, cada propina y cada gasto, con metas diarias y resúmenes por semana y por mes.

Está hecha con HTML, CSS y JavaScript puro, sin servidor ni dependencias. Es una **PWA**, así que se puede instalar en el celular y funciona sin internet.

## Funciones

- **Domicilio rápido ⚡**: registra un domicilio con tu tarifa habitual en un solo toque (con opción de deshacer).
- **Ingresos**: tarifa, propina, plataforma (Rappi, DiDi, particular…) y método de pago (efectivo o digital).
- **Gastos** por categoría: gasolina, comida, mantenimiento de la moto, datos, parqueadero…
- **Inicio**: ganancia neta del día, número de domicilios, efectivo en mano y progreso de la meta diaria.
- **Historial** agrupado por día, con filtros por tipo y rango; toca un movimiento para editarlo o eliminarlo.
- **Resumen** semanal o mensual: ganancia por día, promedio por domicilio, mejor día, gastos por categoría e ingresos por plataforma.
- **Respaldo**: exportar e importar en JSON y exportar a Excel (CSV).

## Cómo usarla

**En el computador:** abre `index.html` con doble clic.

**Con un servidor local** (necesario para el modo offline y para instalarla):

```bash
npx serve .
# o
python -m http.server 8080
```

**En el celular:** publica la carpeta en GitHub Pages (o Netlify), abre el enlace en Chrome y elige *Agregar a la pantalla principal*.

> Los datos se guardan en el navegador de cada dispositivo (`localStorage`). Lo que registras en el celular no aparece en el computador, y al revés. Usa **Ajustes → Exportar respaldo** para tener una copia o pasar los datos de un dispositivo a otro.

## Estructura

```
index.html            Vistas: inicio, historial, resumen, ajustes
css/estilos.css       Estilos (mobile-first, modo claro y oscuro)
js/app.js             Lógica, cálculos y almacenamiento
sw.js                 Service worker (modo offline)
manifest.webmanifest  Datos para instalarla como app
icon.svg              Ícono
```

## Ideas para próximas versiones

- Jornadas con hora de inicio y fin para calcular la ganancia por hora.
- Control de kilómetros y rendimiento de la gasolina.
- "Bolsillos" de ahorro (SOAT, llantas, aceite) y recordatorios de mantenimiento.
- Sincronización entre dispositivos con un backend.
