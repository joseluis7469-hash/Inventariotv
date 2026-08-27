/* ============================================================
   INVENTARIO TV – Hotel Hesperia Playa El Agua
   app.js – Lógica principal
   ============================================================ */

// ─── STORAGE ────────────────────────────────────────────────
const DB_TVS  = 'hpa_tvs';
const DB_MOVS = 'hpa_movimientos';

// Funciones de carga que filtran registros eliminados lógicamente
// Por defecto nadie ve los eliminados. El admin puede activar "Ver eliminados".
function loadTVs()   {
  const tvs = window.appData.tvs || [];
  if (isAdmin() && window.mostrarEliminados) return tvs;
  return tvs.filter(t => !t.deleted);
}
function loadMovs()  {
  const movs = window.appData.movimientos || [];
  if (isAdmin() && window.mostrarEliminados) return movs;
  return movs.filter(m => !m.deleted);
}
// Función para admin que carga todos (incluyendo eliminados)
function loadAllTVs()  { return window.appData.tvs || []; }
function loadAllMovs() { return window.appData.movimientos || []; }

let currentImgFile = null;

// ─── NAVEGACIÓN ─────────────────────────────────────────────
const pageTitles = {
  dashboard:    'Panel',
  inventario:   'Inventario de TVs',
  movimientos:  'Registrar Movimiento',
  historial:    'Historial Global',
  'nuevo-tv':   'Registrar TV'
};

function showPage(id) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const page = document.getElementById('page-' + id);
  if (page) page.classList.add('active');
  const nav = document.getElementById('nav-' + id);
  if (nav) nav.classList.add('active');
  document.getElementById('pageTitle').textContent = pageTitles[id] || id;

  // Habilitar/deshabilitar botón Gestión de Usuarios según la página activa
  const navUsuarios = document.getElementById('nav-usuarios');
  if (navUsuarios) {
    if (id === 'dashboard') {
      navUsuarios.classList.remove('disabled');
      navUsuarios.style.pointerEvents = '';
      navUsuarios.style.opacity = '';
    } else {
      navUsuarios.classList.add('disabled');
      navUsuarios.style.pointerEvents = 'none';
      navUsuarios.style.opacity = '0.4';
    }
  }

  // Mostrar/ocultar herramientas de admin en el inventario según permisos
  const adminInvTools = document.getElementById('adminInvTools');
  if (adminInvTools) {
    adminInvTools.style.display = hasPermission('eliminar_base_datos') ? 'flex' : 'none';
  }

  // Limpiar campo de búsqueda al mostrar la página de inventario
  if (id === 'inventario') {
    const searchInput = document.getElementById('searchInventario');
    if (searchInput) {
      searchInput.value = '';
      applyInventarioFilters();
    }
  }

  if (id === 'dashboard')   renderDashboard();
  if (id === 'inventario')  renderInventario();
  if (id === 'historial')   renderHistorial();
  if (id === 'movimientos') {
    populateMovTV();
    setTimeout(() => {
      const firstBtn = document.querySelector('.mov-tipo-btn');
      if (firstBtn) firstBtn.focus();
    }, 200);
  }
  if (id === 'asignar-tv')  renderAsignarTVPage();
  if (id === 'nuevo-tv' && !document.getElementById('tvId').value) resetFormTV();

  // Cerrar sidebar en móvil
  if (window.innerWidth <= 768) {
    document.getElementById('sidebar').classList.remove('open');
  }
}

document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', e => {
    // Si el enlace tiene un href real (no "#"), permitir la navegación normal
    if (item.getAttribute('href') && item.getAttribute('href') !== '#') {
      return; // No prevenir el comportamiento por defecto
    }
    e.preventDefault();
    showPage(item.dataset.page);
  });
});

// Navegación por teclado en el menú lateral
document.addEventListener('keydown', e => {
  // Ignorar si el usuario está escribiendo en un formulario
  if (document.activeElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) return;
  // Ignorar si el foco está en una fila de tabla (navegación propia de la tabla)
  if (document.activeElement && document.activeElement.tagName === 'TR' && document.activeElement.hasAttribute('tabindex')) return;
  // Ignorar si el foco está en una tarjeta de tipo de movimiento (navegación propia)
  if (document.activeElement && document.activeElement.classList.contains('mov-tipo-btn')) return;

  const navItems = Array.from(document.querySelectorAll('.nav-item'));
  if (!navItems.length) return;

  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    
    let currentIdx = navItems.indexOf(document.activeElement);
    if (currentIdx === -1) {
      currentIdx = navItems.findIndex(n => n.classList.contains('active'));
      if (currentIdx === -1) currentIdx = 0;
      else if (e.key === 'ArrowDown') currentIdx = (currentIdx + 1) % navItems.length;
      else currentIdx = (currentIdx - 1 + navItems.length) % navItems.length;
    } else {
      if (e.key === 'ArrowDown') {
        currentIdx = (currentIdx + 1) % navItems.length;
      } else {
        currentIdx = (currentIdx - 1 + navItems.length) % navItems.length;
      }
    }
    navItems[currentIdx].focus();
  }
  // 'Enter' is handled natively when the <a> element is focused
});

document.getElementById('sidebarToggle').addEventListener('click', () => {
  const sb = document.getElementById('sidebar');
  if (window.innerWidth <= 768) {
    sb.classList.toggle('open');
  } else {
    sb.classList.toggle('collapsed');
    document.querySelector('.main-wrapper').classList.toggle('expanded');
  }
});

// ─── FECHA ACTUAL ────────────────────────────────────────────
function updateDate() {
  const now = new Date();
  document.getElementById('currentDate').textContent =
    now.toLocaleDateString('es-VE', { weekday:'short', day:'2-digit', month:'short', year:'numeric' });
}
updateDate();
setInterval(updateDate, 60000);

// ─── HELPERS ────────────────────────────────────────────────
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

function fmtDate(iso) {
  if (!iso) return '—';
  if (iso === 'desconocida') return 'Fecha y hora desconocida';
  const d = new Date(iso);
  return d.toLocaleString('es-VE', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });
}
function fmtDateOnly(iso) {
  if (!iso) return '—';
  if (iso === 'desconocida') return 'Fecha desconocida';
  // Treat "00" or dates starting with "00" as unknown
  const trimmed = iso.trim();
  if (trimmed === '00' || trimmed.startsWith('00/')) {
    return 'Fecha desconocida';
  }
  // Accept both ISO (yyyy-mm-dd) and DD/MM/YYYY formats
  if (trimmed.includes('/')) return trimmed; // already in desired format
  const parts = trimmed.split('-');
  if (parts.length === 3) {
    const [y, m, d] = parts;
    return `${d}/${m}/${y}`;
  }
  return trimmed;
}

const tipoLabel = {
  traslado_hab:   '🔀 Traslado habitación',
  entrada_taller: '🔧 Enviado a taller',
  baja:           '❌ Dado de baja',
  otro:           '📝 Otro',
  tv_creado:      '➕ TV registrado',
  tv_editado:     '✏️ TV editado',
  tv_eliminado:   '🗑️ TV eliminado (oculto)',
  tv_eliminado_fisico: '💀 TV eliminado (físico)',
  tv_serial:      '🔑 Serial modificado',
  tv_asignado:    '🏨 TV asignado',
  acta_eliminada: '📄 Acta eliminada',
  bd_reseteada:   '💣 Base de datos reiniciada'
};

const estadoBadge = {
  activo:   '<span class="badge badge-activo">✅ En Habitación</span>',
  taller:   '<span class="badge badge-taller">🔧 En Taller</span>',
  traslado: '<span class="badge badge-traslado">🔀 En Traslado</span>',
  baja:     '<span class="badge badge-baja">❌ Dado de Baja</span>',
  operativo:   '<span class="badge badge-activo">✅ Operativo</span>',
  inoperativo: '<span class="badge badge-baja">❌ Inoperativo</span>'
};

function showToast(msg, type = 'success', duration = 3200) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast ' + type + ' show';
  setTimeout(() => { t.className = 'toast'; }, duration);
}

function showAlertaHabitacion(hab, tv) {
  document.getElementById('alertaHabNum').textContent = hab;
  document.getElementById('alertaHabCodigo').textContent = tv.codigo || '—';
  document.getElementById('alertaHabMarca').textContent = `${tv.marca || '—'} ${tv.modelo || ''}`.trim();
  document.getElementById('alertaHabSerial').textContent = tv.serial || '—';
  openModal('modalAlertaHab');
}

let _reubicarTvData = null;
let _reubicarSeleccion = null;
let _reubicarCallback = null;

function mostrarModalReubicarTV(tv, hab, callback) {
  _reubicarTvData = { tv, hab };
  _reubicarSeleccion = null;
  _reubicarCallback = callback;
  document.getElementById('reubicarTVInfo').innerHTML = `⚠️ La habitación <strong>${hab}</strong> ya tiene el TV [<strong>${tv.codigo}</strong>] ${tv.marca} ${tv.modelo || ''}.`;
  document.getElementById('reubicarOtroGroup').style.display = 'none';
  document.getElementById('reubicarOtroInput').value = '';
  const estadoGroup = document.getElementById('reubicarEstadoGroup');
  if (estadoGroup) estadoGroup.style.display = 'none';
  const estadoSel = document.getElementById('reubicarEstado');
  if (estadoSel) estadoSel.value = 'inoperativo';
  const btnConfirm = document.getElementById('btnConfirmarReubicacion');
  if (btnConfirm) btnConfirm.disabled = true;
  document.querySelectorAll('.reubicar-btn').forEach(b => b.style.borderColor = '');
  openModal('modalReubicarTV');
}

function seleccionarReubicacion(tipo) {
  _reubicarSeleccion = tipo;
  document.querySelectorAll('.reubicar-btn').forEach(b => b.style.borderColor = '');
  event.currentTarget.style.borderColor = 'var(--accent)';
  const otroGroup = document.getElementById('reubicarOtroGroup');
  const estadoGroup = document.getElementById('reubicarEstadoGroup');
  if (tipo === 'otro') {
    otroGroup.style.display = '';
    document.getElementById('reubicarOtroInput').focus();
  } else {
    otroGroup.style.display = 'none';
  }
  if (estadoGroup) estadoGroup.style.display = '';
  const estadoSel = document.getElementById('reubicarEstado');
  if (estadoSel) estadoSel.value = 'inoperativo';
  const btnConfirm = document.getElementById('btnConfirmarReubicacion');
  if (btnConfirm) btnConfirm.disabled = false;
}

function confirmarReubicacion() {
  if (!_reubicarSeleccion || !_reubicarTvData) return;
  let destino = _reubicarSeleccion;
  let destinoLabel = '';
  if (destino === 'taller') {
    destinoLabel = 'Taller';
  } else if (destino === 'almacen') {
    destinoLabel = 'Almacén';
  } else if (destino === 'baja') {
    destinoLabel = 'Baja';
  } else if (destino === 'otro') {
    destino = document.getElementById('reubicarOtroInput').value.trim();
    if (!destino) {
      showToast('Especifica el destino del TV.', 'error');
      return;
    }
    destinoLabel = destino;
  }

  const estadoSel = document.getElementById('reubicarEstado');
  const estado = estadoSel ? estadoSel.value : 'activo';

  const tv = _reubicarTvData.tv;
  document.getElementById('tvSalienteInfo').textContent = `${tv.codigo} — ${tv.marca} ${tv.serial || ''}`.trim();
  document.getElementById('tvSalienteDestino').textContent = destinoLabel;
  
  let estadoLabel;
  if (estado === 'operativo') {
    const estadoDestinoMap = {
      taller: 'Operativo - En Taller',
      almacen: 'Operativo - En Almacén',
      baja: 'Operativo - Dado de Baja',
      otro: `Operativo - ${destinoLabel}`
    };
    estadoLabel = estadoDestinoMap[_reubicarSeleccion] || `Operativo - ${destinoLabel}`;
  } else {
    const estadoDestinoMap = {
      taller: 'Inoperativo para revisión - En Taller',
      almacen: 'Inoperativo para revisión - En Almacén',
      baja: 'Inoperativo para revisión - Dado de Baja',
      otro: `Inoperativo para revisión - ${destinoLabel}`
    };
    estadoLabel = estadoDestinoMap[_reubicarSeleccion] || `Inoperativo para revisión - ${destinoLabel}`;
  }
  document.getElementById('tvSalienteEstado').textContent = estadoLabel;
  const grp = document.getElementById('grpMovTvSaliente');
  if (grp) grp.style.display = '';

  closeModal('modalReubicarTV');
  if (_reubicarCallback) {
    _reubicarCallback(_reubicarTvData.tv, _reubicarSeleccion, destino, estado);
    _reubicarCallback = null;
  }
}

function cancelarReubicarTV() {
  window._tvReemplazo = null;
  const habInput = document.getElementById('movDestinoHab');
  closeModal('modalReubicarTV');
  if (habInput) { habInput.value = ''; habInput.focus(); }
  _reubicarTvData = null;
  _reubicarSeleccion = null;
  _reubicarCallback = null;
}

let _nuevaAreaCallback = null;

function mostrarModalNuevaArea(callback) {
  _nuevaAreaCallback = callback;
  const input = document.getElementById('inputNuevaArea');
  if (input) {
    input.value = '';
    openModal('modalNuevaArea', '#inputNuevaArea');
  }
}

function confirmarNuevaArea() {
  const input = document.getElementById('inputNuevaArea');
  const valor = input ? input.value.trim() : '';
  if (!valor) {
    showToast('Ingresa un nombre para el área.', 'error');
    return;
  }
  const areasFijas = ['Premium 68', 'Premium 69', 'Anillo 1', 'Anillo 2', 'Anillo 3'];
  const custom = loadAreas();
  const todas = [...areasFijas, ...custom];
  const existe = todas.some(a => a.toLowerCase() === valor.toLowerCase());
  if (existe) {
    showToast(`El área "${valor}" ya existe.`, 'error');
    return;
  }
  custom.push(valor);
  saveAreas(custom);
  closeModal('modalNuevaArea');
  if (_nuevaAreaCallback) {
    _nuevaAreaCallback(valor);
    _nuevaAreaCallback = null;
  }
}

function cancelarNuevaArea() {
  closeModal('modalNuevaArea');
  _nuevaAreaCallback = null;
}

let _lastFocusedElement = null;

function openModal(id, focusSelector) {
  _lastFocusedElement = document.activeElement;
  document.getElementById(id).classList.add('open');
  const modal = document.getElementById(id);
  if (focusSelector) {
    const target = modal.querySelector(focusSelector);
    if (target) { setTimeout(() => target.focus(), 60); return; }
  }
  const firstFocusable = modal.querySelector('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
  if (firstFocusable) setTimeout(() => firstFocusable.focus(), 100);
}

function closeModal(id) { 
  document.getElementById(id).classList.remove('open'); 
  if (id === 'modalZoom') {
    const img = document.getElementById('zoomImgSource');
    if (img) {
      img.style.transition = 'transform 0.3s cubic-bezier(.4,0,.2,1)';
      img.style.transform = 'scale(0.95)';
    }
  }
  if (_lastFocusedElement) { _lastFocusedElement.focus(); _lastFocusedElement = null; }
}

let currentZoomScale = 1;
let translateX = 0;
let translateY = 0;
let isDragging = false;
let startX = 0;
let startY = 0;

function updateZoomTransform() {
  const img = document.getElementById('zoomImgSource');
  if (img) {
    img.style.transform = `translate(${translateX}px, ${translateY}px) scale(${currentZoomScale})`;
  }
}

function zoomImagen(src, title) {
  if (!src) {
    showToast('Este televisor no tiene esta imagen registrada.', 'info');
    return;
  }
  const modal = document.getElementById('modalZoom');
  const img = document.getElementById('zoomImgSource');
  const titleEl = document.getElementById('zoomImgTitle');
  
  img.src = src;
  titleEl.textContent = title;
  img.style.transition = 'transform 0.3s cubic-bezier(.4,0,.2,1)';
  
  openModal('modalZoom');
  
  currentZoomScale = 1;
  translateX = 0;
  translateY = 0;
  setTimeout(() => {
    updateZoomTransform();
    setTimeout(() => {
      if (img) img.style.transition = 'none';
    }, 300);
  }, 50);
}

const zoomImg = document.getElementById('zoomImgSource');
if (zoomImg) {
  zoomImg.addEventListener('wheel', function(e) {
    e.preventDefault();
    const zoomFactor = 0.1;
    if (e.deltaY < 0) {
      currentZoomScale += zoomFactor;
    } else {
      currentZoomScale -= zoomFactor;
    }
    if (currentZoomScale < 0.5) currentZoomScale = 0.5;
    if (currentZoomScale > 8) currentZoomScale = 8;
    updateZoomTransform();
  });

  zoomImg.addEventListener('mousedown', function(e) {
    e.preventDefault();
    isDragging = true;
    startX = e.clientX - translateX;
    startY = e.clientY - translateY;
    this.style.cursor = 'grabbing';
  });

  window.addEventListener('mousemove', function(e) {
    if (!isDragging) return;
    translateX = e.clientX - startX;
    translateY = e.clientY - startY;
    updateZoomTransform();
  });

  window.addEventListener('mouseup', function() {
    if (isDragging) {
      isDragging = false;
      if (zoomImg) zoomImg.style.cursor = 'grab';
    }
  });

  zoomImg.style.cursor = 'grab';

  // Zoom con teclado: +/- para zoom, flechas para mover
  document.addEventListener('keydown', function(e) {
    const modal = document.getElementById('modalZoom');
    if (!modal || !modal.classList.contains('open')) return;
    const step = 0.3;
    if (e.key === '+' || e.key === '=') { e.preventDefault(); currentZoomScale = Math.min(8, currentZoomScale + step); updateZoomTransform(); }
    else if (e.key === '-' || e.key === '_') { e.preventDefault(); currentZoomScale = Math.max(0.5, currentZoomScale - step); updateZoomTransform(); }
    else if (e.key === 'ArrowLeft')  { e.preventDefault(); translateX -= 30; updateZoomTransform(); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); translateX += 30; updateZoomTransform(); }
    else if (e.key === 'ArrowUp')    { e.preventDefault(); translateY -= 30; updateZoomTransform(); }
    else if (e.key === 'ArrowDown')  { e.preventDefault(); translateY += 30; updateZoomTransform(); }
    else if (e.key === '0') { e.preventDefault(); currentZoomScale = 1; translateX = 0; translateY = 0; updateZoomTransform(); }
  });
}

function adjustMovDestinoHabWidth() {
  const input = document.getElementById('movDestinoHab');
  if (input) {
    const val = input.value || input.placeholder || '';
    input.style.width = `${Math.max(val.length + 2, 8)}ch`;
  }
}

// Cerrar modales al click fuera
document.querySelectorAll('.modal-overlay').forEach(o => {
  o.addEventListener('click', e => { if (e.target === o) o.classList.remove('open'); });
});

// Cerrar modales con tecla Escape
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    const active = document.activeElement;
    const isOpenModal = document.querySelector('.modal-overlay.open');
    if (isOpenModal) {
      isOpenModal.classList.remove('open');
      if (isOpenModal.id === 'modalZoom') {
        const img = document.getElementById('zoomImgSource');
        if (img) { img.style.transition = 'transform 0.3s'; img.style.transform = 'scale(0.95)'; }
      }
      if (_lastFocusedElement) { _lastFocusedElement.focus(); _lastFocusedElement = null; }
      return;
    }
    if (active && ['INPUT', 'TEXTAREA'].includes(active.tagName) && !active.readOnly && !active.disabled) {
      e.preventDefault();
      active.value = '';
      active.dispatchEvent(new Event('input', { bubbles: true }));
      return;
    }
    const searchInput = document.getElementById('searchInventario');
    if (searchInput) {
      searchInput.value = '';
      applyInventarioFilters();
    }
  }
});

// ─── BÚSQUEDA INVENTARIO ─────────────────────────────────────────
// El campo de búsqueda mantiene el texto mientras escribe.
// Los filtros se aplican automáticamente cada vez que se escribe un carácter.
// El campo se limpia al presionar Escape (mientras tiene foco) o al navegar a la página de Inventario.

document.getElementById('searchInventario').addEventListener('input', applyInventarioFilters);

