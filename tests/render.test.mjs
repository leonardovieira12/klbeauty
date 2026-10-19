import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {createHandler} from '../server/app.mjs';
import {hashPassword,verifyPassword,readToken,sessionCookie,validOrigin} from '../server/security.mjs';

test('hash de senha é salgado e valida somente a senha correta',async()=>{const a=await hashPassword('senha-longa-teste'),b=await hashPassword('senha-longa-teste');assert.notEqual(a,b);assert.equal(await verifyPassword('senha-longa-teste',a),true);assert.equal(await verifyPassword('senha-errada',a),false);assert.equal(await verifyPassword('a','broken'),false)});
test('cookies de sessão protegidos em produção',()=>{const c=sessionCookie('token',true);for(const flag of ['HttpOnly','SameSite=Lax','Secure','Path=/'])assert.ok(c.includes(flag));assert.equal(readToken('foo=1; kl_session=token'),'token');assert.equal(readToken(''),'')});
test('origem bloqueia requisição externa e ausente',()=>{assert.equal(validOrigin('https://app.example','https://app.example','ignored',true),true);assert.equal(validOrigin('https://evil.example','https://app.example','app.example',true),false);assert.equal(validOrigin(undefined,'https://app.example','app.example',true),false)});

test('integração HTTP com motor PostgreSQL PGlite',async t=>{
 const db=new PGlite();await db.exec(await readFile(new URL('../server/schema.sql',import.meta.url),'utf8'));
 const pool={query:async(sql,params)=>{const r=await db.query(sql,params);return {...r,rowCount:r.affectedRows||r.rows.length}},connect:async()=>({...pool,release(){}})};
 const adminId=randomUUID();await pool.query('INSERT INTO kl_users(id,email,password_hash,is_admin) VALUES($1,$2,$3,TRUE)',[adminId,'admin@example.com',await hashPassword('Admin-password-123')]);
 const server=createServer(createHandler(pool,{production:false}));await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
 const call=async(path,{cookie='',data,origin=base,headers={}}={})=>{const response=await fetch(base+path,{method:data===undefined?'GET':'POST',headers:{...headers,...(cookie?{Cookie:cookie}:{}),...(data===undefined?{}:{Origin:origin,'Content-Type':'application/json'})},body:data===undefined?undefined:JSON.stringify(data)});const type=response.headers.get('content-type');return {status:response.status,body:type?.includes('json')?await response.json():await response.text(),cookie:response.headers.get('set-cookie')?.split(';')[0]}};
 let admin,staff,company,version=0;
 try{
 await t.test('health check consulta o banco',async()=>{assert.equal((await call('/healthz')).status,200)});
 await t.test('dados privados exigem sessão',async()=>{assert.equal((await call('/api/crm')).status,401)});
 await t.test('cabeçalhos de autenticação antigos não concedem acesso',async()=>{assert.equal((await call('/api/crm',{headers:{'oai-authenticated-user-id':adminId,'oai-authenticated-user-email':'admin@example.com'}})).status,401)});
 await t.test('origem externa rejeitada no login',async()=>{assert.equal((await call('/api/auth/login',{origin:'https://evil.example',data:{email:'admin@example.com',password:'Admin-password-123'}})).status,403)});
 await t.test('senha incorreta recusada',async()=>{assert.equal((await call('/api/auth/login',{data:{email:'admin@example.com',password:'wrong'}})).status,401)});
 await t.test('login emite cookie e retorna administrador',async()=>{const r=await call('/api/auth/login',{data:{email:'admin@example.com',password:'Admin-password-123'}});assert.equal(r.status,200);assert.equal(r.body.user.admin,true);admin=r.cookie;assert.ok(admin)});
 await t.test('criação de salão persiste JSONB',async()=>{const r=await call('/api/crm',{cookie:admin,data:{type:'create',name:'Salão de testes'}});assert.equal(r.status,201);company=r.body.company;assert.equal(r.body.state.clients.length,0)});
 await t.test('cadastro de cliente e leitura persistente',async()=>{const r=await call('/api/crm',{cookie:admin,data:{company,version,command:{type:'save',entity:'clients',data:{name:'Cliente Teste'}}}});assert.equal(r.status,200);version=r.body.version;assert.equal((await call('/api/crm?company='+company,{cookie:admin})).body.state.clients.length,1)});
 await t.test('gravação com versão antiga retorna 409',async()=>{const r=await call('/api/crm',{cookie:admin,data:{company,version:0,command:{type:'save',entity:'clients',data:{name:'Duplicado'}}}});assert.equal(r.status,409)});
 await t.test('administrador cria conta da equipe',async()=>{const r=await call('/api/accounts',{cookie:admin,data:{action:'create',email:'staff@example.com',password:'Staff-password-123'}});assert.equal(r.status,201);staff=(await call('/api/auth/login',{data:{email:'staff@example.com',password:'Staff-password-123'}})).cookie});
 await t.test('equipe sem associação não lê o salão',async()=>{assert.equal((await call('/api/crm?company='+company,{cookie:staff})).status,403);assert.equal((await call('/api/crm',{cookie:staff})).body.companies.length,0)});
 await t.test('equipe não cria conta nem salão',async()=>{assert.equal((await call('/api/accounts',{cookie:staff,data:{action:'create',email:'x@example.com',password:'Another-password-1'}})).status,403);assert.equal((await call('/api/crm',{cookie:staff,data:{type:'create',name:'Ataque'}})).status,403)});
 await t.test('permissão por e-mail libera somente salão associado',async()=>{const r=await call('/api/crm',{cookie:admin,data:{company,version,command:{type:'member',data:{email:'staff@example.com',role:'reception'}}}});assert.equal(r.status,200);version=r.body.version;const read=await call('/api/crm?company='+company,{cookie:staff});assert.equal(read.status,200);assert.equal(read.body.role,'reception');assert.equal((await call('/api/crm',{cookie:staff})).body.companies.length,1)});
 await t.test('recepção não configura o salão',async()=>{const r=await call('/api/crm',{cookie:staff,data:{company,version,command:{type:'settings',data:{}}}});assert.equal(r.status,400)});
 await t.test('desativar conta revoga as sessões',async()=>{const all=await call('/api/accounts',{cookie:admin});const account=all.body.users.find(u=>u.email==='staff@example.com');assert.equal((await call('/api/accounts',{cookie:admin,data:{action:'toggle',id:account.id,active:false}})).status,200);assert.equal((await call('/api/auth/me',{cookie:staff})).status,401)});
 await t.test('administrador não pode se desativar',async()=>{assert.equal((await call('/api/accounts',{cookie:admin,data:{action:'toggle',id:adminId,active:false}})).status,400)});
 await t.test('limite de tentativas bloqueia abuso',async()=>{for(let i=0;i<10;i++)assert.equal((await call('/api/auth/login',{data:{email:'unknown@example.com',password:'wrong'}})).status,401);assert.equal((await call('/api/auth/login',{data:{email:'unknown@example.com',password:'wrong'}})).status,429)});
 await t.test('frontend compilado é servido com política de conteúdo',async()=>{const r=await fetch(base+'/');assert.equal(r.status,200);assert.ok(r.headers.get('content-security-policy').includes("frame-ancestors 'none'"));assert.ok((await r.text()).includes('KL Beauty'))});
 await t.test('arquivos de servidor não são expostos',async()=>{assert.equal((await call('/server/schema.sql')).status,404);assert.equal((await call('/.env')).status,404)});
 await t.test('troca de senha revoga sessão antiga',async()=>{assert.equal((await call('/api/auth/password',{cookie:admin,data:{current:'Admin-password-123',password:'New-password-456'}})).status,200);assert.equal((await call('/api/auth/me',{cookie:admin})).status,401);const r=await call('/api/auth/login',{data:{email:'admin@example.com',password:'New-password-456'}});assert.equal(r.status,200);admin=r.cookie});
 await t.test('logout invalida token no servidor',async()=>{assert.equal((await call('/api/auth/logout',{cookie:admin,data:{}})).status,200);assert.equal((await call('/api/auth/me',{cookie:admin})).status,401)});
 }finally{await new Promise(r=>server.close(r));await db.close()}
});

