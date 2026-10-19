import { z } from 'zod';
export type Role = 'admin'|'reception'|'finance';
export type Client = {id:string;name:string;phone:string;email:string;birthday:string;notes:string;consent:boolean;active:boolean};
export type Staff = {id:string;name:string;specialty:string;commission:number;color:string;active:boolean};
export type Product = {id:string;name:string;unit:string;stock:number;minimum:number;cost:number;price:number;active:boolean};
export type Service = {id:string;name:string;category:string;duration:number;price:number;consumption:{productId:string;quantity:number}[];active:boolean};
export type Appointment = {id:string;clientId:string;staffId:string;serviceIds:string[];items:{name:string;price:number;duration:number}[];consumption:{productId:string;quantity:number}[];start:string;end:string;status:'scheduled'|'confirmed'|'arrived'|'in_progress'|'completed'|'cancelled'|'no_show';notes:string;total:number;commissionRate:number;discount:number;packageId:string;actualStart?:string;actualEnd?:string};
export type Entry = {id:string;description:string;direction:'in'|'out';amount:number;due:string;paidDate:string;method:string;category:string;appointmentId:string;staffId:string;status:'pending'|'paid';created:string};
export type Pack = {id:string;clientId:string;serviceId:string;name:string;uses:number;remaining:number;expires:string;price:number};
export type Movement = {id:string;productId:string;quantity:number;reason:string;at:string};
export type State = {settings:{name:string;phone:string;address:string;taxId:string;open:string;close:string};clients:Client[];staff:Staff[];services:Service[];products:Product[];appointments:Appointment[];entries:Entry[];packages:Pack[];movements:Movement[];members:{email:string;role:Role}[];audit:{id:string;at:string;actor:string;action:string}[]};
export class DomainError extends Error {status=400;}
const fail=(s:string):never=>{throw new DomainError(s)};
export const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const id=()=>crypto.randomUUID();
const name=z.string().trim().min(2,'Informe pelo menos 2 caracteres.').max(160);
const short=z.string().max(500).default('');
const money=z.number().int().min(0).max(100000000);
const date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v=>!isNaN(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v,'Data inválida.');
const time=z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const qty=z.number().finite().min(0).max(1000000);
const consumption=z.array(z.object({productId:z.string(),quantity:qty.refine(x=>x>0)})).max(30).default([]);
const schemas={
 clients:z.object({name,phone:z.string().regex(/^[\d\s()+-]*$/).max(30).default(''),email:z.union([z.string().email(),z.literal('')]).default(''),birthday:z.union([date,z.literal('')]).default(''),notes:z.string().max(4000).default(''),consent:z.boolean().default(false),active:z.boolean().default(true)}),
 staff:z.object({name,specialty:short,commission:z.number().min(0).max(100),color:z.string().regex(/^#[\da-fA-F]{6}$/).default('#9b7c96'),active:z.boolean().default(true)}),
 products:z.object({name,unit:z.enum(['un','ml','g']),stock:qty,minimum:qty,cost:money,price:money,active:z.boolean().default(true)}),
 services:z.object({name,category:short,duration:z.number().int().min(5).max(720),price:money,consumption,active:z.boolean().default(true)}),
};
export function emptyState(n:string):State{return {settings:{name:n,phone:'',address:'',taxId:'',open:'08:00',close:'20:00'},clients:[],staff:[],services:[],products:[],appointments:[],entries:[],packages:[],movements:[],members:[],audit:[]}}
export function amountOf(a:Appointment){return a.total-a.discount;}
export function paidFor(s:State,a:Appointment){return s.entries.filter(e=>e.appointmentId===a.id&&e.direction==='in'&&e.status==='paid').reduce((n,e)=>n+e.amount,0)}
export function balanceFor(s:State,a:Appointment){return Math.max(0,amountOf(a)-paidFor(s,a))}
export function roleFor(s:State,email:string,owner:boolean):Role|null{return owner?'admin':s.members.find(m=>m.email.toLowerCase()===email.toLowerCase())?.role??null}
export function visibleState(s:State,role:Role):State { if(role!=='reception')return s;return {...s,members:[],audit:[],entries:s.entries.filter(e=>e.direction==='in'),appointments:s.appointments.map(a=>({...a,commissionRate:0})),products:s.products.map(p=>({...p,cost:0})),staff:s.staff.map(p=>({...p,commission:0}))}; }
function entry(s:State,v:Partial<Entry>&Pick<Entry,'description'|'amount'|'direction'>){const e:Entry={id:id(),due:today(),paidDate:'',method:'',category:'Outros',appointmentId:'',staffId:'',status:'pending',created:new Date().toISOString(),...v};if(e.status==='paid'&&!e.paidDate)e.paidDate=today();s.entries.push(e);return e}
const found=<T extends {id:string}>(rows:T[],key:string,label:string):T=>rows.find(x=>x.id===key)??fail(`${label} não encontrado.`);
function consume(s:State,list:{productId:string;quantity:number}[],reason:string){const totals=new Map<string,number>();for(const x of list)totals.set(x.productId,(totals.get(x.productId)||0)+x.quantity);for(const [key,quantity] of totals){const p=found(s.products,key,'Produto');if(p.stock+1e-8<quantity)fail(`Estoque insuficiente: ${p.name}.`);p.stock=Math.round((p.stock-quantity)*1000)/1000;s.movements.push({id:id(),productId:key,quantity:-quantity,reason,at:new Date().toISOString()})}}
export function mutate(input:State,command:any,role:Role,actor:string):State{
 const s:State=structuredClone(input);const c=z.object({type:z.string(),data:z.any().optional(),id:z.string().optional(),entity:z.string().optional()}).parse(command);const d=c.data??{};
 const admins=['settings','member','removeMember'];if(admins.includes(c.type)&&role!=='admin')fail('Somente o administrador pode realizar esta ação.');
 if(role==='reception'&&(['entry','payEntry','stock','payCommissions'].includes(c.type)||(c.type==='save'&&c.entity!=='clients')||c.type==='archive'))fail('Seu perfil não permite esta ação.');
 switch(c.type){
 case 'save':{const kind=c.entity as keyof typeof schemas;if(!schemas[kind])fail('Cadastro inválido.');const value:any=schemas[kind].parse(d);const rows=s[kind] as any[];const existing=c.id?found(rows,c.id,'Registro'):null;
 if(kind==='services')for(const use of value.consumption)found(s.products,use.productId,'Produto');
 if(kind==='products'&&existing)value.stock=existing.stock;
 const row={...value,id:existing?.id??id()};if(existing)rows[rows.indexOf(existing)]=row;else rows.push(row);break;}
 case 'archive':{const kind=c.entity as keyof typeof schemas;if(!schemas[kind])fail('Cadastro inválido.');const row=found(s[kind] as any[],c.id!,'Registro');row.active=!row.active;break;}
 case 'appointment':{
 const a=z.object({clientId:z.string(),staffId:z.string(),serviceIds:z.array(z.string()).min(1).max(15),date,time,notes:z.string().max(2000).default(''),discount:money.default(0),packageId:z.string().default('')}).parse(d);
 const client=found(s.clients,a.clientId,'Cliente'),staff=found(s.staff,a.staffId,'Profissional');if(!client.active||!staff.active)fail('Selecione cliente e profissional ativos.');
 const services=a.serviceIds.map(k=>found(s.services,k,'Serviço'));if(services.some(x=>!x.active))fail('Serviço inativo.');
 const start=`${a.date}T${a.time}:00-03:00`,end=new Date(Date.parse(start)+services.reduce((n,x)=>n+x.duration,0)*60000).toISOString();
 const minutes=Number(a.time.slice(0,2))*60+Number(a.time.slice(3));const hm=(x:string)=>Number(x.slice(0,2))*60+Number(x.slice(3));
 if(minutes<hm(s.settings.open)||minutes+services.reduce((n,x)=>n+x.duration,0)>hm(s.settings.close))fail('Atendimento fora do horário de funcionamento.');
 if(s.appointments.some(x=>x.id!==c.id&&x.staffId===a.staffId&&!['cancelled','no_show'].includes(x.status)&&Date.parse(x.start)<Date.parse(end)&&Date.parse(x.end)>Date.parse(start)))fail('Este profissional já tem um atendimento nesse horário.');
 const previous=c.id?found(s.appointments,c.id,'Agendamento'):null;if(previous&&!['scheduled','confirmed'].includes(previous.status))fail('Somente agendamentos pendentes podem ser reagendados.');
 if(previous&&s.entries.some(e=>e.appointmentId===previous.id))fail('Agendamento com recebimento não pode ser alterado.');
 let total=services.reduce((n,x)=>n+x.price,0);if(a.packageId){const p=found(s.packages,a.packageId,'Pacote');if(p.clientId!==client.id||services.length!==1||services[0].id!==p.serviceId)fail('Pacote incompatível com cliente ou serviço.');if(p.remaining<1||p.expires<a.date)fail('Pacote esgotado ou vencido.');total=0;}
 if(a.discount>total)fail('Desconto maior que o valor do atendimento.');
 const record:Appointment={id:previous?.id??id(),clientId:a.clientId,staffId:a.staffId,serviceIds:a.serviceIds,items:services.map(x=>({name:x.name,price:x.price,duration:x.duration})),consumption:services.flatMap(x=>x.consumption),start,end,status:previous?.status??'scheduled',notes:a.notes,total,commissionRate:staff.commission,discount:a.discount,packageId:a.packageId};if(previous)s.appointments[s.appointments.indexOf(previous)]=record;else s.appointments.push(record);break;
 }
 case 'status':{const a=found(s.appointments,c.id!,'Atendimento');const next=z.enum(['confirmed','arrived','in_progress','completed','cancelled','no_show']).parse(d.status);const edges:Record<string,string[]>={scheduled:['confirmed','arrived','cancelled','no_show'],confirmed:['arrived','cancelled','no_show'],arrived:['in_progress','cancelled'],in_progress:['completed'],completed:[],cancelled:[],no_show:[]};if(!edges[a.status].includes(next))fail('Esta alteração de status não é permitida.');if(['cancelled','no_show'].includes(next)&&paidFor(s,a)>0)fail('Atendimento com pagamento: registre o estorno antes de cancelar.');
 if(next==='in_progress')a.actualStart=new Date().toISOString();
 if(next==='completed'){
 consume(s,a.consumption,`Atendimento ${a.id}`);
 let commissionBase=amountOf(a);if(a.packageId){const p=found(s.packages,a.packageId,'Pacote');if(p.remaining<1||p.expires<today())fail('Pacote esgotado ou vencido.');p.remaining--;commissionBase=Math.round(p.price/p.uses);}
 a.actualEnd=new Date().toISOString();const balance=balanceFor(s,a);if(balance>0)entry(s,{description:`Atendimento · ${found(s.clients,a.clientId,'Cliente').name}`,amount:balance,direction:'in',appointmentId:a.id,category:'Serviços'});
 const commission=Math.round(commissionBase*a.commissionRate/100);if(commission)entry(s,{description:`Comissão · ${found(s.staff,a.staffId,'Profissional').name}`,amount:commission,direction:'out',staffId:a.staffId,appointmentId:a.id,category:'Comissões'});
 }a.status=next;break;}
 case 'payment':{const a=found(s.appointments,c.id!,'Atendimento');if(['cancelled','no_show'].includes(a.status))fail('Atendimento cancelado ou ausente.');const p=z.object({amount:money.refine(x=>x>0),method:z.enum(['Pix','Dinheiro','Débito','Crédito','Transferência'])}).parse(d);if(p.amount>balanceFor(s,a))fail('Recebimento maior que o saldo em aberto.');
 let rest=p.amount;for(const e of s.entries.filter(e=>e.appointmentId===a.id&&e.direction==='in'&&e.status==='pending')){const part=Math.min(e.amount,rest);if(!part)continue;e.amount-=part;rest-=part;}s.entries=s.entries.filter(e=>e.amount>0);
 entry(s,{description:`Recebimento · ${found(s.clients,a.clientId,'Cliente').name}`,direction:'in',amount:p.amount,status:'paid',method:p.method,appointmentId:a.id,category:'Serviços'});break;}
 case 'refund':{if(role==='reception')fail('Somente gestão e financeiro podem estornar.');const a=found(s.appointments,c.id!,'Atendimento');if(a.status==='completed')fail('Estorno de atendimento concluído exige ajuste financeiro manual.');const payments=s.entries.filter(e=>e.appointmentId===a.id&&e.direction==='in'&&e.status==='paid');if(!payments.length)fail('Não há recebimentos para estornar.');for(const p of payments){entry(s,{description:`Estorno · ${p.description}`,direction:'out',amount:p.amount,status:'paid',category:'Estornos',method:p.method});p.appointmentId='';}break;}
 case 'entry':{const e=z.object({description:name,amount:money.refine(x=>x>0),direction:z.enum(['in','out']),due:date,category:name,status:z.enum(['paid','pending']),method:short}).parse(d);entry(s,{...e});break;}
 case 'payEntry':{const e=found(s.entries,c.id!,'Lançamento');if(e.status==='paid')fail('Este lançamento já foi pago.');if(e.appointmentId&&e.direction==='in')fail('Receba este valor na comanda do atendimento.');e.status='paid';e.paidDate=today();e.method=z.enum(['Pix','Dinheiro','Débito','Crédito','Transferência']).parse(d.method);break;}
 case 'stock':{const p=found(s.products,c.id!,'Produto');const m=z.object({quantity:z.number().finite().min(-1000000).max(1000000).refine(x=>x!==0),reason:name}).parse(d);if(p.stock+m.quantity<0)fail('O estoque não pode ficar negativo.');p.stock=Math.round((p.stock+m.quantity)*1000)/1000;s.movements.push({id:id(),productId:p.id,...m,at:new Date().toISOString()});break;}
 case 'package':{const p=z.object({clientId:z.string(),serviceId:z.string(),name,uses:z.number().int().min(1).max(200),expires:date,price:money,method:z.enum(['Pix','Dinheiro','Débito','Crédito','Transferência'])}).parse(d);found(s.clients,p.clientId,'Cliente');found(s.services,p.serviceId,'Serviço');if(p.expires<today())fail('Validade deve ser hoje ou uma data futura.');s.packages.push({id:id(),...p,remaining:p.uses});if(p.price)entry(s,{description:`Pacote · ${p.name}`,amount:p.price,direction:'in',status:'paid',method:p.method,category:'Pacotes'});break;}
 case 'settings':{s.settings=z.object({name,phone:short,address:short,taxId:short,open:time,close:time}).parse(d);if(s.settings.close<=s.settings.open)fail('Fechamento deve ser posterior à abertura.');break;}
 case 'member':{const m=z.object({email:z.string().email().transform(x=>x.toLowerCase()),role:z.enum(['reception','finance'])}).parse(d);s.members=s.members.filter(x=>x.email!==m.email);s.members.push(m);break;}
 case 'removeMember':{s.members=s.members.filter(x=>x.email!==d.email);break;}
 default:fail('Operação desconhecida.');
 }
 s.audit.unshift({id:id(),at:new Date().toISOString(),actor,action:`${c.type}${c.entity?' · '+c.entity:''}${c.id?' · '+c.id:''}`});s.audit=s.audit.slice(0,2000);
 if(JSON.stringify(s).length>1500000)fail('Limite de armazenamento por salão atingido. Exporte os dados e solicite expansão.');return s;
}
export function demoState():State{
 const s=emptyState('Ateliê Beauty');s.settings.address='Av. das Flores, 120 · João Pessoa';
 s.staff=[{id:'s1',name:'Marina Costa',specialty:'Cabelo & coloração',commission:35,color:'#b78699',active:true},{id:'s2',name:'Beatriz Lima',specialty:'Nail designer',commission:40,color:'#91a697',active:true},{id:'s3',name:'Camila Rocha',specialty:'Estética & sobrancelhas',commission:40,color:'#b49a71',active:true}];
 s.products=[{id:'p1',name:'Máscara de hidratação',unit:'g',stock:850,minimum:200,cost:12,price:25,active:true},{id:'p2',name:'Shampoo profissional',unit:'ml',stock:120,minimum:250,cost:5,price:10,active:true},{id:'p3',name:'Esmalte nude rosé',unit:'un',stock:8,minimum:3,cost:1200,price:2200,active:true}];
 s.services=[{id:'v1',name:'Corte + escova',category:'Cabelo',duration:60,price:15000,consumption:[{productId:'p2',quantity:15}],active:true},{id:'v2',name:'Manicure e pedicure',category:'Unhas',duration:60,price:8500,consumption:[],active:true},{id:'v3',name:'Design de sobrancelhas',category:'Estética',duration:30,price:5500,consumption:[],active:true},{id:'v4',name:'Hidratação profunda',category:'Tratamento',duration:45,price:12000,consumption:[{productId:'p1',quantity:40}],active:true},{id:'v5',name:'Coloração completa',category:'Cabelo',duration:120,price:28000,consumption:[],active:true}];
 s.clients=['Ana Luiza Martins','Juliana Almeida','Fernanda Santos','Isabela Oliveira','Carolina Mendes','Patrícia Souza','Letícia Ribeiro','Amanda Costa'].map((n,i)=>({id:`c${i}`,name:n,phone:'',email:'',birthday:'',notes:i===0?'Prefere atendimento pela manhã.':'' ,consent:false,active:true}));
 const times=['09:00','09:30','10:00','11:00','13:30','14:00','15:00','16:00'];const svc=['v1','v2','v3','v4','v5','v2','v3','v1'];const staff=['s1','s2','s3','s1','s1','s2','s3','s1'];
 for(let i=0;i<8;i++){const v=s.services.find(x=>x.id===svc[i])!;const start=`${today()}T${times[i]}:00-03:00`;s.appointments.push({id:`a${i}`,clientId:`c${i}`,staffId:staff[i],serviceIds:[v.id],items:[{name:v.name,price:v.price,duration:v.duration}],consumption:v.consumption,start,end:new Date(Date.parse(start)+v.duration*60000).toISOString(),status:i===0?'completed':i===1?'in_progress':i===2?'arrived':i<5?'confirmed':'scheduled',notes:'',total:v.price,commissionRate:35,discount:0,packageId:''})}
 for(let day=1;day<=12;day++){const dt=new Date(`${today()}T12:00:00-03:00`);dt.setDate(dt.getDate()-day);const date=dt.toISOString().slice(0,10);entry(s,{description:'Atendimentos demonstrativos',direction:'in',amount:35000+(day%5)*12500,status:'paid',due:date,paidDate:date,method:'Pix',category:'Serviços'});}
 entry(s,{description:'Ana Luiza · Corte + escova',direction:'in',amount:15000,status:'paid',appointmentId:'a0',category:'Serviços',method:'Pix'});entry(s,{description:'Comissão · Marina Costa',direction:'out',amount:5250,appointmentId:'a0',staffId:'s1',category:'Comissões'});entry(s,{description:'Aluguel do espaço',direction:'out',amount:180000,status:'paid',category:'Estrutura',method:'Pix'});entry(s,{description:'Reposição de produtos',direction:'out',amount:38000,due:today(),category:'Produtos'});return s;
}
