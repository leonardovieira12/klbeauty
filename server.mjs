import {createServer,request as httpRequest} from 'node:http';
import {readFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {createPool,initialize} from './beauty/server/store.mjs';
import {createHandler} from './beauty/server/app.mjs';
import {makePortal} from './scripts/gateway.mjs';
const appUrl=(process.env.APP_URL||process.env.RENDER_EXTERNAL_URL||'').replace(/\/$/,'');
const origin=new URL(appUrl);if(origin.protocol!=='https:'||origin.pathname!=='/'||origin.username||origin.search||origin.hash)throw Error('APP_URL ou RENDER_EXTERNAL_URL deve ser a origem HTTPS do serviço, sem caminho.');
const ssl=process.env.DATABASE_SSL||'disable';process.env.DATABASE_SSL=ssl;
const marketDb=new URL(process.env.KLS_DATABASE_URL||process.env.DATABASE_URL||'');
marketDb.searchParams.set('sslmode',ssl==='disable'?'disable':'verify-full');
let digest=process.env.KLS_PASSWORD_SHA256;
if(process.env.KLS_ADMIN_PASSWORD){if(process.env.KLS_ADMIN_PASSWORD.length<12)throw Error('KLS_ADMIN_PASSWORD precisa ter no mínimo 12 caracteres.');digest=createHash('sha256').update(process.env.KLS_ADMIN_PASSWORD).digest('hex')}
if(!/^[a-f0-9]{64}$/i.test(digest||''))throw Error('Defina KLS_ADMIN_PASSWORD (senha inicial do mercado).');
const childEnv={...process.env,PORT:'10001',KLS_MODE:'cloud',KLS_NO_BROWSER:'1',KLS_DATA_DIR:'/tmp/kl-mercado',KLS_PUBLIC_URL:origin.origin,KLS_PASSWORD_SHA256:digest,DATABASE_URL:marketDb.toString()};
delete childEnv.ADMIN_PASSWORD;delete childEnv.KLS_ADMIN_PASSWORD;
const child=spawn(fileURLToPath(new URL('./bin/klsistemas',import.meta.url)),[],{env:childEnv,stdio:'inherit'});
let stopping=false,server,pool;
function stop(code=0){if(stopping)return;stopping=true;child.kill('SIGTERM');const finish=async()=>{await pool?.end();process.exit(code)};if(server)server.close(()=>finish());else finish();setTimeout(()=>{child.kill('SIGKILL');process.exit(code||1)},10000).unref()}
child.on('error',()=>{console.error('Não foi possível iniciar KLSistemas.');stop(1)});child.on('exit',()=>{if(!stopping){console.error('KLSistemas encerrou. Reiniciando o serviço completo.');stop(1)}});
process.on('SIGTERM',()=>stop());process.on('SIGINT',()=>stop());
try{
 pool=createPool();pool.on('error',e=>console.error('PostgreSQL:',e.code||e.name));await initialize(pool);
 for(let attempt=0;attempt<60;attempt++){if(stopping)break;try{const r=await fetch('http://127.0.0.1:10001/health',{signal:AbortSignal.timeout(1000)});if(r.ok)break}catch{}if(attempt===59)throw Error('KLSistemas não respondeu ao iniciar.');await new Promise(r=>setTimeout(r,500))}
 if(!stopping){const handler=createHandler(pool,{production:true,appUrl:origin.origin});const portal=await readFile(new URL('./portal.html',import.meta.url));server=createServer(makePortal({beauty:handler,pool,portal,marketPort:10001,host:origin.host}));server.requestTimeout=30000;server.headersTimeout=15000;server.listen(Number(process.env.PORT||10000),'0.0.0.0',()=>console.log('KL Portal ativo: /beauty/ e /mercado/'));const timer=setInterval(()=>{pool.query('DELETE FROM kl_sessions WHERE expires<now()').catch(()=>{});pool.query('DELETE FROM kl_login_limits WHERE reset_at<now()').catch(()=>{})},3600000);timer.unref();}
}catch(e){console.error('Falha ao iniciar portal:',e.message.replace(/postgres(?:ql)?:\/\/\S+/g,'[conexão omitida]'));stop(1)}
