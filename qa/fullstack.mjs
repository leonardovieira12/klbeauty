// Local-only integration suite. All accounts and database records are disposable fixtures.
import {PGlite} from '@electric-sql/pglite';
import {PGLiteSocketServer} from '@electric-sql/pglite-socket';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const project=fileURLToPath(new URL('../',import.meta.url)),qa=fileURLToPath(new URL('./',import.meta.url));
const db=await PGlite.create();
const socket=new PGLiteSocketServer({db,host:'127.0.0.1',port:15439,maxConnections:30});
let child;
try{
 await socket.start();
 child=spawn(process.execPath,['server.mjs'],{cwd:project,env:{...process.env,KLS_DATABASE_URL:'',KLS_PASSWORD_SHA256:'',DATABASE_URL:'postgresql://postgres:postgres@127.0.0.1:15439/postgres',DATABASE_SSL:'disable',APP_URL:'https://portal.test',PORT:'18090',ADMIN_EMAIL:'legacy@qa.test',ADMIN_PASSWORD:'Legacy-password-123',KLS_ADMIN_USER:'legacy',KLS_ADMIN_PASSWORD:'Market-password-123',SUPERADMIN_EMAIL:'root@qa.test',SUPERADMIN_PASSWORD:'Superadmin-password-123'},stdio:['ignore','pipe','pipe']});
 child.stderr.on('data',b=>process.stderr.write(b));
 await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Portal não iniciou em 30 segundos')),30000);child.once('error',e=>{clearTimeout(timer);reject(e)});child.once('exit',code=>{clearTimeout(timer);reject(Error('Portal encerrou durante inicialização: '+code))});child.stdout.on('data',b=>{process.stdout.write(b);if(b.toString().includes('KL Portal ativo')){clearTimeout(timer);resolve()}})});
 for(const file of ['live-check.mjs','admin-dom.cjs','market-dom.cjs','stock-dom.cjs'])await new Promise((resolve,reject)=>{const test=spawn(process.execPath,[file],{cwd:qa,stdio:'inherit'});test.once('error',reject);test.once('exit',code=>code===0?resolve():reject(Error(file+' falhou: '+code)))});
 console.log('PASS suíte integrada completa');
}catch(e){console.error(e.message);process.exitCode=1}finally{if(child&&child.exitCode===null){child.kill();await new Promise(r=>{child.once('exit',r);setTimeout(()=>{child.kill('SIGKILL');r()},10000).unref()})}await socket.stop();/* Socket close callbacks are queued with setImmediate. Drain them before disposing WASM. */for(let i=0;i<4;i++)await new Promise(r=>setImmediate(r));await db.close()}
