import {request as httpRequest} from 'node:http';
export function makePortal({beauty,pool,portal,marketPort,host}){return async(req,res)=>{
 const url=new URL(req.url,'http://local');
 const fail=(status,msg)=>{if(res.headersSent){res.end();return}res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({error:msg}))};
 if(url.pathname==='/healthz'){try{await pool.query('SELECT 1');const r=await fetch(`http://127.0.0.1:${marketPort}/health`,{signal:AbortSignal.timeout(2000)});if(!r.ok)throw Error();res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({status:'ok',beauty:'ok',mercado:'ok'}))}catch{fail(503,'Um dos sistemas não está disponível.')}return}
 if(host&&req.headers.host!==host)return fail(403,'Host inválido. Confira APP_URL.');
 if(url.pathname==='/beauty'||url.pathname==='/mercado'){res.writeHead(308,{Location:url.pathname+'/'+url.search});res.end();return}
 if(url.pathname.startsWith('/beauty/')){req.url=req.url.slice('/beauty'.length);return beauty(req,res)}
 if(url.pathname.startsWith('/mercado/')){
 const headers={...req.headers};delete headers.connection;delete headers['transfer-encoding'];
 const upstream=httpRequest({hostname:'127.0.0.1',port:marketPort,path:req.url.slice('/mercado'.length),method:req.method,headers,timeout:30000},response=>{res.writeHead(response.statusCode||502,response.headers);response.pipe(res)});
 upstream.on('timeout',()=>upstream.destroy());upstream.on('error',()=>fail(502,'KLSistemas indisponível. Tente novamente.'));req.on('aborted',()=>upstream.destroy());res.on('close',()=>upstream.destroy());req.pipe(upstream);return
 }
 if(url.pathname==='/'&&(req.method==='GET'||req.method==='HEAD')){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-cache','X-Frame-Options':'DENY','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'"});res.end(req.method==='HEAD'?undefined:portal);return}
 fail(404,'Escolha /beauty/ ou /mercado/.');
};}
