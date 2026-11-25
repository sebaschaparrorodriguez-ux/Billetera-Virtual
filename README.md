# Billetera Virtual

Aplicación web para llevar las finanzas de un domiciliario: cada domicilio, cada propina y cada gasto, con metas diarias y resúmenes por semana y por mes.

Está hecha con HTML, CSS y JavaScript puro, sin servidor ni dependencias. Es una **PWA**, así que se puede instalar en el celular y funciona sin internet.

## Funciones

- **Domicilio rápido ⚡**: registra un domicilio con tu tarifa habitual en un solo toque (con opción de deshacer).
- **Ingresos**: tarifa, propina, plataforma (Rappi, DiDi, particular…) y método de pago (efectivo o digital).
- **Gastos** por categoría: gasolina, comida, mantenimiento de la moto, datos, parqueadero…
- **Inicio**: ganancia neta del día, número de domicilios y progreso de la meta diaria.
- **Dinero base y dinero total**: escribe con cuánto empezaste (efectivo y Nequi) y la app lleva cuánto tienes en total, separado en efectivo y Nequi.
- **Cuentas (opcional)**: crea una cuenta con correo y contraseña para guardar los datos en la nube y verlos desde cualquier dispositivo. Sin cuenta, todo se guarda solo en el dispositivo.
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

> Sin cuenta, los datos se guardan en el navegador de cada dispositivo (`localStorage`). Con cuenta, se guardan también en Firebase y se sincronizan entre dispositivos.

## Activar las cuentas (Firebase)

Las cuentas usan **Firebase Authentication** (correo y contraseña) y **Cloud Firestore**. El plan gratuito (Spark) alcanza de sobra.

1. Entra a [console.firebase.google.com](https://console.firebase.google.com) y crea un proyecto (Google Analytics no hace falta).
2. **Authentication → Comenzar → Correo electrónico/contraseña → Habilitar**.
3. **Authentication → Configuración → Dominios autorizados**: agrega `sebaschaparrorodriguez-ux.github.io`.
4. **Firestore Database → Crear base de datos**, en modo de producción, ubicación `southamerica-east1` (São Paulo) o la más cercana.
5. **Firestore → Reglas**: pega el contenido de [`firestore.rules`](firestore.rules) y publica.
6. **Configuración del proyecto → Tus apps → Web (`</>`)**: registra la app y copia el objeto `firebaseConfig` en [`js/firebase-config.js`](js/firebase-config.js).

Mientras `firebaseConfig` sea `null`, la app funciona sin cuentas y no muestra esa opción. Las cuentas solo funcionan cuando la página se sirve por `http(s)` (GitHub Pages o un servidor local), no al abrir `index.html` con doble clic.

**Cómo se sincroniza:** cada movimiento es un documento en `usuarios/{uid}/movimientos`. Firestore guarda una copia en el dispositivo, así que sin señal se puede seguir registrando y los cambios se suben solos al volver la conexión. Al iniciar sesión por primera vez, la app ofrece pasar a la cuenta los movimientos que había en el dispositivo.

## Estructura

```
index.html            Vistas: inicio, historial, resumen, ajustes
css/estilos.css       Estilos (mobile-first, modo claro y oscuro)
js/app.js             Lógica, cálculos y almacenamiento
js/nube.js            Cuentas y sincronización con Firebase
js/firebase-config.js Configuración del proyecto de Firebase
firestore.rules       Reglas de seguridad de la base de datos
sw.js                 Service worker (modo offline)
manifest.webmanifest  Datos para instalarla como app
icon.svg              Ícono
```

## Ideas para próximas versiones

- Jornadas con hora de inicio y fin para calcular la ganancia por hora.
- Control de kilómetros y rendimiento de la gasolina.
- "Bolsillos" de ahorro (SOAT, llantas, aceite) y recordatorios de mantenimiento.
- Movimientos entre efectivo y Nequi (por ejemplo, cuando consignas o retiras).
