#!/usr/bin/env python3
"""
Servidor local para Observatorio para Chabely
Sirve los archivos estáticos y procesa el botón manual '/api/refresh' para ejecutar
el web scraping en vivo bajo demanda.
"""

import http.server
import socketserver
import os
import json
import subprocess
import sys

PORT = 8000
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

class ObservatorioHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=BASE_DIR, **kwargs)

    def do_GET(self):
        # Endpoint para el botón manual de Actualizar / Scraping
        if self.path.startswith('/api/refresh'):
            self.handle_manual_refresh()
        else:
            super().do_GET()

    def end_headers(self):
        # Headers anti-caché para hoy.json y la interfaz
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def handle_manual_refresh(self):
        print("\n[!] Solicitud manual de actualización recibida desde la web...")
        try:
            # Ejecutar scripts/fetch_media.py
            script_path = os.path.join(BASE_DIR, "scripts", "fetch_media.py")
            res = subprocess.run([sys.executable, script_path], capture_output=True, text=True, check=True)
            print("[OK] Scraping manual finalizado con éxito.")
            
            # Cargar today.json
            today_path = os.path.join(BASE_DIR, "data", "today.json")
            with open(today_path, "r", encoding="utf-8") as f:
                data = json.load(f)
                
            response_payload = {
                "success": True,
                "message": "Scraping y actualización completados con éxito",
                "updated_at": data.get("updated_at"),
                "stats": data.get("stats")
            }
            
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(json.dumps(response_payload, ensure_ascii=False).encode('utf-8'))
        except Exception as e:
            print(f"[!] Error en scraping manual: {e}")
            self.send_response(500)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"success": False, "error": str(e)}).encode('utf-8'))

if __name__ == "__main__":
    # Servidor multi-hilos sin bloqueos
    socketserver.ThreadingTCPServer.allow_reuse_address = True
    with socketserver.ThreadingTCPServer(("", PORT), ObservatorioHandler) as httpd:
        print("============================================================")
        print(" [*] Observatorio para Chabely - Servidor Activo")
        print(f" [*] URL: http://localhost:{PORT}")
        print(f" [*] Endpoint Manual Scraping: http://localhost:{PORT}/api/refresh")
        print("============================================================")
        httpd.serve_forever()
