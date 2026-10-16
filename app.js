/**
 * Observatorio para Chabely - Frontend Logic
 * Carga de datos, filtrado por categorías, búsqueda, visualización y descargas individuales o ZIP.
 */

let allMediaItems = [];
let currentCategory = 'all';
let currentSearchTerm = '';
let currentModalIndex = -1;
let filteredItems = [];

// Elementos del DOM
const mediaGrid = document.getElementById('media-grid');
const loadingState = document.getElementById('loading-state');
const emptyState = document.getElementById('empty-state');
const inputSearch = document.getElementById('input-search');
const categoryTabs = document.getElementById('category-tabs');
const btnDownloadAllZip = document.getElementById('btn-download-all-zip');
const btnDownloadCatZip = document.getElementById('btn-download-cat-zip');
const btnCatZipText = document.getElementById('btn-cat-zip-text');

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
});

function initEventListeners() {
  // Cambio de pestañas
  categoryTabs.addEventListener('click', (e) => {
    const btn = e.target.closest('.tab-btn');
    if (!btn) return;
    
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
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
    document.querySelectorAll('.tab-btn').forEach(b => {
      b.classList.toggle('active', b.getAttribute('data-cat') === 'all');
    });
    updateCatZipButtonText();
    applyFilters();
  });

  // Descarga ZIP completa
  btnDownloadAllZip.addEventListener('click', () => {
    if (allMediaItems.length === 0) return;
    const today = new Date().toISOString().split('T')[0];
    generateZipPackage(allMediaItems, `Observatorio_Chabely_Todas_Fotos_${today}.zip`, "Todas las fotos de hoy");
  });

  // Descarga ZIP de categoría / vista actual
  btnDownloadCatZip.addEventListener('click', () => {
    if (filteredItems.length === 0) return;
    const catLabel = getCategoryLabel(currentCategory);
    const today = new Date().toISOString().split('T')[0];
    generateZipPackage(filteredItems, `Observatorio_Chabely_${catLabel.replace(/\s+/g, '_')}_${today}.zip`, catLabel);
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
    const res = await fetch('data/today.json?t=' + new Date().getTime());
    if (!res.ok) throw new Error('No se pudo cargar data/today.json');
    const data = await res.json();
    
    allMediaItems = data.media || [];
    
    // Actualizar fecha y contadores
    document.getElementById('label-updated-time').textContent = data.updated_at || 'Actualizado hoy';
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
      <p class="text-slate-800 font-bold">No se pudieron cargar las noticias de hoy</p>
      <p class="text-xs text-slate-500 mt-1">Verifica que se haya ejecutado el script o el workflow de GitHub Actions.</p>
    `;
  }
}

function updateTabBadge(cat, count) {
  const btn = document.querySelector(`.tab-btn[data-cat="${cat}"] .tab-count`);
  if (btn) btn.textContent = count;
}

// Filtrado de noticias y fotos
function applyFilters() {
  filteredItems = allMediaItems.filter(item => {
    // Filtro de categoría
    const matchesCat = currentCategory === 'all' || item.category === currentCategory;
    
    // Filtro de búsqueda
    const matchesSearch = !currentSearchTerm || 
      item.title.toLowerCase().includes(currentSearchTerm) ||
      item.source.toLowerCase().includes(currentSearchTerm) ||
      (item.summary && item.summary.toLowerCase().includes(currentSearchTerm));
      
    return matchesCat && matchesSearch;
  });

  renderGrid(filteredItems);
}

// Renderizado de tarjetas
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
    
    return `
      <article class="bg-white rounded-2xl overflow-hidden border border-slate-200/90 shadow-sm card-hover-effect flex flex-col group">
        <!-- Contenedor Imagen -->
        <div class="relative overflow-hidden bg-slate-100 aspect-[16/10] cursor-pointer" onclick="openLightbox(${index})">
          <img src="${imgSrc}" alt="${escapeHtml(item.title)}" loading="lazy"
            onerror="this.onerror=null; this.src='${item.image_url}';"
            class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500">
          
          <!-- Overlay de Hover con Icono Zoom -->
          <div class="absolute inset-0 bg-slate-900/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
            <span class="w-10 h-10 rounded-full bg-white/90 text-slate-800 flex items-center justify-center shadow-md">
              <i class="fa-solid fa-expand text-sm"></i>
            </span>
          </div>

          <!-- Badge de Categoría y Fuente -->
          <div class="absolute top-3 left-3 flex flex-wrap gap-1.5 items-center">
            <span class="text-[11px] font-bold px-2.5 py-0.5 rounded-full border shadow-sm backdrop-blur-md ${badgeClass}">
              ${item.category_label || item.category}
            </span>
          </div>

          <div class="absolute bottom-2.5 right-2.5">
            <span class="text-[10px] font-bold px-2 py-0.5 rounded bg-black/70 text-white backdrop-blur-sm">
              ${escapeHtml(item.source)}
            </span>
          </div>
        </div>

        <!-- Contenido de la Noticia -->
        <div class="p-4 sm:p-5 flex-1 flex flex-col justify-between">
          <div>
            <h3 class="text-sm sm:text-base font-bold text-slate-900 leading-snug line-clamp-2 hover:text-sky-600 transition-colors cursor-pointer" onclick="openLightbox(${index})">
              ${escapeHtml(item.title)}
            </h3>
            <p class="text-xs text-slate-500 mt-2 line-clamp-2 leading-relaxed">
              ${escapeHtml(item.summary || '')}
            </p>
          </div>

          <!-- Acciones de la Tarjeta -->
          <div class="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
            <!-- Botón de Descarga Directa de Foto -->
            <button onclick="downloadSingleImageByIndex(${index})" 
              class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-sky-700 bg-sky-50 hover:bg-sky-100 active:scale-95 transition-all"
              title="Descargar esta foto en alta resolución">
              <i class="fa-solid fa-arrow-down-to-bracket text-xs"></i>
              <span>Descargar Foto</span>
            </button>

            <!-- Enlace a la Noticia Original -->
            <a href="${item.url}" target="_blank" rel="noopener noreferrer" 
              class="text-xs font-semibold text-slate-400 hover:text-slate-700 inline-flex items-center gap-1 transition-colors"
              title="Leer noticia en el medio original">
              <span>Leer más</span>
              <i class="fa-solid fa-arrow-up-right-from-square text-[10px]"></i>
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

// Descarga individual de una imagen
window.downloadSingleImageByIndex = function(index) {
  const item = filteredItems[index];
  if (item) downloadSingleImage(item);
};

async function downloadSingleImage(item) {
  const url = item.local_image || item.image_url;
  const cleanTitle = (item.title || 'foto').replace(/[^a-zA-Z0-9_\u00C0-\u017F\s-]/g, '').trim().substring(0, 50);
  const fileName = `[${item.category}]_${cleanTitle}.jpg`;

  try {
    // Intentar descargar como Blob para asegurar el nombre exacto
    const response = await fetch(url);
    const blob = await response.blob();
    saveAs(blob, fileName);
  } catch (e) {
    // Fallback: enlace de descarga clásico
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
  zipModalSubtitle.textContent = `Empaquetando ${items.length} fotos...`;
  zipProgressBar.style.width = '0%';
  zipProgressText.textContent = '0%';

  let processed = 0;
  const total = items.length;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const url = item.local_image || item.image_url;
    
    // Carpeta interna según categoría
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
    const percent = Math.round((processed / total) * 70); // hasta 70% en descarga
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
  modalCategoryBadge.className = `text-xs font-bold px-2.5 py-0.5 rounded-full border ${getBadgeClass(item.category)}`;
  modalSourceLabel.textContent = `Medio: ${item.source}`;
  modalDate.textContent = item.date ? `Fecha: ${item.date}` : '';
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

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
}
