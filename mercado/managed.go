package main

import (
	"context"
	"fmt"
	"net/http"
	"os"
)

// Revalidate at every request: a previously issued session cannot bypass a
// suspension, user deactivation, password reset or permission change.
func managedPermission(ctx context.Context, s cloudSession) (string, error) {
	var active, autoBlock, overdue bool
	var version int
	var role, status string
	e := cloudDB.QueryRow(ctx, `SELECT u.active,u.auth_version,m.role,c.status,c.auto_block,
 EXISTS(SELECT 1 FROM kp_invoices i WHERE i.app='mercado' AND i.company_id=c.company_id AND NOT i.voided
 AND i.due+c.grace_days<(now() AT TIME ZONE 'America/Sao_Paulo')::date
 AND i.amount_cents>COALESCE((SELECT sum(p.amount_cents) FROM kp_payments p WHERE p.invoice_id=i.id),0))
 FROM kls_users u JOIN kls_memberships m ON m.user_id=u.id
 JOIN kp_contracts c ON c.app='mercado' AND c.company_id=m.company_id
 WHERE u.id=$1 AND m.company_id=$2`, s.UserID, s.CompanyID).Scan(&active, &version, &role, &status, &autoBlock, &overdue)
	if e != nil {
		return "", fmt.Errorf("Não foi possível validar o acesso. Contate o administrador.")
	}
	if !active || version != s.AuthVersion {
		return "", fmt.Errorf("Usuário desativado ou sessão revogada. Entre novamente.")
	}
	if status != "active" {
		return "", fmt.Errorf("Empresa suspensa ou cancelada. Contate o administrador.")
	}
	if autoBlock && overdue {
		return "", fmt.Errorf("Acesso suspenso por mensalidade vencida. Contate o administrador.")
	}
	if role != "owner" && role != "viewer" {
		return "", fmt.Errorf("Perfil de acesso inválido.")
	}
	return role, nil
}
func checkManaged(w http.ResponseWriter, r *http.Request, s cloudSession) bool {
	if os.Getenv("KLS_MANAGED") != "1" || r.URL.Path == "/api/logout" {
		return true
	}
	role, e := managedPermission(r.Context(), s)
	if e != nil {
		fail(w, 403, e.Error())
		return false
	}
	if r.Method != "GET" && role == "viewer" {
		fail(w, 403, "Seu perfil permite somente consulta.")
		return false
	}
	return true
}
