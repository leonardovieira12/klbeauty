import {randomBytes,scrypt as _scrypt,timingSafeEqual,createHash} from 'node:crypto';
import {promisify} from 'node:util';
const scrypt=promisify(_scrypt);
export async function hashPassword(password){const salt=randomBytes(16).toString('hex');const key=await scrypt(password,salt,64,{N:16384,r:8,p:1});return `scrypt$${salt}$${key.toString('hex')}`;}
export async function verifyPassword(password,encoded){try{const [method,salt,hash]=encoded.split('$');if(method!=='scrypt'||!/^[a-f0-9]{128}$/.test(hash))return false;const actual=await scrypt(password,salt,64,{N:16384,r:8,p:1});return timingSafeEqual(actual,Buffer.from(hash,'hex'))}catch{return false}}
export const tokenHash=token=>createHash('sha256').update(token).digest('hex');
export const newToken=()=>randomBytes(32).toString('hex');
export function readToken(cookie=''){const match=cookie.split(';').map(x=>x.trim()).find(x=>x.startsWith('kl_session='));return match?match.slice(11):'';}
export function sessionCookie(token,production,maxAge=43200){return `kl_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${production?'; Secure':''}`;}
export function validOrigin(origin,appUrl,host,production){if(!origin)return false;try{const u=new URL(origin);return u.origin===(appUrl?new URL(appUrl).origin:`${production?'https':'http'}://${host}`)}catch{return false}}
