const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'web/index.html'), 'utf8');
const dom = new JSDOM(html, { url: 'https://kls.example.test', runScripts: 'outside-only', pretendToBeVisual: true });
const win = dom.window;
win.eval = code => require('vm').runInContext(code, dom.getInternalVMContext());
win.matchMedia = () => ({ matches: true });
win.confirm = () => true;
win.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
win.HTMLDialogElement.prototype.close = function () { this.open = false; };

let authenticated = false;
let registration;
win.fetch = async (url, options = {}) => {
  if (url === '/mercado/api/config') return { ok: true, status: 200, json: async () => ({ cloud: true, version: '2.2.0' }) };
  if (url === '/mercado/api/state' && !authenticated) return { ok: false, status: 401, json: async () => ({ error: 'Faça login.' }) };
  if (url === '/mercado/api/state') return { ok: true, status: 200, json: async () => ({ state: null, revision: 0, companyName: 'Mercado Teste', companyDocument: '12345678000190', dataDir: 'PostgreSQL isolado por empresa' }) };
  if (url === '/mercado/api/register') {
    registration = JSON.parse(options.body);
    authenticated = true;
    return { ok: true, status: 201, json: async () => ({ ok: true, company: { id: 'tenant-test', name: registration.companyName } }) };
  }
  throw new Error(`Unexpected request: ${url}`);
};

(async () => {
  win.eval(fs.readFileSync(path.join(root, 'web/app.js'), 'utf8'));
  for (let i = 0; i < 50 && !win.document.getElementById('cloudLogin'); i++) await new Promise(r => setTimeout(r, 10));
  assert.ok(win.document.getElementById('cloudLogin'), 'unauthenticated cloud visit should show login');
  assert.match(win.document.body.textContent, /Cada empresa tem login e dados separados/);
  win.eval('registerView()');
  win.document.getElementById('regCompany').value = 'Mercado Teste';
  win.document.getElementById('regDocument').value = '12345678000190';
  win.document.getElementById('regUser').value = 'mercado.teste';
  win.document.getElementById('regPassword').value = 'senha-teste-com-12';
  await win.eval('registerCloud()');
  assert.equal(registration.companyName, 'Mercado Teste');
  assert.equal(registration.username, 'mercado.teste');
  assert.equal(win.eval('ready'), true, 'new tenant should be logged in after registration');
  assert.equal(win.eval('cfg().name'), 'Mercado Teste', 'empty tenant should receive its own company identity');
  console.log('PASS multiempresa UI: login, new company registration, automatic session, and tenant-specific initial profile.');
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => win.close());
