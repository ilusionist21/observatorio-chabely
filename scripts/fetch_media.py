#!/usr/bin/env python3
"""
Observatorio para Chabely - Extractor Diario de Medios
Obtiene fotos y noticias de medios:
- Regional (Puno): Diario Sin Fronteras, Pachamama Radio, Diario Los Andes (Excluye Onda Azul)
- Nacional (Perú): RPP Noticias, Agencia Andina
- Portadas de Diarios del Día: El Comercio, La República, La Razón, Líbero, El País
- Internacional: BBC Mundo, France 24 en Español, El País Internacional
Descarga las fotos a 'images/today/' y guarda 'data/today.json' y 'data/archive/YYYY-MM-DD.json'.
"""

import os
import re
import json
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone, timedelta
import html

# Directorios de salida
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(BASE_DIR, "data")
ARCHIVE_DIR = os.path.join(DATA_DIR, "archive")
IMAGES_DIR = os.path.join(BASE_DIR, "images")
IMAGES_TODAY_DIR = os.path.join(IMAGES_DIR, "today")

for d in [DATA_DIR, ARCHIVE_DIR, IMAGES_DIR, IMAGES_TODAY_DIR]:
    os.makedirs(d, exist_ok=True)

USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"

def get_request(url):
    return urllib.request.Request(url, headers={"User-Agent": USER_AGENT})

def clean_html(raw_html):
    if not raw_html:
        return ""
    clean = re.sub(r"<[^>]+>", "", raw_html)
    return html.unescape(clean).strip()

import unicodedata

def sanitize_filename(name):
    # Convertir acentos a caracteres ASCII estándar (á -> a, ñ -> n)
    normalized = unicodedata.normalize('NFKD', name).encode('ascii', 'ignore').decode('utf-8')
    clean = re.sub(r'[^a-zA-Z0-9_\-]+', '_', normalized)
    clean = re.sub(r'_+', '_', clean).strip('._')
    return clean[:60]

def download_image(img_url, filename_prefix, date_str):
    if not img_url:
        return None
    try:
        # Resolver URLs relativas tipo //img.kiosko.net
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
            if len(data) < 2000:  # descartar iconos pequeños o errores
                return None
            with open(local_path, "wb") as f:
                f.write(data)
        return rel_path
    except Exception as e:
        print(f"Error descargando imagen {img_url}: {e}")
        return None

def fetch_wp_posts(api_url, source_name, category_id, category_label, max_posts=8, date_str=""):
    items = []
    print(f"[*] Obteniendo WP: {source_name}...")
    try:
        req = get_request(api_url)
        with urllib.request.urlopen(req, timeout=12) as resp:
            posts = json.loads(resp.read().decode('utf-8'))
            for post in posts[:max_posts]:
                title = clean_html(post.get("title", {}).get("rendered", ""))
                link = post.get("link", "")
                date_iso = post.get("date", "")
                
                # Resumen
                excerpt = clean_html(post.get("excerpt", {}).get("rendered", ""))
                if len(excerpt) > 220:
                    excerpt = excerpt[:220] + "..."
                
                # Imagen destacada
                media_info = post.get("_embedded", {}).get("wp:featuredmedia", [{}])
                img_url = None
                if media_info and isinstance(media_info, list) and len(media_info) > 0:
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
                    "summary": excerpt or title
                })
    except Exception as e:
        print(f"[!] Error en WP {source_name}: {e}")
    return items

def fetch_rss_feed(feed_url, source_name, category_id, category_label, max_items=10, date_str=""):
    items = []
    print(f"[*] Obteniendo RSS: {source_name}...")
    try:
        req = get_request(feed_url)
        with urllib.request.urlopen(req, timeout=12) as resp:
            xml_text = resp.read()
            root = ET.fromstring(xml_text)
            
            feed_items = root.findall(".//item")
            for item in feed_items[:max_items]:
                title_elem = item.find("title")
                title = clean_html(title_elem.text if title_elem is not None else "")
                if not title:
                    continue
                
                link_elem = item.find("link")
                link = link_elem.text if link_elem is not None else ""
                
                pubDate_elem = item.find("pubDate")
                pubDate = pubDate_elem.text if pubDate_elem is not None else ""
                
                desc_elem = item.find("description")
                desc_raw = desc_elem.text if desc_elem is not None else ""
                summary = clean_html(desc_raw)
                if len(summary) > 220:
                    summary = summary[:220] + "..."
                
                # Buscar imagen
                img_url = None
                
                # 1. Enclosure
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
                        # BBC thumbnail optimization
                        if "ichef.bbci.co.uk" in img_url:
                            img_url = re.sub(r'/ws/\d+/', '/ws/800/', img_url)
                        break
                
                # 2. Si no hay en tags, buscar en encoded / description
                if not img_url:
                    content_encoded = item.find("{http://purl.org/rss/1.0/modules/content/}encoded")
                    text_search = (content_encoded.text or "") + " " + desc_raw
                    imgs = re.findall(r'https?://[^\s"\'<>]+\.(?:jpg|jpeg|png|webp)', text_search)
                    if imgs:
                        img_url = imgs[0]
                
                if not img_url:
                    continue
                
                # Mantener URL original si no hay fallo
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
                    "summary": summary or title
                })
    except Exception as e:
        print(f"[!] Error en RSS {source_name}: {e}")
    return items

