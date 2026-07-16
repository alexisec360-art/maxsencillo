/* ==========================================================
   ¿CONVIENE? — Lógica de comparación de precios unitarios
   ========================================================== */

const STORAGE_KEY = 'conviene_productos_v1';

/** Carga productos guardados (o arreglo vacío) */
function cargarProductos(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  }catch(e){
    return [];
  }
}

function guardarProductos(lista){
  localStorage.setItem(STORAGE_KEY, JSON.stringify(lista));
}

let productos = cargarProductos();

/* -----------------------------------------------------------
   1. NORMALIZACIÓN DE UNIDADES
   Todo se lleva a una unidad base:
     g, kg  -> gramos
     ml, l  -> mililitros
     un     -> unidades
   ----------------------------------------------------------- */
function grupoUnidad(unidad){
  if(unidad === 'g' || unidad === 'kg') return 'peso';
  if(unidad === 'ml' || unidad === 'l') return 'volumen';
  return 'cantidad';
}

function aCantidadBase(cantidad, unidad){
  switch(unidad){
    case 'kg': return cantidad * 1000;   // -> gramos
    case 'l':  return cantidad * 1000;   // -> mililitros
    default:   return cantidad;          // g, ml, un ya están en base
  }
}

const ETIQUETA_GRUPO = {
  peso:      { titulo: '⚖️ Por peso',    baseUnidad: 'g',  porCuanto: 100, sufijo: '100 g' },
  volumen:   { titulo: '💧 Por volumen', baseUnidad: 'ml', porCuanto: 100, sufijo: '100 ml' },
  cantidad:  { titulo: '🔢 Por unidad',  baseUnidad: 'un', porCuanto: 1,   sufijo: 'unidad' },
};

/* -----------------------------------------------------------
   2. LÓGICA DE OFERTAS
   Determina cuántas unidades del producto realmente te llevas
   y cuánto pagas en total por ellas.
   ----------------------------------------------------------- */
function resolverOferta(producto){
  const precio = producto.precio;
  let unidadesLlevadas = 1;
  let totalPagado = precio;

  switch(producto.oferta){
    case '2x1':
      unidadesLlevadas = 2;
      totalPagado = precio; // pagas 1, llevas 2
      break;
    case '3x2':
      unidadesLlevadas = 3;
      totalPagado = precio * 2; // pagas 2, llevas 3
      break;
    case 'descuento': {
      const d = Number(producto.valorDescuento) || 0;
      unidadesLlevadas = 1;
      totalPagado = precio * (1 - d / 100);
      break;
    }
    case 'segunda': {
      const s = Number(producto.valorSegunda) || 0;
      unidadesLlevadas = 2;
      totalPagado = precio * (1 + s / 100); // 1 normal + 2da a s%
      break;
    }
    default:
      unidadesLlevadas = 1;
      totalPagado = precio;
  }

  return { unidadesLlevadas, totalPagado };
}

/* -----------------------------------------------------------
   3. CÁLCULO DEL PRECIO UNITARIO NORMALIZADO
   ----------------------------------------------------------- */
function calcularProducto(producto){
  const { unidadesLlevadas, totalPagado } = resolverOferta(producto);
  const cantidadBaseUnitaria = aCantidadBase(producto.cantidad, producto.unidad);
  const cantidadTotalBase = cantidadBaseUnitaria * unidadesLlevadas;
  const precioPorUnidadBase = cantidadTotalBase > 0 ? totalPagado / cantidadTotalBase : Infinity;
  const grupo = grupoUnidad(producto.unidad);
  const cfg = ETIQUETA_GRUPO[grupo];
  const precioMostrado = precioPorUnidadBase * cfg.porCuanto;

  return {
    grupo,
    unidadesLlevadas,
    totalPagado,
    cantidadTotalBase,
    precioPorUnidadBase,
    precioMostrado, // precio por 100g / 100ml / unidad
  };
}

/* -----------------------------------------------------------
   4. FORMATEO
   ----------------------------------------------------------- */
const fmtCLP = new Intl.NumberFormat('es-CL', { style:'currency', currency:'CLP', maximumFractionDigits:0 });

function fmtPrecioUnitario(valor){
  // precios chicos necesitan decimales aunque CLP normalmente no los use
  if(valor >= 100) return fmtCLP.format(Math.round(valor));
  return '$' + valor.toLocaleString('es-CL', { minimumFractionDigits:1, maximumFractionDigits:2 });
}

function textoOferta(producto){
  switch(producto.oferta){
    case '2x1': return '2x1';
    case '3x2': return '3x2';
    case 'descuento': return `${producto.valorDescuento || 0}% dcto.`;
    case 'segunda': return `2ª unidad a ${producto.valorSegunda || 0}%`;
    default: return 'precio normal';
  }
}

function textoContenido(producto){
  const unidadLabel = { g:'g', kg:'kg', ml:'ml', l:'L', un:'un.' }[producto.unidad];
  return `${producto.cantidad} ${unidadLabel}`;
}

/* -----------------------------------------------------------
   5. RENDER
   ----------------------------------------------------------- */
function render(){
  guardarProductos(productos);
  renderLista();
  renderResumen();
}

