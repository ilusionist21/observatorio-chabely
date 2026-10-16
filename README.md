# 📸 Observatorio para Chabely

**Observatorio de Medios de Comunicación** con actualización automática diaria y descarga directa y en paquete ZIP de fotos del día en categorías:
- 📰 **Portadas de Diarios**: El Comercio, La República, La Razón, Líbero, El País, The New York Times.
- 📍 **Regional (Puno)**: Diario Sin Fronteras, Pachamama Radio, Diario Los Andes *(Nota: Radio Onda Azul queda excluida)*.
- 🇵🇪 **Nacional (Perú)**: RPP Noticias, Agencia Andina, Noticias destacadas de Perú.
- 🌍 **Internacional**: France 24 en Español, BBC Mundo, El País Internacional.

---

## 🚀 Características Principales

1. **Descarga de Fotos Directa en Alta Calidad (HD)**:
   - Cada tarjeta de noticia tiene el botón verde Apple **"⬇️ Descargar Foto HD"**, que descarga la foto en su resolución nativa original y sin compresión con un nombre limpio y ordenado: `[HD]_[Regional_Puno]_Titular.jpg`.
2. **Botón Manual "🔄 Actualizar Ahora"**:
   - Botón en la barra de navegación para forzar un scraping inmediato de medios y recargar las noticias al instante.
3. **Indicador de Fecha y Hora de Última Actualización**:
   - Notificación en tiempo real en la cabecera indicando cuándo fue la última vez que se actualizaron los medios (ej. `Última actualización: 15 de Octubre de 2026, 09:36 PM • Hace 2 minutos`).
4. **Fecha y Hora Exacta en Cada Noticia**:
   - Cada noticia cuenta con su propia etiqueta de tiempo con icono de reloj (ej. `🕒 Hoy • 8:18 PM`), para saber exactamente en qué momento del día fue publicada.
5. **Visor de Fotos (Lightbox estilo macOS Quick Look)**:
   - Haz clic en cualquier imagen para verla en pantalla completa, hacer zoom, navegar con las flechas del teclado y leer el resumen completo.
6. **100% Gratis en GitHub Pages**:
   - No requiere servidor de pago ni bases de datos. Todo funciona en el navegador con HTML5 y Tailwind CSS.
7. **Actualización Automática para la Jornada de Chabely (9:00 AM - 2:00 PM)**:
   - Un Cron Job de GitHub Actions extrae las fotos automáticamente a las **7:00 AM**, **8:30 AM**, **11:00 AM** y **1:30 PM** (Hora de Perú) y las publica en la web sin costo alguno.

---

## ❓ Pregunta Frecuente: ¿Ya tengo otro repositorio con Cron Job, es normal?

**¡Sí, es 100% normal y totalmente seguro!**

En GitHub:
1. **Independencia Total**: Cada repositorio tiene su propio sistema de GitHub Actions independiente. Tu otro repositorio seguirá funcionando exactamente igual y no interferirá en lo más mínimo con este.
2. **Gratis e Ilimitado en Repos Públicos**: En repositorios públicos de GitHub, los minutos de GitHub Actions son **ilimitados y gratuitos**.
3. **Mínimo Consumo en Repos Privados**: Si el repositorio es privado, GitHub te da **2,000 minutos gratis cada mes**. Este script tarda menos de 40 segundos por día (apenas ~20 minutos al mes), por lo que consume menos del 1% de tu cuota mensual.

---

## 🛠️ Cómo Activar GitHub Pages y el Cron Job

### Paso 1: Subir este código a un repositorio en GitHub
1. Abre tu terminal en esta carpeta y ejecuta:
   ```bash
   git init
   git add .
   git commit -m "Initial commit - Observatorio para Chabely"
   git branch -M main
   git remote add origin https://github.com/TU_USUARIO/observatorio-chabely.git
   git push -u origin main
   ```

### Paso 2: Activar GitHub Pages (100% Gratis)
1. Ve a tu repositorio en GitHub.
2. Haz clic en **Settings** (Configuración) > **Pages** (en el menú lateral izquierdo).
3. En la sección **Build and deployment**:
   - Source: **Deploy from a branch**
   - Branch: selecciona `main` y la carpeta `/ (root)`.
   - Haz clic en **Save** (Guardar).
4. En 1 o 2 minutos, GitHub te dará tu enlace web público gratuito:
   `https://TU_USUARIO.github.io/observatorio-chabely/`

### Paso 3: Habilitar Permiso de Escritura para el Cron Job
Para que GitHub Actions pueda guardar las fotos diarias automáticamente:
1. En tu repositorio, ve a **Settings** > **Actions** > **General**.
2. Baja hasta **Workflow permissions**.
3. Selecciona **Read and write permissions**.
4. Haz clic en **Save**.

### Paso 4: Ejecutar manualmente cuando quieras (Opcional)
- Ve a la pestaña **Actions** en tu repositorio de GitHub.
- Haz clic en **Actualización Diaria del Observatorio** en el menú de la izquierda.
- Haz clic en el botón **Run workflow** para forzar una actualización instantánea con las fotos del momento.

---

## 📁 Estructura del Proyecto

```
observatorio chabely/
├── .github/workflows/
│   └── daily_update.yml      # Cron Job automático (6 AM y 1 PM hora de Perú)
├── data/
│   ├── today.json            # Base de datos de fotos y noticias de hoy
│   └── archive/              # Historial diario (YYYY-MM-DD.json)
├── images/
│   └── today/                # Fotos locales descargadas (garantiza descarga sin bloqueo CORS)
├── scripts/
│   └── fetch_media.py        # Extractor de noticias y fotos
├── index.html                # Interfaz moderna del observatorio
├── app.js                    # Lógica de filtros, búsqueda, lightbox y empaquetado ZIP
├── style.css                 # Estilos y efectos visuales
└── README.md                 # Guía de uso y despliegue
```

---
*Diseñado para Chabely con ❤️.*
