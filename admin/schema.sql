CREATE TABLE IF NOT EXISTS kp_admins(id text PRIMARY KEY,email text UNIQUE NOT NULL,password_hash text NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS kp_sessions(token_hash text PRIMARY KEY,admin_id text NOT NULL REFERENCES kp_admins(id),expires timestamptz NOT NULL);
CREATE TABLE IF NOT EXISTS kp_limits(key text PRIMARY KEY,attempts integer NOT NULL,reset_at timestamptz NOT NULL);
CREATE TABLE IF NOT EXISTS kp_contracts(
 app text NOT NULL CHECK(app IN ('beauty','mercado')), company_id text NOT NULL,
 name text NOT NULL, contact text NOT NULL DEFAULT '', document text NOT NULL DEFAULT '',
 status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','suspended','cancelled')),
 plan text NOT NULL DEFAULT 'Sem plano', monthly_cents integer NOT NULL DEFAULT 0 CHECK(monthly_cents>=0),
 next_due date, anchor_day integer NOT NULL DEFAULT 1 CHECK(anchor_day BETWEEN 1 AND 31),
 grace_days integer NOT NULL DEFAULT 5 CHECK(grace_days BETWEEN 0 AND 90), auto_block boolean NOT NULL DEFAULT false,
 version integer NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now(),
 deleted_at timestamptz,
 PRIMARY KEY(app,company_id));
ALTER TABLE kp_contracts ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
CREATE TABLE IF NOT EXISTS kp_invoices(
 id text PRIMARY KEY,app text NOT NULL,company_id text NOT NULL,period text NOT NULL,
 due date NOT NULL,amount_cents integer NOT NULL CHECK(amount_cents>0),voided boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(app,company_id) REFERENCES kp_contracts(app,company_id),UNIQUE(app,company_id,period));
CREATE TABLE IF NOT EXISTS kp_payments(
 id text PRIMARY KEY,invoice_id text NOT NULL REFERENCES kp_invoices(id),amount_cents integer NOT NULL CHECK(amount_cents<>0),
 method text NOT NULL,reference text NOT NULL DEFAULT '',reason text NOT NULL DEFAULT '',
 reverses text UNIQUE REFERENCES kp_payments(id),actor text NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS kp_audit(id text PRIMARY KEY,actor text NOT NULL,action text NOT NULL,app text NOT NULL,company_id text NOT NULL,detail jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS kp_invoices_company ON kp_invoices(app,company_id,due);
CREATE INDEX IF NOT EXISTS kp_payments_invoice ON kp_payments(invoice_id);
CREATE INDEX IF NOT EXISTS kp_audit_company ON kp_audit(app,company_id,created_at);