// ─── DASHBOARD ───────────────────────────────────────────────
function renderDashboard() {
  const tvs  = loadTVs();
  const movs = loadMovs();

  document.getElementById('stat-total').textContent   = tvs.length;
  document.getElementById('stat-activos').textContent = tvs.filter(t => t.estado === 'activo').length;
  document.getElementById('stat-taller').textContent  = tvs.filter(t => t.estado === 'taller').length;
  document.getElementById('stat-baja').textContent    = tvs.filter(t => t.estado === 'baja').length;

  const sinTV = getHabitacionesSinTV();
  document.getElementById('stat-sintv').textContent = sinTV.length;

  // Últimos movimientos (ordenados por momento real de creación, en caliente)
  const elMov = document.getElementById('dash-movimientos');
  const recientes = [...movs].sort((a, b) => {
    const fa = (a.creadoEn || a.fecha || '');
    const fb = (b.creadoEn || b.fecha || '');
    const aDesconocida = !fa || fa.includes('desconocida') || fa.includes('0001') || fa.includes('0000');
    const bDesconocida = !fb || fb.includes('desconocida') || fb.includes('0001') || fb.includes('0000');
    if (aDesconocida && bDesconocida) return 0;
    if (aDesconocida) return 1;
    if (bDesconocida) return -1;
    return fb.localeCompare(fa);
  }).slice(0, 20);
  if (!recientes.length) {
    elMov.innerHTML = '<p class="empty-state">No hay movimientos registrados aún.</p>';
  } else {
    elMov.innerHTML = '<ul class="mini-list">' + recientes.map(m => {
      const tv = tvs.find(t => String(t.id) === String(m.tvId));
      const hasActa = tv && (m.actaUrl || m.tipo);
      const actaIcon = hasActa ? `<span class="ml-acta-icon" title="Ver acta" style="cursor:pointer; margin-left:6px; font-size:0.85rem; opacity:0.7;" onclick="event.stopPropagation(); openActaFromMov(event, '${m.id}')">📄</span>` : '';
      return `<li tabindex="0" data-tvid="${m.tvId || ''}">
        <div class="ml-left">
          <span class="ml-code">${tv ? tv.codigo : m.tvId}</span>
          <span class="ml-desc-row"><span class="ml-desc">${tipoLabel[m.tipo] || m.tipo}</span>${actaIcon}</span>
        </div>
        <span class="ml-date">${fmtDate(m.fecha)}</span>
      </li>`;
    }).join('') + '</ul>';
  }

  // TVs en taller
  const elTaller = document.getElementById('dash-taller');
  const enTaller = tvs.filter(t => t.estado === 'taller');
  const enTallerOrdenado = enTaller.sort((a, b) => {
    const movA = movs.filter(m => String(m.tvId) === String(a.id));
    const movB = movs.filter(m => String(m.tvId) === String(b.id));
    const fechaA = movA.length ? movA[movA.length - 1].fecha : '';
    const fechaB = movB.length ? movB[movB.length - 1].fecha : '';
    return fechaB.localeCompare(fechaA);
  });
  if (!enTallerOrdenado.length) {
    elTaller.innerHTML = '<p class="empty-state">Ningún TV en taller actualmente.</p>';
  } else {
    elTaller.innerHTML = '<ul class="mini-list">' + enTallerOrdenado.map(t => {
      const movsTv = movs.filter(m => String(m.tvId) === String(t.id));
      const ultimoMov = movsTv.length ? movsTv[movsTv.length - 1] : null;
      const actaIcon = ultimoMov ? `<span class="ml-acta-icon" title="Ver acta" style="cursor:pointer; margin-left:6px; font-size:0.85rem; opacity:0.7;" onclick="event.stopPropagation(); openActaFromMov(event, '${ultimoMov.id}')">📄</span>` : '';
      return `<li tabindex="0" data-tvid="${t.id}">
        <div class="ml-left">
          <span class="ml-code">${t.codigo}</span>
          <span class="ml-desc-row"><span class="ml-desc">${t.marca} ${t.modelo} – Hab. ${t.habitacion}</span>${actaIcon}</span>
        </div>
      </li>`;
    }).join('') + '</ul>';
  }

  document.querySelectorAll('#dash-movimientos .mini-list li').forEach(li => {
    li.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const tvId = li.dataset.tvid;
        if (tvId) verDetalle(tvId);
      }
    });
  });

  document.querySelectorAll('#dash-taller .mini-list li').forEach(li => {
    li.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const tvId = li.dataset.tvid;
        if (tvId) verDetalle(tvId);
      }
    });
  });
}

// ─── INVENTARIO ──────────────────────────────────────────────
function renderInventario(filtroEstado = '', filtroUbicacion = '', busqueda = '') {
  let tvs = loadTVs();

  if (filtroEstado) tvs = tvs.filter(t => t.estado === filtroEstado);
  if (filtroUbicacion) tvs = tvs.filter(t => t.ubicacion === filtroUbicacion);
  if (busqueda) {
    const q = busqueda.toLowerCase();
    tvs = tvs.filter(t =>
      [t.codigo, t.ubicacion, t.habitacion, t.marca, t.modelo, t.serial]
        .some(v => v && v.toLowerCase().includes(q))
    );
  }

  const tbody = document.getElementById('inventarioBody');
  if (!tvs.length) {
    tbody.innerHTML = '<tr><td colspan="8" class="empty-state">No se encontraron TVs.</td></tr>';
    return;
  }

  tbody.innerHTML = tvs.map(t => `
    <tr tabindex="0" ondblclick="verDetalle('${t.id}')" data-id="${t.id}" style="${t.deleted ? 'background:rgba(255,77,109,0.06);' : ''}">
      <td><strong style="color:var(--accent)">${t.codigo}</strong>${t.deleted ? '<span style="margin-left:4px; font-size:0.65rem; background:rgba(255,77,109,0.2); color:#ff4d6d; border:1px solid rgba(255,77,109,0.4); border-radius:4px; padding:1px 5px;">ELIMINADO</span>' : ''}</td>
      <td>${t.ubicacion === 'Habitacion' ? t.habitacion : (t.ubicacion || '—')}</td>
      <td>${t.marca}</td>
      <td>${t.modelo}</td>
      <td>${t.tamano || '—'}</td>
      <td style="font-size:0.78rem;color:var(--text-secondary)">${t.serial}</td>
      <td style="font-size:0.78rem">${fmtDateOnly(t.fechaIngreso)}</td>
      <td>
        <div class="actions-cell">
          <button class="btn btn-assign btn-sm" title="Asignar a habitación" onclick="abrirAsignarHabitacion('${t.id}')" ${(t.ubicacion === 'Habitacion' || (t.ubicacion || '').toLowerCase() === 'taller') ? 'disabled style="opacity:0.5;cursor:not-allowed;"' : ''}>🏨 Asignar</button>
          <button class="btn btn-secondary btn-sm" onclick="editarTV('${t.id}')" title="Editar datos del TV">✏️ Editar</button>
          ${hasPermission('cambiar_serial') ? `<button class="btn btn-secondary btn-sm" onclick="abrirCambioSerial('${t.id}')" title="Modificar serial del TV" style="background:rgba(179,110,255,0.15); border-color:rgba(179,110,255,0.4); color:#b36eff;">🔑 Serial</button>` : ''}
          <button class="btn btn-danger btn-sm" onclick="confirmarEliminar('${t.id}')" title="Ocultar registro">🗑️ Eliminar</button>
          ${hasPermission('eliminar_fisico_tv') ? `<button class="btn btn-danger btn-sm" onclick="confirmarEliminacionFisica('${t.id}')" title="Eliminar permanentemente de la BD" style="background:rgba(255,77,109,0.2); border-color:rgba(255,77,109,0.5);">💀 Borrar</button>` : ''}
        </div>
      </td>
    </tr>
  `).join('');

  // Add keyboard navigation and click-selection for rows
  const rows = document.querySelectorAll('#inventarioBody tr');

  function selectRow(row) {
    rows.forEach(r => r.classList.remove('tr-selected'));
    row.classList.add('tr-selected');
    row.focus();
  }

  rows.forEach((row, idx) => {
    // Selección por click
    row.addEventListener('click', () => selectRow(row));

    row.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const next = rows[idx + 1] || rows[0];
        selectRow(next);
        next.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const prev = rows[idx - 1] || rows[rows.length - 1];
        selectRow(prev);
        prev.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (row.dataset.id) verDetalle(row.dataset.id);
      } else if (e.key === 'Delete') {
        e.preventDefault();
        const delBtn = row.querySelector('button[title="Eliminar este TV"]');
        if (delBtn) delBtn.click();
      } else if (e.key === 'Escape') {
        rows.forEach(r => r.classList.remove('tr-selected'));
        row.blur();
      }
    });
  });
  // Auto-select and focus first row for immediate keyboard navigation
  // (no robar el foco si el usuario está escribiendo en un campo de búsqueda/filtro)
  const activeEl = document.activeElement;
  const escribiendo = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'SELECT' || activeEl.tagName === 'TEXTAREA');
  if (rows.length && !escribiendo) selectRow(rows[0]);
}

// Filtros de inventario
document.getElementById('searchInventario').addEventListener('input', applyInventarioFilters);
document.getElementById('filterEstado').addEventListener('change', applyInventarioFilters);
const filterUbicacion = document.getElementById('filterUbicacion');
if (filterUbicacion) {
  filterUbicacion.addEventListener('change', applyInventarioFilters);
}

function applyInventarioFilters() {
  renderInventario(
    document.getElementById('filterEstado').value,
    filterUbicacion ? filterUbicacion.value : '',
    document.getElementById('searchInventario').value
  );
}

// ─── VER DETALLE ─────────────────────────────────────────────
function verDetalle(id) {
  const tvs  = loadTVs();
  const movs = loadMovs();
  const tv   = tvs.find(t => String(t.id) === String(id));
  if (!tv) return;

  const historial = movs.filter(m => String(m.tvId) === String(id))
    .sort((a,b) => b.fecha.localeCompare(a.fecha));

  document.getElementById('modalDetalleTitle').textContent = '📺 Control de TV – Hesperia Playa El Agua';

  const ubiMostrar = tv.ubicacion === 'Habitacion'
    ? (tv.habitacion || tv.piso || 'Habitación')
    : (tv.ubicacion || '—');

  const fields = [
    ['Código',         tv.codigo || '—'],
    ['Marca',          tv.marca || '—'],
    ['Modelo',         tv.modelo || '—'],
    ['Serial',         tv.serial || '—'],
    ['Tamaño',         tv.tamano || '—'],
    ['Tipo Panel',     tv.tipo || '—'],
    ['Resolución',     tv.resolucion || '—'],
    ['Smart TV',       tv.smarttv === 'si' ? 'Sí' : 'No'],
    ['Ubicación',      ubiMostrar],
    ['Estado',         tv.estado],
    ['Observaciones',  tv.observaciones || '—'],
  ];

  const imgsHTML = `
    <div class="detail-images-section">
      <h4>📷 Foto de Etiqueta (Trasera) <span style="font-size:0.75rem;font-weight:normal;color:var(--text-secondary);margin-left:8px;">(Doble clic en la imagen para ampliar 🔍)</span></h4>
      <div class="detail-images-grid" style="grid-template-columns: 1fr; max-width: 320px; margin: 0 auto;">
        <div class="detail-image-card" title="Foto de Etiqueta - Doble clic para zoom" ondblclick="zoomImagen('${tv.imgTrasera || ''}', 'Foto de Etiqueta (Trasera) - ${tv.codigo}')">
          <span class="dic-label">Foto de Etiqueta (Trasera)</span>
          <div class="dic-preview ${!tv.imgTrasera ? 'no-image' : ''}">
            ${tv.imgTrasera 
              ? `<img src="${tv.imgTrasera}" alt="Etiqueta" />` 
              : `<div class="dic-placeholder">
                  <span class="dic-icon">🏷️</span>
                  <span>Sin foto de etiqueta</span>
                 </div>`
            }
          </div>
        </div>
      </div>
    </div>
  `;

  const histHTML = historial.length
    ? '<div class="historial-timeline">' + historial.map(m => `
        <div class="ht-item tipo-${m.tipo}">
          <span class="ht-icon">${tipoIcon(m.tipo)}</span>
          <div class="ht-content">
            <div class="ht-head">
              <span class="ht-tipo">${tipoLabel[m.tipo] || m.tipo}</span>
              <span class="ht-fecha">${fmtDate(m.fecha)}</span>
            </div>
            <div class="ht-motivo"><strong>Motivo:</strong> ${m.motivo}</div>
            ${m.habDestino ? `<div class="ht-resp">→ Hab. ${m.habDestino}</div>` : ''}
            <div class="ht-resp">Responsable: ${m.responsable}</div>
            ${m.observaciones ? `<div class="ht-resp">${m.observaciones}</div>` : ''}
          </div>
        </div>`).join('') + '</div>'
    : '<p class="empty-state">Sin movimientos registrados.</p>';

  document.getElementById('modalDetalleBody').innerHTML = `
    <div style="display:flex; justify-content:flex-end; margin-bottom:1rem;">
      <button type="button" onclick="imprimirDetalleTV()" style="display:flex; align-items:center; gap:6px; background:#10b981; color:#fff; border:none; border-radius:8px; padding:10px 20px; font-size:0.9rem; font-weight:600; cursor:pointer;">🖨️ Imprimir</button>
    </div>
    <div class="detail-grid">
      ${fields.map(([l,v]) => `<div class="detail-item">
        <span class="di-label">${l}</span>
        <span class="di-value">${l === 'Estado' ? (estadoBadge[v] || v) : v}</span>
      </div>`).join('')}
    </div>
    ${imgsHTML}
    <div class="historial-section">
      <h4>📜 Historial de Movimientos (${historial.length})</h4>
      ${histHTML}
    </div>`;

  openModal('modalDetalle');
}

function tipoIcon(tipo) {
  const icons = { traslado_hab:'🔀', entrada_taller:'🔧', retorno_taller:'✅',
                  baja:'❌', otro:'📝' };
  return icons[tipo] || '📝';
}

function imprimirDetalleTV() {
  const body = document.getElementById('modalDetalleBody');
  if (!body) return;
  const printWin = window.open('', '_blank', 'width=800,height=600');
  printWin.document.write(`<!DOCTYPE html><html><head><title>Control de TV</title>
    <style>
      body { font-family: Arial, sans-serif; padding: 20px; color: #1a202c; }
      .detail-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 20px; }
      .detail-item { border-bottom: 1px solid #e2e8f0; padding: 6px 0; }
      .di-label { font-size: 0.75rem; text-transform: uppercase; color: #718096; display: block; font-weight: 600; }
      .di-value { font-size: 0.95rem; color: #2d3748; }
      .detail-images-section { margin: 20px 0; text-align: center; }
      .detail-images-section img { max-width: 100%; max-height: 300px; }
      .historial-section { margin-top: 20px; }
      .historial-section h4 { border-bottom: 1px solid #e2e8f0; padding-bottom: 8px; margin-bottom: 10px; }
      .ht-item { padding: 8px 0; border-bottom: 1px solid #f7fafc; }
      .ht-head { display: flex; justify-content: space-between; }
      .ht-tipo { font-weight: 600; }
      .ht-fecha { color: #718096; font-size: 0.8rem; }
      .ht-motivo { color: #4a5568; margin: 4px 0; }
      .ht-resp { color: #718096; font-size: 0.85rem; }
      .btn-print { display: none; }
      @media print { .btn-print { display: none; } }
    </style>
  </head><body>
    <div style="text-align:center; margin-bottom:16px; font-size:14px; color:#718096;">Hesperia Playa El Agua</div>
    ${body.innerHTML}
  </body></html>`);
  printWin.document.close();
  setTimeout(() => { printWin.print(); }, 500);
}

// ─── REGISTRO DE EVENTOS DE TV (para Historial Global) ─────
async function registrarEventoTV({ tipo, tvId = null, codigo = '', detalle = '', responsable = '' }) {
  try {
    const ahora = new Date();
    const fechaLocal = `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}-${String(ahora.getDate()).padStart(2, '0')}`;
    const ev = {
      id: uid(),
      tvId,
      codigo: codigo || (tvId ? (loadAllTVs().find(t => String(t.id) === String(tvId))?.codigo || '') : ''),
      tipo,
      esEvento: true,
      fecha: fechaLocal,
      motivo: detalle,
      responsable: responsable || (window.currentUser ? (window.currentUser.name || window.currentUser.email || 'Usuario') : '—'),
      creadoEn: ahora.toISOString()
    };
    await db.collection('movimientos').doc(ev.id).set(ev);
  } catch (e) {
    console.error('Error registrando evento:', e);
  }
}

// ─── ELIMINAR TV (ELIMINACIÓN LÓGICA) ─────────────────────
let _pendingDeleteId = null;

function confirmarEliminar(id) {
  _pendingDeleteId = id;
  openModal('modalConfirm');
}

document.getElementById('btnConfirmDelete').addEventListener('click', async () => {
  if (!_pendingDeleteId) return;
  
  const btn = document.getElementById('btnConfirmDelete');
  const prevText = btn.textContent;
  btn.textContent = 'Eliminando...';
  btn.disabled = true;

  try {
    // Registrar evento en el historial global
    const tvElim = loadAllTVs().find(t => String(t.id) === String(_pendingDeleteId));
    if (tvElim) {
      await registrarEventoTV({
        tipo: 'tv_eliminado',
        tvId: tvElim.id,
        codigo: tvElim.codigo,
        detalle: `TV ${tvElim.codigo} (${tvElim.marca || ''} ${tvElim.modelo || ''}) ocultado del inventario`
      });
    }

    // Eliminación lógica: marcar como eliminado
    await db.collection('tvs').doc(_pendingDeleteId).update({
      deleted: true,
      deletedAt: new Date().toISOString(),
      deletedBy: window.currentUser ? window.currentUser.uid : 'unknown'
    });
    
    // También marcar movimientos como eliminados lógicamente (excepto eventos del historial)
    const movsToDelete = loadMovs().filter(m => String(m.tvId) === String(_pendingDeleteId) && !m.deleted && !m.esEvento);
    if (movsToDelete.length > 0) {
      const batch = db.batch();
      movsToDelete.forEach(m => {
        batch.update(db.collection('movimientos').doc(m.id), {
          deleted: true,
          deletedAt: new Date().toISOString(),
          deletedBy: window.currentUser ? window.currentUser.uid : 'unknown'
        });
      });
      await batch.commit();
    }

    _pendingDeleteId = null;
    closeModal('modalConfirm');
    showToast('TV eliminado correctamente (registro oculto).', 'success');
  } catch (e) {
    console.error(e);
    showToast('Error al eliminar: ' + e.message, 'error');
  } finally {
    btn.textContent = prevText;
    btn.disabled = false;
  }
});

// Eliminación física (requiere permiso)
let _pendingPhysicalDeleteId = null;
function confirmarEliminacionFisica(id) {
  if (!hasPermission('eliminar_fisico_tv')) {
    showToast('No tienes permiso para realizar eliminación física.', 'error');
    return;
  }
  _pendingPhysicalDeleteId = id;
  openModal('modalPhysicalDelete');
}

document.getElementById('btnConfirmPhysicalDelete').addEventListener('click', async () => {
  if (!_pendingPhysicalDeleteId) return;
  
  const btn = document.getElementById('btnConfirmPhysicalDelete');
  const prevText = btn.textContent;
  btn.textContent = 'Eliminando...';
  btn.disabled = true;

  try {
    // Registrar evento ANTES de eliminar el TV (para que quede constancia en el historial)
    const tvElimFis = loadAllTVs().find(t => String(t.id) === String(_pendingPhysicalDeleteId));
    if (tvElimFis) {
      await registrarEventoTV({
        tipo: 'tv_eliminado_fisico',
        tvId: tvElimFis.id,
        codigo: tvElimFis.codigo,
        detalle: `TV ${tvElimFis.codigo} (${tvElimFis.marca || ''} ${tvElimFis.modelo || ''}) eliminado permanentemente`
      });
    }

    // Eliminar físicamente el TV
    await db.collection('tvs').doc(_pendingPhysicalDeleteId).delete();
    
    // Eliminar físicamente sus movimientos (excepto los eventos del historial)
    const movsToDelete = loadAllMovs().filter(m =>
      !m.esEvento &&
      (String(m.tvId) === String(_pendingPhysicalDeleteId) ||
       (m.tvReemplazo && String(m.tvReemplazo.id) === String(_pendingPhysicalDeleteId)))
    );
    // Eliminar las imágenes de actas de esos movimientos en Storage
    await eliminarActasDeMovimientos(movsToDelete);
    if (movsToDelete.length > 0) {
      const batch = db.batch();
      movsToDelete.forEach(m => {
        batch.delete(db.collection('movimientos').doc(m.id));
      });
      await batch.commit();
    }

    _pendingPhysicalDeleteId = null;
    closeModal('modalPhysicalDelete');
    showToast('TV eliminado permanentemente de la base de datos.', 'success');
  } catch (e) {
    console.error(e);
    showToast('Error al eliminar: ' + e.message, 'error');
  } finally {
    btn.textContent = prevText;
    btn.disabled = false;
  }
});

// ─── ACCIONES DE ADMIN ─────────────────────────────────────

