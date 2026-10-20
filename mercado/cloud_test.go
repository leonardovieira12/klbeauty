package main

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func cloudRequest(method, path, body string, cookie *http.Cookie) *httptest.ResponseRecorder {
	r := httptest.NewRequest(method, publicOrigin+path, strings.NewReader(body))
	if method != "GET" {
		r.Header.Set("Origin", publicOrigin)
	}
	if cookie != nil {
		r.AddCookie(cookie)
	}
	w := httptest.NewRecorder()
	switch path {
	case "/api/login":
		loginAPI(w, r)
	case "/api/register":
		registerAPI(w, r)
	case "/api/state":
		cloudStateAPI(w, r)
	case "/api/logout":
		logoutAPI(w, r)
	}
	return w
}

func setupCloudTests(t *testing.T) {
	t.Helper()
	cloudMode = true
	publicOrigin = "https://kls.example.com"
	sessions = map[string]cloudSession{}
	loginWindow = time.Time{}
	loginAttempts = 0
	t.Cleanup(func() {
		cloudMode = false
		sessions = map[string]cloudSession{}
	})
}

func TestCloudAuthAndTenantIsolation(t *testing.T) {
	setupCloudTests(t)
	password := "test-only-long-password"
	hash, err := hashCloudPassword(password)
	if err != nil {
		t.Fatal(err)
	}
	users := map[string]cloudUser{
		"loja-a": {ID: "u-a", Username: "loja-a", PasswordHash: hash, CompanyID: "company-a", CompanyName: "Loja A"},
		"loja-b": {ID: "u-b", Username: "loja-b", PasswordHash: hash, CompanyID: "company-b", CompanyName: "Loja B"},
	}
	oldFind, oldRead, oldWrite, oldUpdatePassword := findCloudUser, readCloud, writeCloud, updateCloudPassword
	t.Cleanup(func() {
		findCloudUser, readCloud, writeCloud, updateCloudPassword = oldFind, oldRead, oldWrite, oldUpdatePassword
	})
	findCloudUser = func(_ context.Context, username string) (cloudUser, error) {
		u, ok := users[username]
		if !ok {
			return cloudUser{}, errConflict
		}
		return u, nil
	}
	readCloud = func(_ context.Context, companyID string) (json.RawMessage, int64, error) {
		return json.RawMessage(`{"db":{"products":[],"sales":[],"customers":[]},"settings":{"name":"` + companyID + `"}}`), 7, nil
	}
	writes := []string{}
	writeCloud = func(_ context.Context, companyID string, _ json.RawMessage, revision int64) (int64, error) {
		if revision != 7 {
			return 0, errConflict
		}
		writes = append(writes, companyID)
		return 8, nil
	}
	updateCloudPassword = func(context.Context, string, string) error { return nil }
	if w := cloudRequest("POST", "/api/login", `{"username":"loja-a","password":"wrong"}`, nil); w.Code != 401 {
		t.Fatalf("expected invalid login, got %d", w.Code)
	}
	wa := cloudRequest("POST", "/api/login", `{"username":"LOJA-A","password":"`+password+`"}`, nil)
	if wa.Code != 200 {
		t.Fatalf("login A: %d %s", wa.Code, wa.Body.String())
	}
	ca := wa.Result().Cookies()[0]
	if !ca.Secure || !ca.HttpOnly || ca.SameSite != http.SameSiteStrictMode {
		t.Fatal("session cookie must be Secure, HttpOnly, SameSite=Strict")
	}
	wb := cloudRequest("POST", "/api/login", `{"username":"loja-b","password":"`+password+`"}`, nil)
	if wb.Code != 200 {
		t.Fatalf("login B: %d", wb.Code)
	}
	cb := wb.Result().Cookies()[0]
	ra := cloudRequest("GET", "/api/state", "", ca)
	rb := cloudRequest("GET", "/api/state", "", cb)
	if !strings.Contains(ra.Body.String(), "company-a") || strings.Contains(ra.Body.String(), "company-b") {
		t.Fatalf("tenant A received wrong state: %s", ra.Body.String())
	}
	if !strings.Contains(rb.Body.String(), "company-b") || strings.Contains(rb.Body.String(), "company-a") {
		t.Fatalf("tenant B received wrong state: %s", rb.Body.String())
	}
	state := `{"revision":7,"state":{"db":{"products":[],"sales":[],"customers":[]},"companyId":"company-b"}}`
	if w := cloudRequest("POST", "/api/state", state, ca); w.Code != 200 {
		t.Fatalf("save A: %d %s", w.Code, w.Body.String())
	}
	if len(writes) != 1 || writes[0] != "company-a" {
		t.Fatalf("client-controlled company ID escaped tenant scope: %v", writes)
	}
	if w := cloudRequest("POST", "/api/logout", `{}`, ca); w.Code != 200 {
		t.Fatalf("logout: %d", w.Code)
	}
	if w := cloudRequest("GET", "/api/state", "", ca); w.Code != 401 {
		t.Fatalf("logged-out session still works: %d", w.Code)
	}
}

