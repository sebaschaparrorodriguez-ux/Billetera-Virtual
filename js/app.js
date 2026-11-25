'use strict';

/* =========================================================
   Configuración
   ========================================================= */
const CLAVE_STORAGE = 'billetera-domi:v1';

const CATEGORIAS = {
  ingreso: ['Domicilio', 'Propina', 'Bono / incentivo', 'Otro ingreso'],
  gasto: ['Gasolina', 'Comida', 'Mantenimiento moto', 'Datos / celular', 'Parqueadero', 'Otro gasto'],
};

const AJUSTES_BASE = {
  nombre: '',
  metaDiaria: 100000,
  tarifas: [4000, 4500, 5000],
  tarifaElegida: 4000,
  metodoElegido: 'efectivo',
  plataformas: ['Rappi', 'DiDi Food', 'Particular'],
};

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
  'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const DIAS_CORTOS = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];

/* =========================================================
   Utilidades
   ========================================================= */
const $ = (sel, raiz = document) => raiz.querySelector(sel);
const $$ = (sel, raiz = document) => [...raiz.querySelectorAll(sel)];

const formatoPesos = new Intl.NumberFormat('es-CO', {
  style: 'currency', currency: 'COP', maximumFractionDigits: 0,
});
// "$4.000" en vez de "$ 4.000", como se escribe normalmente.
const pesos = (n) => formatoPesos.format(Math.round(n || 0)).replace(/\s/u, '');
const formatoMiles = (n) => (n ? n.toLocaleString('es-CO') : '');
const aNumero = (texto) => Number(String(texto ?? '').replace(/\D/g, '')) || 0;

