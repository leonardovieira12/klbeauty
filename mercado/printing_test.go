package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"unicode/utf8"
)

func TestReceiptWidths(t *testing.T) {
	for _, w := range []int{58, 80} {
		max := 48
		if w == 58 {
			max = 32
		}
		s := receiptSale{ID: 1, Items: []receiptItem{{Name: strings.Repeat("Café açúcar ", 10), Qty: 3, Price: 2.5}}, Total: 7.5, Payment: "Pix"}
		for _, l := range receiptLines(s, receiptSettings{Name: "Loja", ReceiptWidth: w}) {
			if utf8.RuneCountInString(l) > max {
				t.Fatal("overflow", w, l)
			}
		}
		if !strings.Contains(strings.Join(receiptLines(s, receiptSettings{}), "\n"), "R$ 7,50") {
			t.Fatal("wrong total")
		}
	}
}
func TestPrintQueueDuplicateAndFailure(t *testing.T) {
	dataDir = t.TempDir()
	token = "test"
	current = json.RawMessage(`{"settings":{"name":"Loja","receiptWidth":58},"db":{"sales":[{"id":1,"date":"2026-10-08T12:00:00Z","items":[{"name":"Café","qty":2,"price":5}],"total":10,"payment":"Pix"}]}}`)
	old := printerRunner
	defer func() { printerRunner = old }()
	count := 0
	printerRunner = func(p printPayload) ([]byte, error) {
		count++
		if p.Width != 58 {
			t.Fatal("wrong width")
		}
		return []byte(`{"printer":"Termica"}`), nil
	}
	call := func(body string) int {
		r := httptest.NewRequest("POST", "http://localhost/api/print", strings.NewReader(body))
		r.Header.Set("Origin", "http://localhost")
		r.AddCookie(&http.Cookie{Name: "kls_session", Value: token})
		w := httptest.NewRecorder()
		printAPI(w, r)
		return w.Code
	}
	if call(`{"saleId":1}`) != 200 || count != 1 {
		t.Fatal("first print")
	}
	if call(`{"saleId":1}`) != 200 || count != 1 {
		t.Fatal("duplicate printed")
	}
	if call(`{"saleId":1,"retry":true}`) != 200 || count != 2 {
		t.Fatal("reprint")
	}
	if call(`{"saleId":999}`) != 404 || count != 2 {
		t.Fatal("unknown sale printed")
	}
	printerRunner = func(p printPayload) ([]byte, error) { count++; return nil, fmt.Errorf("offline") }
	if call(`{"saleId":1,"retry":true}`) != 503 {
		t.Fatal("failure not reported")
	}
	if call(`{"saleId":1}`) != 409 || count != 3 {
		t.Fatal("uncertain print automatically retried")
	}
	if !strings.Contains(string(current), `"total":10`) {
		t.Fatal("sale modified")
	}
}

func TestWeightedReceipt(t *testing.T) {
	s := receiptSale{ID: 2, Items: []receiptItem{{Name: "Mussarela", Unit: "KG", Qty: 0.125, Price: 19.99}}, Total: 2.50, Payment: "Pix"}
	text := strings.Join(receiptLines(s, receiptSettings{}), "\n")
	if !strings.Contains(text, "0.125 KG x R$ 19,99 = R$ 2,50") {
		t.Fatal(text)
	}
}
