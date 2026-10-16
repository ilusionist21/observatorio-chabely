/**
 * Observatorio para Chabely - Frontend Logic
 * Actualización automática para la jornada de 9:00 AM a 2:00 PM.
 * Soporte de scraping manual bajo demanda, visualización de fecha de noticia y descargas en alta calidad.
 */

let allMediaItems = [];
let currentCategory = 'all';
let currentSearchTerm = '';
let currentModalIndex = -1;
let filteredItems = [];
let lastUpdatedIso = null;

// Elementos del DOM
const mediaGrid = document.getElementById('media-grid');
const loadingState = document.getElementById('loading-state');
const emptyState = document.getElementById('empty-state');
const inputSearch = document.getElementById('input-search');
const categoryTabs = document.getElementById('category-tabs');
const btnDownloadAllZip = document.getElementById('btn-download-all-zip');
const btnDownloadCatZip = document.getElementById('btn-download-cat-zip');
const btnCatZipText = document.getElementById('btn-cat-zip-text');

// Botón Manual de Scraping y Actualización
const btnManualRefresh = document.getElementById('btn-manual-refresh');
const refreshIcon = document.getElementById('refresh-icon');
const refreshText = document.getElementById('refresh-text');
const labelUpdatedTime = document.getElementById('label-updated-time');
const labelRelativeTime = document.getElementById('label-relative-time');

// Modal Lightbox
const lightboxModal = document.getElementById('lightbox-modal');
const modalImage = document.getElementById('modal-image');
const modalTitle = document.getElementById('modal-title');
const modalSummary = document.getElementById('modal-summary');
const modalCategoryBadge = document.getElementById('modal-category-badge');
const modalSourceLabel = document.getElementById('modal-source-label');
const modalDate = document.getElementById('modal-date');
const modalArticleLink = document.getElementById('modal-article-link');
const modalCloseBtn = document.getElementById('modal-close-btn');
const modalDownloadBtn = document.getElementById('modal-download-btn');

// Modal Progreso ZIP
const zipModal = document.getElementById('zip-progress-modal');
const zipProgressBar = document.getElementById('zip-progress-bar');
const zipProgressText = document.getElementById('zip-progress-text');
const zipModalTitle = document.getElementById('zip-modal-title');
const zipModalSubtitle = document.getElementById('zip-modal-subtitle');

// Inicialización
document.addEventListener('DOMContentLoaded', () => {
  initEventListeners();
  loadObservatoryData();
  
  // Actualizar el tiempo relativo cada 60 segundos
  setInterval(() => {
    if (lastUpdatedIso) updateRelativeTime(lastUpdatedIso);
  }, 60000);
});

