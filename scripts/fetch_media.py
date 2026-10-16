#!/usr/bin/env python3
"""
Observatorio para Chabely - Extractor Diario de Medios (Scraping Automático)
Personalizado para la jornada laboral de Chabely (9:00 AM a 2:00 PM).
Extrae fotos y noticias exclusivas de HOY de:
- Portadas de Diarios del Día: El Comercio, La República, La Razón, Líbero, El País
- Regional (Puno): Diario Sin Fronteras, Pachamama Radio, Diario Los Andes (Excluye Onda Azul)
- Nacional (Perú): RPP Noticias, Agencia Andina
- Internacional: BBC Mundo, France 24 en Español, El País Internacional
"""

import os
import re
import json
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone, timedelta
import html
import unicodedata
import dateutil.parser

# Directorios de salida
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(BASE_DIR, "data")
ARCHIVE_DIR = os.path.join(DATA_DIR, "archive")
IMAGES_DIR = os.path.join(BASE_DIR, "images")
IMAGES_TODAY_DIR = os.path.join(IMAGES_DIR, "today")

for d in [DATA_DIR, ARCHIVE_DIR, IMAGES_DIR, IMAGES_TODAY_DIR]:
    os.makedirs(d, exist_ok=True)

USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"

# Zona horaria de Perú (UTC-5)
PERU_TZ = timezone(timedelta(hours=-5))

def get_request(url):
    return urllib.request.Request(url, headers={"User-Agent": USER_AGENT})

def clean_html(raw_html):
    if not raw_html:
        return ""
    clean = re.sub(r"<[^>]+>", "", raw_html)
    return html.unescape(clean).strip()

def sanitize_filename(name):
    normalized = unicodedata.normalize('NFKD', name).encode('ascii', 'ignore').decode('utf-8')
    clean = re.sub(r'[^a-zA-Z0-9_\-]+', '_', normalized)
    clean = re.sub(r'_+', '_', clean).strip('._')
    return clean[:60]

def clean_old_images(date_str, images_dir=IMAGES_TODAY_DIR):
    deleted = 0
    current_prefix = f"{date_str}_"
    for entry in os.scandir(images_dir):
        if entry.is_file() and not entry.name.startswith(current_prefix):
            os.remove(entry.path)
            deleted += 1
    print(f"[OK] Eliminadas {deleted} imágenes de días anteriores.")
    return deleted

def parse_and_format_date(date_str, now_peru):
    """
    Parsea cualquier formato de fecha y devuelve:
    (es_reciente_de_hoy, fecha_formateada_corta, fecha_completa, objeto_datetime)
    """
    if not date_str:
        return (True, now_peru.strftime("Hoy • %I:%M %p"), now_peru.strftime("%d de %B de %Y, %I:%M %p"), now_peru)
    
    try:
        dt = dateutil.parser.parse(date_str)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=PERU_TZ)
        else:
            dt = dt.astimezone(PERU_TZ)
    except Exception:
        return (True, now_peru.strftime("Hoy • %I:%M %p"), date_str, now_peru)

    # Solo noticias de las últimas 30 horas (del día de hoy y madrugada)
    diff_hours = (now_peru - dt).total_seconds() / 3600
    is_today = (diff_hours >= -2 and diff_hours <= 32)

    meses = ['', 'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Set', 'Oct', 'Nov', 'Dic']
    meses_completos = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Setiembre', 'Octubre', 'Noviembre', 'Diciembre']

    hora_str = dt.strftime("%I:%M %p").lstrip('0')
    if dt.date() == now_peru.date():
        short_fmt = f"Hoy • {hora_str}"
    else:
        short_fmt = f"{dt.day} {meses[dt.month]} • {hora_str}"
        
    full_fmt = f"{dt.day} de {meses_completos[dt.month]} de {dt.year}, {hora_str}"
    return (is_today, short_fmt, full_fmt, dt)