const pad = (n) => String(n).padStart(2, '0');
const claveDia = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const ahoraLocal = () => {
  const d = new Date();
  return `${claveDia(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const aFecha = (clave) => {
  const [a, m, d] = clave.split('-').map(Number);
  return new Date(a, m - 1, d);
};
const sumarDias = (fecha, n) => {
  const r = new Date(fecha);
  r.setDate(r.getDate() + n);
  return r;
};
const capitalizar = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const fechaLarga = (clave) =>
  aFecha(clave).toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' });

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));

const nuevoId = () =>
  (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));

const nombreMetodo = (metodo) => (metodo === 'efectivo' ? 'Efectivo' : 'Nequi');
const totalMov = (m) => m.monto + (m.propina || 0);
const esDomicilio = (m) => m.tipo === 'ingreso' && m.categoria === 'Domicilio';
const diaDe = (m) => m.fecha.slice(0, 10);
const ordenarRecientes = (movs) => [...movs].reverse().sort((a, b) => b.fecha.localeCompare(a.fecha));

/* =========================================================
   Estado y persistencia
   ========================================================= */
const FECHA_VALIDA = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

/** Limpia un movimiento (por ejemplo, de un respaldo importado). Devuelve null si no sirve. */
function normalizarMovimiento(m) {
  if (!m || typeof m !== 'object') return null;
  if (m.tipo !== 'ingreso' && m.tipo !== 'gasto') return null;
  const monto = Math.round(Number(m.monto));
  if (!Number.isFinite(monto) || monto < 0) return null;
  if (typeof m.fecha !== 'string' || !FECHA_VALIDA.test(m.fecha.slice(0, 16))) return null;
  const propina = Math.round(Number(m.propina)) || 0;
  return {
    id: typeof m.id === 'string' && m.id ? m.id : nuevoId(),
    tipo: m.tipo,
    monto,
    propina: m.tipo === 'ingreso' && propina > 0 ? propina : 0,
    categoria: typeof m.categoria === 'string' && m.categoria ? m.categoria.slice(0, 40) : (m.tipo === 'ingreso' ? 'Otro ingreso' : 'Otro gasto'),
    plataforma: m.tipo === 'ingreso' && typeof m.plataforma === 'string' ? m.plataforma.slice(0, 40) : '',
    metodo: m.metodo === 'efectivo' ? 'efectivo' : 'digital',
    fecha: m.fecha.slice(0, 16),
    nota: typeof m.nota === 'string' ? m.nota.slice(0, 120) : '',
  };
}

function normalizarAjustes(a = {}) {
  const plataformas = Array.isArray(a.plataformas)
    ? a.plataformas.map((p) => String(p).trim().slice(0, 40)).filter(Boolean)
    : [];
  let tarifas = Array.isArray(a.tarifas)
    ? [...new Set(a.tarifas.map((t) => Math.round(Number(t))).filter((t) => t > 0))].sort((x, y) => x - y).slice(0, 6)
    : [];
  if (!tarifas.length) tarifas = [...AJUSTES_BASE.tarifas];
  const elegida = Math.round(Number(a.tarifaElegida));
  return {
    nombre: typeof a.nombre === 'string' ? a.nombre.slice(0, 40) : AJUSTES_BASE.nombre,
    metaDiaria: Number.isFinite(Number(a.metaDiaria)) && a.metaDiaria !== undefined ? Math.max(0, Math.round(a.metaDiaria)) : AJUSTES_BASE.metaDiaria,
    tarifas,
    tarifaElegida: tarifas.includes(elegida) ? elegida : tarifas[0],
    metodoElegido: a.metodoElegido === 'digital' ? 'digital' : 'efectivo',
    plataformas: plataformas.length ? plataformas : [...AJUSTES_BASE.plataformas],
  };
}

function cargar() {
  try {
    const datos = JSON.parse(localStorage.getItem(CLAVE_STORAGE));
    if (datos && Array.isArray(datos.movimientos)) {
      return {
        movimientos: datos.movimientos.map(normalizarMovimiento).filter(Boolean),
        ajustes: normalizarAjustes(datos.ajustes),
      };
    }
  } catch (e) {
    console.warn('No se pudieron leer los datos guardados', e);
  }
  return { movimientos: [], ajustes: normalizarAjustes() };
}

function guardar() {
  try {
    localStorage.setItem(CLAVE_STORAGE, JSON.stringify(estado));
  } catch (e) {
    console.error(e);
    mostrarToast('No se pudo guardar. Exporta un respaldo desde Ajustes.');
  }
}

let estado = cargar();
let respaldoDeshacer = null;

/** Aplica un cambio a los movimientos guardando una copia para poder deshacerlo. */
function cambiarMovimientos(mutacion, mensaje) {
  respaldoDeshacer = estado.movimientos.map((m) => ({ ...m }));
  mutacion();
  guardar();
  renderTodo();
  mostrarToast(mensaje, true);
}

function deshacer() {
  if (!respaldoDeshacer) return;
  estado.movimientos = respaldoDeshacer;
  respaldoDeshacer = null;
  guardar();
  renderTodo();
  mostrarToast('Cambio deshecho');
}

/* =========================================================
   Cálculos
   ========================================================= */
function calcularRango(tipo, desplazamiento = 0) {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);

  if (tipo === 'hoy') {
    const k = claveDia(hoy);
    return { desde: k, hasta: k, etiqueta: 'Hoy' };
  }
  if (tipo === 'semana') {
    const lunes = sumarDias(hoy, -((hoy.getDay() + 6) % 7) + desplazamiento * 7);
    const domingo = sumarDias(lunes, 6);
    const corto = (d) => `${d.getDate()} ${MESES[d.getMonth()].slice(0, 3)}`;
    const rango = `${corto(lunes)} – ${corto(domingo)}`;
    return {
      desde: claveDia(lunes),
      hasta: claveDia(domingo),
      etiqueta: desplazamiento === 0 ? `Esta semana (${rango})` : rango,
    };
  }
  if (tipo === 'mes') {
    const inicio = new Date(hoy.getFullYear(), hoy.getMonth() + desplazamiento, 1);
    const fin = new Date(inicio.getFullYear(), inicio.getMonth() + 1, 0);
    return {
      desde: claveDia(inicio),
      hasta: claveDia(fin),
      etiqueta: `${capitalizar(MESES[inicio.getMonth()])} ${inicio.getFullYear()}`,
    };
  }
  return { desde: '0000-00-00', hasta: '9999-99-99', etiqueta: 'Todo' };
}

const enRango = (m, r) => {
  const d = diaDe(m);
  return d >= r.desde && d <= r.hasta;
};

function calcularTotales(movs) {
  const t = { ingresos: 0, gastos: 0, domicilios: 0, ingresoDomicilios: 0, efectivo: 0 };
  for (const m of movs) {
    const valor = totalMov(m);
    if (m.tipo === 'ingreso') {
      t.ingresos += valor;
      if (m.metodo === 'efectivo') t.efectivo += valor;
      if (esDomicilio(m)) {
        t.domicilios += 1;
        t.ingresoDomicilios += valor;
      }
    } else {
      t.gastos += valor;
      if (m.metodo === 'efectivo') t.efectivo -= valor;
    }
  }
  t.neto = t.ingresos - t.gastos;
  return t;
}

/* =========================================================
   Render
   ========================================================= */
function itemMovimiento(m) {
  const li = document.createElement('li');
  const detalle = [m.fecha.slice(11), nombreMetodo(m.metodo), m.plataforma]
    .filter(Boolean)
    .map((d) => `<span>${esc(d)}</span>`)
    .join('');
  const signo = m.tipo === 'ingreso' ? '+' : '−';
  const extra = m.propina ? `<span class="mov-extra">con ${esc(pesos(m.propina))} de propina</span>` : '<span></span>';
  const nota = m.nota ? `<span class="mov-nota">${esc(m.nota)}</span>` : '';

  li.innerHTML = `
    <button type="button" class="mov-btn" data-id="${esc(m.id)}" aria-label="Editar ${esc(m.categoria)} de ${esc(pesos(totalMov(m)))}">
      <span class="mov-cat">${esc(m.categoria)}</span>
      <span class="mov-monto ${m.tipo}">${signo}${esc(pesos(totalMov(m)))}</span>
      <span class="mov-detalle">${detalle}</span>
      ${extra}
      ${nota}
    </button>`;
  return li;
}

function mensajeVacio(texto) {
  const div = document.createElement('div');
  div.className = 'vacio';
  div.textContent = texto;
  return div;
}

function renderEncabezado() {
  $('#fecha-hoy').textContent = new Date().toLocaleDateString('es-CO', {
    weekday: 'long', day: 'numeric', month: 'long',
  });
  const hora = new Date().getHours();
  let saludo = 'Buenas noches';
  if (hora < 12) saludo = 'Buenos días';
  else if (hora < 19) saludo = 'Buenas tardes';
  const nombre = estado.ajustes.nombre.trim();
  $('#saludo').textContent = nombre ? `${saludo}, ${nombre}` : saludo;
}

function renderInicio() {
  const movsHoy = estado.movimientos.filter((m) => enRango(m, calcularRango('hoy')));
  const t = calcularTotales(movsHoy);
  const meta = estado.ajustes.metaDiaria;

  $('#hoy-neto').textContent = pesos(t.neto);
  $('#hoy-neto').classList.toggle('neg', t.neto < 0);
  $('#hoy-ingresos').textContent = pesos(t.ingresos);
  $('#hoy-gastos').textContent = pesos(t.gastos);
  $('#hoy-domis').textContent = t.domicilios;
  $('#hoy-efectivo').textContent = pesos(t.efectivo);

  const barra = $('#meta-barra');
  if (meta > 0) {
    const pct = Math.min(100, Math.max(0, (t.neto / meta) * 100));
    $('#meta-progreso').style.width = `${pct}%`;
    barra.setAttribute('aria-valuenow', Math.round(pct));
    barra.classList.toggle('cumplida', t.neto >= meta);
    $('#meta-texto').textContent = t.neto >= meta
      ? `Cumpliste la meta de ${pesos(meta)}`
      : `Faltan ${pesos(meta - t.neto)} para la meta de ${pesos(meta)}`;
    barra.hidden = false;
  } else {
    barra.hidden = true;
    $('#meta-texto').textContent = 'Define una meta diaria en Ajustes.';
  }

  renderRegistroRapido();

  const lista = $('#lista-recientes');
  lista.replaceChildren();
  const recientes = ordenarRecientes(estado.movimientos).slice(0, 6);
  if (!recientes.length) {
    lista.append(mensajeVacio('Aquí van a aparecer tus domicilios y gastos.'));
  } else {
    recientes.forEach((m) => lista.append(itemMovimiento(m)));
  }
}

function renderRegistroRapido() {
  const { tarifas, tarifaElegida, metodoElegido } = estado.ajustes;
  const chips = $('#chips-tarifa');
  chips.replaceChildren(...tarifas.map((t) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.valor = String(t);
    b.textContent = formatoMiles(t);
    return b;
  }));
  activarSegmentado(chips, String(tarifaElegida));
  activarSegmentado($('#chips-metodo'), metodoElegido);
  $('#rapido-monto').textContent =
    `${pesos(tarifaElegida)} ${metodoElegido === 'efectivo' ? 'en efectivo' : 'por Nequi'}`;
}

const filtrosHistorial = { tipo: 'todos' };

function renderHistorial() {
  const rango = calcularRango($('#filtro-rango').value);
  const movs = ordenarRecientes(estado.movimientos.filter((m) =>
    enRango(m, rango) && (filtrosHistorial.tipo === 'todos' || m.tipo === filtrosHistorial.tipo)));

  const t = calcularTotales(movs);
  $('#historial-total').textContent = movs.length
    ? `${movs.length} ${movs.length === 1 ? 'movimiento' : 'movimientos'}, neto ${pesos(t.neto)}`
    : '';

  const contenedor = $('#lista-historial');
  contenedor.replaceChildren();
  if (!movs.length) {
    contenedor.append(mensajeVacio('No hay movimientos en este rango.'));
    return;
  }

  const porDia = new Map();
  movs.forEach((m) => {
    const dia = diaDe(m);
    if (!porDia.has(dia)) porDia.set(dia, []);
    porDia.get(dia).push(m);
  });

  porDia.forEach((lista, dia) => {
    const grupo = document.createElement('section');
    grupo.className = 'grupo-dia';
    const neto = calcularTotales(lista).neto;
    grupo.innerHTML = `
      <div class="grupo-cabecera">
        <strong>${esc(fechaLarga(dia))}</strong>
        <span class="${neto < 0 ? 'neg' : ''}">${esc(pesos(neto))}</span>
      </div>`;
    const ul = document.createElement('ul');
    ul.className = 'lista';
    lista.forEach((m) => ul.append(itemMovimiento(m)));
    grupo.append(ul);
    contenedor.append(grupo);
  });
}

const estadoResumen = { periodo: 'semana', desplazamiento: 0 };

function barrasHorizontales(mapa, clase) {
  const entradas = [...mapa.entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  if (!entradas.length) return '<div class="vacio">Sin datos en este periodo.</div>';
  const total = entradas.reduce((s, [, v]) => s + v, 0);
  return `<div class="barras-h">${entradas.map(([nombre, valor]) => {
    const pct = (valor / total) * 100;
    return `
      <div class="barra-h">
        <div class="barra-h-texto"><span>${esc(nombre)}</span><span>${esc(pesos(valor))} (${Math.round(pct)}%)</span></div>
        <div class="barra-h-pista ${clase}"><span style="width:${pct.toFixed(1)}%"></span></div>
      </div>`;
  }).join('')}</div>`;
}

function renderResumen() {
  const { periodo, desplazamiento } = estadoResumen;
  const rango = calcularRango(periodo, desplazamiento);
  const movs = estado.movimientos.filter((m) => enRango(m, rango));
  const t = calcularTotales(movs);

  $('#periodo-etiqueta').textContent = rango.etiqueta;
  $('#periodo-sig').disabled = desplazamiento >= 0;

  $('#res-ingresos').textContent = pesos(t.ingresos);
  $('#res-gastos').textContent = pesos(t.gastos);
  $('#res-neto').textContent = pesos(t.neto);
  $('#res-neto').classList.toggle('neg', t.neto < 0);
  $('#res-domis').textContent = t.domicilios;
  $('#res-promedio').textContent = t.domicilios ? pesos(t.ingresoDomicilios / t.domicilios) : '—';

  // Ganancia neta por día
  const netoPorDia = new Map();
  for (let d = aFecha(rango.desde); claveDia(d) <= rango.hasta; d = sumarDias(d, 1)) {
    netoPorDia.set(claveDia(d), 0);
  }
  movs.forEach((m) => {
    const dia = diaDe(m);
    netoPorDia.set(dia, netoPorDia.get(dia) + (m.tipo === 'ingreso' ? 1 : -1) * totalMov(m));
  });

  let mejor = null;
  netoPorDia.forEach((v, dia) => {
    if (v > 0 && (!mejor || v > mejor.valor)) mejor = { dia, valor: v };
  });
  $('#res-mejor').textContent = mejor
    ? `${capitalizar(fechaLarga(mejor.dia))}, ${pesos(mejor.valor)}`
    : '—';

  const maximo = Math.max(1, ...[...netoPorDia.values()].map(Math.abs));
  const etiquetaDia = (fecha) => {
    if (periodo === 'semana') return DIAS_CORTOS[fecha.getDay()];
    const n = fecha.getDate();
    return n === 1 || n % 5 === 0 ? n : '';
  };
  const entradas = [...netoPorDia.entries()];
  $('#grafica-dias').innerHTML = entradas.map(([dia, valor]) => {
    let clase = '';
    if (valor < 0) clase = 'negativa';
    else if (valor === 0) clase = 'vacia';
    const alto = valor === 0 ? 0 : Math.max(3, (Math.abs(valor) / maximo) * 100);
    return `
      <div class="barra-col" title="${esc(capitalizar(fechaLarga(dia)))}: ${esc(pesos(valor))}">
        <div class="barra ${clase}" style="height:${alto.toFixed(1)}%"></div>
      </div>`;
  }).join('');
  $('#grafica-etiquetas').innerHTML = entradas
    .map(([dia]) => `<span>${etiquetaDia(aFecha(dia))}</span>`)
    .join('');

  const gastosCat = new Map();
  const ingresosPlat = new Map();
  movs.forEach((m) => {
    if (m.tipo === 'gasto') {
      gastosCat.set(m.categoria, (gastosCat.get(m.categoria) || 0) + totalMov(m));
    } else {
      const plat = m.plataforma || 'Sin plataforma';
      ingresosPlat.set(plat, (ingresosPlat.get(plat) || 0) + totalMov(m));
    }
  });
  $('#gastos-categoria').innerHTML = barrasHorizontales(gastosCat, 'gasto');
  $('#ingresos-plataforma').innerHTML = barrasHorizontales(ingresosPlat, '');
}

function renderAjustes() {
  const f = $('#form-ajustes');
  const a = estado.ajustes;
  f.nombre.value = a.nombre;
  f.metaDiaria.value = formatoMiles(a.metaDiaria);
  f.tarifas.value = a.tarifas.map(formatoMiles).join(', ');
  f.plataformas.value = a.plataformas.join('\n');
}

function renderTodo() {
  renderEncabezado();
  renderInicio();
  renderHistorial();
  renderResumen();
}

/* =========================================================
   Navegación
   ========================================================= */
function irA(vista) {
  $$('.vista').forEach((s) => s.classList.toggle('activa', s.id === `vista-${vista}`));
  $$('.nav-inferior button').forEach((b) => {
    const activo = b.dataset.vista === vista;
    b.classList.toggle('activo', activo);
    if (activo) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  });
  if (vista === 'ajustes') renderAjustes();
  window.scrollTo({ top: 0 });
}

function activarSegmentado(contenedor, valor) {
  $$('button', contenedor).forEach((b) => {
    const activo = b.dataset.valor === valor;
    b.classList.toggle('activo', activo);
    b.setAttribute('aria-pressed', String(activo));
  });
}

/* =========================================================
   Formulario de movimiento
   ========================================================= */
const dialogo = $('#dlg-movimiento');
const formMov = $('#form-movimiento');
let editandoId = null;
let tipoFormulario = 'ingreso';

function llenarSelect(select, opciones, seleccionada) {
  select.replaceChildren(...opciones.map((op) => new Option(op, op, false, op === seleccionada)));
}

function cambiarTipoFormulario(tipo, categoria) {
  tipoFormulario = tipo;
  activarSegmentado($('#form-tipo'), tipo);
  const categorias = [...CATEGORIAS[tipo]];
  // Si la categoría (p. ej. de un respaldo viejo) no está en la lista, la agregamos para no perderla.
  if (categoria && !categorias.includes(categoria)) categorias.push(categoria);
  llenarSelect(formMov.categoria, categorias, categoria);
  const esIngreso = tipo === 'ingreso';
  $('#campo-propina').hidden = !esIngreso;
  $('#campo-plataforma').hidden = !esIngreso;
}

function abrirFormulario(tipo, mov = null) {
  editandoId = mov ? mov.id : null;
  $('#form-error').textContent = '';
  $('#dlg-titulo').textContent = mov ? 'Editar movimiento' : (tipo === 'gasto' ? 'Nuevo gasto' : 'Nuevo ingreso');
  $('#btn-eliminar').hidden = !mov;

  const tipoInicial = mov ? mov.tipo : tipo;
  cambiarTipoFormulario(tipoInicial, mov ? mov.categoria : CATEGORIAS[tipoInicial][0]);

  const plataformas = [...estado.ajustes.plataformas];
  if (mov?.plataforma && !plataformas.includes(mov.plataforma)) plataformas.push(mov.plataforma);
  llenarSelect(formMov.plataforma, plataformas, mov?.plataforma || plataformas[0]);

  formMov.monto.value = mov ? formatoMiles(mov.monto) : '';
  formMov.propina.value = mov ? formatoMiles(mov.propina) : '';
  formMov.metodo.value = mov ? mov.metodo : estado.ajustes.metodoElegido;
  formMov.fecha.value = mov ? mov.fecha : ahoraLocal();
  formMov.nota.value = mov ? mov.nota : '';

  dialogo.showModal();
  formMov.monto.focus();
}

function guardarFormulario(evento) {
  evento.preventDefault();
  const monto = aNumero(formMov.monto.value);
  const fecha = formMov.fecha.value;

  if (monto <= 0) {
    $('#form-error').textContent = 'Escribe un monto mayor a cero.';
    formMov.monto.focus();
    return;
  }
  if (!FECHA_VALIDA.test(fecha)) {
    $('#form-error').textContent = 'Revisa la fecha y la hora.';
    formMov.fecha.focus();
    return;
  }

  const esIngreso = tipoFormulario === 'ingreso';
  const mov = normalizarMovimiento({
    id: editandoId || nuevoId(),
    tipo: tipoFormulario,
    monto,
    propina: esIngreso ? aNumero(formMov.propina.value) : 0,
    categoria: formMov.categoria.value,
    plataforma: esIngreso ? formMov.plataforma.value : '',
    metodo: formMov.metodo.value,
    fecha,
    nota: formMov.nota.value.trim(),
  });

  const id = editandoId;
  cambiarMovimientos(() => {
    if (id) {
      estado.movimientos = estado.movimientos.map((m) => (m.id === id ? mov : m));
    } else {
      estado.movimientos.push(mov);
    }
  }, id ? 'Movimiento actualizado' : `${mov.tipo === 'ingreso' ? 'Ingreso' : 'Gasto'} de ${pesos(totalMov(mov))} guardado`);
  dialogo.close();
}

function eliminarActual() {
  const id = editandoId;
  if (!id) return;
  cambiarMovimientos(() => {
    estado.movimientos = estado.movimientos.filter((m) => m.id !== id);
  }, 'Movimiento eliminado');
  dialogo.close();
}

function domicilioRapido() {
  const a = estado.ajustes;
  const mov = normalizarMovimiento({
    id: nuevoId(),
    tipo: 'ingreso',
    monto: a.tarifaElegida,
    categoria: 'Domicilio',
    plataforma: a.plataformas[0] || '',
    metodo: a.metodoElegido,
    fecha: ahoraLocal(),
  });
  cambiarMovimientos(
    () => estado.movimientos.push(mov),
    `Domicilio de ${pesos(mov.monto)} (${nombreMetodo(mov.metodo)}) registrado`,
  );
}

/* =========================================================
   Respaldo
   ========================================================= */
function descargar(nombre, contenido, tipo) {
  const url = URL.createObjectURL(new Blob([contenido], { type: tipo }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportarJSON() {
  const datos = { app: 'billetera-domi', version: 1, exportado: new Date().toISOString(), ...estado };
  descargar(`billetera-domi-${claveDia(new Date())}.json`, JSON.stringify(datos, null, 2), 'application/json');
}

function exportarCSV() {
  const celda = (v) => {
    const s = String(v ?? '');
    // Evita que Excel interprete el texto como fórmula.
    const seguro = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
    return `"${seguro.replace(/"/g, '""')}"`;
  };
  const filas = [['Fecha', 'Hora', 'Tipo', 'Categoría', 'Plataforma', 'Método', 'Monto', 'Propina', 'Total', 'Nota']];
  [...estado.movimientos].sort((a, b) => a.fecha.localeCompare(b.fecha)).forEach((m) => {
    filas.push([
      diaDe(m), m.fecha.slice(11), m.tipo, m.categoria, m.plataforma, nombreMetodo(m.metodo),
      m.monto, m.propina, (m.tipo === 'gasto' ? -1 : 1) * totalMov(m), m.nota,
    ]);
  });
  // Excel en español usa ";" como separador. El BOM hace que respete las tildes.
  const csv = '﻿' + filas.map((f) => f.map(celda).join(';')).join('\r\n');
  descargar(`billetera-domi-${claveDia(new Date())}.csv`, csv, 'text/csv;charset=utf-8');
}

