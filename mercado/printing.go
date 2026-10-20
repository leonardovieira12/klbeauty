package main

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
	"unicode"
)

type receiptItem struct {
	Name       string
	Qty, Price float64
}
type receiptSale struct {
	ID                                  int64
	Date, Status, CustomerName, Payment string
	Items                               []receiptItem
	Total, Change                       float64
	Cash                                *float64
}
type receiptSettings struct {
	Name, Cnpj, Address, Phone, Receipt, PrinterName string
	ReceiptWidth                                     int
}
type printPayload struct {
	Action  string   `json:"action"`
	Printer string   `json:"printer"`
	Width   int      `json:"width"`
	Title   string   `json:"title"`
	Lines   []string `json:"lines"`
}

var printMu sync.Mutex
var printerRunner = platformPrinter

func receiptMoney(v float64) string {
	return "R$ " + strings.ReplaceAll(fmt.Sprintf("%.2f", v), ".", ",")
}
func cleanReceipt(s string) string {
	return strings.Map(func(r rune) rune {
		if unicode.IsControl(r) {
			return ' '
		}
		return r
	}, s)
}
func receiptLines(s receiptSale, c receiptSettings) []string {
	width := 48
	if c.ReceiptWidth == 58 {
		width = 32
	}
	lines := []string{}
	add := func(text string) {
		r := []rune(cleanReceipt(text))
		if len(r) == 0 {
			lines = append(lines, "")
			return
		}
		for len(r) > width {
			lines = append(lines, string(r[:width]))
			r = r[width:]
		}
		lines = append(lines, string(r))
	}
	add(c.Name)
	if c.Cnpj != "" {
		add(c.Cnpj)
	}
	if c.Address != "" {
		add(c.Address)
	}
	if c.Phone != "" {
		add(c.Phone)
	}
	add("COMPROVANTE NAO FISCAL")
	add(fmt.Sprintf("Venda #%d", s.ID))
	stamp := s.Date
	if t, e := time.Parse(time.RFC3339, s.Date); e == nil {
		stamp = t.Local().Format("02/01/2006 15:04")
	}
	add(stamp)
	if s.Status == "cancelled" {
		add("*** VENDA CANCELADA ***")
	}
	if s.CustomerName != "" {
		add("Cliente: " + s.CustomerName)
	}
	add(strings.Repeat("-", width))
	for _, i := range s.Items {
		add(i.Name)
		add(fmt.Sprintf("%g x %s = %s", i.Qty, receiptMoney(i.Price), receiptMoney(i.Qty*i.Price)))
	}
	add(strings.Repeat("-", width))
	add("TOTAL: " + receiptMoney(s.Total))
	add("Pagamento: " + s.Payment)
	if s.Cash != nil {
		add("Recebido: " + receiptMoney(*s.Cash))
		add("Troco: " + receiptMoney(s.Change))
	}
	add("")
	add(c.Receipt)
	add("KLSistemas " + version)
	return lines
}
func printersAPI(w http.ResponseWriter, r *http.Request) {
	if !auth(w, r) {
		return
	}
	if r.Method != "GET" {
		fail(w, 405, "Método inválido")
		return
	}
	b, e := printerRunner(printPayload{Action: "list"})
	if e != nil {
		fail(w, 503, e.Error())
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.Write(b)
}
func printAPI(w http.ResponseWriter, r *http.Request) {
	if !auth(w, r) {
		return
	}
	if r.Method != "POST" {
		fail(w, 405, "Método inválido")
		return
	}
	var req struct {
		SaleID  int64  `json:"saleId"`
		Retry   bool   `json:"retry"`
		Test    bool   `json:"test"`
		Printer string `json:"printer"`
		Width   int    `json:"width"`
	}
	if json.NewDecoder(http.MaxBytesReader(w, r.Body, 8192)).Decode(&req) != nil {
		fail(w, 400, "Pedido inválido")
		return
	}
	printMu.Lock()
	defer printMu.Unlock()
	mu.Lock()
	raw := append([]byte(nil), current...)
	mu.Unlock()
	var state struct {
		Settings receiptSettings
		Db       struct{ Sales []receiptSale }
	}
	if json.Unmarshal(raw, &state) != nil {
		fail(w, 400, "Salve a configuração antes de imprimir")
		return
	}
	c := state.Settings
	var sale receiptSale
	if req.Test {
		c.PrinterName = req.Printer
		c.ReceiptWidth = req.Width
		sale = receiptSale{Date: time.Now().Format(time.RFC3339), Payment: "TESTE - SEM VALOR", Items: []receiptItem{{Name: "Teste de impressão: café, açúcar, pão", Qty: 1, Price: 0}}}
	} else {
		found := false
		for _, s := range state.Db.Sales {
			if s.ID == req.SaleID {
				sale = s
				found = true
				break
			}
		}
		if !found {
			fail(w, 404, "Venda não encontrada. Nada foi impresso.")
			return
		}
	}
	if c.ReceiptWidth != 58 {
		c.ReceiptWidth = 80
	}
	payload := printPayload{Action: "print", Printer: c.PrinterName, Width: c.ReceiptWidth, Title: fmt.Sprintf("KLSistemas - Venda %d", sale.ID), Lines: receiptLines(sale, c)}
	jobFile := ""
	if !req.Test {
		key := sha256.Sum256([]byte(fmt.Sprintf("%d|%s", sale.ID, sale.Date)))
		dir := filepath.Join(dataDir, "print-jobs")
		if e := os.MkdirAll(dir, 0700); e != nil {
			fail(w, 500, "Não foi possível registrar a impressão")
			return
		}
		jobFile = filepath.Join(dir, hex.EncodeToString(key[:])+".json")
		if previous, e := os.ReadFile(jobFile); e == nil && !req.Retry {
			var j map[string]string
			json.Unmarshal(previous, &j)
			if j["status"] == "queued" {
				reply(w, 200, map[string]any{"ok": true, "alreadyQueued": true})
				return
			}
			fail(w, 409, "Envio anterior não confirmado. Confira a fila da impressora antes de reimprimir.")
			return
		}
		if e := atomic(jobFile, []byte(`{"status":"sending"}`)); e != nil {
			fail(w, 500, "Não foi possível registrar a impressão")
			return
		}
	}
	result, e := printerRunner(payload)
	if e != nil {
		if jobFile != "" {
			atomic(jobFile, []byte(`{"status":"uncertain"}`))
		}
		fail(w, 503, "Venda preservada. "+e.Error()+" Confira a fila antes de reimprimir.")
		return
	}
	if jobFile != "" {
		if e = atomic(jobFile, []byte(`{"status":"queued"}`)); e != nil {
			fail(w, 500, "Comprovante enviado, mas o registro de envio falhou. Confira a fila antes de reimprimir.")
			return
		}
	}
	var status map[string]any
	json.Unmarshal(result, &status)
	reply(w, 200, map[string]any{"ok": true, "printer": status["printer"], "message": "Enviado à fila de impressão do Windows"})
}