test('inicialização cria administrador e preserva senha em reinícios',async()=>{
 const {initialize}=await import('../server/store.mjs');const db=new PGlite();const oldEmail=process.env.ADMIN_EMAIL,oldPass=process.env.ADMIN_PASSWORD;
 const pool={query:async(sql,params)=>{if(sql.includes('CREATE TABLE')){await db.exec(sql);return {rows:[],rowCount:0}}const r=await db.query(sql,params);return {...r,rowCount:r.affectedRows||r.rows.length}},connect:async()=>({...pool,release(){}})};
 try{process.env.ADMIN_EMAIL='bootstrap@example.com';process.env.ADMIN_PASSWORD='Bootstrap-password-123';await initialize(pool);process.env.ADMIN_PASSWORD='Different-password-456';await initialize(pool);const {rows}=await pool.query('SELECT * FROM kl_users');assert.equal(rows.length,1);assert.equal(rows[0].is_admin,true);assert.equal(await verifyPassword('Bootstrap-password-123',rows[0].password_hash),true)}finally{if(oldEmail===undefined)delete process.env.ADMIN_EMAIL;else process.env.ADMIN_EMAIL=oldEmail;if(oldPass===undefined)delete process.env.ADMIN_PASSWORD;else process.env.ADMIN_PASSWORD=oldPass;await db.close()}
});
