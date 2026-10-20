import {createServer} from 'node:http';
import {createPool,initialize} from './store.mjs';
import {createHandler} from './app.mjs';
const production=process.env.NODE_ENV==='production';
if(production&&(!process.env.APP_URL||!process.env.APP_URL.startsWith('https://')))throw Error('Configure APP_URL com a URL HTTPS do serviço.');
const pool=createPool();pool.on('error',e=>console.error('Banco indisponível:',e.code||e.name));
await initialize(pool);
const server=createServer(createHandler(pool,{production,appUrl:process.env.APP_URL||''}));
server.requestTimeout=30000;server.headersTimeout=15000;
server.listen(Number(process.env.PORT||10000),'0.0.0.0',()=>console.log('KL Beauty ativo na porta',process.env.PORT||10000));
const cleanup=setInterval(()=>{pool.query('DELETE FROM kl_sessions WHERE expires<now()').catch(()=>{});pool.query('DELETE FROM kl_login_limits WHERE reset_at<now()').catch(()=>{})},3600000);cleanup.unref();
function shutdown(){clearInterval(cleanup);server.close(async()=>{await pool.end();process.exit(0)});setTimeout(()=>process.exit(1),10000).unref()}
process.on('SIGTERM',shutdown);process.on('SIGINT',shutdown);