// Verificar si el usuario actual es admin
function isAdmin() {
  return window.currentUser && window.currentUser.role === 'admin';
}

// Eliminar un movimiento individual (ELIMINACIÓN LÓGICA)
let _pendingDeleteMovId = null;
function confirmarEliminarMovimiento(movId) {
  _pendingDeleteMovId = movId;
  openModal('modalConfirmMov');
}

function setupDeleteMovListener() {
  const btn = document.getElementById('btnConfirmDeleteMov');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    if (!_pendingDeleteMovId) return;
    const prevText = btn.textContent;
    btn.textContent = 'Eliminando...';
    btn.disabled = true;
    try {
      // Eliminación lógica
      await db.collection('movimientos').doc(_pendingDeleteMovId).update({
        deleted: true,
        deletedAt: new Date().toISOString(),
        deletedBy: window.currentUser ? window.currentUser.uid : 'unknown'
      });
      _pendingDeleteMovId = null;
      closeModal('modalConfirmMov');
      showToast('Movimiento eliminado correctamente (registro oculto).', 'success');
    } catch (e) {
      console.error(e);
      showToast('Error al eliminar: ' + e.message, 'error');
    } finally {
      btn.textContent = prevText;
      btn.disabled = false;
    }
  });
}
setupDeleteMovListener();

// Eliminar un movimiento individual (ELIMINACIÓN FÍSICA - Admin)
function confirmarEliminacionFisicaMovimiento(movId) {
  if (!hasPermission('eliminar_fisico_movimiento')) {
    showToast('No tienes permiso para eliminar movimientos permanentemente.', 'error');
    return;
  }
  const mov = loadMovs().find(m => String(m.id) === String(movId));
  if (!mov) return;
  if (!confirm(`⚠️ ELIMINACIÓN FÍSICA\n\n¿Eliminar permanentemente este movimiento?\n\nTipo: ${mov.tipo}\nFecha: ${mov.fecha}\nResponsable: ${mov.responsable}\n\nEsta acción no se puede deshacer.`)) return;
  db.collection('movimientos').doc(movId).delete()
    .then(async () => {
      // Eliminar la imagen del acta en Storage (si existe)
      await eliminarActasDeMovimientos([mov]);
      await registrarEventoTV({
        tipo: 'otro',
        tvId: mov.tvId,
        codigo: mov.codigo,
        detalle: `Movimiento (${tipoLabel[mov.tipo] || mov.tipo}) eliminado permanentemente del historial`
      });
      showToast('Movimiento eliminado permanentemente.', 'success');
      window.appData.movimientos = window.appData.movimientos.filter(m => String(m.id) !== String(movId));
      renderHistorial();
    })
    .catch(e => showToast('Error: ' + e.message, 'error'));
}

// Eliminar imágenes de actas en Storage de una lista de movimientos
async function eliminarActasDeMovimientos(movs) {
  for (const m of movs) {
    if (m.actaPath) {
      try { await storage.ref(m.actaPath).delete(); } catch (e) { /* la imagen ya no existe */ }
    }
  }
}

// Eliminar acta de un movimiento (ELIMINACIÓN FÍSICA - Admin)
function confirmarEliminarActaMovimiento(movId) {
  if (!hasPermission('eliminar_fisico_acta')) {
    showToast('No tienes permiso para eliminar actas permanentemente.', 'error');
    return;
  }
  const mov = loadMovs().find(m => String(m.id) === String(movId));
  if (!mov || !mov.actaUrl) return;
  if (!confirm('¿Eliminar el acta de este movimiento?\n\nEsta acción no se puede deshacer.')) return;
  db.collection('movimientos').doc(movId).update({ actaUrl: firebase.firestore.FieldValue.delete(), actaPath: firebase.firestore.FieldValue.delete() })
    .then(async () => {
      // Eliminar la imagen del acta en Storage
      await eliminarActasDeMovimientos([mov]);
      await registrarEventoTV({
        tipo: 'acta_eliminada',
        tvId: mov.tvId,
        codigo: mov.codigo,
        detalle: `Acta del movimiento (${tipoLabel[mov.tipo] || mov.tipo}) eliminada`
      });
      showToast('Acta eliminada correctamente.', 'success');
      mov.actaUrl = null;
      renderHistorial();
    })
    .catch(e => showToast('Error: ' + e.message, 'error'));
}

// Modificar serial de TV
let _pendingChangeSerialId = null;
function abrirCambioSerial(tvId) {
  const tv = loadTVs().find(t => String(t.id) === String(tvId));
  if (!tv) return;
  _pendingChangeSerialId = tvId;
  document.getElementById('serialOldValue').textContent = tv.serial;
  document.getElementById('serialNewValue').value = '';
  openModal('modalChangeSerial');
}

function setupChangeSerialListener() {
  const btn = document.getElementById('btnConfirmSerial');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    const newSerial = document.getElementById('serialNewValue').value.trim();
    if (!newSerial) { showToast('Ingrese el nuevo serial.', 'error'); return; }
    if (!_pendingChangeSerialId) return;
    const prevText = btn.textContent;
    btn.textContent = 'Cambiando...';
    btn.disabled = true;
    try {
      const tvSerialAntes = loadAllTVs().find(t => String(t.id) === String(_pendingChangeSerialId));
      await db.collection('tvs').doc(_pendingChangeSerialId).update({ serial: newSerial });
      // Registrar evento
      if (tvSerialAntes) {
        await registrarEventoTV({
          tipo: 'tv_serial',
          tvId: tvSerialAntes.id,
          codigo: tvSerialAntes.codigo,
          detalle: `Serial del TV ${tvSerialAntes.codigo} cambiado de "${tvSerialAntes.serial}" a "${newSerial}"`
        });
      }
      _pendingChangeSerialId = null;
      closeModal('modalChangeSerial');
      showToast('Serial actualizado correctamente.', 'success');
    } catch (e) {
      console.error(e);
      showToast('Error al cambiar serial: ' + e.message, 'error');
    } finally {
      btn.textContent = prevText;
      btn.disabled = false;
    }
  });
}
setupChangeSerialListener();

// Eliminar TODOS los datos (solo admin)
function confirmarEliminarTodo() {
  openModal('modalDeleteAll');
}

// Flujo de doble confirmación para eliminar todos los datos
function setupDeleteAllListener() {
  const btn = document.getElementById('btnConfirmDeleteAll');
  if (!btn) return;
  btn.addEventListener('click', () => {
    const confirmText = document.getElementById('deleteAllConfirmText').value.trim();
    if (confirmText !== 'ELIMINAR') {
      showToast('Debe escribir "ELIMINAR" para confirmar.', 'error');
      return;
    }
    // Primera confirmación válida → pasar a la segunda
    closeModal('modalDeleteAll');
    openModal('modalDeleteAllConfirm2');
  });

  const btn2 = document.getElementById('btnConfirmDeleteAll2');
  if (!btn2) return;
  btn2.addEventListener('click', async () => {
    const prevText = btn2.textContent;
    btn2.textContent = 'Eliminando todo...';
    btn2.disabled = true;
    try {
      // Borrar tvs
      const tvsSnap = await db.collection('tvs').get();
      for (const doc of tvsSnap.docs) { await doc.ref.delete(); }
      // Borrar movimientos
      const movsSnap = await db.collection('movimientos').get();
      for (const doc of movsSnap.docs) { await doc.ref.delete(); }
      // Borrar config
      const configSnap = await db.collection('config').get();
      for (const doc of configSnap.docs) { await doc.ref.delete(); }
      // Borrar imágenes de actas en Storage
      try {
        const actasRef = storage.ref('actas');
        const listResult = await actasRef.listAll();
        for (const item of listResult.items) { await item.delete(); }
      } catch (e) { /* sin imágenes */ }

      // Registrar evento de reinicio (para dejar constancia en el historial)
      await registrarEventoTV({
        tipo: 'bd_reseteada',
        detalle: `Base de datos reiniciada por ${window.currentUser ? (window.currentUser.name || window.currentUser.email) : 'admin'}`
      });

      closeModal('modalDeleteAllConfirm2');
      showToast('Todos los datos han sido eliminados.', 'success');
    } catch (e) {
      console.error(e);
      showToast('Error al eliminar: ' + e.message, 'error');
    } finally {
      btn2.textContent = prevText;
      btn2.disabled = false;
    }
  });
}
setupDeleteAllListener();

// ─── ELIMINACIÓN POR GRUPO (Solo Admin) ───────────────────────
function toggleVerEliminados() {
  window.mostrarEliminados = document.getElementById('chkVerEliminados').checked;
  renderInventario();
}

function abrirEliminarPorGrupo() {
  if (!hasPermission('eliminar_base_datos')) {
    showToast('No tienes permiso para eliminar registros.', 'error');
    return;
  }
  document.getElementById('grupoEliminarConfirm').value = '';
  document.getElementById('grupoEliminarTipo').selectedIndex = 0;
  document.getElementById('grupoEliminarMarcaGrp').style.display = 'none';
  actualizarInfoGrupo();
  renderGrupoEliminarLista();
  openModal('modalEliminarGrupo');
}

function obtenerTVsGrupoEliminar() {
  const tipo = document.getElementById('grupoEliminarTipo').value;
  let tvs = loadAllTVs();
  if (tipo === 'marca') {
    const marca = document.getElementById('grupoEliminarMarca').value;
    if (marca) tvs = tvs.filter(t => t.marca === marca);
  } else if (tipo !== 'todos') {
    tvs = tvs.filter(t => t.estado === tipo);
  }
  return tvs;
}

function poblarMarcasGrupoEliminar() {
  const sel = document.getElementById('grupoEliminarMarca');
  if (!sel) return;
  const marcas = new Set(loadAllTVs().map(t => t.marca).filter(Boolean));
  const predef = ['LG', 'Samsung', 'Sony', 'Toshiba'];
  const todas = Array.from(new Set([...predef, ...loadMarcas(), ...marcas])).filter(Boolean);
  sel.innerHTML = todas.map(m => `<option value="${m}">${m}</option>`).join('');
}

function renderGrupoEliminarLista() {
  const tipo = document.getElementById('grupoEliminarTipo').value;
  const lista = document.getElementById('grupoEliminarLista');
  const tvs = obtenerTVsGrupoEliminar();
  if (tipo === 'marca' && !document.getElementById('grupoEliminarMarca').value) {
    lista.innerHTML = '<div style="color:var(--text-secondary);">Selecciona una marca.</div>';
    actualizarInfoGrupo();
    return;
  }
  if (tvs.length === 0) {
    lista.innerHTML = '<div style="color:var(--text-secondary);">No hay registros que coincidan con esta opción.</div>';
    document.getElementById('grupoEliminarTodoMarca').checked = false;
    actualizarInfoGrupo();
    return;
  }
  lista.innerHTML = tvs.map(t =>
    `<label style="display:flex; align-items:center; gap:8px; padding:6px 4px; border-bottom:1px solid var(--border); cursor:pointer;">
      <input type="checkbox" class="chkEliminarMarca" data-id="${t.id}" style="width:auto; margin:0; flex-shrink:0;">
      <span>${t.codigo} — ${t.marca} — ${t.serial || 's/s'}</span>
    </label>`
  ).join('');
  document.getElementById('grupoEliminarTodoMarca').checked = false;
  actualizarInfoGrupo();
}

function actualizarInfoGrupo() {
  const tipo = document.getElementById('grupoEliminarTipo').value;
  const tvs = loadAllTVs();
  const el = document.getElementById('grupoEliminarInfo');
  if (tipo === 'marca') {
    const marca = document.getElementById('grupoEliminarMarca').value;
    const checks = document.querySelectorAll('.chkEliminarMarca:checked');
    if (el) el.textContent = marca
      ? `Se eliminarán permanentemente ${checks.length} registro(s) seleccionados de la marca ${marca}.`
      : 'Selecciona una marca.';
    return;
  }
  let count = 0;
  if (tipo === 'todos') {
    count = tvs.length;
  } else {
    count = tvs.filter(t => t.estado === tipo).length;
  }
  const checks = document.querySelectorAll('.chkEliminarMarca:checked');
  if (el) el.textContent = `Se eliminarán permanentemente ${checks.length} de ${count} registro(s) del grupo seleccionado.`;
}

function setupEliminarGrupoListener() {
  const sel = document.getElementById('grupoEliminarTipo');
  if (sel) sel.addEventListener('change', () => {
    const tipo = sel.value;
    const marcaGrp = document.getElementById('grupoEliminarMarcaGrp');
    if (tipo === 'marca') {
      marcaGrp.style.display = 'block';
      poblarMarcasGrupoEliminar();
      renderGrupoEliminarLista();
    } else {
      marcaGrp.style.display = 'none';
      renderGrupoEliminarLista();
    }
  });
  const selMarca = document.getElementById('grupoEliminarMarca');
  if (selMarca) selMarca.addEventListener('change', renderGrupoEliminarLista);
  const chkTodo = document.getElementById('grupoEliminarTodoMarca');
  if (chkTodo) chkTodo.addEventListener('change', () => {
    document.querySelectorAll('.chkEliminarMarca').forEach(c => c.checked = chkTodo.checked);
    actualizarInfoGrupo();
  });
  document.addEventListener('change', e => {
    if (e.target && e.target.classList && e.target.classList.contains('chkEliminarMarca')) {
      actualizarInfoGrupo();
    }
  });
  const btn = document.getElementById('btnConfirmEliminarGrupo');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    const confirmText = document.getElementById('grupoEliminarConfirm').value.trim();
    if (confirmText !== 'ELIMINAR') {
      showToast('Debe escribir "ELIMINAR" para confirmar.', 'error');
      return;
    }
    const tipo = document.getElementById('grupoEliminarTipo').value;
    const prevText = btn.textContent;
    btn.textContent = 'Eliminando...';
    btn.disabled = true;
    try {
      const selectedIds = Array.from(document.querySelectorAll('.chkEliminarMarca:checked')).map(c => c.dataset.id);
      let tvsAEliminar = obtenerTVsGrupoEliminar().filter(t => selectedIds.includes(t.id));
      if (tipo === 'marca' && !document.getElementById('grupoEliminarMarca').value) {
        closeModal('modalEliminarGrupo');
        showToast('Selecciona una marca.', 'info');
        return;
      }
      if (tvsAEliminar.length === 0) {
        closeModal('modalEliminarGrupo');
        showToast('Selecciona al menos un registro de la lista.', 'info');
        return;
      }
      const ids = tvsAEliminar.map(t => t.id);
      // Registrar evento para cada TV eliminado
      for (const tv of tvsAEliminar) {
        await registrarEventoTV({
          tipo: 'tv_eliminado_fisico',
          tvId: tv.id,
          codigo: tv.codigo,
          detalle: tipo === 'marca'
            ? `TV ${tv.codigo} eliminado permanentemente (eliminación por marca: ${document.getElementById('grupoEliminarMarca').value})`
            : `TV ${tv.codigo} eliminado permanentemente (eliminación por grupo: ${tipo === 'todos' ? 'todos' : tipo})`
        });
      }
      // Eliminar físicamente cada TV
      for (const id of ids) {
        await db.collection('tvs').doc(id).delete();
      }
      // Eliminar movimientos asociados a esos TVs (excepto eventos del historial)
      const movsSnap = await db.collection('movimientos').get();
      const batch = db.batch();
      let ops = 0;
      const movsToDelete = [];
      movsSnap.docs.forEach(doc => {
        const m = doc.data();
        if (!m.esEvento && (ids.includes(String(m.tvId)) || (m.tvReemplazo && ids.includes(String(m.tvReemplazo.id))))) {
          batch.delete(doc.ref);
          movsToDelete.push(m);
          ops++;
        }
      });
      if (ops > 0) await batch.commit();
      // Eliminar las imágenes de actas de los movimientos eliminados en Storage
      await eliminarActasDeMovimientos(movsToDelete);

      closeModal('modalEliminarGrupo');
      showToast(`${ids.length} registro(s) eliminados permanentemente.`, 'success');
    } catch (e) {
      console.error(e);
      showToast('Error al eliminar: ' + e.message, 'error');
    } finally {
      btn.textContent = prevText;
      btn.disabled = false;
    }
  });
}
setupEliminarGrupoListener();

// ─── FORMULARIO TV ───────────────────────────────────────────
function generarCodigoTV() {
  const tvs = loadTVs();
  let max = 0;
  tvs.forEach(t => {
    if (t.codigo && t.codigo.toUpperCase().startsWith('HPA-')) {
      const num = parseInt(t.codigo.split('-')[1], 10);
      if (!isNaN(num) && num > max) max = num;
    }
  });
  return 'HPA-' + String(max + 1).padStart(3, '0');
}

let currentImgTrasera = '';

const DB_UBICACIONES = 'hpa_ubicaciones';
function loadUbicaciones() { return window.appData?.metadata?.ubicaciones || []; }
async function saveUbicaciones(d) { await db.collection('config').doc('metadata').update({ ubicaciones: d }); }

function renderUbicaciones() {
  const sel = document.getElementById('tvUbicacion');
  if (!sel) return;
  const custom = loadUbicaciones();
  sel.innerHTML = `
    <option value="">-- Seleccionar --</option>
    <option value="Almacen">Almacén</option>
    <option value="Taller">Taller</option>
    <option value="Habitacion">Habitación</option>
    <option value="Sala de Juntas">Sala de Juntas</option>
    ${custom.map(u => `<option value="${u}">${u}</option>`).join('')}
    <option value="otro">Otro (Especifique)</option>
  `;
}

const DB_MARCAS = 'hpa_marcas';
function loadMarcas() { return window.appData?.metadata?.marcas || []; }
async function saveMarcas(d) { await db.collection('config').doc('metadata').update({ marcas: d }); }

function renderMarcas() {
  const sel = document.getElementById('tvMarca');
  if (!sel) return;
  const custom = loadMarcas();
  sel.innerHTML = `
    <option value="">-- Seleccionar --</option>
    <option value="LG">LG</option>
    <option value="Samsung">Samsung</option>
    <option value="Sony">Sony</option>
    <option value="Toshiba">Toshiba</option>
    ${custom.map(m => `<option value="${m}">${m}</option>`).join('')}
    <option value="otro">Otro (Especifique)</option>
  `;
}

