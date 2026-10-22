import assert from 'node:assert/strict';
import {request} from 'node:http';
import {randomUUID} from 'node:crypto';
const base='http://127.0.0.1:18090',host='portal.test';let checks=0;
function check(a,b,msg){assert.equal(a,b,msg);checks++}
async function call(path,data,cookie=''){return new Promise((resolve,reject)=>{const text=data===undefined?null:JSON.stringify(data);const req=request(base+path,{method:data===undefined?'GET':'POST',headers:{Host:host,Origin:'https://'+host,Cookie:cookie,...(text===null?{}:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(text)})}},r=>{const parts=[];r.on('data',b=>parts.push(b));r.on('end',()=>{const raw=Buffer.concat(parts).toString();resolve({status:r.statusCode,body:r.headers['content-type']?.includes('json')?JSON.parse(raw):raw,cookie:r.headers['set-cookie']?.[0]?.split(';')[0]})});});req.on('error',reject);req.end(text)})}

check((await call('/healthz')).status,200);
const a=await call('/admin/api/login',{email:'root@qa.test',password:'Superadmin-password-123'});check(a.status,200);const admin=a.cookie;const post=(p,b)=>call('/admin/api/'+p,b,admin);
const draft={name:'Live mercado A',app:'mercado',contact:'Teste',document:'',plan:'Teste',monthly_cents:10000,next_due:new Date(Date.now()-10*86400000).toISOString().slice(0,10),grace_days:1,auto_block:false,username:'live.a',password:'Live-password-123'};
const c=await post('create',draft);check(c.status,201,JSON.stringify(c.body));const id=c.body.id,ctx={app:'mercado',company_id:id};const details=async()=>(await call('/admin/api/detail?app=mercado&company_id='+id,undefined,admin)).body;
check((await post('create',{...draft,name:'Live mercado B',username:'live.b',monthly_cents:0,next_due:null})).status,201);
const login=await call('/mercado/api/login',{username:'live.a',password:draft.password});check(login.status,200,JSON.stringify(login.body));const cookie=login.cookie;
check((await call('/mercado/api/state',undefined,cookie)).status,200);
check((await call('/mercado/api/register',{companyName:'Bypass',username:'bad',password:'Any-password-123'})).status,403);
let d=await details();check((await post('company',{...d.company,...ctx,auto_block:true,reason:'Aplicar política'})).status,200);
check((await call('/mercado/api/state',undefined,cookie)).status,403,'existing session must block overdue');
check((await call('/mercado/api/login',{username:'live.a',password:draft.password})).status,403);
check((await post('invoice/pay',{...ctx,invoice_id:d.invoices[0].id,payment_id:randomUUID(),amount_cents:10000,method:'pix',reference:'QA-PIX'})).status,200);
check((await call('/mercado/api/state',undefined,cookie)).status,200,'payment restores access');
check((await post('user/create',{...ctx,username:'live.viewer',password:'Viewer-password-123',role:'viewer'})).status,200);
const v=await call('/mercado/api/login',{username:'live.viewer',password:'Viewer-password-123'});check(v.status,200);check((await call('/mercado/api/state',undefined,v.cookie)).status,200);check((await call('/mercado/api/state',{revision:0,state:{}},v.cookie)).status,403,'viewer cannot write');
d=await details();const uid=d.users.find(u=>u.username==='live.viewer').id;
check((await post('user/update',{...ctx,user_id:uid,active:false,role:'viewer',reason:'Desativar conta'})).status,200);check((await call('/mercado/api/state',undefined,v.cookie)).status,403);check((await call('/mercado/api/login',{username:'live.viewer',password:'Viewer-password-123'})).status,401);
check((await post('user/update',{...ctx,user_id:uid,active:true,role:'owner',password:'Reset-password-123',reason:'Recuperar acesso'})).status,200);check((await call('/mercado/api/state',undefined,v.cookie)).status,403);const reset=await call('/mercado/api/login',{username:'live.viewer',password:'Reset-password-123'});check(reset.status,200);
const b=await call('/mercado/api/login',{username:'live.b',password:draft.password});check(b.status,200);check((await call('/mercado/api/state?company_id='+id,undefined,b.cookie)).body.companyName,'Live mercado B','request cannot choose another tenant');
d=await details();check((await post('company',{...d.company,...ctx,status:'cancelled',reason:'Contrato encerrado'})).status,200);check((await call('/mercado/api/state',undefined,cookie)).status,403);check((await call('/mercado/api/state',undefined,reset.cookie)).status,403);check((await call('/mercado/api/state',undefined,b.cookie)).status,200,'other tenant stays active');check((await call('/mercado/api/logout',{},cookie)).status,200,'blocked user can logout');
check((await call('/admin/')).status,200);check((await call('/admin/app.js')).status,200);check((await call('/beauty/')).status,200);check((await call('/mercado/')).status,200);check((await call('/admin/schema.sql')).status,404);
console.log(`PASS ${checks} verificações HTTP no conjunto Node + Go + PostgreSQL/PGlite socket`);
