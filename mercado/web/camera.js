'use strict';
let cameraEpoch=0,cameraStream=null,cameraControls=null,cameraLibrary=null;
function stopCamera(){
 cameraEpoch++;
 if(cameraControls){cameraControls.stop();cameraControls=null}
 if(cameraStream){cameraStream.getTracks().forEach(t=>t.stop());cameraStream=null}
 const video=document.getElementById('cameraVideo');if(video)video.srcObject=null;
 const dialog=document.getElementById('cameraModal');if(dialog?.open)dialog.close();
}
function closeCamera(){stopCamera()}
function loadCameraReader(){
 if(window.ZXingBrowser)return Promise.resolve(window.ZXingBrowser);
 if(!cameraLibrary)cameraLibrary=new Promise((resolve,reject)=>{
  const script=document.createElement('script');script.src='/mercado/zxing-browser.min.js';
  script.onload=()=>{if(window.ZXingBrowser)resolve(window.ZXingBrowser);else{cameraLibrary=null;script.remove();reject(Error('Não foi possível carregar o leitor.'))}};
  script.onerror=()=>{cameraLibrary=null;script.remove();reject(Error('Falha ao carregar o leitor. Confira a conexão e tente novamente.'))};
  document.head.appendChild(script);
 });
 return cameraLibrary;
}
async function openCamera(target='sale'){
 clearTimeout(window.scanTimer);
 if(target==='product'&&!$('pBarcode'))return;
 if(target!=='product'&&!$('scan'))return;
 const pendingQty=target==='sale'?parseScan($('scan').value)?.qty??null:null;
 stopCamera();
 const dialog=$('cameraModal');
 dialog.innerHTML=`<button type="button" class="close" onclick="closeCamera()" aria-label="Fechar câmera">×</button><h2>${target==='product'?'Escanear código do produto':'Adicionar à sacola pela câmera'}</h2><p class="subtitle">${target==='product'?'O código será preenchido no cadastro; os outros campos serão preservados.':'Produtos por unidade entram direto na sacola. Para produtos por quilo, informe o peso.'}</p><video id="cameraVideo" autoplay muted playsinline aria-label="Prévia da câmera"></video><p id="cameraStatus" role="status">Preparando leitor…</p><div class="form-actions"><button type="button" class="secondary" onclick="closeCamera()">Cancelar leitura</button></div>`;
 dialog.showModal();
 const epoch=cameraEpoch,video=$('cameraVideo');
 try{
  if(!window.isSecureContext||!navigator.mediaDevices?.getUserMedia)throw Error('A câmera precisa de HTTPS e de um navegador com acesso à câmera. Abra o endereço do portal no Chrome ou Safari.');
  const library=await loadCameraReader();if(epoch!==cameraEpoch)return;
  $('cameraStatus').textContent='Autorize o uso da câmera no navegador.';
  const stream=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:'environment'},width:{ideal:1280},height:{ideal:720}}});
  if(epoch!==cameraEpoch){stream.getTracks().forEach(t=>t.stop());return}
  cameraStream=stream;
  const reader=new library.BrowserMultiFormatOneDReader(undefined,{delayBetweenScanAttempts:200,delayBetweenScanSuccess:1500});
  const controls=await reader.decodeFromStream(stream,video,(result,error,controls)=>{
   if(!result||epoch!==cameraEpoch)return;
   const code=result.getText();controls.stop();closeCamera();
   if(target==='product'){
    if($('pBarcode')){$('pBarcode').value=code;$('pBarcode').focus();toast('Código preenchido. Confira o cadastro e salve o produto.')}
   }else if($('scan'))acceptCameraCode(code,pendingQty);
  });
  if(epoch!==cameraEpoch){controls.stop();return}
  cameraControls=controls;
  $('cameraStatus').textContent='Mantenha o código inteiro no enquadramento, com boa iluminação.';
 }catch(error){
  if(epoch!==cameraEpoch)return;
  // Release hardware without dismissing the error message or the product form.
  if(cameraControls){cameraControls.stop();cameraControls=null}
  if(cameraStream){cameraStream.getTracks().forEach(t=>t.stop());cameraStream=null}
  const msg={NotAllowedError:'Permissão negada. Libere a câmera nas permissões deste site e tente novamente.',NotFoundError:'Nenhuma câmera foi encontrada neste dispositivo.',NotReadableError:'A câmera está ocupada. Feche outros aplicativos que a estejam usando.'}[error.name]||error.message;
  if($('cameraStatus'))$('cameraStatus').textContent=msg;
 }
}
document.addEventListener('visibilitychange',()=>{if(document.hidden)closeCamera()});
window.addEventListener('pagehide',stopCamera);
document.addEventListener('DOMContentLoaded',()=>{
 for(const id of ['modal','cameraModal']){
  const dialog=document.getElementById(id);
  dialog?.addEventListener('cancel',stopCamera);
  dialog?.addEventListener('close',()=>{if(!dialog.open&&id==='cameraModal'&&cameraStream)stopCamera()});
 }
});