function readImage(input, previewId, callback) {
  if (input.files && input.files[0]) {
    const file = input.files[0];
    const reader = new FileReader();
    reader.onload = function(e) {
      const img = new Image();
      img.onload = function() {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 800;
        const MAX_HEIGHT = 800;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        
        // Comprimir a JPEG al 60% de calidad para no saturar Firestore
        const dataUrl = canvas.toDataURL('image/jpeg', 0.6);
        
        document.getElementById(previewId).innerHTML = `<img src="${dataUrl}" style="max-width:100%;max-height:250px;border-radius:4px;" />`;
        const label = document.getElementById('labelTrasera');
        if (label) label.classList.add('has-image');
        
        callback(dataUrl);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }
}

function resetFormTV() {
  document.getElementById('tvId').value = '';
  document.getElementById('formTV').reset();
  document.getElementById('tvSerial').disabled = false;
  document.getElementById('formTVTitle').textContent = '📺 Registrar Nuevo TV';
  document.getElementById('btnGuardarTV').textContent = '💾 Guardar TV';
  // Fecha de ingreso = hoy en formato DD/MM/YYYY
  const today = new Date();
  document.getElementById('tvFechaIngreso').value = `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}/${today.getFullYear()}`;
  document.getElementById('tvCodigo').value = generarCodigoTV();
  
  renderUbicaciones();
  document.getElementById('tvUbicacion').value = 'Almacen';
  document.getElementById('grpUbicacionOtro').style.display = 'none';
  document.getElementById('tvUbicacionOtro').value = '';
  document.getElementById('grpTvHabitacion').style.display = 'none';
  document.getElementById('tvHabitacion').value = '';
  const grpTvTaller = document.getElementById('grpTvTallerEstado');
  if (grpTvTaller) {
    grpTvTaller.style.display = 'none';
    document.getElementById('tvTallerEstado').value = 'inoperativo';
  }
  
  renderMarcas();
  document.getElementById('tvMarca').value = '';
  
  currentImgTrasera = '';
  currentImgFile = null;
  document.getElementById('previewTrasera').innerHTML = '';
  document.getElementById('tvImagenTrasera').value = '';
  const label = document.getElementById('labelTrasera');
  if (label) label.classList.remove('has-image');
}

document.getElementById('tvUbicacion').addEventListener('change', function() {
  document.getElementById('grpUbicacionOtro').style.display = this.value === 'otro' ? '' : 'none';
  document.getElementById('grpTvHabitacion').style.display = (this.value === 'Habitacion' || this.value === 'Habitación') ? '' : 'none';
  const grpTvTaller = document.getElementById('grpTvTallerEstado');
  if (grpTvTaller) {
    grpTvTaller.style.display = this.value === 'Taller' ? '' : 'none';
    if (this.value === 'Taller') {
      document.getElementById('tvTallerEstado').value = 'inoperativo';
    }
  }
});

document.getElementById('btnClearFechaIngreso').addEventListener('click', function() {
  document.getElementById('tvFechaIngreso').value = '00/00/0000';
  document.getElementById('tvUbicacion').focus();
});

function clearFieldHighlight(el) {
  el.style.borderColor = '';
  el.style.boxShadow = '';
}
['tvCodigo','tvMarca','tvModelo','tvSerial','tvUbicacion','tvUbicacionOtro'].forEach(id => {
  const el = document.getElementById(id);
  if (el) {
    el.addEventListener('input', () => clearFieldHighlight(el));
    el.addEventListener('change', () => clearFieldHighlight(el));
  }
});

document.getElementById('tvMarca').addEventListener('change', async function() {
  if (this.value === 'otro') {
    const nuevaMarca = prompt('Ingrese la nueva Marca:');
    if (nuevaMarca && nuevaMarca.trim()) {
      const marcaTrimmed = nuevaMarca.trim();
      const custom = loadMarcas();
      if (!custom.includes(marcaTrimmed)) {
        custom.push(marcaTrimmed);
        await saveMarcas(custom);
      }
      renderMarcas();
      this.value = marcaTrimmed;
    } else {
      this.value = '';
    }
  }
});

function getRoomsForArea(area) {
  const rooms = [];
  const val = (area || '').toLowerCase();
  
  if (val.includes('premium')) {
    const match = val.match(/\d+/);
    if (match) {
      const prefix = match[0];
      for (let i = 1; i <= 29; i++) {
        if (i === 9 || i === 10 || i === 20) continue;
        rooms.push(`${prefix}${i.toString().padStart(2, '0')}`);
      }
    }
  } else if (val.includes('anillo')) {
    let prefix = '';
    if (val.includes('1')) prefix = '50';
    else if (val.includes('2')) prefix = '51';
    else if (val.includes('3')) prefix = '52';
    
    if (prefix) {
      for (let i = 1; i <= 32; i++) {
        rooms.push(`${prefix}${i.toString().padStart(2, '0')}`);
      }
    }
  }
  return rooms;
}

function seleccionarReemplazo(destino, event) {
  document.querySelectorAll('#modalReemplazo .btn').forEach(b => b.style.borderColor = '');
  const btn = event ? event.currentTarget : document.querySelector(`#modalReemplazo .btn[onclick*="'${destino}'"]`);
  if (btn) btn.style.borderColor = 'var(--accent)';
  window._reemplazoSeleccion = destino;
  document.getElementById('reemplazoOtroGroup').style.display = destino === 'Otro' ? '' : 'none';
  const grpTaller = document.getElementById('reemplazoTallerEstadoGroup');
  if (grpTaller) {
    grpTaller.style.display = destino === 'Taller' ? '' : 'none';
    if (destino === 'Taller') document.getElementById('reemplazoTallerEstado').value = 'inoperativo';
  }
}

function confirmarReemplazo() {
  let destino = window._reemplazoSeleccion;
  if (!destino) { showToast('Selecciona un destino.', 'error'); return; }
  if (destino === 'Otro') {
    destino = document.getElementById('reemplazoOtroInput').value.trim();
    if (!destino) { showToast('Especifica el destino.', 'error'); return; }
  }
  closeModal('modalReemplazo');
  if (window._tvReemplazoData) {
    window._tvReemplazo = { ...window._tvReemplazoData, destino };
    if (destino === 'Taller') {
      window._tvReemplazo.tallerEstado = document.getElementById('reemplazoTallerEstado').value || 'inoperativo';
    }
  }
  if (window._resolveReemplazo) {
    window._resolveReemplazo(destino);
    window._resolveReemplazo = null;
  }
}

function cancelarReemplazo() {
  closeModal('modalReemplazo');
  if (window._resolveReemplazo) {
    window._resolveReemplazo(null);
    window._resolveReemplazo = null;
  }
}

function isValidRoom(room) {
  const validRooms = [
    ...getRoomsForArea('Premium 68'),
    ...getRoomsForArea('Premium 69'),
    ...getRoomsForArea('Anillo 1'),
    ...getRoomsForArea('Anillo 2'),
    ...getRoomsForArea('Anillo 3')
  ];
  return validRooms.includes(room);
}

// Habitaciones del hotel agrupadas por área
function getTodasLasHabitaciones() {
  return {
    'Premium 68': getRoomsForArea('Premium 68'),
    'Premium 69': getRoomsForArea('Premium 69'),
    'Anillo 1':   getRoomsForArea('Anillo 1'),
    'Anillo 2':   getRoomsForArea('Anillo 2'),
    'Anillo 3':   getRoomsForArea('Anillo 3')
  };
}

// Devuelve las habitaciones que NO tienen un TV asignado (ubicacion 'Habitacion')
function getHabitacionesSinTV() {
  const tvs = loadTVs();
  const asignadas = new Set();
  tvs.forEach(t => {
    if ((t.ubicacion === 'Habitacion' || t.ubicacion === 'Habitación') && t.habitacion) {
      asignadas.add(String(t.habitacion).trim());
    }
  });
  const todas = [];
  Object.values(getTodasLasHabitaciones()).forEach(list => list.forEach(r => todas.push(r)));
  return todas.filter(r => !asignadas.has(r));
}

// Abre el modal con el listado de habitaciones sin TV agrupado por área
function abrirModalSinTV() {
  const asignadas = new Set();
  loadTVs().forEach(t => {
    if ((t.ubicacion === 'Habitacion' || t.ubicacion === 'Habitación') && t.habitacion) {
      asignadas.add(String(t.habitacion).trim());
    }
  });
  const areas = getTodasLasHabitaciones();
  const body = document.getElementById('modalSinTVBody');
  let totalSin = 0;
  let html = '';
  Object.entries(areas).forEach(([area, rooms]) => {
    const sin = rooms.filter(r => !asignadas.has(r));
    totalSin += sin.length;
    const cards = sin.length
      ? sin.map(r => `<span style="display:inline-block; padding:6px 12px; margin:4px; border:1px solid rgba(179,110,255,0.35); background:rgba(179,110,255,0.1); border-radius:8px; font-size:0.85rem; font-weight:600; color:var(--text-primary);">${r}</span>`).join('')
      : '<span style="color:var(--text-secondary); font-size:0.85rem;">Todas las habitaciones tienen TV ✅</span>';
    html += `
      <div style="margin-bottom:1rem;">
        <div style="display:flex; align-items:center; gap:8px; margin-bottom:6px;">
          <strong style="font-size:0.9rem;">🏨 ${area}</strong>
          <span style="font-size:0.7rem; padding:2px 8px; border-radius:10px; background:rgba(255,77,109,0.15); color:#ff4d6d; border:1px solid rgba(255,77,109,0.3);">${sin.length} sin TV</span>
          <span style="font-size:0.7rem; color:var(--text-secondary);">/ ${rooms.length} habs.</span>
        </div>
        <div style="line-height:1;">${cards}</div>
      </div>`;
  });
  html = `<div style="margin-bottom:1rem; padding:10px 14px; border-radius:8px; background:rgba(179,110,255,0.1); border:1px solid rgba(179,110,255,0.3); font-size:0.85rem;"><strong style="color:#b36eff;">${totalSin}</strong> habitaciones de ${Object.values(areas).reduce((a, l) => a + l.length, 0)} no tienen TV asignado.</div>` + html;
  body.innerHTML = html;
  openModal('modalSinTV');
}

// Abre el modal con el listado de TVs que están en el Taller
function abrirModalTaller() {
  const tvs = loadTVs().filter(t => t.estado === 'taller' || String(t.ubicacion || '').toLowerCase() === 'taller');
  const body = document.getElementById('modalTallerBody');
  const operativos = tvs.filter(t => (t.tallerEstado || 'inoperativo') === 'operativo');
  const inoperativos = tvs.filter(t => (t.tallerEstado || 'inoperativo') === 'inoperativo');

  let html = '';
  if (!tvs.length) {
    html = '<p class="empty-state">No hay TVs en el Taller actualmente.</p>';
  } else {
    html = `<div style="margin-bottom:1rem; padding:10px 14px; border-radius:8px; background:rgba(255,204,0,0.1); border:1px solid rgba(255,204,0,0.3); font-size:0.85rem;">
      <strong style="color:#ffcc00;">${tvs.length}</strong> TVs en el Taller ·
      <span style="color:#00f5a0;">✅ ${operativos.length} operativos</span> ·
      <span style="color:#ff4d6d;">❌ ${inoperativos.length} inoperativos</span>
    </div>`;
    html += `<div class="table-wrapper" style="max-height:55vh; overflow-y:auto;">
      <table class="data-table">
        <thead>
          <tr>
            <th>Código</th>
            <th>Marca</th>
            <th>Modelo</th>
            <th>Serial</th>
            <th>Estado</th>
          </tr>
        </thead>
        <tbody>
          ${tvs.map(t => `
            <tr tabindex="0" ondblclick="verDetalle('${t.id}')" title="Doble clic para ver detalle">
              <td><strong style="color:var(--accent)">${t.codigo}</strong></td>
              <td>${t.marca}</td>
              <td>${t.modelo || '—'}</td>
              <td style="font-size:0.78rem;color:var(--text-secondary)">${t.serial}</td>
              <td>${t.tallerEstado === 'operativo' ? estadoBadge.operativo : estadoBadge.inoperativo}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>`;
  }
  body.innerHTML = html;
  openModal('modalTaller');
}

function toggleAsignarHabNumero(area) {
  const grp = document.getElementById('grpAsignarHabNumero');
  const selHab = document.getElementById('asignarHabNumero');
  if (!grp || !selHab) return;
  const val = (area || '').toLowerCase();
  
  if (val.includes('premium') || val.includes('anillo')) {
    grp.style.display = '';
    selHab.disabled = false;
    
    const currentVal = selHab.value;
    const rooms = getRoomsForArea(area);
    
    selHab.innerHTML = '<option value="">-- Seleccionar Habitación --</option>' + 
      rooms.map(r => `<option value="${r}">${r}</option>`).join('');
      
    if (currentVal) {
      if (!rooms.includes(currentVal)) {
        selHab.insertAdjacentHTML('beforeend', `<option value="${currentVal}">${currentVal}</option>`);
      }
      selHab.value = currentVal;
    }
  } else {
    grp.style.display = 'none';
    selHab.innerHTML = '<option value="">-- Seleccionar Habitación --</option>';
  }
}

document.getElementById('asignarArea').addEventListener('change', function() {
  const self = this;
  if (self.value === 'otro') {
    mostrarModalNuevaArea(function(areaCreada) {
      renderAsignarAreas();
      self.value = areaCreada;
      toggleAsignarHabNumero(areaCreada);
    });
  } else {
    toggleAsignarHabNumero(self.value);
  }
  const selHab = document.getElementById('asignarHabNumero');
  if (selHab && !selHab.disabled && selHab.options.length > 1) selHab.focus();
});

document.getElementById('asignarHabNumero').addEventListener('change', function() {
  if (this.value) document.getElementById('asignarResponsable').focus();
});



document.getElementById('tvImagenTrasera').addEventListener('change', function() {
  readImage(this, 'previewTrasera', res => currentImgTrasera = res);
});

function cancelarFormTV() {
  resetFormTV();
  showPage('inventario');
}

function editarTV(id) {
  const tv = loadTVs().find(t => String(t.id) === String(id));
  if (!tv) return;
  resetFormTV();
  document.getElementById('tvId').value          = tv.id;
  document.getElementById('tvCodigo').value       = tv.codigo;
  
  renderMarcas();
  document.getElementById('tvMarca').value        = tv.marca || '';
  if (document.getElementById('tvMarca').selectedIndex === -1 && tv.marca) {
    const custom = loadMarcas();
    if (!custom.includes(tv.marca)) {
      custom.push(tv.marca);
      saveMarcas(custom);
    }
    renderMarcas();
    document.getElementById('tvMarca').value = tv.marca;
  }
  document.getElementById('tvModelo').value       = tv.modelo;
  document.getElementById('tvSerial').value       = tv.serial;
  document.getElementById('tvSerial').disabled    = true;
  document.getElementById('tvTamano').value       = tv.tamano || '42 pulgadas';
  document.getElementById('tvTipo').value         = tv.tipo || '';
  document.getElementById('tvResolucion').value   = tv.resolucion || '';
  document.getElementById('tvSmartTV').value      = tv.smarttv || 'si';
  // Format date for display (dd/mm/yyyy) using fmtDateOnly
  document.getElementById('tvFechaIngreso').value = fmtDateOnly(tv.fechaIngreso) || '';
  
  renderUbicaciones();
  document.getElementById('tvUbicacion').value = tv.ubicacion || '';
  if (document.getElementById('tvUbicacion').selectedIndex === -1) {
    document.getElementById('tvUbicacion').value = 'otro';
    document.getElementById('grpUbicacionOtro').style.display = '';
    document.getElementById('tvUbicacionOtro').value = tv.ubicacion;
  } else {
    document.getElementById('grpUbicacionOtro').style.display = 'none';
  }
  const esHabitacion = tv.ubicacion === 'Habitacion' || tv.ubicacion === 'Habitación';
  document.getElementById('grpTvHabitacion').style.display = esHabitacion ? '' : 'none';
  document.getElementById('tvHabitacion').value = tv.habitacion || '';
  const grpTvTaller = document.getElementById('grpTvTallerEstado');
  if (grpTvTaller) {
    const esTaller = String(tv.ubicacion || '').toLowerCase() === 'taller';
    grpTvTaller.style.display = esTaller ? '' : 'none';
    document.getElementById('tvTallerEstado').value = tv.tallerEstado || 'inoperativo';
  }
  
  currentImgTrasera = tv.imgTrasera || '';
  currentImgFile = null;
  const label = document.getElementById('labelTrasera');
  if (currentImgTrasera) {
    document.getElementById('previewTrasera').innerHTML = `<img src="${currentImgTrasera}" style="max-width:100%;max-height:250px;border-radius:4px;" />`;
    if (label) label.classList.add('has-image');
  } else {
    document.getElementById('previewTrasera').innerHTML = '';
    if (label) label.classList.remove('has-image');
  }
  
  document.getElementById('tvEstado').value       = tv.estado || 'operativo';
  document.getElementById('tvObservaciones').value= tv.observaciones || '';
  document.getElementById('formTVTitle').textContent   = '✏️ Editar TV';
  document.getElementById('btnGuardarTV').textContent  = '💾 Actualizar TV';
  showPage('nuevo-tv');
}

document.getElementById('formTV').addEventListener('submit', e => {
  e.preventDefault();
  const get = id => document.getElementById(id).value.trim();
  
  if (!get('tvId') && get('tvSerial')) {
    const msgEl = document.getElementById('modalConfirmSerialMsg');
    msgEl.innerHTML = `¿Estás seguro de que el serial <strong>'${get('tvSerial')}'</strong> es correcto?<br>Una vez guardado no podrás modificarlo.`;
    
    const btnAceptar = document.getElementById('btnConfirmSerialAceptar');
    const newBtnAceptar = btnAceptar.cloneNode(true);
    btnAceptar.parentNode.replaceChild(newBtnAceptar, btnAceptar);
    
    newBtnAceptar.addEventListener('click', () => {
      closeModal('modalConfirmSerial');
      procesarGuardadoTV();
    });
    
    openModal('modalConfirmSerial');
    return;
  }

  procesarGuardadoTV();

  async function procesarGuardadoTV() {
    function highlightField(id) {
      const el = document.getElementById(id);
      if (el) {
        el.style.borderColor = '#ff4d6d';
        el.style.boxShadow = '0 0 0 2px rgba(255,77,109,0.35)';
        el.style.transition = 'border-color 0.3s, box-shadow 0.3s';
      }
      return el;
    }
    function clearHighlights() {
      document.querySelectorAll('#formTV input, #formTV select').forEach(el => {
        el.style.borderColor = '';
        el.style.boxShadow = '';
      });
    }
    clearHighlights();

    const requiredFields = [
      { id: 'tvCodigo', msg: 'El código es obligatorio.' },
      { id: 'tvMarca', msg: 'Seleccione la marca.' },
      { id: 'tvModelo', msg: 'El modelo es obligatorio.' },
      { id: 'tvSerial', msg: 'El serial es obligatorio.' },
      { id: 'tvUbicacion', msg: 'Seleccione la ubicación.' }
    ];
    for (const f of requiredFields) {
      const val = document.getElementById(f.id).value.trim();
      if (!val || val === 'otro') {
        highlightField(f.id);
        document.getElementById(f.id).focus();
        showToast(f.msg, 'error');
        return;
      }
    }

    let marcaVal = get('tvMarca');
    let ubicacionVal = get('tvUbicacion');
    if (ubicacionVal === 'otro') {
      const newUbi = get('tvUbicacionOtro');
      if (!newUbi) {
        highlightField('tvUbicacionOtro');
        document.getElementById('tvUbicacionOtro').focus();
        showToast('Especifique la nueva ubicación.', 'error');
        return;
      }
      ubicacionVal = newUbi;
      const custom = loadUbicaciones();
      if (!custom.includes(newUbi)) {
        custom.push(newUbi);
        await saveUbicaciones(custom);
      }
    }

    if (ubicacionVal === 'Habitacion' || ubicacionVal === 'Habitación') {
      const habVal = get('tvHabitacion');
      if (!habVal) {
        highlightField('tvHabitacion');
        document.getElementById('tvHabitacion').focus();
        showToast('Ingrese el número de habitación.', 'error');
        return;
      }
      const existId = get('tvId');
      const tvsCheck = loadTVs();
      const tvEnHab = tvsCheck.find(t => t.habitacion === habVal && (t.ubicacion === 'Habitacion' || t.ubicacion === 'Habitación') && String(t.id) !== String(existId));
      if (tvEnHab) {
        highlightField('tvHabitacion');
        document.getElementById('tvHabitacion').focus();
        showAlertaHabitacion(habVal, tvEnHab);
        return;
      }
    }

  const tvs = loadTVs();
  const existId = get('tvId');
  const currentTv = existId ? tvs.find(t => String(t.id) === String(existId)) : null;
  
  const serialVal = get('tvSerial');
  if ((!currentTv || currentTv.serial !== serialVal) && tvs.some(t => t.serial.toLowerCase() === serialVal.toLowerCase() && String(t.id) !== String(existId))) {
    showToast('Ya existe un TV con este número de serie.', 'error');
    return;
  }
  
  const codigoVal = get('tvCodigo');
  if ((!currentTv || currentTv.codigo !== codigoVal) && tvs.some(t => t.codigo.toLowerCase() === codigoVal.toLowerCase() && String(t.id) !== String(existId))) {
    showToast('Ya existe un TV con este código.', 'error');
    return;
  }
  
  if ((!currentTv || currentTv.imgTrasera !== currentImgTrasera) && currentImgTrasera && tvs.some(t => t.imgTrasera === currentImgTrasera && String(t.id) !== String(existId))) {
    showToast('Esta imagen trasera ya está asignada a otro TV.', 'error');
    return;
  }

  const tv = {
    id:           existId || uid(),
    codigo:       get('tvCodigo'),
    marca:        marcaVal,
    modelo:       get('tvModelo'),
    serial:       get('tvSerial'),
    tamano:       get('tvTamano'),
    tipo:         get('tvTipo'),
    resolucion:   get('tvResolucion'),
    smarttv:      get('tvSmartTV'),
    fechaIngreso: get('tvFechaIngreso'),
    ubicacion:    ubicacionVal,
    habitacion:   (ubicacionVal === 'Habitacion' || ubicacionVal === 'Habitación') ? get('tvHabitacion') : '',
    imgTrasera:   currentImgTrasera,
    estado:       get('tvEstado'),
    tallerEstado: (String(ubicacionVal || '').toLowerCase() === 'taller') ? document.getElementById('tvTallerEstado').value : '',
    observaciones:get('tvObservaciones'),
    updatedAt:    new Date().toISOString()
  };

  const btnSubmit = document.getElementById('btnGuardarTV');
  const prevText = btnSubmit.textContent;
  btnSubmit.textContent = 'Guardando...';
  btnSubmit.disabled = true;

  try {
    // La imagen ya está comprimida en currentImgTrasera como base64
    await db.collection('tvs').doc(tv.id).set(tv);

    // Registrar evento en el historial global
    await registrarEventoTV({
      tipo: existId ? 'tv_editado' : 'tv_creado',
      tvId: tv.id,
      codigo: tv.codigo,
      detalle: `${existId ? 'TV actualizado' : 'Nuevo TV registrado'}: ${tv.codigo} (${tv.marca || ''} ${tv.modelo || ''})`
    });

    // Si el TV nuevo se registra directamente en el Taller, generar movimiento de envío a taller y su acta
    if (!existId && String(ubicacionVal || '').toLowerCase() === 'taller') {
      const mov = {
        id: uid(),
        tvId: tv.id,
        tipo: 'entrada_taller',
        fecha: get('tvFechaIngreso') || 'desconocida',
        responsable: window.currentUser ? (window.currentUser.name || window.currentUser.email || 'Usuario') : 'Usuario',
        motivo: 'Registro inicial del TV en el Taller de Reparaciones',
        origen: 'Registro de nuevo activo',
        destino: 'Taller',
        habDestino: '',
        tvReemplazo: null,
        tvSaliente: '',
        creadoEn: new Date().toISOString()
      };
      await db.collection('movimientos').doc(mov.id).set(mov);
      const tvRegistrado = loadTVs().find(t => String(t.id) === String(tv.id));
      setTimeout(() => imprimirActaFromData(mov, tvRegistrado || tv), 1200);
    }

    if (existId) {
      showToast('TV actualizado correctamente.', 'success');
      resetFormTV();
      showPage('inventario');
    } else {
      showToast('Registro guardado exitosamente.', 'success');
      resetFormTV();
      // Regresar el puntero a la opción marca
      setTimeout(() => {
        document.getElementById('tvMarca').focus();
      }, 50);
    }
  } catch(e) {
    console.error(e);
    showToast('Error al guardar: ' + e.message, 'error');
  } finally {
    btnSubmit.textContent = prevText;
    btnSubmit.disabled = false;
  }
  }
});

// ─── FORMULARIO MOVIMIENTO ───────────────────────────────────
function renderMovOrigenFiltro() {
  const sel = document.getElementById('movOrigenFiltro');
  if (!sel) return;
  const selected = sel.value;
  const custom = loadUbicaciones();
  const lugares = ['Sala de Juntas', ...custom.filter(u => u && u !== 'Sala de Juntas')];
  sel.innerHTML = `
    <option value="">Todos los lugares</option>
    <option value="Habitacion">🏨 Habitaciones</option>
    <option value="Taller">🔧 Taller</option>
    <option value="Almacen">📦 Almacén</option>
    ${lugares.map(u => `<option value="lugar:${u}">🏢 ${u}</option>`).join('')}
  `;
  if (selected) sel.value = selected;
}

function populateMovTV() {
  const tvs = loadTVs();
  const sel = document.getElementById('movTV');
  if (sel) {
    if (window.movTVTomSelect) {
      window.movTVTomSelect.destroy();
    }
    renderMovOrigenFiltro();
    const filtro = document.getElementById('movOrigenFiltro');
    const filtroVal = filtro ? filtro.value : '';
    let lista = tvs.filter(t => t.estado !== 'baja');
    if (filtroVal === 'Habitacion') {
      lista = lista.filter(t => (t.ubicacion === 'Habitacion' || t.ubicacion === 'Habitación') && t.estado !== 'taller');
    } else if (filtroVal === 'Taller') {
      lista = lista.filter(t => (t.estado === 'taller' || String(t.ubicacion || '').toLowerCase() === 'taller') && t.tallerEstado === 'operativo');
    } else if (filtroVal === 'Almacen') {
      lista = lista.filter(t => t.ubicacion === 'Almacen');
    } else if (filtroVal && filtroVal.startsWith('lugar:')) {
      const lugar = filtroVal.slice(6);
      lista = lista.filter(t => t.ubicacion === lugar);
    }
    sel.innerHTML = '<option value="">-- Seleccionar TV --</option>' +
      lista.map(t => {
        const ubiTxt = t.ubicacion === 'Habitacion' ? ('Hab. ' + (t.habitacion || '?')) : (t.ubicacion || '—');
        return `<option value="${t.id}" data-codigo="${t.codigo}" data-marca="${t.marca}" data-modelo="${t.modelo || ''}" data-serial="${t.serial}" data-ubi="${ubiTxt}">[${t.codigo}] ${t.marca} ${t.modelo || ''} · ${ubiTxt} · S/N: ${t.serial}</option>`;
      }).join('');
      
    window.movTVTomSelect = new TomSelect("#movTV", {
      create: false,
      sortField: { field: "text", direction: "asc" },
      placeholder: "🔍 Buscar por código, marca o serial…",
      render: {
        option: function(data, escape) {
          const opt = sel.querySelector(`option[value="${data.value}"]`);
          const codigo  = opt ? opt.dataset.codigo  : '';
          const marca   = opt ? opt.dataset.marca   : '';
          const modelo  = opt ? opt.dataset.modelo  : '';
          const serial  = opt ? opt.dataset.serial  : '';
          const ubi     = opt ? opt.dataset.ubi     : '';
          if (!codigo) return `<div class="ts-tv-option ts-tv-placeholder">${escape(data.text)}</div>`;
          return `<div class="ts-tv-option" style="flex-direction: row; align-items: center; gap: 0.75rem;">
            <span class="ts-tv-code">${escape(codigo)}</span>
            <span class="ts-tv-brand">${escape(marca)}</span>
            <span class="ts-tv-serial" style="margin-left: 1rem; padding-left: 0; color: var(--text-muted); font-family: monospace; font-size: 0.85rem;">${escape(serial)}</span>
          </div>`;
        },
        item: function(data, escape) {
          const opt = sel.querySelector(`option[value="${data.value}"]`);
          const codigo = opt ? opt.dataset.codigo : '';
          const serial = opt ? opt.dataset.serial : '';
          const marca  = opt ? opt.dataset.marca  : '';
          if (!codigo) return `<div>${escape(data.text)}</div>`;
          return `<div class="ts-tv-item"><strong>${escape(codigo)}</strong><span class="ts-tv-divider"></span><span>${escape(marca)}</span><span class="ts-tv-divider"></span><span class="ts-tv-item-serial">${escape(serial)}</span></div>`;
        }
      }
    });
  }

  // Poblar select oculto de tipo con opciones
  const selTipo = document.getElementById('movTipo');
  if (selTipo && !selTipo.options.length) {
    selTipo.innerHTML = `
      <option value="">-- Seleccionar --</option>
      <option value="traslado_hab">HABITACION</option>
      <option value="entrada_taller">TALLER</option>
      <option value="baja">DE BAJA</option>
      <option value="otro">OTROS</option>
    `;
  }
  
  // Limpiar info card del TV
  _movUpdateTVCard(null);
  
  const custom = loadUbicaciones();
  const origenInput = document.getElementById('movOrigen');
  if (origenInput) {
    origenInput.value = 'Sin TV seleccionado';
  }
  const destInput = document.getElementById('movDestino');
  if (destInput) {
    destInput.value = '';
  }

  // Datetime local = ahora (hora local del CPU, no UTC)
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  document.getElementById('movFecha').value = now.toISOString().slice(0,16);

  // Limpiar selección de tipo visual
  document.querySelectorAll('.mov-tipo-btn').forEach(b => b.classList.remove('selected'));
  
  adjustMovDestinoHabWidth();
}

// Al cambiar el filtro de origen, repoblar la lista y mostrar el listado
const movOrigenFiltroEl = document.getElementById('movOrigenFiltro');
if (movOrigenFiltroEl) {
  movOrigenFiltroEl.addEventListener('change', function() {
    const tvs = loadTVs();
    const val = this.value;
    let lista = tvs.filter(t => t.estado !== 'baja');
    if (val === 'Habitacion') {
      lista = lista.filter(t => (t.ubicacion === 'Habitacion' || t.ubicacion === 'Habitación') && t.estado !== 'taller');
    } else if (val === 'Taller') {
      lista = lista.filter(t => (t.estado === 'taller' || String(t.ubicacion || '').toLowerCase() === 'taller') && t.tallerEstado === 'operativo');
    } else if (val === 'Almacen') {
      lista = lista.filter(t => t.ubicacion === 'Almacen');
    } else if (val && val.startsWith('lugar:')) {
      const lugar = val.slice(6);
      lista = lista.filter(t => t.ubicacion === lugar);
    }

    if (lista.length === 0) {
      showToast('No hay TVs en ese lugar.', 'info');
      if (window.movTVTomSelect) {
        window.movTVTomSelect.clear();
        window.movTVTomSelect.close();
      }
      _movUpdateTVCard(null);
      const origenInput = document.getElementById('movOrigen');
      if (origenInput) origenInput.value = 'Sin TV seleccionado';
      return;
    }

    populateMovTV();
    if (window.movTVTomSelect) {
      window.movTVTomSelect.open();
    }
  });
}

/** Actualiza la tarjeta de info del TV en el panel izquierdo y activa/desactiva el overlay */
function _movUpdateTVCard(tv) {
  const card        = document.getElementById('movTVCard');
  const placeholder = document.getElementById('movTVPlaceholder');
  const imgWrap     = document.getElementById('movTVImgContainer');
  const imgEl       = document.getElementById('movTVImg');
  const overlay     = document.getElementById('movPanelOverlay');

  if (!tv) {
    if (card)        card.style.display = 'none';
    if (placeholder) placeholder.style.display = '';
    if (imgEl)       imgEl.src = '';
    // Mostrar overlay (bloquear panel derecho)
    if (overlay)     overlay.classList.remove('hidden');
    return;
  }

  // Datos
  const ubicLabel = (tv.ubicacion === 'Habitacion' && tv.habitacion)
    ? `Hab. ${tv.habitacion}`
    : (tv.ubicacion || '—');

  const setVal = (id, txt) => {
    const el = document.getElementById(id);
    if (el) el.textContent = txt || '—';
  };
  setVal('movTVInfoCodigo',   tv.codigo);
  setVal('movTVInfoMarca',    `${tv.marca} ${tv.modelo || ''}`.trim());
  setVal('movTVInfoSerial',   tv.serial);
  setVal('movTVInfoUbicacion', ubicLabel);

  // Imagen
  if (tv.imgTrasera) {
    imgEl.src = tv.imgTrasera;
    if (imgWrap) imgWrap.style.display = '';
  } else {
    imgEl.src = '';
    if (imgWrap) imgWrap.style.display = 'none';
  }

  if (placeholder) placeholder.style.display = 'none';
  if (card)        card.style.display = '';
  // Ocultar overlay (habilitar panel derecho)
  if (overlay)     overlay.classList.add('hidden');
}



if (document.getElementById('movTV')) {
  document.getElementById('movTV').addEventListener('change', function() {
    const val = this.value;
    const tvs = loadTVs();
    const tv = tvs.find(t => String(t.id) === String(val));
    
    const grpTvSaliente = document.getElementById('grpMovTvSaliente');
    if (grpTvSaliente) grpTvSaliente.style.display = 'none';
    
    const origenSelect = document.getElementById('movOrigen');
    
    if (tv) {
      // Actualizar campo origen
      if (origenSelect) {
        let valToSet = (tv.ubicacion === 'Habitacion' && tv.habitacion) ? tv.habitacion : tv.ubicacion;
        origenSelect.value = valToSet || '';
      }
      // Actualizar tarjeta de info del TV
      _movUpdateTVCard(tv);
    } else {
      if (origenSelect) origenSelect.value = 'Sin TV seleccionado';
      _movUpdateTVCard(null);
    }
  });
}

// ── Tarjetas visuales de Tipo de Movimiento ──
document.querySelectorAll('.mov-tipo-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    if (btn.classList.contains('locked')) return;
    document.querySelectorAll('.mov-tipo-btn').forEach(b => {
      b.classList.remove('selected');
      b.classList.remove('locked');
    });
    btn.classList.add('selected');
    btn.classList.add('locked');
    const sel = document.getElementById('movTipo');
    if (sel) sel.value = btn.dataset.val;

    const grpTvSaliente = document.getElementById('grpMovTvSaliente');
    if (grpTvSaliente) grpTvSaliente.style.display = 'none';

    const grpMovTaller = document.getElementById('grpMovTallerEstado');
    if (grpMovTaller) {
      grpMovTaller.style.display = btn.dataset.val === 'entrada_taller' ? '' : 'none';
if (btn.dataset.val === 'entrada_taller') {
      // Establecer origen según la ubicación actual del TV
      const origenSelect = document.getElementById('movOrigen');
      const tvSelect = document.getElementById('movTV');
      if (origenSelect && tvSelect) {
        const tv = tvs.find(t => String(t.id) === String(tvSelect.value));
        if (tv) {
          // Si el TV está en habitación (con o sin acento), poner el número de habitación
          if (tv.ubicacion === 'Habitacion' || tv.ubicacion === 'Habitación') {
            origenSelect.value = tv.habitacion || tv.ubicacion || '';
          } else if (tv.ubicacion === 'Taller') {
            origenSelect.value = 'Taller';
          } else {
            // Otherwise, use the location
            origenSelect.value = tv.ubicacion || '';
          }
        } else {
          origenSelect.value = '';
        }
        origenSelect.disabled = true;
      }
      document.getElementById('movTallerEstado').value = 'inoperativo';
    }
    }

    const destInput = document.getElementById('movDestino');
    const destSelect = document.getElementById('movDestinoSelect');

    if (btn.dataset.val === 'otro') {
      if (destInput) destInput.style.display = 'none';
      if (destSelect) {
        destSelect.style.display = '';
        renderMovDestinoSelect();
        mostrarModalNuevaArea(function(areaCreada) {
          renderMovDestinoSelect();
          destSelect.value = areaCreada;
        });
      }
    } else {
      if (destSelect) destSelect.style.display = 'none';
      if (destInput) {
        destInput.style.display = '';
        // Remover readonly y asegurar que se quede removido
        destInput.removeAttribute('readonly');
        destInput.readonly = false;
        // Establecer valor inmediatamente y directamente
        if (btn.dataset.val === 'entrada_taller') {
          destInput.value = 'AL TALLER';
          // Forzar actualización visual
          destInput.style.borderColor = '#2d3a4f';
        } else {
          destInput.value = btn.querySelector('.mov-tipo-txt').textContent;
        }
        // Disparar cambio para que otros handlers lo detecten
        const changeEvent = new Event('change', { bubbles: true });
        destInput.dispatchEvent(changeEvent);
      }
    }

    setTimeout(() => {
      if (btn.dataset.val === 'traslado_hab') {
        const grp = document.getElementById('grpMovDestinoHab');
        if (grp) grp.style.display = '';
        const habInput = document.getElementById('movDestinoHab');
        if (habInput) habInput.focus();
      } else {
        const grp = document.getElementById('grpMovDestinoHab');
        if (grp) grp.style.display = 'none';
        const fechaInput = document.getElementById('movFecha');
        if (fechaInput) fechaInput.focus();
      }
    }, 100);
  });
});

// Navegación con flechas en tarjetas de tipo de movimiento
document.querySelectorAll('.mov-tipo-btn').forEach((btn, idx, btns) => {
  btn.setAttribute('tabindex', '0');
  btn.addEventListener('keydown', e => {
    const cols = window.innerWidth <= 500 ? 2 : 3;
    let target = null;
    if (e.key === 'ArrowRight') { e.preventDefault(); target = btns[idx + 1] || btns[0]; }
    else if (e.key === 'ArrowLeft')  { e.preventDefault(); target = btns[idx - 1] || btns[btns.length - 1]; }
    else if (e.key === 'ArrowDown') { e.preventDefault(); target = btns[idx + cols] || btns[btns.length - 1]; }
    else if (e.key === 'ArrowUp')   { e.preventDefault(); target = btns[idx - cols] || btns[0]; }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); btn.click(); }
    if (target) target.focus();
  });
});

function renderMovDestinoSelect() {
  const sel = document.getElementById('movDestinoSelect');
  if (!sel) return;
  const custom = loadAreas();
  sel.innerHTML = `
    <option value="">-- Seleccionar Área --</option>
    <option value="Premium 68">Premium 68</option>
    <option value="Premium 69">Premium 69</option>
    <option value="Anillo 1">Anillo 1</option>
    <option value="Anillo 2">Anillo 2</option>
    <option value="Anillo 3">Anillo 3</option>
    ${custom.map(a => `<option value="${a}">${a}</option>`).join('')}
    <option value="nueva">➕ Agregar nueva área...</option>
  `;
}

if (document.getElementById('movDestinoSelect')) {
  document.getElementById('movDestinoSelect').addEventListener('change', function() {
    const self = this;
    if (self.value === 'nueva') {
      mostrarModalNuevaArea(function(areaCreada) {
        renderMovDestinoSelect();
        self.value = areaCreada;
      });
      return;
    }
    const selTipo = document.getElementById('movTipo');
    const grp = document.getElementById('grpMovDestinoHab');
    const val = (this.value || '').toLowerCase();
    if (selTipo && (selTipo.value === 'traslado_hab') && (val.includes('premium') || val.includes('anillo'))) {
      grp.style.display = '';
      const habInput = document.getElementById('movDestinoHab');
      const habList = document.getElementById('movDestinoHabList');
      if (habInput && habList) {
        const rooms = getRoomsForArea(this.value);
        habList.innerHTML = rooms.map(r => `<option value="${r}">`).join('');
        habInput.value = '';
        habInput.disabled = false;
        habInput.focus();
      }
    } else if (selTipo && selTipo.value === 'entrada_taller') {
      grp.style.display = 'none';
      const movDestino = document.getElementById('movDestino');
      const destSelect = document.getElementById('movDestinoSelect');
      if (destSelect) destSelect.style.display = 'none';
      if (movDestino) {
        movDestino.style.display = '';
        movDestino.value = this.value || '';
        movDestino.readOnly = true;
      }
      const habInput = document.getElementById('movDestinoHab');
      if (habInput) { habInput.value = ''; habInput.disabled = false; }
      const aviso = document.getElementById('movDestinoHabAviso');
      if (aviso) aviso.style.display = 'none';
      const nextField = document.getElementById('movFecha');
      if (nextField) nextField.focus();
    } else if (selTipo && selTipo.value === 'traslado_hab') {
      grp.style.display = '';
    } else {
      grp.style.display = 'none';
      const habInput = document.getElementById('movDestinoHab');
      if (habInput) { habInput.value = ''; habInput.disabled = false; }
      const aviso = document.getElementById('movDestinoHabAviso');
      if (aviso) aviso.style.display = 'none';
    }
  });
}


const elMovDestino = document.getElementById('movDestino');
if (elMovDestino) {
  elMovDestino.addEventListener('change', function() {
    const selTipo = document.getElementById('movTipo');
    const grp = document.getElementById('grpMovDestinoHab');
    if (selTipo && selTipo.value === 'traslado_hab') {
      grp.style.display = '';
      document.getElementById('movDestinoHab').required = true;
    } else {
      grp.style.display = 'none';
      document.getElementById('movDestinoHab').required = false;
      document.getElementById('movDestinoHab').value = '';
      document.getElementById('movDestinoHabAviso').style.display = 'none';
    }
  });
}

const elMovDestinoHab = document.getElementById('movDestinoHab');
if (elMovDestinoHab) {
  elMovDestinoHab.addEventListener('input', function() {
    adjustMovDestinoHabWidth();
    const habVal = this.value.trim();
    if (habVal.length >= 4 && isValidRoom(habVal) && !window._tvReemplazo) {
      const tvs = loadTVs();
      const exist = tvs.find(t =>
        t.estado === 'activo' &&
        ((t.ubicacion === 'Habitacion' || t.ubicacion === 'Habitación') && t.habitacion === habVal) ||
        (t.ubicacion === habVal));
      if (exist) {
        this.blur();
        mostrarModalReubicarTV(exist, habVal, function(tvReem, tipoReem, destinoReem, estadoReem) {
          window._tvReemplazo = { id: tvReem.id, codigo: tvReem.codigo, marca: tvReem.marca, modelo: tvReem.modelo, tamano: tvReem.tamano, serial: tvReem.serial, destino: destinoReem, ubicacion: tvReem.ubicacion, habitacion: tvReem.habitacion };
          window._tvReemplazoTipo = tipoReem;
          window._tvReemplazoEstado = estadoReem;
          const movDestino = document.getElementById('movDestino');
          const destSelect = document.getElementById('movDestinoSelect');
          const grp = document.getElementById('grpMovDestinoHab');
          const area = destSelect ? destSelect.value : '';
          if (destSelect) destSelect.style.display = 'none';
          if (movDestino) {
            movDestino.style.display = '';
            movDestino.value = area ? `${area} - Hab. ${habVal}` : `Hab. ${habVal}`;
            movDestino.readOnly = true;
          }
          if (grp) grp.style.display = 'none';
          const nextField = document.getElementById('movFecha');
          if (nextField) nextField.focus();
        });
      }
    }
  });

  elMovDestinoHab.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      const habVal = this.value.trim();
      if (!habVal || !isValidRoom(habVal)) {
        showToast(`La habitación ${habVal} no es válida.`, 'error');
        return;
      }
      if (window._tvReemplazo) return;
      const movDestino = document.getElementById('movDestino');
      const destSelect = document.getElementById('movDestinoSelect');
      const grp = document.getElementById('grpMovDestinoHab');
      const area = destSelect ? destSelect.value : '';
      if (destSelect) destSelect.style.display = 'none';
      if (movDestino) {
        movDestino.style.display = '';
        movDestino.value = area ? `${area} - Hab. ${habVal}` : `Hab. ${habVal}`;
        movDestino.readOnly = true;
      }
      if (grp) grp.style.display = 'none';
      const nextField = document.getElementById('movFecha');
      if (nextField) nextField.focus();
    }
  });
}
const elMovMotivo = document.getElementById('movMotivo');
if (elMovMotivo) {
  elMovMotivo.addEventListener('input', function() {
    const btnContainer = document.getElementById('movActaContainer');
    const tvId = document.getElementById('movTV') ? document.getElementById('movTV').value : '';
    if (this.value.trim().length > 0 && tvId) {
      if (btnContainer) btnContainer.style.display = 'block';
    } else {
      if (btnContainer) btnContainer.style.display = 'none';
    }
  });
}


// Devuelve el texto del procedimiento específico según el tipo de movimiento
function textoProcedimientoActivo(mov, tv) {
  const t = (mov.tipo || 'otro');
  const codigo = tv.codigo || '___';
  const marca = tv.marca || '___';
  const modelo = tv.modelo || '___';
  const tamano = tv.tamano || '___';
  const serial = tv.serial || '___';
  const origen = mov.origen || '______________';
  const destino = mov.destino || '______________';

  const base = `Se procede a registrar el movimiento del TV código interno <strong>${codigo}</strong>, marca <strong>${marca}</strong>, modelo <strong>${modelo}</strong>, de <strong>${tamano}</strong>, y serial <strong>${serial}</strong>.`;

  switch (t) {
    case 'entrada_taller':
      return `${base}<br>
      <strong>Procedimiento de Envío a Taller:</strong> El televisor fue retirado de su ubicación de origen (${origen}) y trasladado al Taller de Reparaciones del HPA para su revisión técnica. Queda bajo custodia del personal técnico, registrado en la condición indicada (operativo/inoperativo), hasta su diagnóstico y reparación.`;
    case 'retorno_taller':
      return `${base}<br>
      <strong>Procedimiento de Retorno de Taller:</strong> El televisor fue recibido del Taller de Reparaciones del HPA una vez concluida su revisión técnica, verificando su correcto funcionamiento. Se procede a reintegrarlo al inventario activo en la ubicación de destino (${destino}), quedando nuevamente disponible para su asignación.`;
    case 'baja':
      return `${base}<br>
      <strong>Procedimiento de Baja de Activo:</strong> Se procede a dar de baja el televisor del inventario activo del HPA, quedando excluido del parque tecnológico. Se registran las razones de la baja y se deja constancia del retiro del equipo del servicio.`;
    case 'traslado_hab':
      return `${base}<br>
      <strong>Procedimiento de Traslado de Activo:</strong> Se retira el televisor de su ubicación de origen (${origen}) y se traslada a la habitación ${destino}. El equipo es instalado y verificado en la habitación designada, quedando en servicio.${mov.tvReemplazo ? `<br>
      <strong>TV Reemplazado:</strong> El televisor existente en la habitación fue retirado y reubicado a: <strong>${mov.tvReemplazo.destino}</strong>.` : ''}`;
    case 'otro':
      return `${base}<br>
      <strong>Procedimiento:</strong> Se procede al movimiento del activo desde ${origen} hacia ${destino}, conforme a las indicaciones de la Gerencia General.`;
    default:
      return `${base}<br>
      <strong>Procedimiento:</strong> Se procede al movimiento del activo desde ${origen} hacia ${destino}.`;
  }
}

function imprimirActaActual() {
  const get = id => (document.getElementById(id) ? document.getElementById(id).value.trim() : '');
  const tvId = get('movTV');
  if (!tvId) {
    showToast('Selecciona un TV primero.', 'error');
    return;
  }
  const tvs = loadTVs();
  const tv = tvs.find(t => String(t.id) === String(tvId));
  if (!tv) return;

  const fechaVal = get('movFecha');
  const d = fechaVal ? new Date(fechaVal) : new Date();
  const fechaFmt = `Playa El Agua, ${d.toLocaleDateString('es-VE', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }).replace(/de (\d{4})/, 'del $1')}.-`;
  const horaFmt = d.toLocaleTimeString('es-VE', { hour:'2-digit', minute:'2-digit' });

  const respInputs = document.querySelectorAll('.mov-resp-input');
  const respList = Array.from(respInputs).map(i => i.value.trim()).filter(Boolean);
  const resp1 = respList[0] || '______________________';
  const resp2 = respList[1] || '______________________';
  const resp3 = respList[2] || '______________________';
  let origen = get('movOrigen') || '______________';
  let destino = get('movDestino') || '______________';
  const selTipo = get('movTipo');
  if (selTipo === 'traslado_hab') {
    const hab = get('movDestinoHab');
    destino = hab ? `Hab. ${hab}` : destino;
  }

  const motivo = get('movMotivo') || 'Sin descripción';

  const confirmar = confirm('¿Desea imprimir el acta de movimiento?');
  if (!confirmar) return;

  const w = window.open('', '_blank');
  if (!w) {
    showToast('El navegador bloqueó la ventana emergente. Permite ventanas emergentes para imprimir.', 'error');
    return;
  }
  w.document.write(`
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Acta de Movimiento - ${tv.codigo}</title>
  <style>
    @page { margin: 20mm; }
    body { font-family: 'Arial', sans-serif; color: #000; font-size: 14px; line-height: 1.6; }
    .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
    .header-logo-h { font-size: 32px; font-weight: normal; line-height: 1; display: flex; flex-direction: column; align-items: center; font-family: 'Times New Roman', serif; }
    .header-logo-h span { font-size: 10px; font-weight: normal; letter-spacing: 2px; font-family: 'Arial', sans-serif; margin-top: 4px; }
    .header-logo-pcp { font-size: 40px; font-weight: bold; display: flex; align-items: center; gap: 8px; color: #444; }
    .title { text-align: center; text-decoration: underline; font-weight: bold; margin: 30px 0; font-size: 16px; }
    .date-row { text-align: right; margin-bottom: 30px; }
    .content { text-align: justify; margin-bottom: 20px; }
    .lines-container { margin-top: 10px; margin-bottom: 60px; }
    .line-row { border-bottom: 1px solid #000; height: 28px; width: 100%; }
    .signatures { display: flex; flex-direction: column; gap: 50px; margin-top: 40px; }
    .sig-main { display: flex; justify-content: space-between; }
    .sig-colabs { display: flex; justify-content: space-between; margin-top: 20px; }
  </style>
</head>
<body>
  <div class="header">
    <div class="header-logo-h">
      |--|
      <span>HESPERIA</span>
      <span style="font-size:8px; letter-spacing: 1px; margin-top: 2px;">PLAYA EL AGUA</span>
    </div>
    <div class="header-logo-pcp">
      <span style="font-size: 32px;">🛡️</span>PCP
    </div>
  </div>

  <div class="title">CONSTANCIA DE CAMBIO DE ACTIVOS</div>

  <div class="date-row">${fechaFmt}</div>

  <div class="content">
    En esta misma fecha, siendo las <u>&nbsp;${horaFmt}&nbsp;</u>, por instrucciones de la Gerencia General, se procede a realizar el siguiente movimiento de activo en el HPA.
    <br><br>
    <strong>Descripción del procedimiento:</strong><br>
      ${textoProcedimientoActivo({ tipo: selTipo, origen, destino, tvReemplazo: window._tvReemplazo || null }, tv)}<br>
    <strong>Motivo del movimiento:</strong> ${motivo}<br>
    <strong>Responsable de la ejecución:</strong> ${respList.length ? respList.join(', ') : '______________________'}
  </div>

  <div class="lines-container">
    <div class="line-row"></div>
    <div class="line-row"></div>
    <div class="line-row"></div>
    <div class="line-row"></div>
    <div class="line-row"></div>
    <div class="line-row"></div>
  </div>

  <div class="signatures">
    <div class="sig-main">
      <div>Gerencia General __________________________________</div>
      <div>Firma _______________________________________</div>
    </div>
    <div>
      <div>Firma de los colaboradores actuantes.</div>
      <div class="sig-colabs">
        <span>1. ${resp1} ______________</span>
        <span>2. ${resp2} ______________</span>
        <span>3. ${resp3} ______________</span>
      </div>
    </div>
  </div>
  <script>
    window.onload = () => { window.print(); };
    window.onafterprint = () => { window.close(); };
  </script>
</body>
</html>
  `);
  w.document.close();
}

function imprimirActaFromData(mov, tv) {
  if (!tv) return;

  const d = mov.fecha && !mov.fecha.includes('desconocida') ? new Date(mov.fecha) : new Date();
  const fechaFmt = `Playa El Agua, ${d.toLocaleDateString('es-VE', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }).replace(/de (\d{4})/, 'del $1')}.-`;
  const horaFmt = d.toLocaleTimeString('es-VE', { hour:'2-digit', minute:'2-digit' });

  const respRaw = mov.responsable || '';
  const respList = respRaw.split(',').map(r => r.trim()).filter(Boolean);
  const resp1 = respList[0] || '______________________';
  const resp2 = respList[1] || '______________________';
  const resp3 = respList[2] || '______________________';

  let origen = mov.origen;
  if (!origen || origen === '______________') {
    if (tv.ubicacion === 'Habitacion') {
      origen = `Hab. ${tv.habitacion || '?'}`;
    } else {
      origen = tv.ubicacion || 'Almacén';
    }
  }
  let destino = mov.destino || '______________';
  if (mov.habDestino) destino = `Hab. ${mov.habDestino}`;
  const motivo = mov.motivo || 'Sin descripción';

  const actaHTML = `
    <div class="acta-header" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
      <div style="font-size:32px; line-height:1; display:flex; flex-direction:column; align-items:center; font-family:'Times New Roman', serif;">
        |--|
        <span style="font-size:10px; font-weight:normal; letter-spacing:2px; font-family:Arial, sans-serif; margin-top:4px;">HESPERIA</span>
        <span style="font-size:8px; letter-spacing:1px; font-family:Arial, sans-serif;">PLAYA EL AGUA</span>
      </div>
      <div style="font-size:40px; font-weight:bold; display:flex; align-items:center; gap:8px; color:#444;">
        <span style="font-size:32px;">🛡️</span>PCP
      </div>
    </div>
    <div style="text-align:center; text-decoration:underline; font-weight:bold; margin:30px 0; font-size:16px; color:#1a202c;">CONSTANCIA DE CAMBIO DE ACTIVOS</div>
    <div style="text-align:right; margin-bottom:30px;">${fechaFmt}</div>
    <div style="text-align:justify; margin-bottom:20px; color:#2d3748; line-height:1.8;">
      En esta misma fecha, siendo las <u>&nbsp;${horaFmt}&nbsp;</u>, por instrucciones de la Gerencia General, se procede a realizar el siguiente movimiento de activo en el HPA.
      <br><br>
      <strong>Descripción del procedimiento:</strong><br>
    ${textoProcedimientoActivo(mov, tv)}<br>
      ${mov.tvReemplazo ? `<strong>Detalle del TV Reemplazado:</strong><br>
      &nbsp;&nbsp;&nbsp;&nbsp;Código: <strong>${mov.tvReemplazo.codigo}</strong><br>
      &nbsp;&nbsp;&nbsp;&nbsp;Marca: <strong>${mov.tvReemplazo.marca}</strong>, Modelo: <strong>${mov.tvReemplazo.modelo}</strong><br>
      &nbsp;&nbsp;&nbsp;&nbsp;Tamaño: <strong>${mov.tvReemplazo.tamano}</strong>, Serial: <strong>${mov.tvReemplazo.serial}</strong><br>
      &nbsp;&nbsp;&nbsp;&nbsp;Reubicado a: <strong>${mov.tvReemplazo.destino}</strong>.<br>` : ''}
      <strong>Motivo del movimiento:</strong> ${motivo}<br>
      <strong>Responsable de la ejecución:</strong> ${respList.length ? respRaw : '______________________'}
    </div>
    <div style="margin-top:10px; margin-bottom:60px;">
      <div style="border-bottom:1px solid #000; height:28px;"></div>
      <div style="border-bottom:1px solid #000; height:28px;"></div>
      <div style="border-bottom:1px solid #000; height:28px;"></div>
      <div style="border-bottom:1px solid #000; height:28px;"></div>
      <div style="border-bottom:1px solid #000; height:28px;"></div>
      <div style="border-bottom:1px solid #000; height:28px;"></div>
    </div>
    <div style="display:flex; flex-direction:column; gap:50px; margin-top:40px;">
      <div style="display:flex; justify-content:space-between;">
        <div>Gerencia General __________________________________</div>
        <div>Firma _______________________________________</div>
      </div>
      <div>
        <div>Firma de los colaboradores actuantes.</div>
        <div style="display:flex; justify-content:space-between; margin-top:20px;">
          <span>1. ${resp1} ______________</span>
          <span>2. ${resp2} ______________</span>
          <span>3. ${resp3} ______________</span>
        </div>
      </div>
    </div>
  `;

  let overlay = document.getElementById('actaOverlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'actaOverlay';
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal" style="max-width:800px; max-height:95vh; background:#fff; color:#000;">
        <div class="modal-header">
          <h3 style="color:#1a202c; text-shadow:none;">📄 Acta de Movimiento</h3>
          <button class="modal-close" onclick="closeActaOverlay()" title="Cerrar">✕</button>
        </div>
        <div class="modal-body" id="actaBody" style="padding:2rem; max-height:70vh; overflow-y:auto; background:#fff;"></div>
        <div style="padding:0.75rem 1.5rem; display:flex; gap:1rem; justify-content:space-between; align-items:center; background:#f8fafc; border-top:2px solid #e2e8f0;">
          <button onclick="closeActaOverlay()" style="background:#4f46e5; color:#fff; border:none; padding:0.8rem 1.8rem; border-radius:10px; font-size:1rem; font-weight:700; cursor:pointer; display:flex; align-items:center; gap:0.6rem; box-shadow:0 4px 14px rgba(79,70,229,0.4); transition:all 0.2s;">
            ← Volver al Menú
          </button>
          <div style="display:flex; gap:0.75rem;">
            <button class="btn btn-primary" onclick="printActaOverlay()" style="display:flex; align-items:center; gap:0.5rem;">
              🖨️ Imprimir
            </button>
            <button onclick="closeActaOverlay()" style="background:#ef4444; color:#fff; border:none; padding:0.7rem 1.2rem; border-radius:8px; font-size:0.9rem; font-weight:600; cursor:pointer; display:flex; align-items:center; gap:0.5rem;">
              Cerrar
            </button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
  }

  document.getElementById('actaBody').innerHTML = actaHTML;
  overlay.classList.add('open');

  _lastFocusedElement = document.activeElement;

  saveActaImage(mov, tv);
}

async function saveActaImage(mov, tv) {
  try {
    const actaBody = document.getElementById('actaBody');
    if (!actaBody || typeof html2canvas === 'undefined') return;

    const canvas = await html2canvas(actaBody, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    if (!blob) return;

    const d = new Date();
    const fecha = d.toISOString().slice(0, 10);
    const hora = d.toTimeString().slice(0, 5).replace(':', '');
    const codigo = tv.codigo || 'TV';
    const tipo = mov.tipo || 'mov';
    const filePath = `actas/${codigo}_${tipo}_${fecha}_${hora}.png`;
    const ref = storage.ref(filePath);
    await ref.put(blob);
    const url = await ref.getDownloadURL();

    await db.collection('movimientos').doc(mov.id).update({ actaUrl: url, actaPath: filePath });
  } catch (err) {
    console.error('Error guardando acta:', err);
  }
}

function printActaOverlay() {
  const body = document.getElementById('actaBody');
  if (!body) return;
  const w = window.open('', '_blank');
  if (!w) {
    showToast('El navegador bloqueó la ventana emergente. Permite ventanas emergentes para imprimir.', 'error');
    return;
  }
  w.document.write(`
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Acta de Movimiento</title>
  <style>
    @page { margin: 20mm; }
    body { font-family: 'Arial', sans-serif; color: #000; font-size: 14px; line-height: 1.6; }
  </style>
</head>
<body>
  ${body.innerHTML}
  <script>
    window.onload = () => { window.print(); };
    window.onafterprint = () => { window.close(); };
  </script>
</body>
</html>
  `);
  w.document.close();
  closeActaOverlay();
}

function closeActaOverlay() {
  const overlay = document.getElementById('actaOverlay');
  if (overlay) overlay.classList.remove('open');
  if (_lastFocusedElement) { _lastFocusedElement.focus(); _lastFocusedElement = null; }
  showPage('inventario');
}

function openActaFromMov(e, movId) {
  e.preventDefault();
  e.stopPropagation();
  const movs = loadMovs();
  const tvs = loadTVs();
  const mov = movs.find(m => String(m.id) === String(movId));
  if (!mov) return;
  const tv = tvs.find(t => String(t.id) === String(mov.tvId));
  if (!tv) return;

  const d = mov.fecha && !mov.fecha.includes('desconocida') ? new Date(mov.fecha) : new Date();
  const fechaFmt = `Playa El Agua, ${d.toLocaleDateString('es-VE', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }).replace(/de (\d{4})/, 'del $1')}.-`;
  const horaFmt = d.toLocaleTimeString('es-VE', { hour:'2-digit', minute:'2-digit' });

  const respRaw = mov.responsable || '';
  const respList = respRaw.split(',').map(r => r.trim()).filter(Boolean);
  const resp1 = respList[0] || '______________________';
  const resp2 = respList[1] || '______________________';
  const resp3 = respList[2] || '______________________';

  let origen = mov.origen;
  if (!origen || origen === '______________') {
    if (tv.ubicacion === 'Habitacion') {
      origen = `Hab. ${tv.habitacion || '?'}`;
    } else {
      origen = tv.ubicacion || 'Almacén';
    }
  }
  let destino = mov.destino || '______________';
  if (mov.habDestino) destino = `Hab. ${mov.habDestino}`;
  const motivo = mov.motivo || 'Sin descripción';

  const w = window.open('', '_blank');
  if (!w) {
    showToast('El navegador bloqueó la ventana emergente.', 'error');
    return;
  }
  w.document.write(`
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Acta de Movimiento - ${tv.codigo}</title>
  <style>
    @page { margin: 20mm; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Arial', sans-serif; color: #000; font-size: 14px; line-height: 1.6; background: #f0f0f0; padding: 20px; }
    .acta-container { max-width: 800px; margin: 0 auto; background: #fff; padding: 40px; box-shadow: 0 4px 20px rgba(0,0,0,0.2); }
    .toolbar { max-width: 800px; margin: 0 auto 15px; display: flex; justify-content: flex-end; gap: 10px; }
    .toolbar button { padding: 10px 20px; border: none; border-radius: 6px; font-size: 14px; font-weight: 600; cursor: pointer; }
    .btn-print { background: #4f46e5; color: #fff; }
    .btn-print:hover { background: #4338ca; }
    .btn-close { background: #e2e8f0; color: #333; }
    .btn-close:hover { background: #cbd5e1; }
  </style>
</head>
<body>
  <div class="toolbar">
    <button class="btn-print" onclick="window.print();">🖨️ Imprimir</button>
    <button class="btn-close" onclick="window.close();">Cerrar</button>
  </div>
  <div class="acta-container">
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
      <div style="font-size:32px; line-height:1; display:flex; flex-direction:column; align-items:center; font-family:'Times New Roman', serif;">
        |--|
        <span style="font-size:10px; font-weight:normal; letter-spacing:2px; font-family:Arial, sans-serif; margin-top:4px;">HESPERIA</span>
        <span style="font-size:8px; letter-spacing:1px; font-family:Arial, sans-serif;">PLAYA EL AGUA</span>
      </div>
      <div style="font-size:40px; font-weight:bold; display:flex; align-items:center; gap:8px; color:#444;">
        <span style="font-size:32px;">🛡️</span>PCP
      </div>
    </div>
    <div style="text-align:center; text-decoration:underline; font-weight:bold; margin:30px 0; font-size:16px;">CONSTANCIA DE CAMBIO DE ACTIVOS</div>
    <div style="text-align:right; margin-bottom:30px;">${fechaFmt}</div>
    <div style="text-align:justify; margin-bottom:20px; line-height:1.8;">
      En esta misma fecha, siendo las <u>&nbsp;${horaFmt}&nbsp;</u>, por instrucciones de la Gerencia General, se procede a realizar el siguiente movimiento de activo en el HPA.
      <br><br>
      <strong>Descripción del procedimiento:</strong><br>
    ${textoProcedimientoActivo(mov, tv)}<br>
      ${mov.tvReemplazo ? `<strong>Detalle del TV Reemplazado:</strong><br>
      &nbsp;&nbsp;&nbsp;&nbsp;Código: <strong>${mov.tvReemplazo.codigo}</strong><br>
      &nbsp;&nbsp;&nbsp;&nbsp;Marca: <strong>${mov.tvReemplazo.marca}</strong>, Modelo: <strong>${mov.tvReemplazo.modelo}</strong><br>
      &nbsp;&nbsp;&nbsp;&nbsp;Tamaño: <strong>${mov.tvReemplazo.tamano}</strong>, Serial: <strong>${mov.tvReemplazo.serial}</strong><br>
      &nbsp;&nbsp;&nbsp;&nbsp;Reubicado a: <strong>${mov.tvReemplazo.destino}</strong>.<br>` : ''}
      <strong>Motivo del movimiento:</strong> ${motivo}<br>
      <strong>Responsable de la ejecución:</strong> ${respList.length ? respRaw : '______________________'}
    </div>
    <div style="margin-top:10px; margin-bottom:60px;">
      <div style="border-bottom:1px solid #000; height:28px;"></div>
      <div style="border-bottom:1px solid #000; height:28px;"></div>
      <div style="border-bottom:1px solid #000; height:28px;"></div>
      <div style="border-bottom:1px solid #000; height:28px;"></div>
      <div style="border-bottom:1px solid #000; height:28px;"></div>
      <div style="border-bottom:1px solid #000; height:28px;"></div>
    </div>
    <div style="display:flex; flex-direction:column; gap:50px; margin-top:40px;">
      <div style="display:flex; justify-content:space-between;">
        <div>Gerencia General __________________________________</div>
        <div>Firma _______________________________________</div>
      </div>
      <div>
        <div>Firma de los colaboradores actuantes.</div>
        <div style="display:flex; justify-content:space-between; margin-top:20px;">
          <span>1. ${resp1} ______________</span>
          <span>2. ${resp2} ______________</span>
          <span>3. ${resp3} ______________</span>
        </div>
      </div>
    </div>
  </div>
</body>
</html>
  `);
  w.document.close();
}

function resetFormMovimiento() {
  document.getElementById('formMovimiento').reset();
  const grpMovTaller = document.getElementById('grpMovTallerEstado');
  if (grpMovTaller) {
    grpMovTaller.style.display = 'none';
    document.getElementById('movTallerEstado').value = 'inoperativo';
  }
  const filtroOrigen = document.getElementById('movOrigenFiltro');
  if (filtroOrigen) filtroOrigen.value = '';
  populateMovTV();
  const grp = document.getElementById('grpMovDestinoHab');
  if (grp) grp.style.display = 'none';
  const aviso = document.getElementById('movDestinoHabAviso');
  if (aviso) aviso.style.display = 'none';
  document.querySelectorAll('.mov-tipo-btn').forEach(b => {
    b.classList.remove('selected');
    b.classList.remove('locked');
  });
  _movUpdateTVCard(null);

  const btnContainer = document.getElementById('movActaContainer');
  if (btnContainer) btnContainer.style.display = 'none';

  const destInput = document.getElementById('movDestino');
  const destSelect = document.getElementById('movDestinoSelect');
  if (destSelect) { destSelect.style.display = 'none'; destSelect.value = ''; }
  if (destInput) {
    destInput.style.display = '';
    destInput.value = '';
    destInput.removeAttribute('readonly');
    destInput.readOnly = false;
  }

  const grpTvSaliente = document.getElementById('grpMovTvSaliente');
  if (grpTvSaliente) grpTvSaliente.style.display = 'none';

  window._tvReemplazo = null;
  window._tvReemplazoTipo = null;
  window._tvReemplazoEstado = null;

  document.querySelectorAll('.mov-resp-input').forEach(i => i.value = '');

  const searchInput = document.getElementById('searchInventario');
  if (searchInput) {
    searchInput.value = '';
    applyInventarioFilters();
  }

  adjustMovDestinoHabWidth();
}


document.getElementById('formMovimiento').addEventListener('submit', async e => {
  e.preventDefault();
  const get = id => document.getElementById(id).value.trim();
  
  const tvId = get('movTV');
  
  const tipo = get('movTipo'),
        rawFecha = get('movFecha'), motivo = get('movMotivo');
  const origen = get('movOrigen');

  const fecha = (!rawFecha || rawFecha.includes('0001') || rawFecha.includes('0000')) ? 'desconocida' : rawFecha;

  const respInputs = document.querySelectorAll('.mov-resp-input');
  const respList = Array.from(respInputs).map(i => i.value.trim()).filter(Boolean);
  const responsable = respList.join(', ');
  let destino = get('movDestino');
  if (tipo === 'otro') {
    destino = get('movDestinoSelect');
    if (!destino) {
      showToast('Selecciona el área de destino.', 'error'); return;
    }
    const destinoLimpio = (destino || '').trim().toUpperCase();
    const origenLimpio = (origen || '').trim().toUpperCase();
    if (origenLimpio && destinoLimpio && (
      (origenLimpio.includes('TALLER') && destinoLimpio.includes('TALLER')) ||
      (origenLimpio === destinoLimpio)
    )) {
      showToast('El origen y el destino no pueden ser el mismo lugar. Verifica los datos.', 'error');
      return;
    }
  }
  let habDestino = '';

  const tvs = loadTVs();

  if (tipo === 'traslado_hab') {
    habDestino = get('movDestinoHab');
    if (!habDestino) {
      showToast('Ingresa el número de habitación destino.', 'error'); return;
    }
    if (!isValidRoom(habDestino)) {
      showToast(`La habitación ${habDestino} no es válida.`, 'error'); return;
    }
    const exist = tvs.find(t => t.estado === 'activo' && ((t.ubicacion === 'Habitacion' || t.ubicacion === 'Habitación') || t.ubicacion === habDestino) && (t.habitacion === habDestino || t.ubicacion === habDestino));
    if (exist && exist.id !== tvId) {
      if (!window._tvReemplazo || window._tvReemplazo.id !== exist.id) {
        showToast('Presiona Enter en el campo de habitación para indicar el destino del TV existente.', 'error'); return;
      }
    } else {
      window._tvReemplazo = null;
    }
  }

  if (tipo === 'entrada_taller') {
    const destinoLimpio = (destino || '').replace(/[-\s]*Hab\.\s*\d+/gi, '').trim().toUpperCase();
    const origenLimpio = (origen || '').trim().toUpperCase();
    if (origenLimpio && destinoLimpio && (
      (origenLimpio.includes('TALLER') && destinoLimpio.includes('TALLER')) ||
      (origenLimpio === destinoLimpio)
    )) {
      showToast('El origen y el destino no pueden ser el mismo lugar. Verifica los datos.', 'error');
      return;
    }
  }

  if (tipo === 'traslado_hab') {
    if (origen && habDestino && origen.trim() === habDestino.trim()) {
      showToast('El origen y el destino no pueden ser la misma habitación.', 'error');
      return;
    }
  }

  if (!tvId) {
    showToast('Seleccione un TV válido de la lista.', 'error'); return;
  }
  if (tipo === 'traslado_hab') {
    destino = `Hab. ${habDestino}`;
  }
  if (!tipo || !responsable || !motivo || !origen) {
    showToast('Completa todos los campos obligatorios.', 'error'); return;
  }

  const btnSubmit = e.target.querySelector('button[type="submit"]');
  const prevText = btnSubmit.textContent;
  btnSubmit.textContent = 'Registrando...';
  btnSubmit.disabled = true;

  try {
    let pisoDestino = '';
    if (tipo === 'traslado_hab' && habDestino) {
      pisoDestino = get('movDestinoSelect') || get('asignarArea') || '';
    }
    const mov = {
      id: uid(), tvId, tipo, fecha, responsable, motivo, origen, destino, habDestino, pisoDestino,
      tvReemplazo: window._tvReemplazo || null,
      tvSaliente: (window._tvReemplazo && window._tvReemplazo.destino) || '',
      creadoEn: new Date().toISOString()
    };
    await db.collection('movimientos').doc(mov.id).set(mov);

    // Reubicar TV existente si hubo reemplazo
    if (window._tvReemplazo) {
      const reemp = window._tvReemplazo;
      const reempUpdates = { ubicacion: 'Habitacion' };
      if (/^\d+$/.test(reemp.destino)) {
        reempUpdates.habitacion = reemp.destino;
      } else {
        reempUpdates.habitacion = '';
        reempUpdates.ubicacion = reemp.destino;
        if (reemp.destino.toLowerCase().includes('taller')) {
          reempUpdates.estado = 'taller';
          reempUpdates.tallerEstado = reemp.tallerEstado || 'inoperativo';
        } else if (reemp.destino.toLowerCase().includes('baja')) {
          reempUpdates.estado = 'baja';
        } else if (reemp.destino.toLowerCase().includes('almacén') || reemp.destino.toLowerCase() === 'almacen') {
          reempUpdates.estado = 'activo';
        }
      }
      await db.collection('tvs').doc(reemp.id).update(reempUpdates);
      window._tvReemplazo = null;
    }

    // Actualizar estado del TV en Firestore directamente
    const updates = {};
    if (tipo === 'entrada_taller')  { updates.estado = 'taller'; updates.tallerEstado = document.getElementById('movTallerEstado').value || 'inoperativo'; updates.ubicacion = 'Taller'; updates.habitacion = ''; updates.piso = ''; }
    if (tipo === 'baja')            { updates.estado = 'baja'; updates.ubicacion = 'Baja'; updates.habitacion = ''; updates.piso = ''; }
    if (tipo === 'traslado_hab')    {
      updates.estado = 'activo';
      if (mov.habDestino) { updates.ubicacion = 'Habitacion'; updates.habitacion = mov.habDestino; if (mov.pisoDestino) updates.piso = mov.pisoDestino; }
    }
    if (tipo === 'otro') {
      updates.estado = 'activo';
      const destLower = (destino || '').toLowerCase();
      if (destLower.includes('taller')) {
        updates.ubicacion = 'Taller'; updates.habitacion = ''; updates.piso = '';
      } else if (destLower.includes('almacén') || destLower.includes('almacen')) {
        updates.ubicacion = 'Almacen'; updates.habitacion = ''; updates.piso = '';
      } else if (destLower.includes('habitacion') || destLower.includes('hab.') || /\bhab\.?\s*\d+/i.test(destino)) {
        const habMatch = destino.match(/hab\.?\s*(\d+)/i);
        updates.ubicacion = 'Habitacion';
        updates.habitacion = habMatch ? habMatch[1] : '';
      } else {
        updates.ubicacion = destino || 'Otro';
        updates.habitacion = '';
      }
    }
    if (Object.keys(updates).length > 0) {
      await db.collection('tvs').doc(tvId).update(updates);
    }

    showToast('El movimiento de TV fue guardado con éxito.', 'success', 4000);
    setTimeout(() => imprimirActaFromData(mov, tv), 4000);
    resetFormMovimiento();
  } catch(err) {
    console.error(err);
    showToast('Error al registrar movimiento: ' + err.message, 'error');
  } finally {
    btnSubmit.textContent = prevText;
    btnSubmit.disabled = false;
  }
});

// ─── HISTORIAL GLOBAL ─────────────────────────────────────────
function renderHistorial(filtroTipo = '', busqueda = '') {
  // El admin ve TODOS los registros (incluidos eliminados y eventos)
  const tvs  = isAdmin() ? loadAllTVs() : loadTVs();
  let movs = (isAdmin() ? loadAllMovs() : loadMovs()).sort((a, b) => {
    const fa = a.fecha || '';
    const fb = b.fecha || '';
    const aDesconocida = fa.includes('desconocida') || !fa;
    const bDesconocida = fb.includes('desconocida') || !fb;
    if (aDesconocida && bDesconocida) return 0;
    if (aDesconocida) return 1;
    if (bDesconocida) return -1;
    return fb.localeCompare(fa);
  });
  if (filtroTipo) movs = movs.filter(m => m.tipo === filtroTipo);
  if (busqueda) {
    const q = busqueda.toLowerCase();
    movs = movs.filter(m => {
      const tv = tvs.find(t => String(t.id) === String(m.tvId));
      return [m.motivo, m.responsable, m.habDestino, tv?.codigo, tv?.habitacion, m.codigo]
        .some(v => v && v.toLowerCase().includes(q));
    });
  }
  const tbody = document.getElementById('historialBody');
  if (!movs.length) {
    tbody.innerHTML = '<tr><td colspan="8" class="empty-state">Sin resultados.</td></tr>'; return;
  }
  tbody.innerHTML = movs.map(m => {
    const tv = tvs.find(t => String(t.id) === String(m.tvId));
    const esEvento = m.esEvento === true;
    const eliminado = m.deleted === true;
    const codigoMostrar = esEvento ? (m.codigo || '—') : (tv?.codigo || '—');
    const hasActa = !esEvento && tv && (m.actaUrl || m.tipo);
    const actaBtn = hasActa ? `<span class="ml-acta-icon" title="Ver acta" style="cursor:pointer; font-size:0.85rem; opacity:0.7; margin-left:4px;" onclick="event.stopPropagation(); openActaFromMov(event, '${m.id}')">📄</span>` : '';
    const logDelBtn = !esEvento && hasPermission('eliminar_movimiento') && !m.deleted ? `<button class="btn btn-danger btn-sm" onclick="event.stopPropagation(); confirmarEliminarMovimiento('${m.id}')" title="Ocultar registro" style="font-size:0.7rem; padding:2px 6px;">🗑️</button>` : '';
    const physDelBtn = !esEvento && hasPermission('eliminar_fisico_movimiento') && m.deleted ? `<button class="btn btn-danger btn-sm" onclick="event.stopPropagation(); confirmarEliminacionFisicaMovimiento('${m.id}')" title="Eliminar permanentemente" style="font-size:0.7rem; padding:2px 6px; background:rgba(255,77,109,0.2); border-color:rgba(255,77,109,0.5);">💀</button>` : '';
    const actaDelBtn = !esEvento && hasPermission('eliminar_fisico_acta') && m.actaUrl ? `<button class="btn btn-danger btn-sm" onclick="event.stopPropagation(); confirmarEliminarActaMovimiento('${m.id}')" title="Eliminar acta" style="font-size:0.7rem; padding:2px 6px; background:rgba(255,165,0,0.15); border-color:rgba(255,165,0,0.4); color:#ff9500;">📄✕</button>` : '';
    const actionsHtml = logDelBtn || physDelBtn || actaDelBtn ? `<div class="actions-cell" style="gap:4px;">${logDelBtn}${physDelBtn}${actaDelBtn}</div>` : '—';
    const badge = esEvento
      ? '<span style="margin-left:4px; font-size:0.65rem; background:rgba(99,179,237,0.2); color:var(--accent); border:1px solid rgba(99,179,237,0.3); border-radius:4px; padding:1px 5px;">EVENTO</span>'
      : (eliminado ? '<span style="margin-left:4px; font-size:0.65rem; background:rgba(255,77,109,0.2); color:#ff4d6d; border:1px solid rgba(255,77,109,0.4); border-radius:4px; padding:1px 5px;">ELIMINADO</span>' : '');
    return `<tr tabindex="0" data-tvid="${m.tvId || ''}" data-movid="${m.id || ''}" style="${esEvento ? 'background:rgba(99,179,237,0.05);' : (eliminado ? 'background:rgba(255,77,109,0.06);' : '')}">
      <td style="font-size:0.78rem;white-space:nowrap">${fmtDate(m.fecha)}</td>
      <td><strong style="color:var(--accent)">${codigoMostrar}</strong>${badge}${actaBtn}</td>
      <td>${tv?.habitacion || '—'}</td>
      <td>${tipoLabel[m.tipo] || m.tipo}</td>
      <td>${m.habDestino ? 'Hab. ' + m.habDestino : '—'}</td>
      <td>${m.responsable}</td>
      <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${m.motivo}">${m.motivo}</td>
      <td style="white-space:nowrap">${actionsHtml}</td>
    </tr>`;
  }).join('');

  const hRows = document.querySelectorAll('#historialBody tr');
  hRows.forEach((row, idx) => {
    row.addEventListener('click', () => {
      hRows.forEach(r => r.classList.remove('tr-selected'));
      row.classList.add('tr-selected');
      row.focus();
    });
    row.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const next = hRows[idx + 1] || hRows[0];
        hRows.forEach(r => r.classList.remove('tr-selected'));
        next.classList.add('tr-selected');
        next.focus();
        next.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const prev = hRows[idx - 1] || hRows[hRows.length - 1];
        hRows.forEach(r => r.classList.remove('tr-selected'));
        prev.classList.add('tr-selected');
        prev.focus();
        prev.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const tvId = row.dataset.tvid;
        if (tvId) verDetalle(tvId);
      } else if (e.key === 'Escape') {
        hRows.forEach(r => r.classList.remove('tr-selected'));
        row.blur();
      }
    });
  });
  if (hRows.length) {
    hRows[0].classList.add('tr-selected');
    hRows[0].focus();
  }
}

document.getElementById('searchHistorial').addEventListener('input', applyHistorialFilters);
document.getElementById('filterTipoMov').addEventListener('change', applyHistorialFilters);

function applyHistorialFilters() {
  renderHistorial(
    document.getElementById('filterTipoMov').value,
    document.getElementById('searchHistorial').value
  );
}

// ─── ASIGNAR TV A HABITACIÓN ──────────────────────────────────
let _asignarTvId = null;

const DB_AREAS = 'hpa_areas';
function loadAreas() {
  const raw = window.appData?.metadata?.areas || [];
  const seen = new Set();
  return raw.filter(a => {
    const k = a.toLowerCase().trim();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
async function saveAreas(d) { await db.collection('config').doc('metadata').update({ areas: d }); }

function renderAsignarAreas() {
  const sel = document.getElementById('asignarArea');
  if (!sel) return;
  const custom = loadAreas();
  sel.innerHTML = `
    <option value="">-- Seleccionar Área --</option>
    <option value="Premium 68">Premium 68</option>
    <option value="Premium 69">Premium 69</option>
    <option value="Anillo 1">Anillo 1</option>
    <option value="Anillo 2">Anillo 2</option>
    <option value="Anillo 3">Anillo 3</option>
    ${custom.map(a => `<option value="${a}">${a}</option>`).join('')}
    <option value="otro">otros</option>
  `;
}

function abrirAsignarHabitacion(tvId) {
  const tv = loadTVs().find(t => String(t.id) === String(tvId));
  if (!tv) return;

  const ubic = (tv.ubicacion || '').toLowerCase();
  if (ubic === 'taller') {
    showToast(`⚠️ El TV [${tv.codigo}] está en el TALLER. No puede ser asignado hasta que regrese a Almacén.`, 'error');
    return;
  }

  if (tv.ubicacion && tv.ubicacion !== 'Almacen' && tv.ubicacion !== 'Almacén') {
    showToast(`El TV [${tv.codigo}] está en "${tv.ubicacion}". Solo se pueden asignar TVs desde Almacén.`, 'error');
    return;
  }

  _asignarTvId = tvId;

  // Cuadro de texto televisor a asignar debe aparecer: codigo, marca, tamano y serial
  document.getElementById('asignarTvInfo').innerHTML =
    `<div class="asignar-tv-info-card">
       <div class="atv-header">
         <span class="atv-badge">${tv.codigo}</span>
         <span class="atv-brand">${tv.marca} ${tv.modelo || ''}</span>
       </div>
       <div class="atv-details">
         <div class="atv-row"><span class="atv-lbl">📐 Tamaño</span><span class="atv-val">${tv.tamano || '—'}</span></div>
         <div class="atv-row atv-serial-row"><span class="atv-lbl">🔑 Serial</span><code class="atv-serial">${tv.serial}</code></div>
       </div>
     </div>`;
     
  const imgCont = document.getElementById('asignarTvImgContainer');
  const imgEl = document.getElementById('asignarTvImg');
  if (tv.imgTrasera) {
    imgEl.src = tv.imgTrasera;
    if (imgCont) imgCont.style.display = 'block';
    imgEl.onclick = null;
    imgEl.ondblclick = () => zoomImagen(tv.imgTrasera, 'Foto de Etiqueta (Trasera) - ' + tv.codigo);
  } else {
    if (imgCont) imgCont.style.display = 'none';
    imgEl.onclick = null;
    imgEl.ondblclick = null;
  }
  document.getElementById('asignarHabNumero').value  = tv.habitacion || '';
  
  renderAsignarAreas();
  const selArea = document.getElementById('asignarArea');
  
  // Si la TV tiene un piso/área existente y no es uno de los por defecto, asegurar que esté en custom
  if (tv.piso && tv.piso !== 'Premium 68' && tv.piso !== 'Premium 69' && tv.piso !== 'Anillo 1' && tv.piso !== 'Anillo 2' && tv.piso !== 'Anillo 3') {
    const custom = loadAreas();
    if (!custom.includes(tv.piso)) {
      custom.push(tv.piso);
      saveAreas(custom);
      renderAsignarAreas();
    }
  }
  
  selArea.value = tv.piso || '';
  toggleAsignarHabNumero(tv.piso || '');
  
  document.getElementById('asignarResponsable').value = '';
  document.getElementById('asignarNota').value        = '';
  document.querySelectorAll('.asignar-resp-input').forEach((inp, i) => { if (i > 0) inp.value = ''; });
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  document.getElementById('asignarFechaIngreso').value = `${y}-${m}-${d}T${hh}:${mm}`;

  openModal('modalAsignar', '#asignarArea');
}

document.getElementById('btnClearAsignarFecha').addEventListener('click', function() {
  document.getElementById('asignarFechaIngreso').value = '';
  document.getElementById('asignarArea').focus();
});

document.getElementById('btnConfirmAsignar').addEventListener('click', async () => {
  if (!_asignarTvId) return;

  const tvsCheck = loadTVs();
  const tvCheck = tvsCheck.find(t => String(t.id) === String(_asignarTvId));
  if (tvCheck) {
    const ubCheck = (tvCheck.ubicacion || '').toLowerCase();
    if (ubCheck === 'taller') {
      showToast(`⚠️ El TV [${tvCheck.codigo}] se encuentra en el TALLER. Será reubicado automáticamente.`, 'info');
    }
  }

  const hab  = document.getElementById('asignarHabNumero').value.trim();
  let area   = document.getElementById('asignarArea').value;
  const respInputs = document.querySelectorAll('.asignar-resp-input');
  const respList = Array.from(respInputs).map(i => i.value.trim()).filter(Boolean);
  const resp = respList.join(', ');
  const nota = document.getElementById('asignarNota').value.trim();

  const esAreaHabitacion = (area || '').toLowerCase().includes('premium') || (area || '').toLowerCase().includes('anillo');

  if (!area) { showToast('Selecciona un área.', 'error'); return; }

  if (area === 'otro') {
    showToast('Por favor seleccione o ingrese una nueva área.', 'error');
    return;
  }

  if (esAreaHabitacion) {
    if (!hab) { showToast('Ingresa el número de habitación.', 'error'); return; }
    const tvsExistCheck = loadTVs();
    const tvEnHabitacion = tvsExistCheck.find(t => t.habitacion === hab && (t.ubicacion === 'Habitacion' || t.ubicacion === 'Habitación') && String(t.id) !== String(_asignarTvId));
    if (tvEnHabitacion) {
      showAlertaHabitacion(hab, tvEnHabitacion);
      return;
    }
  }

  if (!resp) { showToast('Ingresa el nombre del responsable.', 'error'); return; }

  const btnSubmit = document.getElementById('btnConfirmAsignar');
  const prevText = btnSubmit.textContent;
  btnSubmit.textContent = 'Asignando...';
  btnSubmit.disabled = true;

  try {
    const fechaVal = document.getElementById('asignarFechaIngreso').value;
    let fechaMov;
    if (fechaVal) {
      fechaMov = fechaVal;
    } else {
      fechaMov = 'desconocida';
    }
    const tvsList = loadTVs();
    const tvActual = tvsList.find(t => String(t.id) === String(_asignarTvId));
    const origenUbic = tvActual ? (tvActual.ubicacion === 'Habitacion' ? `Hab. ${tvActual.habitacion || '?'}` : tvActual.ubicacion || 'Almacén') : 'Almacén';
    const destinoVal = esAreaHabitacion ? `Hab. ${hab}` : area;
    const mov = {
      id: uid(),
      tvId: _asignarTvId,
      tipo: 'traslado_hab',
      fecha: fechaMov,
      responsable: resp,
      motivo: nota || (esAreaHabitacion ? `Asignación a habitación ${hab}` : `Asignación a ${area}`),
      origen: origenUbic,
      destino: destinoVal,
      habDestino: esAreaHabitacion ? hab : '',
      pisoDestino: area,
      observaciones: '',
      creadoEn: new Date().toISOString()
    };
    
    await db.collection('movimientos').doc(mov.id).set(mov);

    const updates = {
      habitacion: esAreaHabitacion ? hab : '',
      piso: area || '',
      ubicacion: esAreaHabitacion ? 'Habitacion' : area,
      estado: 'activo'
    };
    await db.collection('tvs').doc(_asignarTvId).update(updates);

    _asignarTvId = null;
    closeModal('modalAsignar');
    renderAsignarTVPage();
    showToast(esAreaHabitacion ? `TV asignado a habitación ${hab} correctamente. ✅` : `TV asignado a ${area} correctamente. ✅`, 'success');
    const tvsAsig = loadTVs();
    const tvAsig = tvsAsig.find(t => String(t.id) === String(mov.tvId));
    setTimeout(() => imprimirActaFromData(mov, tvAsig), 1000);
  } catch(err) {
    console.error(err);
    showToast('Error al asignar TV: ' + err.message, 'error');
  } finally {
    btnSubmit.textContent = prevText;
    btnSubmit.disabled = false;
  }
});

function renderAsignarTVPage() {
  const tvs = loadTVs().filter(t => t.estado !== 'baja' && t.ubicacion !== 'Habitacion');
  const container = document.getElementById('page-asignar-tv');
  if (!container) return;

  if (!tvs.length) {
    container.innerHTML = `
      <div class="form-container">
        <div class="card">
          <div class="card-header">
            <h2>📌 Asignación de TV</h2>
          </div>
          <div class="card-body">
            <p class="empty-state">No hay televisores en Almacén o Taller disponibles para asignar.</p>
          </div>
        </div>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <div class="form-container" style="max-width: 100%;">
      <div class="card">
        <div class="card-header">
          <h2>📌 Asignación de TV</h2>
        </div>
        <div class="card-body">
          <p style="color: var(--text-secondary); margin-bottom: 1.25rem; font-size: 0.9rem;">
            Listado de televisores actualmente en stock (Almacén / Taller) listos para ser asignados a una habitación.
          </p>
          <div class="table-wrapper">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Ubicación Actual</th>
                  <th>Marca</th>
                  <th>Modelo</th>
                  <th>Estado</th>
                  <th>Acción</th>
                </tr>
              </thead>
              <tbody>
                ${tvs.map(t => `
                  <tr tabindex="0" data-tvid="${t.id}">
      <td><strong style="color:var(--accent)">${t.codigo}</strong>${t.deleted ? '<span style="margin-left:4px; font-size:0.65rem; background:rgba(255,77,109,0.2); color:#ff4d6d; border:1px solid rgba(255,77,109,0.4); border-radius:4px; padding:1px 5px;">ELIMINADO</span>' : ''}</td>
                    <td>${t.ubicacion || '—'}</td>
                    <td>${t.marca}</td>
                    <td>${t.modelo}</td>
                    <td>${estadoBadge[t.estado] || t.estado}</td>
                    <td>
                      <button class="btn btn-assign btn-sm" onclick="abrirAsignarHabitacion('${t.id}')" ${(t.ubicacion === 'Habitacion' || (t.ubicacion || '').toLowerCase() === 'taller') ? 'disabled style="opacity:0.5;cursor:not-allowed;"' : ''}>
                        🏨 Asignar a Habitación
                      </button>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  `;

  const aRows = container.querySelectorAll('#page-asignar-tv tbody tr');
  aRows.forEach((row, idx) => {
    row.addEventListener('click', () => {
      aRows.forEach(r => r.classList.remove('tr-selected'));
      row.classList.add('tr-selected');
      row.focus();
    });
    row.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const next = aRows[idx + 1] || aRows[0];
        aRows.forEach(r => r.classList.remove('tr-selected'));
        next.classList.add('tr-selected');
        next.focus();
        next.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const prev = aRows[idx - 1] || aRows[aRows.length - 1];
        aRows.forEach(r => r.classList.remove('tr-selected'));
        prev.classList.add('tr-selected');
        prev.focus();
        prev.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const btn = row.querySelector('.btn-assign');
        if (btn) btn.click();
      } else if (e.key === 'Escape') {
        aRows.forEach(r => r.classList.remove('tr-selected'));
        row.blur();
      }
    });
  });
  if (aRows.length) {
    aRows[0].classList.add('tr-selected');
    aRows[0].focus();
  }
}

// Drag and Drop support for image upload
const dropZone = document.getElementById('labelTrasera');
if (dropZone) {
  ['dragenter', 'dragover'].forEach(eventName => {
    dropZone.addEventListener(eventName, (e) => {
      e.preventDefault();
      dropZone.classList.add('dragover');
    }, false);
  });

  ['dragleave', 'drop'].forEach(eventName => {
    dropZone.addEventListener(eventName, (e) => {
      e.preventDefault();
      dropZone.classList.remove('dragover');
    }, false);
  });

  dropZone.addEventListener('drop', (e) => {
    const dt = e.dataTransfer;
    const files = dt.files;
    const input = document.getElementById('tvImagenTrasera');
    if (files.length && input) {
      input.files = files;
      input.dispatchEvent(new Event('change'));
    }
  });
}

// ─── IMPRIMIR INVENTARIO ─────────────────────────────────────
let _printMenuOpen = false;

function togglePrintMenu() {
  _printMenuOpen = !_printMenuOpen;
  const menu = document.getElementById('printFabMenu');
  const btn  = document.getElementById('printFabBtn');
  if (!menu || !btn) return;
  menu.classList.toggle('open', _printMenuOpen);
  btn.classList.toggle('active', _printMenuOpen);
  if (_printMenuOpen) {
    const options = menu.querySelectorAll('.print-fab-option');
    if (options.length) {
      options.forEach(o => o.setAttribute('tabindex', '0'));
      options[0].focus();
    }
  }
}

function closePrintMenu() {
  _printMenuOpen = false;
  const menu = document.getElementById('printFabMenu');
  const btn  = document.getElementById('printFabBtn');
  if (menu) menu.classList.remove('open');
  if (btn)  { btn.classList.remove('active'); btn.focus(); }
}

// Navegación con teclado en el menú FAB
document.querySelectorAll('.print-fab-option').forEach((opt, idx, opts) => {
  opt.setAttribute('tabindex', '0');
  opt.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); (opts[idx + 1] || opts[0]).focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); (opts[idx - 1] || opts[opts.length - 1]).focus(); }
    else if (e.key === 'Escape') { e.preventDefault(); closePrintMenu(); }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); opt.click(); }
  });
});

// Tecla Escape global para cerrar menú FAB
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && _printMenuOpen) {
    closePrintMenu();
  }
});