async function importarJSON(archivo) {
  try {
    const datos = JSON.parse(await archivo.text());
    if (!datos || !Array.isArray(datos.movimientos)) throw new Error('Formato no reconocido');
    const movimientos = datos.movimientos.map(normalizarMovimiento).filter(Boolean);
    const descartados = datos.movimientos.length - movimientos.length;
    const ok = confirm(
      `El respaldo tiene ${movimientos.length} movimiento(s)` +
      (descartados ? ` (${descartados} inválido(s) se ignorarán)` : '') +
      '.\n\nEsto REEMPLAZA los datos actuales de este dispositivo. ¿Continuar?');
    if (!ok) return;
    estado = { movimientos, ajustes: normalizarAjustes(datos.ajustes) };
    respaldoDeshacer = null;
    guardar();
    renderTodo();
    renderAjustes();
    mostrarToast('Respaldo importado');
  } catch (e) {
    console.error(e);
    mostrarToast('Ese archivo no es un respaldo de Billetera Domi');
  }
}

/* =========================================================
   Toast
   ========================================================= */
let temporizadorToast;
function mostrarToast(texto, conDeshacer = false) {
  $('#toast-texto').textContent = texto;
  $('#toast-deshacer').hidden = !conDeshacer;
  $('#toast').classList.add('visible');
  clearTimeout(temporizadorToast);
  temporizadorToast = setTimeout(() => $('#toast').classList.remove('visible'), conDeshacer ? 5000 : 2500);
}