func TestLegacyLoginUpgradesCredential(t *testing.T) {
	setupCloudTests(t)
	password := "legacy-admin-password"
	digest := sha256.Sum256([]byte(password))
	u := cloudUser{ID: "legacy-user", Username: "admin", PasswordHash: "sha256:" + hex.EncodeToString(digest[:]), CompanyID: "legacy-company", CompanyName: "Empresa antiga"}
	oldFind, oldUpdate := findCloudUser, updateCloudPassword
	t.Cleanup(func() { findCloudUser, updateCloudPassword = oldFind, oldUpdate })
	findCloudUser = func(context.Context, string) (cloudUser, error) { return u, nil }
	updated := false
	updateCloudPassword = func(_ context.Context, userID, encoded string) error {
		updated = true
		if userID != u.ID || !strings.HasPrefix(encoded, "pbkdf2-sha256$") {
			t.Fatalf("unexpected password upgrade: %q %q", userID, encoded)
		}
		return nil
	}
	w := cloudRequest("POST", "/api/login", `{"username":"admin","password":"`+password+`"}`, nil)
	if w.Code != 200 || !updated {
		t.Fatalf("legacy login was not upgraded: status=%d updated=%t body=%s", w.Code, updated, w.Body.String())
	}
}

func TestLoginRateLimit(t *testing.T) {
	setupCloudTests(t)
	oldFind := findCloudUser
	t.Cleanup(func() { findCloudUser = oldFind })
	findCloudUser = func(context.Context, string) (cloudUser, error) { return cloudUser{}, errConflict }
	for i := 0; i < 10; i++ {
		if w := cloudRequest("POST", "/api/login", `{"username":"nobody","password":"wrong"}`, nil); w.Code != 401 {
			t.Fatalf("attempt %d: expected 401, got %d", i+1, w.Code)
		}
	}
	w := cloudRequest("POST", "/api/login", `{"username":"nobody","password":"wrong"}`, nil)
	if w.Code != 429 || w.Header().Get("Retry-After") != "60" {
		t.Fatalf("expected rate limit response, got status=%d retry-after=%q", w.Code, w.Header().Get("Retry-After"))
	}
}

func TestLegacyPasswordAndCloudFailClosed(t *testing.T) {
	password := "legacy-admin-password"
	digest := sha256.Sum256([]byte(password))
	if !verifyCloudPassword(password, "sha256:"+hex.EncodeToString(digest[:])) {
		t.Fatal("legacy admin credential should survive migration")
	}
	if verifyCloudPassword("wrong", "sha256:"+hex.EncodeToString(digest[:])) {
		t.Fatal("wrong legacy password accepted")
	}
	setupCloudTests(t)
	t.Setenv("KLS_MODE", "cloud")
	t.Setenv("KLS_PUBLIC_URL", "https://kls.example.com")
	t.Setenv("KLS_PASSWORD_SHA256", "")
	if initCloud() == nil {
		t.Fatal("cloud without migration credential allowed")
	}
}

func TestRegisterValidatesAndCreatesSeparateTenant(t *testing.T) {
	setupCloudTests(t)
	oldCreate := createCloudTenant
	t.Cleanup(func() { createCloudTenant = oldCreate })
	called := false
	createCloudTenant = func(_ context.Context, name, document, username, password string) (cloudUser, error) {
		called = true
		if name != "Empresa Teste" || document != "12.345.678/0001-90" || username != "teste@exemplo.com" || len(password) < 12 {
			t.Fatalf("unexpected registration data: %q %q %q", name, document, username)
		}
		hash, _ := hashCloudPassword(password)
		return cloudUser{ID: "user-new", Username: username, PasswordHash: hash, CompanyID: "tenant-new", CompanyName: name, CompanyDocument: document}, nil
	}
	body := `{"companyName":"Empresa Teste","document":"12.345.678/0001-90","username":"Teste@Exemplo.com","password":"strong-test-password"}`
	w := cloudRequest("POST", "/api/register", body, nil)
	if w.Code != 201 || !called {
		t.Fatalf("registration failed: code=%d body=%s", w.Code, w.Body.String())
	}
	cookies := w.Result().Cookies()
	if len(cookies) == 0 || cookies[0].Name != "kls_session" {
		t.Fatal("registration did not start a session")
	}
	bad := `{"companyName":"X","username":"x","password":"short"}`
	if w := cloudRequest("POST", "/api/register", bad, nil); w.Code != 400 {
		t.Fatalf("invalid registration accepted: %d", w.Code)
	}
}