// Cerrar menú al hacer clic fuera
document.addEventListener('click', function(e) {
  if (_printMenuOpen) {
    const wrap = document.getElementById('printFabWrap');
    if (wrap && !wrap.contains(e.target)) {
      _printMenuOpen = false;
      const menu = document.getElementById('printFabMenu');
      const btn  = document.getElementById('printFabBtn');
      if (menu) menu.classList.remove('open');
      if (btn)  btn.classList.remove('active');
    }
  }
});

function imprimirReporte(tipo) {
  // Cerrar el menú
  _printMenuOpen = false;
  const menu = document.getElementById('printFabMenu');
  const btn  = document.getElementById('printFabBtn');
  if (menu) menu.classList.remove('open');
  if (btn)  btn.classList.remove('active');

  const tvs  = loadTVs();
  const movs = loadMovs();

  // Filtrar según tipo
  let lista = [];
  let titulo = '';
  let subtitulo = '';

  const hoy = new Date().toLocaleDateString('es-VE', {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric'
  });

  if (tipo === 'general') {
    lista = tvs;
    titulo = 'Reporte General de Inventario';
    subtitulo = `Total de televisores registrados: ${tvs.length}`;
  } else if (tipo === 'almacen') {
    lista = tvs.filter(t => t.ubicacion === 'Almacen' || t.estado === 'almacen');
    titulo = 'TVs en Almacén';
    subtitulo = `Total en almacén: ${lista.length}`;
  } else if (tipo === 'habitacion') {
    lista = tvs.filter(t => t.ubicacion === 'Habitacion' || t.estado === 'activo');
    titulo = 'TVs en Habitación';
    subtitulo = `Total en habitaciones: ${lista.length}`;
  } else if (tipo === 'taller') {
    lista = tvs.filter(t => t.estado === 'taller');
    titulo = 'TVs en Taller';
    subtitulo = `Total en taller: ${lista.length}`;
  } else if (tipo === 'baja') {
    lista = tvs.filter(t => t.estado === 'baja');
    titulo = 'TVs Dados de Baja';
    subtitulo = `Total dados de baja: ${lista.length}`;
  }

  // Construir tabla HTML
  const filas = lista.map(t => {
    const ubiMostrar = t.ubicacion === 'Habitacion'
      ? `Hab. ${t.habitacion || '—'}` 
      : (t.ubicacion || '—');
    const estadoTexto = {
      activo: 'En Habitación', taller: 'En Taller', baja: 'Dado de Baja',
      almacen: 'Almacén', operativo: 'Operativo', inoperativo: 'Inoperativo'
    }[t.estado] || t.estado || '—';
    // Obtener último movimiento
    const ultimoMov = movs
      .filter(m => m.tvId === t.id)
      .sort((a, b) => b.fecha.localeCompare(a.fecha))[0];
    const ultimaFecha = ultimoMov ? fmtDate(ultimoMov.fecha) : '—';
    return `
      <tr>
        <td>${t.codigo || '—'}</td>
        <td>${ubiMostrar}</td>
        <td>${t.marca || '—'}</td>
        <td>${t.modelo || '—'}</td>
        <td>${t.tamano || '—'}</td>
        <td>${t.serial || '—'}</td>
        <td>${estadoTexto}</td>
        <td>${fmtDateOnly(t.fechaIngreso)}</td>
        <td>${ultimaFecha}</td>
      </tr>`;
  }).join('');

  const html = `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <title>${titulo} – Hesperia Playa El Agua</title>
  <style>
    @page { size: A4 landscape; margin: 18mm 15mm; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Segoe UI', Arial, sans-serif;
      font-size: 11px;
      color: #1a202c;
      background: #fff;
    }
    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding-bottom: 14px;
      border-bottom: 3px solid #4f46e5;
      margin-bottom: 16px;
    }
    .header-left h1 {
      font-size: 18px;
      font-weight: 800;
      color: #4f46e5;
      letter-spacing: -0.01em;
    }
    .header-left p {
      font-size: 11px;
      color: #718096;
      margin-top: 3px;
    }
    .header-right {
      text-align: right;
      font-size: 10.5px;
      color: #718096;
      line-height: 1.6;
    }
    .header-right strong { color: #2d3748; }
    .subtitle {
      background: #f0f0ff;
      border-left: 4px solid #4f46e5;
      padding: 7px 12px;
      font-size: 11.5px;
      font-weight: 600;
      color: #3730a3;
      margin-bottom: 14px;
      border-radius: 0 6px 6px 0;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 10.5px;
    }
    thead tr {
      background: linear-gradient(135deg, #4f46e5, #7c3aed);
      color: #fff;
    }
    thead th {
      padding: 8px 10px;
      font-weight: 700;
      text-align: left;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      font-size: 9px;
      white-space: nowrap;
    }
    tbody tr:nth-child(even) { background: #f8f7ff; }
    tbody tr:hover { background: #eef2ff; }
    tbody td {
      padding: 7px 10px;
      border-bottom: 1px solid #e2e8f0;
      color: #2d3748;
    }
    tbody td:first-child {
      font-weight: 700;
      color: #4f46e5;
    }
    .empty { text-align: center; padding: 30px; color: #a0aec0; }
    .footer {
      margin-top: 18px;
      text-align: center;
      font-size: 9.5px;
      color: #a0aec0;
      border-top: 1px solid #e2e8f0;
      padding-top: 10px;
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="header-left">
      <h1>📺 ${titulo}</h1>
      <p>Hotel Hesperia Playa El Agua – Sistema de Control de TV</p>
    </div>
    <div class="header-right">
      <strong>Fecha de emisión:</strong><br>${hoy}
    </div>
  </div>
  <div class="subtitle">${subtitulo}</div>
  <table>
    <thead>
      <tr>
        <th>Código</th>
        <th>Ubicación</th>
        <th>Marca</th>
        <th>Modelo</th>
        <th>Tamaño</th>
        <th>Serial</th>
        <th>Estado</th>
        <th>F. Ingreso</th>
        <th>Último Mov.</th>
      </tr>
    </thead>
    <tbody>
      ${filas || '<tr><td colspan="9" class="empty">No hay registros para mostrar.</td></tr>'}
    </tbody>
  </table>
  <div class="footer">
    Control de TV – Hotel Hesperia Playa El Agua &nbsp;|&nbsp; Generado el ${hoy} &nbsp;|&nbsp; Total registros: ${lista.length}
  </div>
  <script>window.onload = function() { window.print(); }<\/script>
</body>
</html>`;

  const win = window.open('', '_blank');
  if (win) {
    win.document.write(html);
    win.document.close();
  } else {
    showToast('El navegador bloqueó la ventana emergente. Permite ventanas emergentes para imprimir.', 'error');
  }
}

