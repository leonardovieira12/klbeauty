import {createPool} from '../server/store.mjs';
import {hashPassword} from '../server/security.mjs';
const email=(process.env.RESET_EMAIL||'').trim().toLowerCase(),password=process.env.RESET_PASSWORD||'';
if(!email||password.length<12||password.length>200)throw Error('Defina RESET_EMAIL e RESET_PASSWORD (12–200 caracteres) somente no ambiente local.');
const pool=createPool();const c=await pool.connect();try{await c.query('BEGIN');const result=await c.query('UPDATE kl_users SET password_hash=$1 WHERE email=$2 RETURNING id',[await hashPassword(password),email]);if(!result.rowCount)throw Error('Conta não encontrada.');await c.query('DELETE FROM kl_sessions WHERE user_id=$1',[result.rows[0].id]);await c.query('COMMIT');console.log('Senha atualizada. Sessões anteriores encerradas.')}catch(e){await c.query('ROLLBACK');throw e}finally{c.release();await pool.end()}