function initEventListeners() {
  // Botón Manual de Scraping / Actualizar
  if (btnManualRefresh) {
    btnManualRefresh.addEventListener('click', handleManualRefresh);
  }

  // Cambio de pestañas
  categoryTabs.addEventListener('click', (e) => {
    const btn = e.target.closest('.apple-tab-btn');
    if (!btn) return;
    
    document.querySelectorAll('.apple-tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    
    currentCategory = btn.getAttribute('data-cat');
    updateCatZipButtonText();
    applyFilters();
  });

  // Búsqueda en vivo
  inputSearch.addEventListener('input', (e) => {
    currentSearchTerm = e.target.value.toLowerCase().trim();
    applyFilters();
  });

  // Reset filtros
  document.getElementById('btn-reset-filters').addEventListener('click', () => {
    inputSearch.value = '';
    currentSearchTerm = '';
    currentCategory = 'all';
    document.querySelectorAll('.apple-tab-btn').forEach(b => {
      b.classList.toggle('active', b.getAttribute('data-cat') === 'all');
    });
    updateCatZipButtonText();
    applyFilters();
  });

  // Descarga ZIP completa
  btnDownloadAllZip.addEventListener('click', () => {
    if (allMediaItems.length === 0) return;
    const today = new Date().toISOString().split('T')[0];
    generateZipPackage(allMediaItems, `Observatorio_Chabely_Todas_Fotos_HD_${today}.zip`, "Todas las fotos de hoy");
  });

  // Descarga ZIP de categoría / vista actual
  btnDownloadCatZip.addEventListener('click', () => {
    if (filteredItems.length === 0) return;
    const catLabel = getCategoryLabel(currentCategory);
    const today = new Date().toISOString().split('T')[0];
    generateZipPackage(filteredItems, `Observatorio_Chabely_${catLabel.replace(/\s+/g, '_')}_HD_${today}.zip`, catLabel);
  });

  // Controles de Lightbox Modal
  modalCloseBtn.addEventListener('click', closeLightbox);
  lightboxModal.addEventListener('click', (e) => {
    if (e.target === lightboxModal) closeLightbox();
  });

  document.addEventListener('keydown', (e) => {
    if (lightboxModal.classList.contains('hidden')) return;
    if (e.key === 'Escape') closeLightbox();
    if (e.key === 'ArrowRight') navigateLightbox(1);
    if (e.key === 'ArrowLeft') navigateLightbox(-1);
  });

  modalDownloadBtn.addEventListener('click', () => {
    if (currentModalIndex >= 0 && currentModalIndex < filteredItems.length) {
      downloadSingleImage(filteredItems[currentModalIndex]);
    }
  });
}

// Acción del Botón Manual de Actualización y Scraping
async function handleManualRefresh() {
  if (!btnManualRefresh) return;
  
  refreshIcon.classList.add('fa-spin');
  refreshText.textContent = 'Raspando medios...';
  btnManualRefresh.disabled = true;

  try {
    // 1. Intentar endpoint de scraping del servidor local si está corriendo
    try {
      const apiResp = await fetch('/api/refresh', { method: 'GET', cache: 'no-store' });
      if (apiResp.ok) {
        const apiData = await apiResp.json();
        console.log('[OK] Scraping manual ejecutado por el servidor:', apiData);
      }
    } catch (e) {
      // Entorno estático (GitHub Pages)
    }

    // 2. Recargar datos frescos
    await loadObservatoryData();
    showAppleToast('¡Observatorio actualizado con las noticias de hoy!');
  } catch (err) {
    console.error('Error durante la actualización:', err);
    showAppleToast('Se recargaron los datos locales.');
  } finally {
    setTimeout(() => {
      refreshIcon.classList.remove('fa-spin');
      refreshText.textContent = 'Actualizar Ahora';
      btnManualRefresh.disabled = false;
    }, 600);
  }
}

function updateCatZipButtonText() {
  const label = getCategoryLabel(currentCategory);
  btnCatZipText.textContent = currentCategory === 'all' ? 'ZIP Todas las Fotos' : `ZIP ${label}`;
}

function getCategoryLabel(cat) {
  switch (cat) {
    case 'portadas': return 'Portadas';
    case 'regional': return 'Regional Puno';
    case 'nacional': return 'Nacional Perú';
    case 'internacional': return 'Internacional';
    default: return 'Vista Actual';
  }
}

// Carga del archivo data/today.json
async function loadObservatoryData() {
  try {
    const res = await fetch('data/today.json?t=' + Date.now(), { cache: 'no-store' });
    if (!res.ok) throw new Error('No se pudo cargar data/today.json');
    const data = await res.json();
    
    allMediaItems = data.media || [];
    lastUpdatedIso = data.updated_at_iso || null;
    
    // Actualizar indicador de última actualización
    if (labelUpdatedTime) {
      labelUpdatedTime.textContent = data.updated_at ? `Última actualización: ${data.updated_at}` : 'Actualizado hoy';
    }
    if (lastUpdatedIso) {
      updateRelativeTime(lastUpdatedIso);
    }

    // Actualizar contadores numéricos
    document.getElementById('stat-total').textContent = allMediaItems.length;
    document.getElementById('stat-regional').textContent = data.stats?.regional || 0;
    document.getElementById('stat-nacional').textContent = data.stats?.nacional || 0;
    document.getElementById('stat-internacional').textContent = data.stats?.internacional || 0;

    // Actualizar contadores en pestañas
    updateTabBadge('all', allMediaItems.length);
    updateTabBadge('portadas', allMediaItems.filter(i => i.category === 'portadas').length);
    updateTabBadge('regional', allMediaItems.filter(i => i.category === 'regional').length);
    updateTabBadge('nacional', allMediaItems.filter(i => i.category === 'nacional').length);
    updateTabBadge('internacional', allMediaItems.filter(i => i.category === 'internacional').length);

    loadingState.classList.add('hidden');
    mediaGrid.classList.remove('hidden');
    
    applyFilters();
  } catch (err) {
    console.error('Error cargando datos:', err);
    loadingState.innerHTML = `
      <div class="text-rose-500 text-3xl mb-2"><i class="fa-solid fa-triangle-exclamation"></i></div>
      <p class="text-[#1d1d1f] font-semibold">No se pudieron cargar las noticias de hoy</p>
      <p class="text-xs text-[#86868b] mt-1">Haz clic en "Actualizar Ahora" o ejecuta el script de scraping.</p>
    `;
  }
}

function updateRelativeTime(isoString) {
  if (!labelRelativeTime || !isoString) return;
  try {
    const updatedDate = new Date(isoString);
    const now = new Date();
    const diffSecs = Math.max(0, Math.floor((now - updatedDate) / 1000));
    
    if (diffSecs < 60) {
      labelRelativeTime.textContent = 'Hace un momento';
    } else if (diffSecs < 3600) {
      const mins = Math.floor(diffSecs / 60);
      labelRelativeTime.textContent = `Hace ${mins} ${mins === 1 ? 'minuto' : 'minutos'}`;
    } else {
      const hours = Math.floor(diffSecs / 3600);
      labelRelativeTime.textContent = `Hace ${hours} ${hours === 1 ? 'hora' : 'horas'}`;
    }
  } catch (e) {
    labelRelativeTime.textContent = 'Hoy';
  }
}

function updateTabBadge(cat, count) {
  const btn = document.querySelector(`.apple-tab-btn[data-cat="${cat}"] .tab-count`);
  if (btn) btn.textContent = count;
}

// Filtrado de noticias y fotos
function applyFilters() {
  filteredItems = allMediaItems.filter(item => {
    const matchesCat = currentCategory === 'all' || item.category === currentCategory;
    const matchesSearch = !currentSearchTerm || 
      item.title.toLowerCase().includes(currentSearchTerm) ||
      item.source.toLowerCase().includes(currentSearchTerm) ||
      (item.summary && item.summary.toLowerCase().includes(currentSearchTerm));
      
    return matchesCat && matchesSearch;
  });

  renderGrid(filteredItems);
}

// Renderizado de tarjetas con visualización clara de la fecha
function renderGrid(items) {
  if (items.length === 0) {
    mediaGrid.innerHTML = '';
    mediaGrid.classList.add('hidden');
    emptyState.classList.remove('hidden');
    return;
  }

  emptyState.classList.add('hidden');
  mediaGrid.classList.remove('hidden');

  mediaGrid.innerHTML = items.map((item, index) => {
    const badgeClass = getBadgeClass(item.category);
    const imgSrc = item.local_image || item.image_url;
    const dateLabel = item.date_formatted || item.date || 'Hoy';
    
    return `
      <article class="apple-card overflow-hidden flex flex-col group p-3.5">
        <!-- Contenedor Imagen -->
        <div class="relative overflow-hidden rounded-2xl bg-[#f5f5f7] aspect-[16/10] cursor-pointer" onclick="openLightbox(${index})">
          <img src="${imgSrc}" alt="${escapeHtml(item.title)}" loading="lazy"
            onerror="this.onerror=null; this.src='${item.image_url}';"
            class="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-500 ease-out">
          
          <!-- Overlay de Hover con Icono Zoom -->
          <div class="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
            <span class="w-9 h-9 rounded-full bg-white/90 text-[#1d1d1f] flex items-center justify-center shadow-lg backdrop-blur-md">
              <i class="fa-solid fa-expand text-xs"></i>
            </span>
          </div>

          <!-- Badge de Categoría Apple Glass -->
          <div class="absolute top-2.5 left-2.5 flex items-center">
            <span class="apple-badge-glass text-[11px] font-semibold px-2.5 py-0.5 rounded-full ${badgeClass}">
              ${item.category_label || item.category}
            </span>
          </div>

          <!-- Badge de Fuente -->
          <div class="absolute bottom-2.5 right-2.5">
            <span class="text-[10px] font-medium px-2.5 py-0.5 rounded-full bg-black/60 text-white backdrop-blur-md">
              ${escapeHtml(item.source)}
            </span>
          </div>
        </div>

        <!-- Contenido de la Noticia -->
        <div class="p-3 sm:p-4 flex-1 flex flex-col justify-between">
          <div>
            <!-- FECHA DE LA NOTICIA (Siempre visible) -->
            <div class="flex items-center gap-1.5 text-[11px] font-medium text-[#86868b] mb-2">
              <span class="inline-flex items-center gap-1.5 bg-[#f5f5f7] px-2.5 py-0.5 rounded-full border border-black/[0.04]">
                <i class="fa-regular fa-clock text-[#34c759] text-[10px]"></i>
                <span class="font-semibold text-[#1d1d1f]">${escapeHtml(dateLabel)}</span>
              </span>
            </div>

            <!-- Titular de la Noticia -->
            <h3 class="text-sm sm:text-[15px] font-semibold text-[#1d1d1f] leading-snug line-clamp-2 hover:text-[#0071e3] transition-colors cursor-pointer" onclick="openLightbox(${index})">
              ${escapeHtml(item.title)}
            </h3>
            <p class="text-xs text-[#86868b] mt-1.5 line-clamp-2 leading-relaxed font-normal">
              ${escapeHtml(item.summary || '')}
            </p>
          </div>

          <!-- Acciones de la Tarjeta Apple Style -->
          <div class="mt-4 pt-3 border-t border-black/[0.04] flex items-center justify-between gap-2">
            <!-- Botón de Descarga Directa de Foto en Verde Alta Calidad -->
            <button onclick="downloadSingleImageByIndex(${index})" 
              class="apple-btn-green px-3.5 py-1.5 text-xs inline-flex items-center gap-1.5 shadow-sm"
              title="Descargar esta fotografía en máxima resolución (HD)">
              <i class="fa-solid fa-arrow-down-to-bracket text-[11px]"></i>
              <span>Descargar Foto HD</span>
            </button>

            <!-- Enlace a la Noticia Original -->
            <a href="${item.url}" target="_blank" rel="noopener noreferrer" 
              class="text-xs font-medium text-[#86868b] hover:text-[#1d1d1f] inline-flex items-center gap-1 transition-colors"
              title="Leer noticia completa en el medio original">
              <span>Leer más</span>
              <i class="fa-solid fa-chevron-right text-[9px] text-[#86868b]"></i>
            </a>
          </div>

        </div>
      </article>
    `;
  }).join('');
}

function getBadgeClass(cat) {
  switch (cat) {
    case 'portadas': return 'badge-portadas';
    case 'regional': return 'badge-regional';
    case 'nacional': return 'badge-nacional';
    case 'internacional': return 'badge-internacional';
    default: return 'bg-slate-100 text-slate-800 border-slate-200';
  }
}

// Descarga individual de una imagen en Alta Calidad
window.downloadSingleImageByIndex = function(index) {
  const item = filteredItems[index];
  if (item) downloadSingleImage(item);
};

async function downloadSingleImage(item) {
  let url = item.local_image || item.image_url;

  // Optimización de resolución HD para fuentes reconocidas
  if (item.image_url && item.image_url.includes('ichef.bbci.co.uk')) {
    url = item.image_url.replace(/\/ws\/\d+\//, '/ws/1024/');
  }

  const cleanTitle = (item.title || 'foto').replace(/[^a-zA-Z0-9_\u00C0-\u017F\s-]/g, '').trim().substring(0, 50);
  const categoryTag = (item.category_label || item.category || 'Medio').replace(/\s+/g, '_');
  const fileName = `[HD]_[${categoryTag}]_${cleanTitle}.jpg`;

  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error('Fallo al obtener blob');
    const blob = await response.blob();
    saveAs(blob, fileName);
    showAppleToast(`Foto descargada: ${cleanTitle.substring(0, 25)}...`);
  } catch (e) {
    if (item.local_image && url !== item.local_image) {
      try {
        const localResp = await fetch(item.local_image);
        if (localResp.ok) {
          const localBlob = await localResp.blob();
          saveAs(localBlob, fileName);
          showAppleToast('Foto HD descargada con éxito');
          return;
        }
      } catch (err) {}
    }

    // Fallback directo por enlace
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.target = '_blank';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }
}

// Generación y Empaquetado de ZIP usando JSZip en el navegador
async function generateZipPackage(items, zipFileName, label) {
  if (!items || items.length === 0) return;

  const zip = new JSZip();
  zipModal.classList.remove('hidden');
  zipModalTitle.textContent = `Preparando ZIP: ${label}`;
  zipModalSubtitle.textContent = `Empaquetando ${items.length} fotos en alta resolución...`;
  zipProgressBar.style.width = '0%';
  zipProgressText.textContent = '0%';

  let processed = 0;
  const total = items.length;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    let url = item.local_image || item.image_url;
    if (item.image_url && item.image_url.includes('ichef.bbci.co.uk')) {
      url = item.image_url.replace(/\/ws\/\d+\//, '/ws/1024/');
    }
    
    let folderName = 'Otras';
    if (item.category === 'portadas') folderName = 'Portadas_Diarios';
    else if (item.category === 'regional') folderName = 'Regional_Puno';
    else if (item.category === 'nacional') folderName = 'Nacional_Peru';
    else if (item.category === 'internacional') folderName = 'Internacional';

    const cleanTitle = (item.title || `foto_${i+1}`).replace(/[^a-zA-Z0-9_\u00C0-\u017F\s-]/g, '').trim().substring(0, 50);
    const fileName = `${folderName}/${(i+1).toString().padStart(2, '0')}_${cleanTitle}.jpg`;

    try {
      const response = await fetch(url);
      if (response.ok) {
        const blob = await response.blob();
        zip.file(fileName, blob);
      }
    } catch (err) {
      console.warn(`No se pudo agregar imagen ${url} al ZIP:`, err);
    }

    processed++;
    const percent = Math.round((processed / total) * 70);
    zipProgressBar.style.width = `${percent}%`;
    zipProgressText.textContent = `Descargando fotos: ${processed}/${total} (${percent}%)`;
  }

  zipModalSubtitle.textContent = 'Comprimiendo archivo ZIP final...';

  try {
    const zipBlob = await zip.generateAsync({ type: 'blob' }, (metadata) => {
      const percent = 70 + Math.round((metadata.percent / 100) * 30);
      zipProgressBar.style.width = `${percent}%`;
      zipProgressText.textContent = `Comprimiendo: ${percent}%`;
    });

    saveAs(zipBlob, zipFileName);
    showAppleToast('¡Archivo ZIP descargado con éxito!');
  } catch (err) {
    alert('Error al comprimir el archivo ZIP: ' + err.message);
  } finally {
    setTimeout(() => {
      zipModal.classList.add('hidden');
    }, 600);
  }
}

// Lightbox Modal
window.openLightbox = function(index) {
  currentModalIndex = index;
  const item = filteredItems[index];
  if (!item) return;

  modalImage.src = item.local_image || item.image_url;
  modalTitle.textContent = item.title;
  modalSummary.textContent = item.summary || 'Sin descripción adicional.';
  modalCategoryBadge.textContent = item.category_label || item.category;
  modalCategoryBadge.className = `text-xs font-semibold px-2.5 py-0.5 rounded-full border ${getBadgeClass(item.category)}`;
  modalSourceLabel.textContent = `Medio: ${item.source}`;
  
  // FECHA COMPLETA DE LA NOTICIA EN EL MODAL
  const fullDate = item.date_full || item.date_formatted || item.date;
  modalDate.innerHTML = `<span class="inline-flex items-center gap-1.5"><i class="fa-regular fa-clock text-[#34c759]"></i> <span>Fecha: ${escapeHtml(fullDate)}</span></span>`;
  modalArticleLink.href = item.url;

  lightboxModal.classList.remove('hidden');
};

function closeLightbox() {
  lightboxModal.classList.add('hidden');
  modalImage.src = '';
  currentModalIndex = -1;
}

function navigateLightbox(direction) {
  if (filteredItems.length === 0) return;
  currentModalIndex = (currentModalIndex + direction + filteredItems.length) % filteredItems.length;
  openLightbox(currentModalIndex);
}

// Notificación Toast elegante estilo Apple
function showAppleToast(message) {
  let toast = document.getElementById('apple-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'apple-toast';
    toast.className = 'fixed bottom-6 right-6 z-50 apple-glass px-4 py-2.5 rounded-2xl shadow-xl text-xs font-semibold text-[#1d1d1f] border border-black/[0.08] flex items-center gap-2 transform translate-y-20 opacity-0 transition-all duration-300 pointer-events-none';
    document.body.appendChild(toast);
  }
  toast.innerHTML = `<i class="fa-solid fa-circle-check text-[#34c759] text-sm"></i> <span>${escapeHtml(message)}</span>`;
  toast.classList.remove('translate-y-20', 'opacity-0');
  toast.classList.add('translate-y-0', 'opacity-100');

  setTimeout(() => {
    toast.classList.remove('translate-y-0', 'opacity-100');
    toast.classList.add('translate-y-20', 'opacity-0');
  }, 3200);
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
}
