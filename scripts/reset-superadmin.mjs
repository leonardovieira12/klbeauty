import {randomUUID} from 'node:crypto';
import {createPool} from '../beauty/server/store.mjs';
import {hashPassword} from '../beauty/server/security.mjs';
const email=(process.env.RESET_EMAIL||'').trim().toLowerCase(),password=process.env.RESET_PASSWORD||'';
if(!email||password.length<12||password.length>200)throw Error('Defina RESET_EMAIL e RESET_PASSWORD (12–200 caracteres) no ambiente local.');
const pool=createPool(),c=await pool.connect();try{await c.query('BEGIN');const r=await c.query('UPDATE kp_admins SET password_hash=$1 WHERE email=$2 RETURNING id',[await hashPassword(password),email]);if(!r.rowCount)throw Error('Superadmin não encontrado');await c.query('DELETE FROM kp_sessions WHERE admin_id=$1',[r.rows[0].id]);await c.query('INSERT INTO kp_audit(id,actor,action,app,company_id,detail) VALUES($1,$2,$3,$4,$5,$6)',[randomUUID(),'local-operator','admin.password.reset','beauty','platform',JSON.stringify({email})]);await c.query('COMMIT');console.log('Senha atualizada e sessões revogadas.')}catch(e){await c.query('ROLLBACK');throw e}finally{c.release();await pool.end()}
