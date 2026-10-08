// Puente de impresión de BarberaGo.
//
// El navegador no puede abrir conexiones TCP, así que la web de BarberaGo le manda el ticket
// (bytes ESC/POS) a este programa en http://127.0.0.1:9123 y él lo reenvía a la impresora
// térmica de red (puerto 9100). Solo acepta peticiones de la web de BarberaGo y solo
// imprime en direcciones de la red local.
package main

import (
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"
)

const (
	version   = "1.0"
	direccion = "127.0.0.1:9123"
	maxTicket = 1 << 20 // 1 MB
)

// Orígenes que pueden imprimir. BARBERAGO_ORIGEN agrega otro (por ejemplo, para pruebas locales).
var origenes = map[string]bool{
	"https://barberago.restorago.com": true,
}

type peticion struct {
	IP     string `json:"ip"`
	Puerto int    `json:"puerto"`
	Datos  string `json:"datos"` // ESC/POS en base64
}

func main() {
	if o := os.Getenv("BARBERAGO_ORIGEN"); o != "" {
		origenes[strings.TrimRight(o, "/")] = true
	}
	http.HandleFunc("/estado", conCors(func(w http.ResponseWriter, r *http.Request) {
		responder(w, http.StatusOK, map[string]any{"ok": true, "version": version})
	}))
	http.HandleFunc("/imprimir", conCors(imprimir))

	fmt.Println("==============================================")
	fmt.Println("  Puente de impresión BarberaGo " + version)
	fmt.Println("==============================================")
	fmt.Println("Listo. Deja esta ventana abierta (puedes minimizarla)")
	fmt.Println("mientras uses BarberaGo en el navegador de esta computadora.")
	fmt.Println()
	srv := &http.Server{Addr: direccion, ReadHeaderTimeout: 10 * time.Second}
	if err := srv.ListenAndServe(); err != nil {
		fmt.Println("No se pudo iniciar el puente:", err)
		fmt.Println("¿Ya está abierto en otra ventana? Ciérrala y vuelve a intentar.")
		fmt.Println("Presiona Enter para salir.")
		fmt.Scanln()
		os.Exit(1)
	}
}

// conCors deja pasar solo a la web de BarberaGo y contesta el preflight (incluye el permiso
// de red privada que Chrome pide para que una página de internet hable con 127.0.0.1).
func conCors(h http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		origen := r.Header.Get("Origin")
		if !origenes[origen] {
			responder(w, http.StatusForbidden, map[string]any{"error": "Origen no permitido"})
			return
		}
		w.Header().Set("Access-Control-Allow-Origin", origen)
		w.Header().Set("Vary", "Origin")
		if r.Method == http.MethodOptions {
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
			w.Header().Set("Access-Control-Allow-Private-Network", "true")
			w.Header().Set("Access-Control-Max-Age", "600")
			w.WriteHeader(http.StatusNoContent)
			return
		}
		h(w, r)
	}
}

func imprimir(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		responder(w, http.StatusMethodNotAllowed, map[string]any{"error": "Usa POST"})
		return
	}
	var p peticion
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, maxTicket*2)).Decode(&p); err != nil {
		responder(w, http.StatusBadRequest, map[string]any{"error": "Ticket no válido"})
		return
	}
	datos, err := base64.StdEncoding.DecodeString(p.Datos)
	if err != nil || len(datos) == 0 || len(datos) > maxTicket {
		responder(w, http.StatusBadRequest, map[string]any{"error": "Ticket no válido"})
		return
	}
	if p.Puerto < 1 || p.Puerto > 65535 {
		p.Puerto = 9100
	}
	ip, err := ipLocal(p.IP)
	if err != nil {
		responder(w, http.StatusBadRequest, map[string]any{"error": err.Error()})
		return
	}
	destino := net.JoinHostPort(ip.String(), strconv.Itoa(p.Puerto))
	if err := enviar(destino, datos); err != nil {
		log.Printf("No se pudo imprimir en %s: %v", destino, err)
		responder(w, http.StatusBadGateway, map[string]any{
			"error": fmt.Sprintf("No se pudo conectar con la impresora %s. Revisa que esté encendida y en la misma red.", destino),
		})
		return
	}
	log.Printf("Ticket enviado a %s (%d bytes)", destino, len(datos))
	responder(w, http.StatusOK, map[string]any{"ok": true})
}

// ipLocal resuelve la dirección y exige que sea de la red local (192.168.x.x, 10.x.x.x, etc.).
func ipLocal(texto string) (net.IP, error) {
	texto = strings.TrimSpace(texto)
	if texto == "" || len(texto) > 64 {
		return nil, errors.New("Escribe la IP de la impresora")
	}
	ips, err := net.LookupIP(texto)
	if err != nil || len(ips) == 0 {
		return nil, fmt.Errorf("No se encontró la impresora %s", texto)
	}
	for _, ip := range ips {
		if ip.IsPrivate() || ip.IsLinkLocalUnicast() || ip.IsLoopback() {
			return ip, nil
		}
	}
	return nil, errors.New("Solo se puede imprimir en impresoras de la red local")
}

func enviar(destino string, datos []byte) error {
	c, err := net.DialTimeout("tcp", destino, 4*time.Second)
	if err != nil {
		return err
	}
	defer c.Close()
	c.SetWriteDeadline(time.Now().Add(10 * time.Second))
	_, err = c.Write(datos)
	return err
}

func responder(w http.ResponseWriter, codigo int, cuerpo any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(codigo)
	json.NewEncoder(w).Encode(cuerpo)
}