def download_image(img_url, filename_prefix, date_str):
    if not img_url:
        return None
    try:
        if img_url.startswith("//"):
            img_url = "https:" + img_url
            
        ext = ".jpg"
        clean_prefix = sanitize_filename(filename_prefix)
        filename = f"{date_str}_{clean_prefix}{ext}"
        local_path = os.path.join(IMAGES_TODAY_DIR, filename)
        rel_path = f"images/today/{filename}"
        
        req = get_request(img_url)
        with urllib.request.urlopen(req, timeout=12) as response:
            content_type = response.headers.get("Content-Type", "")
            if "image" not in content_type and not img_url.lower().endswith(('.jpg', '.jpeg', '.png', '.webp', '.avif')):
                return None
            data = response.read()
            if len(data) < 2000:
                return None
            with open(local_path, "wb") as f:
                f.write(data)
        return rel_path
    except Exception as e:
        print(f"Error descargando imagen {img_url}: {e}")
        return None

def fetch_wp_posts(api_url, source_name, category_id, category_label, now_peru, max_posts=10, date_str=""):
    items = []
    print(f"[*] Obteniendo WP: {source_name}...")
    try:
        req = get_request(api_url)
        with urllib.request.urlopen(req, timeout=12) as resp:
            posts = json.loads(resp.read().decode('utf-8'))
            for post in posts[:max_posts]:
                date_iso = post.get("date", "")
                is_today, date_short, date_full, dt_obj = parse_and_format_date(date_iso, now_peru)
                
                # Filtrar solo noticias recientes del día
                if not is_today:
                    continue

                title = clean_html(post.get("title", {}).get("rendered", ""))
                link = post.get("link", "")
                
                excerpt = clean_html(post.get("excerpt", {}).get("rendered", ""))
                if len(excerpt) > 220:
                    excerpt = excerpt[:220] + "..."
                
                media_info = post.get("_embedded", {}).get("wp:featuredmedia", [{}])
                img_url = None
                if media_info and isinstance(media_info, list) and len(media_info) > 0:
                    # Máxima resolución de WordPress
                    img_url = media_info[0].get("source_url")
                
                if not img_url:
                    continue
                
                slug = sanitize_filename(f"{source_name}_{title[:35]}")
                local_img = download_image(img_url, slug, date_str)
                
                items.append({
                    "id": f"{category_id}-{len(items)+1}-{slug[:25]}",
                    "title": title,
                    "category": category_id,
                    "category_label": category_label,
                    "source": source_name,
                    "url": link,
                    "image_url": img_url,
                    "local_image": local_img or img_url,
                    "date": date_iso,
                    "date_formatted": date_short,
                    "date_full": date_full,
                    "timestamp": int(dt_obj.timestamp()),
                    "summary": excerpt or title
                })
    except Exception as e:
        print(f"[!] Error en WP {source_name}: {e}")
    return items

def fetch_rss_feed(feed_url, source_name, category_id, category_label, now_peru, max_items=12, date_str=""):
    items = []
    print(f"[*] Obteniendo RSS: {source_name}...")
    try:
        req = get_request(feed_url)
        with urllib.request.urlopen(req, timeout=12) as resp:
            xml_text = resp.read()
            root = ET.fromstring(xml_text)
            
            feed_items = root.findall(".//item")
            for item in feed_items[:max_items]:
                pubDate_elem = item.find("pubDate")
                pubDate = pubDate_elem.text if (pubDate_elem is not None and pubDate_elem.text) else ""
                
                is_today, date_short, date_full, dt_obj = parse_and_format_date(pubDate, now_peru)
                if not is_today:
                    continue

                title_elem = item.find("title")
                title = clean_html(title_elem.text if title_elem is not None else "")
                if not title:
                    continue
                
                link_elem = item.find("link")
                link = link_elem.text if link_elem is not None else ""
                
                desc_elem = item.find("description")
                desc_raw = desc_elem.text if desc_elem is not None else ""
                summary = clean_html(desc_raw)
                if len(summary) > 220:
                    summary = summary[:220] + "..."
                
                # Buscar imagen de alta resolución
                img_url = None
                
                for child in item:
                    tag = child.tag.lower()
                    if "enclosure" in tag and "image" in child.attrib.get("type", ""):
                        img_url = child.attrib.get("url")
                        break
                    elif "content" in tag and ("image" in child.attrib.get("type", "") or child.attrib.get("url")):
                        img_url = child.attrib.get("url")
                        break
                    elif "thumbnail" in tag and child.attrib.get("url"):
                        img_url = child.attrib.get("url")
                        # BBC Ultra-HD (1024px)
                        if "ichef.bbci.co.uk" in img_url:
                            img_url = re.sub(r'/ws/\d+/', '/ws/1024/', img_url)
                        break
                
                if not img_url:
                    content_encoded = item.find("{http://purl.org/rss/1.0/modules/content/}encoded")
                    text_search = (content_encoded.text or "") + " " + desc_raw
                    imgs = re.findall(r'https?://[^\s"\'<>]+\.(?:jpg|jpeg|png|webp)', text_search)
                    if imgs:
                        img_url = imgs[0]
                
                if not img_url:
                    continue
                
                slug = sanitize_filename(f"{source_name}_{title[:35]}")
                local_img = download_image(img_url, slug, date_str)
                
                items.append({
                    "id": f"{category_id}-{len(items)+1}-{slug[:25]}",
                    "title": title,
                    "category": category_id,
                    "category_label": category_label,
                    "source": source_name,
                    "url": link,
                    "image_url": img_url,
                    "local_image": local_img or img_url,
                    "date": pubDate,
                    "date_formatted": date_short,
                    "date_full": date_full,
                    "timestamp": int(dt_obj.timestamp()),
                    "summary": summary or title
                })
    except Exception as e:
        print(f"[!] Error en RSS {source_name}: {e}")
    return items