/* =========================================================
   Eventos
   ========================================================= */
function iniciar() {
  // Navegación inferior
  $$('.nav-inferior button').forEach((b) => b.addEventListener('click', () => irA(b.dataset.vista)));

  // Botones de inicio
  $('#btn-rapido').addEventListener('click', domicilioRapido);

  // Elegir precio y método del registro rápido (se recuerda la última elección)
  $('#chips-tarifa').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    estado.ajustes.tarifaElegida = Number(b.dataset.valor);
    guardar();
    renderRegistroRapido();
  });
  $('#chips-metodo').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    estado.ajustes.metodoElegido = b.dataset.valor;
    guardar();
    renderRegistroRapido();
  });
  $$('[data-nuevo]').forEach((b) => b.addEventListener('click', () => abrirFormulario(b.dataset.nuevo)));

  // Abrir un movimiento para editarlo (delegación)
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.mov-btn');
    if (!btn) return;
    const mov = estado.movimientos.find((m) => m.id === btn.dataset.id);
    if (mov) abrirFormulario(mov.tipo, mov);
  });

  // Formulario
  formMov.addEventListener('submit', guardarFormulario);
  $('#btn-cancelar').addEventListener('click', () => dialogo.close());
  $('#btn-eliminar').addEventListener('click', eliminarActual);
  $$('#form-tipo button').forEach((b) => b.addEventListener('click', () => {
    cambiarTipoFormulario(b.dataset.valor, CATEGORIAS[b.dataset.valor][0]);
  }));
  dialogo.addEventListener('click', (e) => {
    if (e.target === dialogo) dialogo.close(); // clic en el fondo
  });

  // Formato de miles mientras se escribe
  document.addEventListener('input', (e) => {
    if (!e.target.classList.contains('input-dinero')) return;
    e.target.value = formatoMiles(aNumero(e.target.value));
  });

  // Filtros del historial
  $$('#filtro-tipo button').forEach((b) => b.addEventListener('click', () => {
    filtrosHistorial.tipo = b.dataset.valor;
    activarSegmentado($('#filtro-tipo'), b.dataset.valor);
    renderHistorial();
  }));
  $('#filtro-rango').addEventListener('change', renderHistorial);

  // Resumen
  $$('#resumen-periodo button').forEach((b) => b.addEventListener('click', () => {
    estadoResumen.periodo = b.dataset.valor;
    estadoResumen.desplazamiento = 0;
    activarSegmentado($('#resumen-periodo'), b.dataset.valor);
    renderResumen();
  }));
  $('#periodo-ant').addEventListener('click', () => { estadoResumen.desplazamiento -= 1; renderResumen(); });
  $('#periodo-sig').addEventListener('click', () => {
    estadoResumen.desplazamiento = Math.min(0, estadoResumen.desplazamiento + 1);
    renderResumen();
  });

  // Ajustes
  $('#form-ajustes').addEventListener('submit', (e) => {
    e.preventDefault();
    const f = e.target;
    estado.ajustes = normalizarAjustes({
      ...estado.ajustes,
      nombre: f.nombre.value.trim(),
      metaDiaria: aNumero(f.metaDiaria.value),
      tarifas: f.tarifas.value.split(/[,;\s]+/).map(aNumero),
      plataformas: f.plataformas.value.split(/[\n,]/),
    });
    guardar();
    renderTodo();
    renderAjustes();
    mostrarToast('Ajustes guardados');
  });

  $('#btn-exportar').addEventListener('click', exportarJSON);
  $('#btn-csv').addEventListener('click', exportarCSV);
  $('#input-importar').addEventListener('change', (e) => {
    const archivo = e.target.files[0];
    if (archivo) importarJSON(archivo);
    e.target.value = '';
  });
  $('#btn-borrar-todo').addEventListener('click', () => {
    if (!estado.movimientos.length) return mostrarToast('No hay movimientos para borrar');
    if (!confirm('¿Borrar TODOS los movimientos? Podrás deshacerlo solo durante unos segundos.')) return;
    cambiarMovimientos(() => { estado.movimientos = []; }, 'Movimientos borrados');
  });

  // Toast
  $('#toast-deshacer').addEventListener('click', () => {
    $('#toast').classList.remove('visible');
    deshacer();
  });

  // Si la app queda abierta y cambia el día, refrescamos al volver.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') renderTodo();
  });

  activarSegmentado($('#filtro-tipo'), 'todos');
  activarSegmentado($('#resumen-periodo'), 'semana');
  renderTodo();

  // Pide al navegador que no borre los datos aunque el celular necesite espacio.
  navigator.storage?.persist?.().catch(() => {});

  // Modo offline / instalable (solo funciona servida por http/https)
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('sw.js').catch((e) => console.warn('Service worker no registrado', e));
  }
}

iniciar();
