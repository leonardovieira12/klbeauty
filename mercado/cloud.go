package main

import (
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var cloudMode bool
var publicOrigin, publicHost, adminUser, passwordDigest string
var cloudDB *pgxpool.Pool
var sessionsMu sync.Mutex
var sessions = map[string]cloudSession{}
var loginAttempts int
var loginWindow time.Time
var errConflict = errors.New("conflict")
var errUsernameTaken = errors.New("username taken")
var readCloud = postgresRead
var writeCloud = postgresWrite
var findCloudUser = postgresFindUser
var createCloudTenant = postgresCreateTenant
var updateCloudPassword = postgresUpdatePassword

type cloudSession struct {
	UserID          string
	CompanyID       string
	CompanyName     string
	CompanyDocument string
	Expires         time.Time
}

type cloudUser struct {
	ID, Username, PasswordHash, CompanyID, CompanyName, CompanyDocument string
}

func initCloud() error {
	cloudMode = os.Getenv("KLS_MODE") == "cloud"
	if !cloudMode {
		return nil
	}
	publicOrigin = strings.TrimRight(os.Getenv("KLS_PUBLIC_URL"), "/")
	if publicOrigin == "" {
		publicOrigin = strings.TrimRight(os.Getenv("RENDER_EXTERNAL_URL"), "/")
	}
	u, e := url.Parse(publicOrigin)
	if e != nil || u.Scheme != "https" || u.Host == "" || u.Path != "" || u.RawQuery != "" || u.User != nil {
		return fmt.Errorf("KLS_PUBLIC_URL ou RENDER_EXTERNAL_URL deve ser a origem HTTPS pública")
	}
	publicHost = u.Host
	adminUser = strings.ToLower(strings.TrimSpace(os.Getenv("KLS_ADMIN_USER")))
	if adminUser == "" {
		adminUser = "admin"
	}
	passwordDigest = strings.ToLower(strings.TrimSpace(os.Getenv("KLS_PASSWORD_SHA256")))
	b, e := hex.DecodeString(passwordDigest)
	if e != nil || len(b) != 32 {
		return fmt.Errorf("Defina KLS_PASSWORD_SHA256 com o hash de uma senha forte, aleatória e exclusiva")
	}
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		return fmt.Errorf("DATABASE_URL obrigatório: armazenamento efêmero não é permitido no modo cloud")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	poolConfig, configErr := pgxpool.ParseConfig(dbURL)
	if configErr != nil { return fmt.Errorf("DATABASE_URL inválida") }
	poolConfig.MaxConns = 5
	cloudDB, e = pgxpool.NewWithConfig(ctx, poolConfig)
	if e != nil {
		return fmt.Errorf("Não foi possível conectar ao PostgreSQL")
	}
	if e = migrateCloud(ctx); e != nil {
		cloudDB.Close()
		return fmt.Errorf("Não foi possível preparar os dados multiempresa no PostgreSQL: %w", e)
	}
	return nil
}

// migrateCloud introduces per-company storage and safely adopts the former
// single-company state as the first tenant, keeping the existing admin login.
func migrateCloud(ctx context.Context) error {
	tx, e := cloudDB.BeginTx(ctx, pgx.TxOptions{})
	if e != nil {
		return e
	}
	defer tx.Rollback(ctx)
	stmts := []string{
		`CREATE TABLE IF NOT EXISTS kls_state (id smallint PRIMARY KEY CHECK(id=1),revision bigint NOT NULL DEFAULT 0,payload jsonb,previous jsonb,updated_at timestamptz NOT NULL DEFAULT now())`,
		`INSERT INTO kls_state(id) VALUES(1) ON CONFLICT DO NOTHING`,
		`CREATE TABLE IF NOT EXISTS kls_companies (id text PRIMARY KEY, name text NOT NULL, document text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now())`,
		`CREATE TABLE IF NOT EXISTS kls_users (id text PRIMARY KEY, username text NOT NULL UNIQUE, password_hash text NOT NULL, created_at timestamptz NOT NULL DEFAULT now())`,
		`CREATE TABLE IF NOT EXISTS kls_memberships (user_id text NOT NULL REFERENCES kls_users(id), company_id text NOT NULL REFERENCES kls_companies(id), role text NOT NULL DEFAULT 'owner', PRIMARY KEY(user_id,company_id))`,
		`CREATE TABLE IF NOT EXISTS kls_tenant_state (company_id text PRIMARY KEY REFERENCES kls_companies(id), revision bigint NOT NULL DEFAULT 0, payload jsonb, previous jsonb, updated_at timestamptz NOT NULL DEFAULT now())`,
		`CREATE INDEX IF NOT EXISTS kls_memberships_company_idx ON kls_memberships(company_id)`,
	}
	for _, s := range stmts {
		if _, e = tx.Exec(ctx, s); e != nil {
			return e
		}
	}
	// Serialize first-start migration if Render starts multiple instances at once.
	if _, e = tx.Exec(ctx, `SELECT pg_advisory_xact_lock(72190361)`); e != nil {
		return e
	}
	var userCount int
	if e = tx.QueryRow(ctx, `SELECT count(*) FROM kls_users`).Scan(&userCount); e != nil {
		return e
	}
	if userCount == 0 {
		var legacy json.RawMessage
		var revision int64
		e = tx.QueryRow(ctx, `SELECT payload,revision FROM kls_state WHERE id=1`).Scan(&legacy, &revision)
		if e != nil && !errors.Is(e, pgx.ErrNoRows) {
			return e
		}
		companyName, document := legacyCompany(legacy)
		companyID, e := randomID()
		if e != nil {
			return e
		}
		userID, e := randomID()
		if e != nil {
			return e
		}
		if _, e = tx.Exec(ctx, `INSERT INTO kls_companies(id,name,document) VALUES($1,$2,$3)`, companyID, companyName, document); e != nil {
			return e
		}
		if _, e = tx.Exec(ctx, `INSERT INTO kls_users(id,username,password_hash) VALUES($1,$2,$3)`, userID, adminUser, "sha256:"+passwordDigest); e != nil {
			return e
		}
		if _, e = tx.Exec(ctx, `INSERT INTO kls_memberships(user_id,company_id,role) VALUES($1,$2,'owner')`, userID, companyID); e != nil {
			return e
		}
		if _, e = tx.Exec(ctx, `INSERT INTO kls_tenant_state(company_id,revision,payload) VALUES($1,$2,$3)`, companyID, revision, nullableJSON(legacy)); e != nil {
			return e
		}
		if _, e = tx.Exec(ctx, `UPDATE kls_state SET payload=NULL,previous=NULL WHERE id=1`); e != nil {
			return e
		}
	}
	return tx.Commit(ctx)
}

func nullableJSON(raw json.RawMessage) any {
	if len(raw) == 0 || string(raw) == "null" {
		return nil
	}
	return string(raw)
}

func legacyCompany(raw json.RawMessage) (string, string) {
	var state struct {
		Settings struct {
			Name  string `json:"name"`
			CNPJ  string `json:"cnpj"`
			Name2 string `json:"companyName"`
		} `json:"settings"`
	}
	_ = json.Unmarshal(raw, &state)
	name := strings.TrimSpace(state.Settings.Name)
	if name == "" || name == "Minha loja" {
		name = strings.TrimSpace(state.Settings.Name2)
	}
	if name == "" || name == "Minha loja" {
		name = "Minha empresa"
	}
	return name, strings.TrimSpace(state.Settings.CNPJ)
}

func randomID() (string, error) {
	b := make([]byte, 16)
	if _, e := rand.Read(b); e != nil {
		return "", e
	}
	return hex.EncodeToString(b), nil
}

func postgresRead(ctx context.Context, companyID string) (json.RawMessage, int64, error) {
	var b []byte
	var rev int64
	e := cloudDB.QueryRow(ctx, `SELECT payload,revision FROM kls_tenant_state WHERE company_id=$1`, companyID).Scan(&b, &rev)
	return json.RawMessage(b), rev, e
}

func postgresWrite(ctx context.Context, companyID string, raw json.RawMessage, expected int64) (int64, error) {
	var rev int64
	e := cloudDB.QueryRow(ctx, `UPDATE kls_tenant_state SET previous=payload,payload=$1::jsonb,revision=revision+1,updated_at=now() WHERE company_id=$2 AND revision=$3 RETURNING revision`, string(raw), companyID, expected).Scan(&rev)
	if errors.Is(e, pgx.ErrNoRows) {
		return 0, errConflict
	}
	return rev, e
}

func postgresFindUser(ctx context.Context, username string) (cloudUser, error) {
	var u cloudUser
	e := cloudDB.QueryRow(ctx, `SELECT u.id,u.username,u.password_hash,m.company_id,c.name,c.document FROM kls_users u JOIN kls_memberships m ON m.user_id=u.id JOIN kls_companies c ON c.id=m.company_id WHERE u.username=$1 ORDER BY m.company_id LIMIT 1`, username).Scan(&u.ID, &u.Username, &u.PasswordHash, &u.CompanyID, &u.CompanyName, &u.CompanyDocument)
	return u, e
}

func postgresUpdatePassword(ctx context.Context, userID, passwordHash string) error {
	_, e := cloudDB.Exec(ctx, `UPDATE kls_users SET password_hash=$1 WHERE id=$2`, passwordHash, userID)
	return e
}

func postgresCreateTenant(ctx context.Context, companyName, document, username, password string) (cloudUser, error) {
	tx, e := cloudDB.BeginTx(ctx, pgx.TxOptions{})
	if e != nil {
		return cloudUser{}, e
	}
	defer tx.Rollback(ctx)
	userID, e := randomID()
	if e != nil {
		return cloudUser{}, e
	}
	companyID, e := randomID()
	if e != nil {
		return cloudUser{}, e
	}
	hash, e := hashCloudPassword(password)
	if e != nil {
		return cloudUser{}, e
	}
	if _, e = tx.Exec(ctx, `INSERT INTO kls_users(id,username,password_hash) VALUES($1,$2,$3)`, userID, username, hash); e != nil {
		if strings.Contains(strings.ToLower(e.Error()), "duplicate key") || strings.Contains(strings.ToLower(e.Error()), "unique constraint") {
			return cloudUser{}, errUsernameTaken
		}
		return cloudUser{}, e
	}
	if _, e = tx.Exec(ctx, `INSERT INTO kls_companies(id,name,document) VALUES($1,$2,$3)`, companyID, companyName, document); e != nil {
		return cloudUser{}, e
	}
	if _, e = tx.Exec(ctx, `INSERT INTO kls_memberships(user_id,company_id,role) VALUES($1,$2,'owner')`, userID, companyID); e != nil {
		return cloudUser{}, e
	}
	if _, e = tx.Exec(ctx, `INSERT INTO kls_tenant_state(company_id,payload) VALUES($1,NULL)`, companyID); e != nil {
		return cloudUser{}, e
	}
	if e = tx.Commit(ctx); e != nil {
		if strings.Contains(strings.ToLower(e.Error()), "duplicate key") || strings.Contains(strings.ToLower(e.Error()), "unique constraint") {
			return cloudUser{}, errUsernameTaken
		}
		return cloudUser{}, e
	}
	return cloudUser{ID: userID, Username: username, PasswordHash: hash, CompanyID: companyID, CompanyName: companyName, CompanyDocument: document}, nil
}

func cloudOriginOK(r *http.Request) bool { return r.Header.Get("Origin") == publicOrigin }

func currentCloudSession(r *http.Request) (string, cloudSession, bool) {
	c, e := r.Cookie("kls_session")
	if e != nil {
		return "", cloudSession{}, false
	}
	sessionsMu.Lock()
	s, ok := sessions[c.Value]
	if ok && time.Now().After(s.Expires) {
		delete(sessions, c.Value)
		ok = false
	}
	sessionsMu.Unlock()
	return c.Value, s, ok
}

func cloudAuthenticated(w http.ResponseWriter, r *http.Request) (cloudSession, bool) {
	_, s, ok := currentCloudSession(r)
	if !ok {
		fail(w, 401, "Faça login para acessar o sistema.")
		return cloudSession{}, false
	}
	if r.Method != "GET" && !cloudOriginOK(r) {
		fail(w, 403, "Origem inválida")
		return cloudSession{}, false
	}
	return s, true
}

func allowLoginAttempt(w http.ResponseWriter) bool {
	sessionsMu.Lock()
	if time.Since(loginWindow) > time.Minute {
		loginWindow = time.Now()
		loginAttempts = 0
	}
	loginAttempts++
	blocked := loginAttempts > 10
	sessionsMu.Unlock()
	if blocked {
		w.Header().Set("Retry-After", "60")
		fail(w, 429, "Muitas tentativas. Aguarde um minuto.")
		return false
	}
	return true
}

func newCloudSession(w http.ResponseWriter, user cloudUser) {
	b := make([]byte, 32)
	if _, e := rand.Read(b); e != nil {
		fail(w, 500, "Erro ao criar sessão")
		return
	}
	session := hex.EncodeToString(b)
	expiry := time.Now().Add(12 * time.Hour)
	sessionsMu.Lock()
	for k, item := range sessions {
		if time.Now().After(item.Expires) {
			delete(sessions, k)
		}
	}
	sessions[session] = cloudSession{UserID: user.ID, CompanyID: user.CompanyID, CompanyName: user.CompanyName, CompanyDocument: user.CompanyDocument, Expires: expiry}
	sessionsMu.Unlock()
	http.SetCookie(w, &http.Cookie{Name: "kls_session", Value: session, Path: "/mercado", Secure: true, HttpOnly: true, SameSite: http.SameSiteStrictMode, MaxAge: 43200, Expires: expiry})
}

func loginAPI(w http.ResponseWriter, r *http.Request) {
	if !cloudMode || r.Method != "POST" {
		fail(w, 404, "Indisponível")
		return
	}
	if !cloudOriginOK(r) {
		fail(w, 403, "Origem inválida")
		return
	}
	if !allowLoginAttempt(w) {
		return
	}
	var body struct{ Username, Password string }
	if json.NewDecoder(http.MaxBytesReader(w, r.Body, 8192)).Decode(&body) != nil {
		fail(w, 400, "Dados inválidos")
		return
	}
	if len(body.Username) > 120 || len(body.Password) > 1024 {
		fail(w, 400, "Dados inválidos")
		return
	}
	u, e := findCloudUser(r.Context(), strings.ToLower(strings.TrimSpace(body.Username)))
	if e != nil {
		fail(w, 401, "Usuário ou senha inválidos.")
		return
	}
	passwordOK := verifyCloudPassword(body.Password, u.PasswordHash)
	if !passwordOK {
		fail(w, 401, "Usuário ou senha inválidos.")
		return
	}
	if strings.HasPrefix(u.PasswordHash, "sha256:") {
		strongHash, e := hashCloudPassword(body.Password)
		if e == nil {
			e = updateCloudPassword(r.Context(), u.ID, strongHash)
		}
		if e != nil {
			fail(w, 503, "Acesso validado, mas não foi possível atualizar a proteção da senha. Tente novamente.")
			return
		}
	}
	newCloudSession(w, u)
	reply(w, 200, map[string]any{"ok": true, "company": map[string]string{"id": u.CompanyID, "name": u.CompanyName, "document": u.CompanyDocument}})
}

var usernamePattern = regexp.MustCompile(`^[a-z0-9][a-z0-9._@+-]{2,119}$`)

func registerAPI(w http.ResponseWriter, r *http.Request) {
	if !cloudMode || r.Method != "POST" {
		fail(w, 404, "Indisponível")
		return
	}
	if !cloudOriginOK(r) {
		fail(w, 403, "Origem inválida")
		return
	}
	if !allowLoginAttempt(w) {
		return
	}
	var body struct {
		CompanyName string `json:"companyName"`
		Document    string `json:"document"`
		Username    string `json:"username"`
		Password    string `json:"password"`
	}
	if json.NewDecoder(http.MaxBytesReader(w, r.Body, 8192)).Decode(&body) != nil {
		fail(w, 400, "Preencha os campos da empresa e do login.")
		return
	}
	body.CompanyName = strings.TrimSpace(body.CompanyName)
	body.Document = strings.TrimSpace(body.Document)
	body.Username = strings.ToLower(strings.TrimSpace(body.Username))
	if len([]rune(body.CompanyName)) < 2 || len([]rune(body.CompanyName)) > 120 || len(body.Document) > 32 || !usernamePattern.MatchString(body.Username) || len(body.Password) < 12 || len(body.Password) > 1024 {
		fail(w, 400, "Informe nome da empresa, usuário de 3 a 120 caracteres e senha com pelo menos 12 caracteres.")
		return
	}
	u, e := createCloudTenant(r.Context(), body.CompanyName, body.Document, body.Username, body.Password)
	if errors.Is(e, errUsernameTaken) {
		fail(w, 409, "Este usuário já está em uso. Escolha outro.")
		return
	}
	if e != nil {
		fail(w, 503, "Não foi possível criar a empresa agora. Tente novamente.")
		return
	}
	newCloudSession(w, u)
	reply(w, 201, map[string]any{"ok": true, "company": map[string]string{"id": u.CompanyID, "name": u.CompanyName, "document": u.CompanyDocument}})
}

func verifyCloudPassword(password, stored string) bool {
	if strings.HasPrefix(stored, "sha256:") { // Compatibility for the original single-company admin account.
		digest := sha256.Sum256([]byte(password))
		return subtle.ConstantTimeCompare([]byte(hex.EncodeToString(digest[:])), []byte(strings.TrimPrefix(stored, "sha256:"))) == 1
	}
	parts := strings.Split(stored, "$")
	if len(parts) != 4 || parts[0] != "pbkdf2-sha256" {
		return false
	}
	iterations, e := strconv.Atoi(parts[1])
	if e != nil || iterations < 100000 || iterations > 1000000 {
		return false
	}
	salt, e1 := base64.RawStdEncoding.DecodeString(parts[2])
	want, e2 := base64.RawStdEncoding.DecodeString(parts[3])
	if e1 != nil || e2 != nil || len(salt) < 16 || len(salt) > 64 || len(want) != sha256.Size {
		return false
	}
	got := pbkdf2SHA256([]byte(password), salt, iterations, len(want))
	return subtle.ConstantTimeCompare(got, want) == 1
}

func hashCloudPassword(password string) (string, error) {
	salt := make([]byte, 16)
	if _, e := rand.Read(salt); e != nil {
		return "", e
	}
	const iterations = 210000
	key := pbkdf2SHA256([]byte(password), salt, iterations, sha256.Size)
	return "pbkdf2-sha256$" + strconv.Itoa(iterations) + "$" + base64.RawStdEncoding.EncodeToString(salt) + "$" + base64.RawStdEncoding.EncodeToString(key), nil
}

func pbkdf2SHA256(password, salt []byte, iterations, keyLen int) []byte {
	if iterations < 1 || keyLen < 1 {
		return nil
	}
	out := make([]byte, 0, keyLen)
	for block := uint32(1); len(out) < keyLen; block++ {
		mac := hmac.New(sha256.New, password)
		mac.Write(salt)
		var counter [4]byte
		binary.BigEndian.PutUint32(counter[:], block)
		mac.Write(counter[:])
		u := mac.Sum(nil)
		result := append([]byte(nil), u...)
		for i := 1; i < iterations; i++ {
			mac = hmac.New(sha256.New, password)
			mac.Write(u)
			u = mac.Sum(nil)
			for j := range result {
				result[j] ^= u[j]
			}
		}
		out = append(out, result...)
	}
	return out[:keyLen]
}

func logoutAPI(w http.ResponseWriter, r *http.Request) {
	if !cloudMode || r.Method != "POST" {
		fail(w, 404, "Indisponível")
		return
	}
	if _, ok := cloudAuthenticated(w, r); !ok {
		return
	}
	c, _ := r.Cookie("kls_session")
	sessionsMu.Lock()
	delete(sessions, c.Value)
	sessionsMu.Unlock()
	http.SetCookie(w, &http.Cookie{Name: "kls_session", Value: "", Path: "/mercado", Secure: true, HttpOnly: true, MaxAge: -1, SameSite: http.SameSiteStrictMode})
	reply(w, 200, map[string]bool{"ok": true})
}

func cloudStateAPI(w http.ResponseWriter, r *http.Request) {
	s, ok := cloudAuthenticated(w, r)
	if !ok {
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 15*time.Second)
	defer cancel()
	mu.Lock()
	defer mu.Unlock()
	if r.Method == "GET" {
		b, rev, e := readCloud(ctx, s.CompanyID)
		if e != nil {
			fail(w, 503, "Banco indisponível. Nenhum dado foi alterado.")
			return
		}
		reply(w, 200, map[string]any{"state": b, "revision": rev, "version": version, "cloud": true, "companyName": s.CompanyName, "companyDocument": s.CompanyDocument, "dataDir": "PostgreSQL isolado por empresa"})
		return
	}
	if r.Method != "POST" {
		fail(w, 405, "Método inválido")
		return
	}
	var body struct {
		Revision int64
		State    json.RawMessage
	}
	if json.NewDecoder(http.MaxBytesReader(w, r.Body, 40<<20)).Decode(&body) != nil || !validState(body.State) {
		fail(w, 400, "Dados inválidos")
		return
	}
	rev, e := writeCloud(ctx, s.CompanyID, body.State, body.Revision)
	if errors.Is(e, errConflict) {
		fail(w, 409, "Outro dispositivo atualizou os dados. Exporte seu carrinho se necessário e recarregue antes de salvar.")
		return
	}
	if e != nil {
		fail(w, 503, "Não foi possível salvar no banco. A operação não foi concluída.")
		return
	}
	reply(w, 200, map[string]any{"revision": rev})
}