def fetch_newspaper_covers(date_str, today_obj):
    items = []
    print("[*] Obteniendo Portadas de Diarios del Día...")
    kiosko_date = today_obj.strftime("%Y/%m/%d")
    
    portadas = [
        ("El Comercio (Perú)", f"https://img.kiosko.net/{kiosko_date}/pe/pe_comercio.750.jpg", "https://elcomercio.pe"),
        ("La República (Perú)", f"https://img.kiosko.net/{kiosko_date}/pe/pe_republica.750.jpg", "https://larepublica.pe"),
        ("Diario Correo (Perú)", f"https://img.kiosko.net/{kiosko_date}/pe/correo_lima.750.jpg", "https://diariocorreo.pe"),
        ("La Razón (Perú)", f"https://img.kiosko.net/{kiosko_date}/pe/pe_larazon.750.jpg", "https://larazon.pe"),
        ("Líbero (Perú)", f"https://img.kiosko.net/{kiosko_date}/pe/pe_libero.750.jpg", "https://libero.pe"),
        ("El País (España / Global)", f"https://img.kiosko.net/{kiosko_date}/es/elpais.750.jpg", "https://elpais.com")
    ]
    
    meses_completos = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Setiembre', 'Octubre', 'Noviembre', 'Diciembre']
    fecha_portada = f"{today_obj.day} de {meses_completos[today_obj.month]} de {today_obj.year}"

    for name, img_url, web_url in portadas:
        slug = sanitize_filename(f"Portada_{name}")
        local_img = download_image(img_url, slug, date_str)
        if local_img:
            items.append({
                "id": f"portada-{len(items)+1}-{slug[:20]}",
                "title": f"Portada del Día: {name}",
                "category": "portadas",
                "category_label": "Portadas de Diarios",
                "source": name,
                "url": web_url,
                "image_url": img_url,
                "local_image": local_img,
                "date": today_obj.strftime("%Y-%m-%d"),
                "date_formatted": "Hoy • Edición Impresa",
                "date_full": f"Edición del {fecha_portada}",
                "timestamp": int(today_obj.timestamp()),
                "summary": f"Primera plana y portada oficial del diario {name} correspondiente al {fecha_portada}."
            })
            
    return items

