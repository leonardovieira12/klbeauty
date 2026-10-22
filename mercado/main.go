package main

import (
	"crypto/rand"
	"crypto/sha256"
	"embed"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"time"
)

//go:embed web/*
var assets embed.FS

const version = "2.5.0"

var mu sync.Mutex
var dataDir, statePath, token string
var revision int64
var current json.RawMessage
var server *http.Server

func reply(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	json.NewEncoder(w).Encode(v)
}
func fail(w http.ResponseWriter, code int, msg string) {
	reply(w, code, map[string]string{"error": msg})
}
func atomic(path string, b []byte) error {
	tmp := path + ".tmp"
	f, e := os.OpenFile(tmp, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, 0600)
	if e != nil {
		return e
	}
	_, e = f.Write(b)
	if e == nil {
		e = f.Sync()
	}
	f.Close()
	if e != nil {
		return e
	}
	return replaceFile(tmp, path)
}
func validState(raw json.RawMessage) bool {
	var s map[string]json.RawMessage
	if json.Unmarshal(raw, &s) != nil {
		return false
	}
	var db map[string]json.RawMessage
	if json.Unmarshal(s["db"], &db) != nil {
		return false
	}
	for _, k := range []string{"products", "sales", "customers"} {
		var a []any
		if len(db[k]) == 0 || json.Unmarshal(db[k], &a) != nil || a == nil {
			return false
		}
	}
	return true
}
func auth(w http.ResponseWriter, r *http.Request) bool {
	if cloudMode {
		_, ok := cloudAuthenticated(w, r)
		return ok
	}
	c, e := r.Cookie("kls_session")
	if e != nil || c.Value != token {
		fail(w, 401, "Sessão inválida. Reabra o KLSistemas.")
		return false
	}
	if r.Method != "GET" && r.Header.Get("Origin") != "http://"+r.Host {
		fail(w, 403, "Origem inválida")
		return false
	}
	return true
}
func stateAPI(w http.ResponseWriter, r *http.Request) {
	if cloudMode {
		cloudStateAPI(w, r)
		return
	}
	if !auth(w, r) {
		return
	}
	mu.Lock()
	defer mu.Unlock()
	if r.Method == "GET" {
		reply(w, 200, map[string]any{"revision": revision, "state": current, "version": version, "dataDir": dataDir})
		return
	}
	if r.Method != "POST" {
		fail(w, 405, "Método inválido")
		return
	}
	var body struct {
		Revision int64           `json:"revision"`
		State    json.RawMessage `json:"state"`
	}
	if json.NewDecoder(http.MaxBytesReader(w, r.Body, 40<<20)).Decode(&body) != nil || !validState(body.State) {
		fail(w, 400, "Backup ou dados inválidos")
		return
	}
	if body.Revision != revision {
		fail(w, 409, "Os dados mudaram em outra janela. Recarregue antes de salvar.")
		return
	}
	if len(current) > 0 {
		if e := atomic(statePath+".bak", current); e != nil {
			fail(w, 500, "Falha ao criar backup de segurança")
			return
		}
	}
	if e := atomic(statePath, body.State); e != nil {
		fail(w, 500, "Não foi possível gravar os dados")
		return
	}
	current = body.State
	revision++
	reply(w, 200, map[string]any{"revision": revision})
}
func getHTTPS(address string) (*http.Response, error) {
	u, e := url.Parse(address)
	if e != nil || u.Scheme != "https" || u.Hostname() == "" || u.User != nil {
		return nil, fmt.Errorf("Use uma URL HTTPS sem credenciais")
	}
	c := http.Client{Timeout: 120 * time.Second, CheckRedirect: func(r *http.Request, v []*http.Request) error {
		if len(v) > 5 || r.URL.Scheme != "https" {
			return fmt.Errorf("Redirecionamento não permitido")
		}
		return nil
	}}
	resp, e := c.Get(address)
	if e != nil {
		return nil, e
	}
	if resp.StatusCode != 200 {
		resp.Body.Close()
		return nil, fmt.Errorf("Servidor respondeu HTTP %d", resp.StatusCode)
	}
	return resp, nil
}
func updateAPI(w http.ResponseWriter, r *http.Request) {
	if !auth(w, r) {
		return
	}
	if r.Method != "POST" {
		fail(w, 405, "Método inválido")
		return
	}
	if runtime.GOOS != "windows" {
		fail(w, 400, "Atualização do executável disponível no Windows")
		return
	}
	var b []byte
	var e error
	if r.URL.Path == "/api/update/file" {
		b, e = io.ReadAll(http.MaxBytesReader(w, r.Body, 100<<20))
	} else {
		var m struct {
			URL string `json:"url"`
			SHA string `json:"sha256"`
		}
		if json.NewDecoder(r.Body).Decode(&m) != nil || len(m.SHA) != 64 {
			fail(w, 400, "Manifesto inválido")
			return
		}
		resp, err := getHTTPS(m.URL)
		if err != nil {
			fail(w, 400, err.Error())
			return
		}
		defer resp.Body.Close()
		b, e = io.ReadAll(io.LimitReader(resp.Body, 100<<20))
		h := sha256.Sum256(b)
		if hex.EncodeToString(h[:]) != strings.ToLower(m.SHA) {
			fail(w, 400, "SHA-256 divergente. Atualização recusada.")
			return
		}
	}
	if e != nil || len(b) < 1024 || len(b) >= 100<<20 || string(b[:2]) != "MZ" {
		fail(w, 400, "Executável Windows inválido ou maior que 100 MB")
		return
	}
	if e = stageUpdate(b); e != nil {
		fail(w, 500, e.Error())
		return
	}
	reply(w, 200, map[string]any{"ok": true})
	go func() { time.Sleep(1200 * time.Millisecond); os.Exit(0) }()
}
func manifestAPI(w http.ResponseWriter, r *http.Request) {
	if !auth(w, r) {
		return
	}
	if r.Method != "POST" {
		fail(w, 405, "Método inválido")
		return
	}
	var m struct {
		URL string `json:"url"`
	}
	if json.NewDecoder(r.Body).Decode(&m) != nil {
		fail(w, 400, "URL inválida")
		return
	}
	resp, e := getHTTPS(m.URL)
	if e != nil {
		fail(w, 400, e.Error())
		return
	}
	defer resp.Body.Close()
	var value any
	if json.NewDecoder(io.LimitReader(resp.Body, 65536)).Decode(&value) != nil {
		fail(w, 400, "Manifesto não é JSON válido")
		return
	}
	reply(w, 200, value)
}
func launch(address string) {
	if os.Getenv("KLS_NO_BROWSER") == "1" {
		return
	}
	if runtime.GOOS == "windows" {
		for _, base := range []string{os.Getenv("ProgramFiles(x86)"), os.Getenv("ProgramFiles")} {
			p := filepath.Join(base, "Microsoft", "Edge", "Application", "msedge.exe")
			if _, e := os.Stat(p); e == nil {
				exec.Command(p, "--app="+address).Start()
				return
			}
		}
		exec.Command("rundll32", "url.dll,FileProtocolHandler", address).Start()
	} else {
		exec.Command("xdg-open", address).Start()
	}
}
func main() {
	if e := initCloud(); e != nil {
		log.Fatal(e)
	}
	dataDir = os.Getenv("KLS_DATA_DIR")
	if dataDir == "" {
		base, e := os.UserConfigDir()
		if e != nil {
			return
		}
		dataDir = filepath.Join(base, "KLSistemas")
	}
	if e := os.MkdirAll(dataDir, 0700); e != nil {
		showError("Não foi possível criar a pasta de dados: " + e.Error())
		return
	}
	statePath = filepath.Join(dataDir, "state.json")
	port := os.Getenv("KLS_PORT")
	if cloudMode {
		port = os.Getenv("PORT")
		if port == "" {
			port = "10000"
		}
	}
	if port == "" {
		port = "18763"
	}
	address := "127.0.0.1:" + port
	if cloudMode {
		address = "127.0.0.1:" + port
	}
	ln, e := net.Listen("tcp", address)
	if e != nil {
		resp, err := http.Get("http://" + address + "/health")
		if err == nil {
			defer resp.Body.Close()
			b, _ := io.ReadAll(resp.Body)
			if strings.Contains(string(b), "KLSistemas") {
				launch("http://" + address)
				return
			}
		}
		return
	}
	b, e := os.ReadFile(statePath)
	if e == nil && !cloudMode {
		if !validState(b) {
			showError("Dados inválidos. Preserve state.json e state.json.bak para recuperação na pasta: " + dataDir)
			return
		}
		current = b
	}
	revision = time.Now().UnixMilli()
	rnd := make([]byte, 32)
	rand.Read(rnd)
	token = hex.EncodeToString(rnd)
	mux := http.NewServeMux()
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) { fmt.Fprint(w, "KLSistemas "+version) })
	mux.HandleFunc("/api/state", stateAPI)
	mux.HandleFunc("/api/login", loginAPI)
	mux.HandleFunc("/api/register", registerAPI)
	mux.HandleFunc("/api/logout", logoutAPI)
	mux.HandleFunc("/api/config", func(w http.ResponseWriter, r *http.Request) {
		reply(w, 200, map[string]any{"cloud": cloudMode, "version": version, "managed": os.Getenv("KLS_MANAGED") == "1"})
	})
	mux.HandleFunc("/api/printers", printersAPI)
	mux.HandleFunc("/api/print", printAPI)
	mux.HandleFunc("/api/manifest", manifestAPI)
	mux.HandleFunc("/api/update/file", updateAPI)
	mux.HandleFunc("/api/update/remote", updateAPI)
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "GET" {
			w.WriteHeader(405)
			return
		}
		name := r.URL.Path
		if name == "/" {
			name = "/index.html"
			if !cloudMode {
				http.SetCookie(w, &http.Cookie{Name: "kls_session", Value: token, Path: "/", HttpOnly: true, SameSite: http.SameSiteStrictMode})
			}
		}
		b, e := assets.ReadFile("web" + name)
		if e != nil {
			http.NotFound(w, r)
			return
		}
		if strings.HasSuffix(name, ".js") {
			w.Header().Set("Content-Type", "text/javascript; charset=utf-8")
		}
		if strings.HasSuffix(name, ".css") {
			w.Header().Set("Content-Type", "text/css; charset=utf-8")
		}
		if strings.HasSuffix(name, ".html") {
			w.Header().Set("Content-Type", "text/html; charset=utf-8")
		}
		w.Write(b)
	})
	server = &http.Server{Handler: http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if (cloudMode && r.Host != publicHost && r.URL.Path != "/health") || (!cloudMode && r.Host != "127.0.0.1:"+port && r.Host != "localhost:"+port) {
			fail(w, 403, "Host inválido")
			return
		}
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("X-Frame-Options", "DENY")
		w.Header().Set("Cache-Control", "no-store")
		if cloudMode && (strings.HasPrefix(r.URL.Path, "/api/update") || r.URL.Path == "/api/manifest" || r.URL.Path == "/api/print" || r.URL.Path == "/api/printers") {
			fail(w, 409, "Este serviço está hospedado. Impressão USB requer a ponte local do Windows; atualizações são publicadas pelo GitHub.")
			return
		}
		mux.ServeHTTP(w, r)
	}), ReadHeaderTimeout: 10 * time.Second}
	if !cloudMode {
		launch("http://" + address)
	}
	log.Fatal(server.Serve(ln))
}
