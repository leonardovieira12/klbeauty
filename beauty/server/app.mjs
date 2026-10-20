import {randomUUID} from 'node:crypto';
import {readFile,stat} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {z} from 'zod';
import {emptyState,demoState,mutate,roleFor,visibleState,DomainError} from '../lib/core.ts';
import {hashPassword,verifyPassword,newToken,tokenHash,readToken,sessionCookie,validOrigin} from './security.mjs';
const emailSchema=z.string().trim().email().max(254).transform(x=>x.toLowerCase());
const passwordSchema=z.string().min(12,'Senha deve ter pelo menos 12 caracteres.').max(200);
const root=resolve(fileURLToPath(new URL('../dist',import.meta.url)));
const dummyHash=await hashPassword('dummy-password-never-used');
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon','.woff2':'font/woff2'};
function send(res,status,body,extra={}){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...extra});res.end(JSON.stringify(body));}
async function body(req){if(!req.headers['content-type']?.includes('application/json'))throw Object.assign(Error('Envie JSON.'),{status:415});let n=0,parts=[];for await(const chunk of req){n+=chunk.length;if(n>200000)throw Object.assign(Error('Solicitação muito grande.'),{status:413});parts.push(chunk)}try{return JSON.parse(Buffer.concat(parts).toString('utf8'))}catch{throw Object.assign(Error('JSON inválido.'),{status:400})}}
export function createHandler(pool,{production=true,appUrl=''}={}){return async function handler(req,res){
 res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Frame-Options','DENY');res.setHeader('Referrer-Policy','same-origin');res.setHeader('Permissions-Policy','camera=(), microphone=(), geolocation=()');
 res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
 if(production)res.setHeader('Strict-Transport-Security','max-age=31536000');
 try{
 const path=new URL(req.url,'http://localhost').pathname;
 if(path==='/healthz'){await pool.query('SELECT 1');return send(res,200,{status:'ok',version:'1.1.0'})}
 if(req.method==='POST'&&!validOrigin(req.headers.origin,appUrl,req.headers.host,production))return send(res,403,{error:'Origem não autorizada. Confira APP_URL.'});
 if(path==='/api/auth/login'&&req.method==='POST'){
 const b=z.object({email:emailSchema,password:z.string().min(1).max(200)}).parse(await body(req));
 const limit=await pool.query("INSERT INTO kl_login_limits(key,attempts,reset_at) VALUES($1,1,now()+interval '15 minutes') ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN kl_login_limits.reset_at<=now() THEN 1 ELSE kl_login_limits.attempts+1 END, reset_at=CASE WHEN kl_login_limits.reset_at<=now() THEN now()+interval '15 minutes' ELSE kl_login_limits.reset_at END RETURNING attempts",[tokenHash(b.email)]);
 if(limit.rows[0].attempts>10)return send(res,429,{error:'Muitas tentativas. Aguarde 15 minutos.'});
 const {rows}=await pool.query('SELECT * FROM kl_users WHERE email=$1',[b.email]);const u=rows[0];const good=await verifyPassword(b.password,u?.password_hash||dummyHash);
 if(!u||!u.active||!good)return send(res,401,{error:'E-mail ou senha inválidos.'});
 const token=newToken();await pool.query("INSERT INTO kl_sessions(token_hash,user_id,expires) VALUES($1,$2,now()+interval '12 hours')",[tokenHash(token),u.id]);await pool.query('DELETE FROM kl_login_limits WHERE key=$1',[tokenHash(b.email)]);return send(res,200,{user:{email:u.email,admin:u.is_admin}},{'Set-Cookie':sessionCookie(token,production)});
 }
 if(path.startsWith('/api/')){
 const token=readToken(req.headers.cookie);const {rows:users}=await pool.query('SELECT u.id,u.email,u.is_admin FROM kl_sessions s JOIN kl_users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires>now() AND u.active=TRUE',[tokenHash(token)]);const u=users[0];if(!u)return send(res,401,{error:'Sua sessão terminou. Entre novamente.'});
 if(path==='/api/auth/me'&&req.method==='GET')return send(res,200,{user:{email:u.email,admin:u.is_admin}});
 if(path==='/api/auth/logout'&&req.method==='POST'){await pool.query('DELETE FROM kl_sessions WHERE token_hash=$1',[tokenHash(token)]);return send(res,200,{ok:true},{'Set-Cookie':sessionCookie('',production,0)})}
 if(path==='/api/auth/password'&&req.method==='POST'){const b=z.object({current:z.string().max(200),password:passwordSchema}).parse(await body(req));const {rows}=await pool.query('SELECT password_hash FROM kl_users WHERE id=$1',[u.id]);if(!await verifyPassword(b.current,rows[0].password_hash))return send(res,400,{error:'Senha atual incorreta.'});const c=await pool.connect();try{await c.query('BEGIN');await c.query('UPDATE kl_users SET password_hash=$1 WHERE id=$2',[await hashPassword(b.password),u.id]);await c.query('DELETE FROM kl_sessions WHERE user_id=$1',[u.id]);await c.query('COMMIT')}catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}return send(res,200,{ok:true},{'Set-Cookie':sessionCookie('',production,0)})}
 if(path==='/api/accounts'){
 if(!u.is_admin)return send(res,403,{error:'Somente o administrador da instalação.'});
 if(req.method==='GET'){const {rows}=await pool.query('SELECT id,email,is_admin,active FROM kl_users ORDER BY created');return send(res,200,{users:rows})}
 if(req.method==='POST'){const b=await body(req);if(b.action==='create'){const p=z.object({email:emailSchema,password:passwordSchema}).parse(b);try{await pool.query('INSERT INTO kl_users(id,email,password_hash) VALUES($1,$2,$3)',[randomUUID(),p.email,await hashPassword(p.password)])}catch(e){if(e.code==='23505')return send(res,400,{error:'E-mail já cadastrado.'});throw e}return send(res,201,{ok:true})}
 if(b.action==='toggle'){const p=z.object({id:z.string(),active:z.boolean()}).parse(b);const c=await pool.connect();try{await c.query('BEGIN');const {rowCount}=await c.query('UPDATE kl_users SET active=$1 WHERE id=$2 AND is_admin=FALSE',[p.active,p.id]);if(!rowCount){await c.query('ROLLBACK');return send(res,400,{error:'Conta não encontrada ou administrador protegido.'})}await c.query('DELETE FROM kl_sessions WHERE user_id=$1',[p.id]);await c.query('COMMIT')}catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}return send(res,200,{ok:true})}
 return send(res,400,{error:'Operação inválida.'})}
 }
 if(path==='/api/crm'){
 if(req.method==='GET'){const company=new URL(req.url,'http://localhost').searchParams.get('company');if(company){const {rows}=await pool.query('SELECT * FROM kl_salons WHERE id=$1',[company]);const r=rows[0];if(!r)return send(res,404,{error:'Salão não encontrado.'});const role=roleFor(r.state,u.email,r.owner===u.id);if(!role)return send(res,403,{error:'Acesso não autorizado.'});return send(res,200,{state:visibleState(r.state,role),version:r.version,role,owner:r.owner===u.id})}
 const {rows}=await pool.query("SELECT id,name,owner FROM kl_salons WHERE owner=$1 OR EXISTS (SELECT 1 FROM jsonb_array_elements(state->'members') m WHERE m->>'email'=$2) ORDER BY updated DESC",[u.id,u.email]);return send(res,200,{companies:rows.map(r=>({id:r.id,name:r.name,owner:r.owner===u.id})),user:u.email})}
 if(req.method==='POST'){const b=await body(req);if(b.type==='create'){if(!u.is_admin)return send(res,403,{error:'Somente o administrador pode criar salões.'});const p=z.object({name:z.string().trim().min(2).max(160),demo:z.boolean().default(false)}).parse(b);const {rows}=await pool.query('SELECT count(*)::int AS n FROM kl_salons WHERE owner=$1',[u.id]);if(rows[0].n>=20)return send(res,400,{error:'Limite de 20 salões por conta.'});const state=p.demo?demoState():emptyState(p.name);state.settings.name=p.name;const company=randomUUID();await pool.query('INSERT INTO kl_salons(id,owner,name,state) VALUES($1,$2,$3,$4)',[company,u.id,p.name,JSON.stringify(state)]);return send(res,201,{company,state,version:0,role:'admin',owner:true})}
 const p=z.object({company:z.string(),version:z.number().int().nonnegative(),command:z.any()}).parse(b);const {rows}=await pool.query('SELECT * FROM kl_salons WHERE id=$1',[p.company]);const r=rows[0];if(!r)return send(res,404,{error:'Salão não encontrado.'});const role=roleFor(r.state,u.email,r.owner===u.id);if(!role)return send(res,403,{error:'Acesso não autorizado.'});if(r.version!==p.version)return send(res,409,{error:'Os dados mudaram. Atualize a tela e repita a operação.'});const next=mutate(r.state,p.command,role,u.email);const result=await pool.query('UPDATE kl_salons SET state=$1,name=$2,version=version+1,updated=now() WHERE id=$3 AND version=$4 RETURNING version',[JSON.stringify(next),next.settings.name,p.company,p.version]);if(!result.rowCount)return send(res,409,{error:'Outra sessão salvou primeiro. Atualize a tela.'});return send(res,200,{state:visibleState(next,role),version:p.version+1,role,owner:r.owner===u.id})}
 }
 return send(res,404,{error:'Rota não encontrada.'});
 }
 if(req.method!=='GET'&&req.method!=='HEAD')return send(res,405,{error:'Método não permitido.'});
 let file;try{const decoded=decodeURIComponent(path);if(decoded.split('/').some(part=>part.startsWith('.')))return send(res,404,{error:'Arquivo não encontrado.'});file=resolve(root,'.'+decoded)}catch{return send(res,400,{error:'Endereço inválido.'})}if(file!==root&&!file.startsWith(root+sep))return send(res,403,{error:'Acesso negado.'});
 let exists=false;try{exists=(await stat(file)).isFile()}catch{}if(!exists){if(extname(path))return send(res,404,{error:'Arquivo não encontrado.'});file=resolve(root,'index.html')}
 const data=await readFile(file);res.writeHead(200,{'Content-Type':types[extname(file)]||'application/octet-stream','Cache-Control':file.includes(sep+'assets'+sep)?'public,max-age=31536000,immutable':'no-cache'});res.end(req.method==='HEAD'?undefined:data);
 }catch(e){if(res.headersSent){res.end();return}if(e instanceof z.ZodError)return send(res,400,{error:e.issues[0]?.message||'Dados inválidos.'});if(e instanceof DomainError)return send(res,400,{error:e.message});if(e.status)return send(res,e.status,{error:e.message});console.error('Falha na requisição:',e.code||e.name||'Error');return send(res,500,{error:'Não foi possível concluir. Tente novamente.'})}
};}