def main():
    now_peru = datetime.now(PERU_TZ)
    date_str = now_peru.strftime("%Y-%m-%d")
    clean_old_images(date_str)
    
    meses_completos = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Setiembre', 'Octubre', 'Noviembre', 'Diciembre']
    hora_actual = now_peru.strftime("%I:%M %p").lstrip('0')
    human_date = f"{now_peru.day} de {meses_completos[now_peru.month]} de {now_peru.year} a las {hora_actual} (Hora Perú)"
    
    print(f"=================================================")
    print(f" Observatorio para Chabely - Actualización {human_date}")
    print(f"=================================================")
    
    all_media = []
    
    # 1. PORTADAS DE DIARIOS
    portadas = fetch_newspaper_covers(date_str, now_peru)
    all_media.extend(portadas)
    
    # 2. REGIONAL (PUNO) - EXCLUYE RADIO ONDA AZUL
    puno_sin_fronteras = fetch_wp_posts(
        "https://diariosinfronteras.com.pe/wp-json/wp/v2/posts?_embed&per_page=12",
        "Diario Sin Fronteras (Puno)",
        "regional",
        "Regional (Puno)",
        now_peru,
        max_posts=8,
        date_str=date_str
    )
    all_media.extend(puno_sin_fronteras)
    
    puno_pachamama = fetch_wp_posts(
        "https://pachamamaradio.org/wp-json/wp/v2/posts?_embed&per_page=12",
        "Pachamama Radio (Puno)",
        "regional",
        "Regional (Puno)",
        now_peru,
        max_posts=8,
        date_str=date_str
    )
    all_media.extend(puno_pachamama)
    
    puno_los_andes = fetch_wp_posts(
        "https://losandes.com.pe/wp-json/wp/v2/posts?_embed&per_page=12",
        "Diario Los Andes (Puno)",
        "regional",
        "Regional (Puno)",
        now_peru,
        max_posts=8,
        date_str=date_str
    )
    all_media.extend(puno_los_andes)
    
    # 3. NACIONAL (PERÚ)
    nacional_rpp = fetch_rss_feed(
        "https://rpp.pe/feed",
        "RPP Noticias",
        "nacional",
        "Nacional (Perú)",
        now_peru,
        max_items=10,
        date_str=date_str
    )
    all_media.extend(nacional_rpp)
    
    nacional_andina = fetch_rss_feed(
        "https://andina.pe/agencia/rss/rss.aspx",
        "Agencia Andina",
        "nacional",
        "Nacional (Perú)",
        now_peru,
        max_items=10,
        date_str=date_str
    )
    all_media.extend(nacional_andina)
    
    # 4. INTERNACIONAL
    inter_france24 = fetch_rss_feed(
        "https://www.france24.com/es/rss",
        "France 24 en Español",
        "internacional",
        "Internacional",
        now_peru,
        max_items=8,
        date_str=date_str
    )
    all_media.extend(inter_france24)
    
    inter_bbc = fetch_rss_feed(
        "https://feeds.bbci.co.uk/mundo/rss.xml",
        "BBC Mundo",
        "internacional",
        "Internacional",
        now_peru,
        max_items=8,
        date_str=date_str
    )
    all_media.extend(inter_bbc)
    
    inter_elpais = fetch_rss_feed(
        "https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/portada",
        "El País Internacional",
        "internacional",
        "Internacional",
        now_peru,
        max_items=8,
        date_str=date_str
    )
    all_media.extend(inter_elpais)
    
    # Ordenar por fecha más reciente primero
    all_media.sort(key=lambda x: x.get("timestamp", 0), reverse=True)
    
    stats = {
        "total": len(all_media),
        "portadas": len([m for m in all_media if m["category"] == "portadas"]),
        "regional": len([m for m in all_media if m["category"] == "regional"]),
        "nacional": len([m for m in all_media if m["category"] == "nacional"]),
        "internacional": len([m for m in all_media if m["category"] == "internacional"])
    }
    
    result = {
        "title": "Observatorio para Chabely",
        "date": date_str,
        "updated_at": human_date,
        "updated_at_iso": now_peru.isoformat(),
        "stats": stats,
        "media": all_media
    }
    
    today_file = os.path.join(DATA_DIR, "today.json")
    with open(today_file, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
    print(f"[OK] Guardado {today_file} con {len(all_media)} fotos estrictamente de HOY.")
    
    archive_file = os.path.join(ARCHIVE_DIR, f"{date_str}.json")
    with open(archive_file, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
    print(f"[OK] Archivo histórico guardado en {archive_file}")
    
    return result

if __name__ == "__main__":
    main()