function renderLista(){
  const slot = document.getElementById('lista-slot');

  if(productos.length === 0){
    slot.innerHTML = `<div class="empty">Tu lista está vacía.<br>Agrega al menos 2 productos del mismo tipo (peso, volumen o unidades) para comparar.</div>`;
    return;
  }

  // calcula y agrupa
  const calculados = productos.map(p => ({ p, c: calcularProducto(p) }));
  const grupos = { peso: [], volumen: [], cantidad: [] };
  calculados.forEach(item => grupos[item.c.grupo].push(item));

  let html = '';

  ['peso','volumen','cantidad'].forEach(grupoKey => {
    const items = grupos[grupoKey];
    if(items.length === 0) return;

    items.sort((a,b) => a.c.precioPorUnidadBase - b.c.precioPorUnidadBase);
    const mejorPrecio = items[0].c.precioPorUnidadBase;
    const cfg = ETIQUETA_GRUPO[grupoKey];

    html += `<div class="group">
      <div class="group-title">${cfg.titulo}</div>`;

    items.forEach(({p, c}, idx) => {
      const esGanador = items.length > 1 && c.precioPorUnidadBase === mejorPrecio;
      const ahorroVsPeor = items.length > 1
        ? Math.round((1 - c.precioPorUnidadBase / items[items.length-1].c.precioPorUnidadBase) * 100)
        : 0;

      html += `
        <div class="item ${esGanador ? 'winner' : ''}">
          <button class="item-del" data-id="${p.id}" title="Eliminar">×</button>
          <div class="item-top">
            <div>
              <div class="item-name">${escapeHtml(p.nombre)}</div>
              <div class="item-detail">${textoContenido(p)} · ${textoOferta(p)}${c.unidadesLlevadas > 1 ? ` · llevas ${c.unidadesLlevadas}` : ''} · pagas ${fmtCLP.format(Math.round(c.totalPagado))}</div>
              ${esGanador && items.length > 1 ? `<span class="stamp">★ TE CONVIENE${ahorroVsPeor > 0 ? ` · ahorras ${ahorroVsPeor}%` : ''}</span>` : ''}
            </div>
            <div class="item-price">${fmtPrecioUnitario(c.precioMostrado)}<small>por ${cfg.sufijo}</small></div>
          </div>
        </div>`;
    });

    html += `</div>`;
  });

  slot.innerHTML = html;

  slot.querySelectorAll('.item-del').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-id');
      productos = productos.filter(p => p.id !== id);
      render();
    });
  });
}

function renderResumen(){
  const slot = document.getElementById('summary-slot');
  const calculados = productos.map(p => ({ p, c: calcularProducto(p) }));
  const grupos = { peso: [], volumen: [], cantidad: [] };
  calculados.forEach(item => grupos[item.c.grupo].push(item));

  const frases = [];

  ['peso','volumen','cantidad'].forEach(grupoKey => {
    const items = grupos[grupoKey];
    if(items.length < 2) return;
    items.sort((a,b) => a.c.precioPorUnidadBase - b.c.precioPorUnidadBase);
    const mejor = items[0];
    const peor = items[items.length - 1];
    const cfg = ETIQUETA_GRUPO[grupoKey];
    const ahorroPct = Math.round((1 - mejor.c.precioPorUnidadBase / peor.c.precioPorUnidadBase) * 100);
    if(ahorroPct <= 0) return;
    frases.push(`<b>${escapeHtml(mejor.p.nombre)}</b> conviene más que <b>${escapeHtml(peor.p.nombre)}</b>: pagas ${ahorroPct}% menos por ${cfg.sufijo} (${fmtPrecioUnitario(mejor.c.precioMostrado)} vs ${fmtPrecioUnitario(peor.c.precioMostrado)}).`);
  });

  if(frases.length === 0){
    slot.innerHTML = '';
    return;
  }

  slot.innerHTML = `<div class="summary">${frases.join('<br><br>')}</div>`;
}

function escapeHtml(str){
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/* -----------------------------------------------------------
   6. FORMULARIO
   ----------------------------------------------------------- */
const form = document.getElementById('form-producto');
const selectOferta = document.getElementById('oferta');
const extraDescuento = document.getElementById('extra-descuento');
const extraSegunda = document.getElementById('extra-segunda');

selectOferta.addEventListener('change', actualizarCamposOferta);
function actualizarCamposOferta(){
  extraDescuento.classList.toggle('show', selectOferta.value === 'descuento');
  extraSegunda.classList.toggle('show', selectOferta.value === 'segunda');
}
actualizarCamposOferta();

form.addEventListener('submit', (e) => {
  e.preventDefault();

  const nombre = document.getElementById('nombre').value.trim();
  const precio = Number(document.getElementById('precio').value);
  const cantidad = Number(document.getElementById('cantidad').value);
  const unidad = document.getElementById('unidad').value;
  const oferta = selectOferta.value;
  const valorDescuento = Number(document.getElementById('valorDescuento').value) || 0;
  const valorSegunda = Number(document.getElementById('valorSegunda').value) || 0;

  if(!nombre || !(precio > 0) || !(cantidad > 0)){
    return;
  }

  productos.push({
    id: 'p_' + Date.now() + '_' + Math.random().toString(36).slice(2,7),
    nombre, precio, cantidad, unidad, oferta, valorDescuento, valorSegunda,
  });

  render();
  form.reset();
  document.getElementById('unidad').value = unidad; // conserva la última unidad usada
  actualizarCamposOferta();
  document.getElementById('nombre').focus();
});

document.getElementById('btn-clear').addEventListener('click', () => {
  if(productos.length === 0) return;
  if(confirm('¿Vaciar toda la lista de productos?')){
    productos = [];
    render();
  }
});

/* -----------------------------------------------------------
   7. INICIO
   ----------------------------------------------------------- */
render();