// Mostrar/ocultar FAB de imprimir según la página activa
(function patchShowPageForPrint() {
  const _origShowPage = showPage;
  window.showPage = function(id) {
    _origShowPage(id);
    const fab = document.getElementById('printFabWrap');
    if (fab) {
      fab.style.display = (id === 'inventario') ? 'flex' : 'none';
    }
  };
})();

// ─── NAVEGACIÓN POR TECLADO EN FORMULARIOS Y MODALES ──────────
// Flechas (↑/↓) y Enter permiten moverse entre los campos de ingreso
// de datos en todas las interfaces (formTV, movimientos, asignación,
// cambio de serial, eliminar registros, etc.).

const TIPOS_TEXT_NAV = new Set(['text','number','tel','email','password','search','url','datetime-local','date','time','month','week']);

function campoEsOrigenNavegacion(el) {
  if (!el || el.tagName !== 'INPUT') return false;
  if (el.disabled || el.readOnly) return false;
  if (el.id === 'searchInventario' || el.id === 'searchHistorial') return false;
  if (el.closest('.ts-wrapper')) return false;
  if (el.offsetParent === null) return false;
  return TIPOS_TEXT_NAV.has((el.getAttribute('type') || 'text').toLowerCase());
}

function camposNavegablesDelScope(scope) {
  return Array.from(scope.querySelectorAll('input, select, textarea')).filter(el => {
    if (el.disabled || el.readOnly) return false;
    if (el.hidden || el.style.display === 'none') return false;
    if (el.closest('.ts-wrapper')) return false;
    if (el.id === 'searchInventario' || el.id === 'searchHistorial' || el.id === 'movDestinoHab') return false;
    if (el.tagName === 'INPUT') {
      const type = (el.getAttribute('type') || 'text').toLowerCase();
      if (['hidden','button','submit','reset','file','checkbox','radio','image','color'].includes(type)) return false;
    }
    if (el.offsetParent === null) return false;
    return true;
  });
}

