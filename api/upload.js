import { randomUUID } from 'node:crypto';
import { put, del } from '@vercel/blob';
import { isAdmin, redis, KEY } from './data.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error:'Método não permitido.' });
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN || !process.env.SESSION_SECRET) return res.status(503).json({ error:'Configure o armazenamento compartilhado antes de publicar fotos.' });
  if (!isAdmin(req)) return res.status(401).json({ error:'Entre na área da família para publicar fotos.' });
  if (!process.env.BLOB_STORE_ID && !process.env.BLOB_READ_WRITE_TOKEN) return res.status(503).json({ code:'BLOB_NOT_CONFIGURED', error:'O armazenamento de fotos não está conectado a este ambiente. Conecte o Blob ao projeto Vercel e publique novamente.' });
  const image = req.body?.image;
  if (typeof image !== 'string' || image.length > 3_500_000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(image)) return res.status(400).json({ error:'Foto inválida ou grande demais.' });
  const bytes = Buffer.from(image, 'base64');
  if (bytes.length > 2_700_000 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) return res.status(400).json({ error:'A imagem não pôde ser preparada. Envie um arquivo JPEG, PNG ou WebP válido com até 20 MB.' });
  const caption = String(req.body?.caption || 'Laura').trim().slice(0,100) || 'Laura';
  let blob;
  try {
    blob = await put(`laura/fotos/${randomUUID()}.jpg`, bytes, { access:'public', contentType:'image/jpeg', addRandomSuffix:true, ...(process.env.BLOB_STORE_ID ? { storeId:process.env.BLOB_STORE_ID } : {}) });
    if (req.body?.purpose === 'gift') return res.status(200).json({ imageUrl:blob.url });
    const photo = { id:randomUUID(), url:blob.url, caption };
    await redis('HSET', KEY.photos, photo.id, JSON.stringify(photo));
    return res.status(200).json({ photo });
  } catch (error) {
    if (blob?.url) { try { await del(blob.url); } catch {} }
    const message = String(error?.message || '');
    if (/no blob credentials|blob credentials found/i.test(message)) return res.status(503).json({ code:'BLOB_NOT_CONFIGURED', error:'A Vercel não forneceu credenciais do Blob para este deploy. Confira a conexão do store ao projeto e o ambiente Production, depois publique novamente.' });
    return res.status(500).json({ error:'Não foi possível publicar a foto agora. Tente novamente em alguns instantes.' });
  }
}