def fetch_newspaper_covers(date_str, today_obj):
    """
    Obtiene las portadas de diarios de hoy (El Comercio, La República, La Razón, Líbero, El País, NYT)
    """
    items = []
    print("[*] Obteniendo Portadas de Diarios del Día...")
    
    # Formato de fecha para kiosko: YYYY/MM/DD
    kiosko_date = today_obj.strftime("%Y/%m/%d")
    
    portadas = [
        ("El Comercio (Perú)", f"https://img.kiosko.net/{kiosko_date}/pe/pe_comercio.750.jpg", "https://elcomercio.pe"),
        ("La República (Perú)", f"https://img.kiosko.net/{kiosko_date}/pe/pe_republica.750.jpg", "https://larepublica.pe"),
        ("Diario Correo (Perú)", f"https://img.kiosko.net/{kiosko_date}/pe/correo_lima.750.jpg", "https://diariocorreo.pe"),
        ("La Razón (Perú)", f"https://img.kiosko.net/{kiosko_date}/pe/pe_larazon.750.jpg", "https://larazon.pe"),
        ("Líbero (Perú)", f"https://img.kiosko.net/{kiosko_date}/pe/pe_libero.750.jpg", "https://libero.pe"),
        ("El País (España / Global)", f"https://img.kiosko.net/{kiosko_date}/es/elpais.750.jpg", "https://elpais.com"),
        ("The New York Times (EE.UU.)", f"https://img.kiosko.net/{kiosko_date}/us/nyt.750.jpg", "https://nytimes.com")
    ]
    
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
                "summary": f"Primera plana y portada oficial del diario {name} correspondiente al {today_obj.strftime('%d de %B de %Y')}."
            })
            
    return items

def main():
    # Zona horaria de Perú (UTC-5)
    peru_tz = timezone(timedelta(hours=-5))
    now_peru = datetime.now(peru_tz)
    date_str = now_peru.strftime("%Y-%m-%d")
    human_date = now_peru.strftime("%d de %B de %Y, %I:%M %p (Hora Perú)")
    
    print(f"=================================================")
    print(f" Observatorio para Chabely - Generando Día {date_str}")
    print(f"=================================================")
    
    all_media = []
    
    # 1. PORTADAS DE DIARIOS
    portadas = fetch_newspaper_covers(date_str, now_peru)
    all_media.extend(portadas)
    
    # 2. REGIONAL (PUNO)
    # NOTA: Radio Onda Azul queda EXCLUIDA como solicitó el usuario.
    puno_sin_fronteras = fetch_wp_posts(
        "https://diariosinfronteras.com.pe/wp-json/wp/v2/posts?_embed&per_page=8",
        "Diario Sin Fronteras (Puno)",
        "regional",
        "Regional (Puno)",
        max_posts=6,
        date_str=date_str
    )
    all_media.extend(puno_sin_fronteras)
    
    puno_pachamama = fetch_wp_posts(
        "https://pachamamaradio.org/wp-json/wp/v2/posts?_embed&per_page=8",
        "Pachamama Radio (Puno)",
        "regional",
        "Regional (Puno)",
        max_posts=6,
        date_str=date_str
    )
    all_media.extend(puno_pachamama)
    
    puno_los_andes = fetch_wp_posts(
        "https://losandes.com.pe/wp-json/wp/v2/posts?_embed&per_page=8",
        "Diario Los Andes (Puno)",
        "regional",
        "Regional (Puno)",
        max_posts=6,
        date_str=date_str
    )
    all_media.extend(puno_los_andes)
    
    # 3. NACIONAL (PERÚ)
    nacional_rpp = fetch_rss_feed(
        "https://rpp.pe/feed",
        "RPP Noticias",
        "nacional",
        "Nacional (Perú)",
        max_items=8,
        date_str=date_str
    )
    all_media.extend(nacional_rpp)
    
    nacional_andina = fetch_rss_feed(
        "https://andina.pe/agencia/rss/rss.aspx",
        "Agencia Andina",
        "nacional",
        "Nacional (Perú)",
        max_items=8,
        date_str=date_str
    )
    all_media.extend(nacional_andina)
    
    # 4. INTERNACIONAL
    inter_france24 = fetch_rss_feed(
        "https://www.france24.com/es/rss",
        "France 24 en Español",
        "internacional",
        "Internacional",
        max_items=6,
        date_str=date_str
    )
    all_media.extend(inter_france24)
    
    inter_bbc = fetch_rss_feed(
        "https://feeds.bbci.co.uk/mundo/rss.xml",
        "BBC Mundo",
        "internacional",
        "Internacional",
        max_items=6,
        date_str=date_str
    )
    all_media.extend(inter_bbc)
    
    inter_elpais = fetch_rss_feed(
        "https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/portada",
        "El País Internacional",
        "internacional",
        "Internacional",
        max_items=6,
        date_str=date_str
    )
    all_media.extend(inter_elpais)
    
    # Conteo por categorías
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
        "stats": stats,
        "media": all_media
    }
    
    # Guardar today.json
    today_file = os.path.join(DATA_DIR, "today.json")
    with open(today_file, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
    print(f"[OK] Guardado {today_file} con {len(all_media)} fotos y noticias.")
    
    # Guardar en archivo histórico por fecha
    archive_file = os.path.join(ARCHIVE_DIR, f"{date_str}.json")
    with open(archive_file, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
    print(f"[OK] Archivo histórico guardado en {archive_file}")
    
    print("\nResumen del Observatorio para Chabely:")
    print(f"- Total fotos recolectadas: {stats['total']}")
    print(f"- Portadas de Diarios: {stats['portadas']}")
    print(f"- Regional (Puno): {stats['regional']}")
    print(f"- Nacional (Perú): {stats['nacional']}")
    print(f"- Internacional: {stats['internacional']}")

if __name__ == "__main__":
    main()