document.addEventListener('keydown', e => {
  const el = document.activeElement;
  if (!campoEsOrigenNavegacion(el)) return;
  if (e.key !== 'Enter' && e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;

  // Los selectores de fecha usan las flechas para cambiar el segmento seleccionado
  const type = (el.getAttribute('type') || 'text').toLowerCase();
  if (['datetime-local','date','time','month','week'].includes(type) && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) return;

  const scope = el.closest('form') || el.closest('.modal-body');
  if (!scope) return;
  const campos = camposNavegablesDelScope(scope);
  if (campos.length < 2) return;
  const idx = campos.indexOf(el);
  if (idx === -1) return;

  e.preventDefault();
  let next = idx;
  if (e.key === 'Enter' || e.key === 'ArrowDown') next = idx + 1;
  else next = idx - 1;

  if (next < 0) return;
  if (next >= campos.length) {
    const btn = scope.querySelector('button[type="submit"], .btn-primary');
    if (btn) btn.focus();
    return;
  }
  campos[next].focus();
});

// ─── INIT ─────────────────────────────────────────────────────

// Ocultar FAB imprimir al inicio (se muestra solo en inventario)
(function() {
  const fab = document.getElementById('printFabWrap');
  if (fab) fab.style.display = 'none';
})();

showPage('dashboard');
