import { orderPhotos, validatePhotoOrder } from '../src/photos.js';
import { membersOf, resizeGuest, answerGuest } from '../src/guests.js';
import { GIFT_CHANGE, giftReservations } from './gifts.js';
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

const DEFAULT_SETTINGS = { date: '2027-02-28T15:00:00-03:00', venue: 'Salão de Festas 2', address: 'Rua Presidente João Goulart, 585', mapUrl: 'https://www.google.com/maps/search/?api=1&query=Rua%20Presidente%20Jo%C3%A3o%20Goulart%2C%20585' };
const DEFAULT_PHOTOS = [
  { id:'laura-art', url:'./images/laura-princesa.png', caption:'Nossa pequena princesa' },
  { id:'laura-invite', url:'./images/convite-laura.png', caption:'O convite da Laura' }
];
const PREFIX = 'lplaura:v1:';
export const KEY = { guests:PREFIX+'guests', gifts:PREFIX+'gifts', photos:PREFIX+'photos', photoOrder:PREFIX+'photo-order', settings:PREFIX+'settings' };
const fail = (res, status, error) => res.status(status).json({ error });
const text = (value, max) => String(value || '').trim().slice(0,max);
const validUrl = (value) => { try { const u = new URL(value, 'https://laura.local'); return ['http:', 'https:'].includes(u.protocol) && (value.startsWith('./images/') || value.startsWith('/images/') || /^https?:\/\//i.test(value)); } catch { return false; } };
export async function redis(...args) {
  const response = await fetch(process.env.UPSTASH_REDIS_REST_URL, { method:'POST', headers:{ Authorization:`Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`, 'Content-Type':'application/json' }, body:JSON.stringify(args) });
  if (!response.ok) throw new Error('Falha no banco de dados');
  const data = await response.json();
  if (data.error) throw new Error(data.error);
  return data.result;
}
const parse = value => { try { return JSON.parse(value); } catch { return null; } };
async function all(key) { const raw = await redis('HGETALL', key); if (!raw) return []; if (Array.isArray(raw)) { const entries=[]; for (let i=1;i<raw.length;i+=2) { const item=parse(raw[i]); if(item) entries.push(item); } return entries; } return Object.values(raw).map(parse).filter(Boolean); }
async function one(key,id) { const raw=await redis('HGET',key,id); return raw ? parse(raw) : null; }
async function settings() { const raw=await redis('GET',KEY.settings); return raw ? parse(raw) || DEFAULT_SETTINGS : DEFAULT_SETTINGS; }
function cookie(req,name) { return (req.headers.cookie || '').split(';').map(s=>s.trim()).find(s=>s.startsWith(name+'='))?.slice(name.length+1); }
function signature(value) { return createHmac('sha256',process.env.SESSION_SECRET).update(value).digest('hex'); }
export function isAdmin(req) { const token=cookie(req,'laura_admin'); if (!token) return false; const [expiry,sig]=token.split('.'); if (!expiry || !sig || Number(expiry)<Date.now()) return false; const expected=signature(expiry); const a=Buffer.from(sig,'hex'), b=Buffer.from(expected,'hex'); return a.length===b.length && timingSafeEqual(a,b); }
function sendCookie(res,value,maxAge) { res.setHeader('Set-Cookie',`laura_admin=${value}; HttpOnly; Secure; SameSite=Lax; Path=/api; Max-Age=${maxAge}`); }
function equalPassword(input) { const a=Buffer.from(String(input||'')), b=Buffer.from(process.env.ADMIN_PASSWORD||''); return a.length===b.length && timingSafeEqual(a,b); }
function cleanGift(g,token,admin) { const reservations=giftReservations(g); const { reservedBy, reservations: privateReservations, ...details }=g; return { ...details, quantity:g.quantity || 1, reservedCount:reservations.length, reservedByMe:!!token && reservations.includes(token), ...(admin ? { reservations } : {}) }; }
async function snapshot(token,admin) {
  const [s,guests,gifts,photos,photoOrder] = await Promise.all([settings(), admin ? all(KEY.guests) : Promise.resolve([]), all(KEY.gifts), all(KEY.photos), redis('GET',KEY.photoOrder)]);
  const guest=token ? await one(KEY.guests,token) : null;
  return { settings:s, guests, gifts:gifts.map(g=>cleanGift(g,token,admin)), photos:orderPhotos([...DEFAULT_PHOTOS,...photos],parse(photoOrder)), guest: guest ? { id:guest.id,name:guest.name,status:guest.status,adults:guest.adults,children:guest.children,members:membersOf(guest) } : null };
}
export default async function handler(req,res) {
  res.setHeader('Cache-Control','no-store');
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN || !process.env.ADMIN_PASSWORD || !process.env.SESSION_SECRET) return fail(res,503,'Configure as variáveis de ambiente para ativar os dados compartilhados.');
  try {
    const token=text(req.query.convite,100);
    const action=text(req.query.action,30);
    if (req.method==='GET') { const admin=req.query.scope==='admin'; if (admin && !isAdmin(req)) return fail(res,401,'Entre com a senha de administrador.'); return res.status(200).json(await snapshot(token,admin)); }
    if (req.method!=='POST') return fail(res,405,'Método não permitido.');
    const body=req.body || {};
    if (action==='login') {
      const ip=String(req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
      const attemptKey=PREFIX+'login:'+signature(ip);
      const attempts=Number(await redis('INCR',attemptKey));
      if (attempts===1) await redis('EXPIRE',attemptKey,900);
      if (attempts>10) return fail(res,429,'Muitas tentativas. Aguarde 15 minutos.');
      if (text(body.username,80).toLowerCase() !== (process.env.ADMIN_USERNAME || 'luana').toLowerCase() || !equalPassword(body.password)) return fail(res,401,'Usuário ou senha incorretos.');
      await redis('DEL',attemptKey);
      const expiry=String(Date.now()+7*86400000);
      sendCookie(res,`${expiry}.${signature(expiry)}`,604800);
      return res.status(200).json({ ok:true });
    }
    if (action==='logout') { sendCookie(res,'',0); return res.status(200).json({ ok:true }); }
    if (action==='rsvp') { const guest=await one(KEY.guests,token); if (!guest) return fail(res,404,'Convite não encontrado.'); try { Object.assign(guest, answerGuest(guest, body.members)); } catch (error) { return fail(res,400,error.message); } await redis('HSET',KEY.guests,token,JSON.stringify(guest)); return res.status(200).json(await snapshot(token,false)); }
    if (action==='reserveGift' || action==='unreserveGift') {
      const result=await redis('EVAL',GIFT_CHANGE,2,KEY.gifts,KEY.guests,text(body.id,100),action==='reserveGift' ? 'reserve' : 'unreserve',token);
      if (result==='missing') return fail(res,404,'Presente não encontrado.');
      if (result==='guest') return fail(res,404,'Abra seu convite pessoal.');
      if (result==='full') return fail(res,409,'Todas as unidades deste presente já foram escolhidas.');
      if (result==='forbidden') return fail(res,403,'Reserva indisponível.');
      return res.status(200).json(await snapshot(token,false));
    }
    if (!isAdmin(req)) return fail(res,401,'Acesso restrito à família.');
    if (action==='addGuest') { const name=text(body.name,80); const adults=Number(body.adults), children=Number(body.children); if (!name) return fail(res,400,'Informe o nome do convidado.'); if (!Number.isInteger(adults) || !Number.isInteger(children) || adults<0 || children<0 || adults+children<1 || adults>99 || children>99) return fail(res,400,'Informe quantidades válidas de adultos e crianças.'); const guest={id:randomUUID(),name,adults,children,status:'pending'}; await redis('HSET',KEY.guests,guest.id,JSON.stringify(guest)); }
    else if (action==='updateGuest') { const id=text(body.id,100); const guest=await one(KEY.guests,id); const name=text(body.name,80); const adults=Number(body.adults), children=Number(body.children); if (!guest) return fail(res,404,'Convidado não encontrado.'); if (!name) return fail(res,400,'Informe o nome do convidado.'); if (!Number.isInteger(adults) || !Number.isInteger(children) || adults<0 || children<0 || adults+children<1 || adults>99 || children>99) return fail(res,400,'Informe quantidades válidas de adultos e crianças.'); Object.assign(guest, resizeGuest(guest,adults,children), {name}); await redis('HSET',KEY.guests,id,JSON.stringify(guest)); }
    else if (action==='deleteGuest') { const id=text(body.id,100); await redis('HDEL',KEY.guests,id); const gifts=await all(KEY.gifts); for (const gift of gifts.filter(g=>giftReservations(g).includes(id))) { await redis('EVAL',GIFT_CHANGE,2,KEY.gifts,KEY.guests,gift.id,'unreserve',id); } }
    else if (action==='addGift' || action==='updateGift') {
      const name=text(body.name,100), shopUrl=text(body.shopUrl,1000), imageUrl=text(body.imageUrl,1000), quantity=Number(body.quantity ?? 1);
      if (!name) return fail(res,400,'Informe o presente.');
      if (!Number.isInteger(quantity) || quantity<1 || quantity>999) return fail(res,400,'Informe uma quantidade de 1 a 999.');
      if (shopUrl && (!/^https?:\/\//i.test(shopUrl) || !validUrl(shopUrl))) return fail(res,400,'Link da loja inválido.');
      if (imageUrl && !validUrl(imageUrl)) return fail(res,400,'Foto inválida.');
      const details={name,note:text(body.note,180),shopUrl,imageUrl,quantity};
      if (action==='addGift') { const gift={id:randomUUID(),...details,reservations:[]}; await redis('HSET',KEY.gifts,gift.id,JSON.stringify(gift)); }
      else {
        const result=await redis('EVAL',GIFT_CHANGE,2,KEY.gifts,KEY.guests,text(body.id,100),'update',JSON.stringify(details));
        if (result==='missing') return fail(res,404,'Presente não encontrado.');
        if (result==='quantity') return fail(res,409,'A quantidade não pode ser menor que o número de unidades reservadas.');
      }
    }
    else if (action==='deleteGift') { const id=text(body.id,100); await redis('HDEL',KEY.gifts,id); await redis('DEL',PREFIX+'reserve:'+id); }
    else if (action==='reorderPhotos') { const photos=[...DEFAULT_PHOTOS,...await all(KEY.photos)]; try { validatePhotoOrder(photos,body.ids); } catch (error) { return fail(res,409,error.message); } await redis('SET',KEY.photoOrder,JSON.stringify(body.ids)); }
    else if (action==='addPhoto') { const url=text(body.url,1000); if (!validUrl(url)) return fail(res,400,'Endereço de imagem inválido.'); const photo={id:randomUUID(),createdAt:Date.now(),url,caption:text(body.caption,100)||'Laura'}; await redis('HSET',KEY.photos,photo.id,JSON.stringify(photo)); }
    else if (action==='deletePhoto') { const id=text(body.id,100); if (DEFAULT_PHOTOS.some(p=>p.id===id)) return fail(res,400,'As imagens iniciais fazem parte do site.'); const photo=await one(KEY.photos,id); if (photo?.url && photo.url.includes('.blob.vercel-storage.com/')) { const {del}=await import('@vercel/blob'); await del(photo.url); } await redis('HDEL',KEY.photos,id); }
    else if (action==='settings') { const s=body.settings||{}; if (Number.isNaN(new Date(s.date).getTime()) || !text(s.venue,120) || !text(s.address,180)) return fail(res,400,'Confira data, local e endereço.'); if (s.mapUrl && !validUrl(s.mapUrl)) return fail(res,400,'Link do mapa inválido.'); await redis('SET',KEY.settings,JSON.stringify({date:s.date,venue:text(s.venue,120),address:text(s.address,180),mapUrl:text(s.mapUrl,1000)})); }
    else return fail(res,400,'Ação desconhecida.');
    return res.status(200).json(await snapshot(token,true));
  } catch (error) { return fail(res,500,error.message || 'Erro no servidor.'); }
}
