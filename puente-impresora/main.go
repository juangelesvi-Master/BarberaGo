// Puente de impresión de BarberaGo (como el de RestoraGo).
//
// El navegador no puede abrir conexiones TCP hacia la red local, así que este programa corre en una
// computadora de la barbería y manda los tickets (bytes ESC/POS) a las impresoras de red (puerto 9100):
//   - Cola en la nube: con el código del puente (BarberaGo > Impresora) pide cada 2 s los tickets que
//     cualquier dispositivo de la barbería dejó en la cola (celular, iPad, otra computadora) y los imprime.
//   - Local: el navegador de esta misma computadora también puede mandarle tickets a http://127.0.0.1:9123.
//
// Solo acepta peticiones locales de la web de BarberaGo y solo imprime en direcciones de la red local.
package main

import (
	"bufio"
	"bytes"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"
)

const (
	version   = "2.0"
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

// Proyecto de Supabase de BarberaGo. La llave publicable es pública por diseño; el puente solo puede
// llamar a puente_trabajos y puente_resultado con su código.
var (
	supabaseURL = "https://stcazhnnsisklzpdwltu.supabase.co"
	supabaseKey = "sb_publishable_GxCR32wwmIYgifjE-L7xzg_8plHLGfb"
)

func main() {
	if o := os.Getenv("BARBERAGO_ORIGEN"); o != "" {
		origenes[strings.TrimRight(o, "/")] = true
	}
	if u := os.Getenv("BARBERAGO_SUPABASE_URL"); u != "" {
		supabaseURL = strings.TrimRight(u, "/")
	}
	http.HandleFunc("/estado", conCors(func(w http.ResponseWriter, r *http.Request) {
		responder(w, http.StatusOK, map[string]any{"ok": true, "version": version, "vinculado": codigoActual() != ""})
	}))
	http.HandleFunc("/imprimir", conCors(imprimir))
	http.HandleFunc("/vincular", conCors(vincular))

	fmt.Println("==============================================")
	fmt.Println("  Puente de impresión BarberaGo " + version)
	fmt.Println("==============================================")
	fmt.Println("Deja esta ventana abierta (puedes minimizarla). Mientras esté")
	fmt.Println("abierta, los tickets de BarberaGo salen en las impresoras de red.")
	fmt.Println()
	cargarCodigo()
	if codigoActual() == "" {
		go pedirCodigo()
	} else {
		fmt.Println("Conectado a tu barbería. Esperando tickets…")
	}
	go ciclo()
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

// ───────────── Cola en la nube ─────────────

var (
	mu     sync.Mutex
	codigo string
)

func codigoActual() string { mu.Lock(); defer mu.Unlock(); return codigo }

func archivoConfig() string {
	dir, err := os.UserConfigDir()
	if err != nil {
		dir = "."
	}
	return filepath.Join(dir, "BarberaGoPuente", "config.json")
}

func cargarCodigo() {
	b, err := os.ReadFile(archivoConfig())
	if err != nil {
		return
	}
	var c struct {
		Codigo string `json:"codigo"`
	}
	if json.Unmarshal(b, &c) == nil && codigoValido(c.Codigo) {
		mu.Lock()
		codigo = c.Codigo
		mu.Unlock()
	}
}

func codigoValido(c string) bool {
	return strings.HasPrefix(c, "bgo_") && len(c) >= 24 && len(c) <= 80 && !strings.ContainsAny(c, " \t\r\n\"")
}

func guardarCodigo(c string) error {
	mu.Lock()
	codigo = c
	mu.Unlock()
	if c == "" {
		os.Remove(archivoConfig())
		return nil
	}
	os.MkdirAll(filepath.Dir(archivoConfig()), 0o700)
	b, _ := json.Marshal(map[string]string{"codigo": c})
	return os.WriteFile(archivoConfig(), b, 0o600)
}

var pidiendo sync.Mutex

// pedirCodigo pregunta el código en la ventana (también se puede vincular desde BarberaGo en esta computadora).
func pedirCodigo() {
	if !pidiendo.TryLock() {
		return
	}
	defer pidiendo.Unlock()
	fmt.Println("Para conectar el puente con tu barbería:")
	fmt.Println("  BarberaGo > Cobrar > Impresora > Red (IP) > Instalar puente, y pega aquí el código.")
	lector := bufio.NewReader(os.Stdin)
	for codigoActual() == "" {
		fmt.Print("Código del puente: ")
		linea, err := lector.ReadString('\n')
		if codigoActual() != "" {
			break
		}
		linea = strings.TrimSpace(linea)
		if codigoValido(linea) {
			guardarCodigo(linea)
			fmt.Println("Código guardado. Conectando…")
			break
		}
		if err != nil {
			return // sin ventana (stdin cerrado): se puede vincular desde BarberaGo en esta computadora
		}
		fmt.Println("Ese código no parece válido; debe empezar con bgo_.")
	}
}

// vincular recibe el código desde BarberaGo abierto en esta misma computadora.
func vincular(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		responder(w, http.StatusMethodNotAllowed, map[string]any{"error": "Usa POST"})
		return
	}
	var p struct {
		Codigo string `json:"codigo"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4096)).Decode(&p); err != nil || !codigoValido(p.Codigo) {
		responder(w, http.StatusBadRequest, map[string]any{"error": "Código no válido"})
		return
	}
	if err := guardarCodigo(p.Codigo); err != nil {
		responder(w, http.StatusInternalServerError, map[string]any{"error": "No se pudo guardar el código"})
		return
	}
	fmt.Println()
	fmt.Println("Puente vinculado desde BarberaGo. Esperando tickets…")
	responder(w, http.StatusOK, map[string]any{"ok": true})
}

type trabajo struct {
	ID     string `json:"id"`
	IP     string `json:"ip"`
	Puerto int    `json:"puerto"`
	Datos  string `json:"datos"`
}

var clienteHTTP = &http.Client{Timeout: 15 * time.Second}

func rpc(fn string, cuerpo any, salida any) error {
	b, _ := json.Marshal(cuerpo)
	req, _ := http.NewRequest(http.MethodPost, supabaseURL+"/rest/v1/rpc/"+fn, bytes.NewReader(b))
	req.Header.Set("apikey", supabaseKey)
	req.Header.Set("Content-Type", "application/json")
	resp, err := clienteHTTP.Do(req)
	if err != nil {
		return errRed{err}
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		var e struct {
			Message string `json:"message"`
		}
		json.NewDecoder(resp.Body).Decode(&e)
		return errServidor{resp.StatusCode, e.Message}
	}
	if salida != nil {
		return json.NewDecoder(resp.Body).Decode(salida)
	}
	return nil
}

type errRed struct{ error }
type errServidor struct {
	codigo  int
	mensaje string
}

func (e errServidor) Error() string { return fmt.Sprintf("%d %s", e.codigo, e.mensaje) }

// ciclo pide los tickets pendientes cada 2 segundos y los imprime.
func ciclo() {
	equipo, _ := os.Hostname()
	sinInternet := false
	for {
		c := codigoActual()
		if c == "" {
			time.Sleep(2 * time.Second)
			continue
		}
		var trabajos []trabajo
		err := rpc("puente_trabajos", map[string]any{"p_codigo": c, "p_equipo": equipo}, &trabajos)
		var es errServidor
		switch {
		case errors.As(err, &es) && strings.Contains(es.mensaje, "no válido"):
			fmt.Println()
			fmt.Println("Este código ya no es válido (quizá se creó uno nuevo en BarberaGo).")
			guardarCodigo("")
			go pedirCodigo()
		case err != nil:
			if !sinInternet {
				log.Printf("Sin conexión con BarberaGo, reintentando… (%v)", err)
				sinInternet = true
			}
			time.Sleep(5 * time.Second)
			continue
		default:
			if sinInternet {
				log.Printf("Conexión recuperada")
				sinInternet = false
			}
		}
		for _, t := range trabajos {
			ok, motivo := imprimirTrabajo(t)
			r := map[string]any{"p_codigo": c, "p_id": t.ID, "p_ok": ok, "p_error": nil}
			if !ok {
				r["p_error"] = motivo
			}
			if err := rpc("puente_resultado", r, nil); err != nil {
				log.Printf("No se pudo informar el resultado: %v", err)
			}
		}
		time.Sleep(2 * time.Second)
	}
}

func imprimirTrabajo(t trabajo) (bool, string) {
	datos, err := base64.StdEncoding.DecodeString(t.Datos)
	if err != nil || len(datos) == 0 || len(datos) > maxTicket {
		return false, "Ticket no válido"
	}
	if t.Puerto < 1 || t.Puerto > 65535 {
		t.Puerto = 9100
	}
	ip, err := ipLocal(t.IP)
	if err != nil {
		return false, err.Error()
	}
	destino := net.JoinHostPort(ip.String(), strconv.Itoa(t.Puerto))
	if err := enviar(destino, datos); err != nil {
		log.Printf("No se pudo imprimir en %s: %v", destino, err)
		return false, fmt.Sprintf("No se pudo conectar con la impresora %s. Revisa que esté encendida y en la misma red.", destino)
	}
	log.Printf("Ticket impreso en %s (%d bytes)", destino, len(datos))
	return true, ""
}
