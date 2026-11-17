const DEFAULT_SETTINGS = { date: '2027-02-28T15:00:00-03:00', venue: 'Salão de Festas 2', address: 'Rua Presidente João Goulart, 585', mapUrl: 'https://www.google.com/maps/search/?api=1&query=Rua%20Presidente%20Jo%C3%A3o%20Goulart%2C%20585' };
const DEFAULT_PHOTOS = [
  { id: 'laura-art', url: './images/laura-princesa.png', caption: 'Nossa pequena princesa' },
  { id: 'laura-invite', url: './images/convite-laura.png', caption: 'O convite da Laura' }
];
const STORAGE_KEY = 'laura-party-v1';
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_IMAGE_FILE_SIZE = 20 * 1024 * 1024;
const pageParams = new URLSearchParams(location.search);
const inviteToken = pageParams.get('convite');
const familyAccess = pageParams.has('familia');
const previewOnly = () => mode === 'offline';
const $ = (selector) => document.querySelector(selector);
const esc = (value = '') => String(value).replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[char]);
const safeUrl = (value) => { if (/^data:image\/(?:jpeg|png|webp);base64,/i.test(value)) return value; try { const u = new URL(value, location.href); return ['http:', 'https:', 'file:'].includes(u.protocol) ? u.href : ''; } catch { return ''; } };
const localRead = () => { try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || null; } catch { return null; } };
const localWrite = (data) => localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
const initialLocal = () => ({ settings: DEFAULT_SETTINGS, guests: [], gifts: [], photos: DEFAULT_PHOTOS });
let mode = 'loading';
let admin = false;
let state = { settings: DEFAULT_SETTINGS, guests: [], gifts: [], photos: DEFAULT_PHOTOS, guest: null };
let activeTab = 'guests';
let guestFilter = 'all';
let allPhotos = false;
let toastTimer;

function toast(message) { const el = $('#toast'); el.textContent = message; el.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 3400); }
async function api(action, body, adminScope = false) {
  const url = new URL('/api/data', location.origin);
  if (action) url.searchParams.set('action', action);
  if (adminScope) url.searchParams.set('scope', 'admin');
  if (inviteToken) url.searchParams.set('convite', inviteToken);
  const response = await fetch(url, body === undefined ? { credentials:'same-origin' } : { method:'POST', credentials:'same-origin', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) });
  let result; try { result = await response.json(); } catch { throw new Error('Serviço indisponível'); }
  if (!response.ok) throw new Error(result.error || 'Não foi possível concluir');
  return result;
}
function useLocal() { mode = 'local'; state = { ...initialLocal(), ...(localRead() || {}) }; state.guest = state.guests.find(g => g.id === inviteToken) || null; }
async function loadPublic() {
  try { const result = await api(); mode = 'cloud'; state = { ...state, ...result }; }
  catch { if (location.protocol === 'file:' || ['localhost', '127.0.0.1'].includes(location.hostname)) useLocal(); else { mode = 'offline'; state = { ...initialLocal(), guest:null }; } }
  renderPublic();
}
async function loadAdmin() {
  if (mode === 'local') { admin = true; renderAdmin(); return; }
  if (mode === 'offline') { admin = false; renderAdmin(); return; }
  try { const result = await api('', undefined, true); state = { ...state, ...result }; admin = true; renderAdmin(); }
  catch { admin = false; renderAdmin(); }
}
async function mutate(action, payload = {}) {
  if (mode === 'offline') throw new Error('Painel indisponível. Confira a configuração do servidor.');
  if (mode === 'cloud') { const result = await api(action, payload); state = { ...state, ...result }; if (admin) await loadAdmin(); else renderPublic(); return result; }
  const data = localRead() || initialLocal();
  const id = () => crypto.randomUUID();
  switch (action) {
    case 'addGuest': data.guests.push({ id: id(), name: payload.name.trim(), adults: Number(payload.adults) || 0, children: Number(payload.children) || 0, status: 'pending' }); break;
    case 'deleteGuest': data.guests = data.guests.filter(x => x.id !== payload.id); data.gifts = data.gifts.map(g => g.reservedBy === payload.id ? { ...g, reservedBy: null } : g); break;
    case 'rsvp': { const g = data.guests.find(x => x.id === inviteToken); if (!g) throw new Error('Convite não encontrado'); g.status = payload.status; break; }
    case 'addGift': data.gifts.push({ id: id(), name: payload.name.trim(), note: payload.note?.trim() || '', reservedBy: null }); break;
    case 'deleteGift': data.gifts = data.gifts.filter(x => x.id !== payload.id); break;
    case 'reserveGift': { const g = data.gifts.find(x => x.id === payload.id); if (!g || g.reservedBy) throw new Error('Presente indisponível'); if (!data.guests.some(x => x.id === inviteToken)) throw new Error('Abra seu convite pessoal'); g.reservedBy = inviteToken; break; }
    case 'unreserveGift': { const g = data.gifts.find(x => x.id === payload.id); if (!g || g.reservedBy !== inviteToken) throw new Error('Reserva indisponível'); g.reservedBy = null; break; }
    case 'addPhoto': data.photos.push({ id: id(), url: payload.url.trim(), caption: payload.caption?.trim() || 'Laura' }); break;
    case 'deletePhoto': data.photos = data.photos.filter(x => x.id !== payload.id); break;
    case 'settings': data.settings = payload.settings; break;
  }
  localWrite(data); state = { ...data, guest: data.guests.find(g => g.id === inviteToken) || null }; renderPublic(); if (admin) renderAdmin(); return state;
}
function formatDate(iso, options) { const date = new Date(iso); return Number.isNaN(date.getTime()) ? 'Data a definir' : new Intl.DateTimeFormat('pt-BR', { timeZone:'America/Sao_Paulo', ...options }).format(date); }
function renderCountdown() {
  const diff = Math.max(0, new Date(state.settings.date).getTime() - Date.now());
  const vals = [Math.floor(diff / 86400000), Math.floor(diff / 3600000) % 24, Math.floor(diff / 60000) % 60, Math.floor(diff / 1000) % 60];
  $('#countdown').querySelectorAll('strong').forEach((el, i) => el.textContent = String(vals[i]).padStart(2, '0'));
}
function renderPublic() {
  const s = state.settings || DEFAULT_SETTINGS;
  $('#event-date').textContent = formatDate(s.date, { day:'numeric', month:'long' }) + ' · ' + formatDate(s.date, { hour:'numeric', minute:'2-digit' });
  $('#detail-date').textContent = formatDate(s.date, { day:'numeric', month:'long', year:'numeric' });
  $('#detail-time').textContent = 'A partir das ' + formatDate(s.date, { hour:'numeric', minute:'2-digit' });
  $('#detail-venue').textContent = s.venue;
  $('#detail-address').textContent = s.address;
  $('#map-link').href = safeUrl(s.mapUrl) || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(s.address)}`;
  renderCountdown(); renderRsvp(); renderGifts(); renderPhotos();
}
function renderRsvp() {
  const guest = state.guest;
  const controls = $('#rsvp-controls');
  if (previewOnly()) { $('#invite-message').textContent = 'As confirmações estarão disponíveis após configurar o banco de dados do site.'; controls.innerHTML = ''; $('#rsvp-note').textContent = 'Esta publicação está em modo de demonstração.'; return; }
  if (!guest) { $('#invite-message').textContent = 'Abra o link pessoal enviado pela família para confirmar sua presença.'; controls.innerHTML = ''; $('#rsvp-note').textContent = ''; return; }
  $('#invite-message').innerHTML = `<span class="guest-greeting">Olá, ${esc(guest.name)}!</span><br>Será uma alegria ter você com a gente. Pode confirmar sua presença?`;
  controls.innerHTML = `<button class="button ${guest.status === 'yes' ? 'button-primary' : 'button-outline'}" data-rsvp="yes">♡ Vou sim!</button><button class="button ${guest.status === 'no' ? 'button-primary' : 'button-outline'}" data-rsvp="no">Não poderei ir</button>`;
  $('#rsvp-note').textContent = guest.status === 'yes' ? 'Presença confirmada! Estamos esperando você. ♡' : guest.status === 'no' ? 'Sentiremos sua falta. Você pode mudar sua resposta aqui.' : 'Você poderá mudar sua resposta se precisar.';
}
function renderGifts() {
  const list = $('#gift-list');
  if (!state.gifts?.length) { list.innerHTML = `<div class="empty-state"><span>🎁</span>A lista de presentes está sendo preparada com carinho. Volte em breve!</div>`; return; }
  list.innerHTML = state.gifts.map(g => { const mine = g.reservedBy && g.reservedBy === inviteToken; const reserved = Boolean(g.reservedBy); return `<article class="gift-card"><div class="gift-icon">🎁</div><div class="gift-info"><strong>${esc(g.name)}</strong><small>${esc(g.note || (reserved ? 'Já escolhido com carinho' : 'Disponível para escolher'))}</small></div><button data-gift="${esc(g.id)}" ${previewOnly() || !state.guest || (reserved && !mine) ? 'disabled' : ''}>${mine ? 'Desfazer' : reserved ? 'Reservado' : 'Escolher'}</button></article>`; }).join('');
}
function renderPhotos() {
  const photos = state.photos?.length ? state.photos : DEFAULT_PHOTOS;
  const visible = allPhotos ? photos : photos.slice(0, 5);
  $('#photo-grid').innerHTML = visible.map(p => `<button data-photo="${esc(p.id)}" aria-label="Abrir foto: ${esc(p.caption)}"><img src="${esc(safeUrl(p.url))}" alt="${esc(p.caption)}" loading="lazy"></button>`).join('');
  $('#gallery-more').hidden = photos.length <= 5; $('#gallery-more').textContent = allPhotos ? 'Mostrar menos ↑' : 'Ver todas as fotos ↗';
}
function prepareImage(file) {
  return new Promise((resolve, reject) => {
    if (!file || !ALLOWED_IMAGE_TYPES.has(file.type)) return reject(new Error('Escolha uma imagem JPEG, PNG ou WebP.'));
    if (file.size > MAX_IMAGE_FILE_SIZE) return reject(new Error('A imagem deve ter no máximo 20 MB.'));
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const max = 1600;
        const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.naturalWidth * scale);
        canvas.height = Math.round(img.naturalHeight * scale);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', .82);
        URL.revokeObjectURL(objectUrl);
        if (dataUrl.length > 3_500_000) return reject(new Error('A foto ficou grande demais. Escolha outra imagem.'));
        resolve(dataUrl);
      } catch { URL.revokeObjectURL(objectUrl); reject(new Error('Não foi possível preparar a foto.')); }
    };
    img.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error('Formato de imagem não suportado neste navegador.')); };
    img.src = objectUrl;
  });
}
async function uploadPhoto(file, caption) {
  const dataUrl = await prepareImage(file);
  if (mode === 'local') return mutate('addPhoto', { url:dataUrl, caption });
  const response = await fetch('/api/upload', { method:'POST', credentials:'same-origin', headers:{ 'Content-Type':'application/json' }, body:JSON.stringify({ image:dataUrl.split(',')[1], caption }) });
  let result;
  try { result = await response.json(); }
  catch {
    if (response.status === 413) throw new Error('A imagem ficou grande demais para enviar. Escolha uma imagem menor.');
    throw new Error('Não foi possível concluir o envio. Verifique sua conexão e tente novamente.');
  }
  if (!response.ok) throw new Error(result.error || 'Falha no envio da foto.');
  if (!result.photo?.id || !result.photo?.url) throw new Error('A foto foi enviada, mas o servidor não confirmou o salvamento.');
  state.photos = [...(state.photos || []), result.photo];
  renderPublic();
  if (admin) renderAdmin();
  return result;
}
function renderAdmin() {
  const box = $('#admin-content');
  if (mode === 'offline') { box.innerHTML = '<div class="admin-banner">O painel está indisponível. Configure as variáveis do Redis e de acesso na Vercel e faça um novo deploy.</div>'; return; }
  if (!admin) { box.innerHTML = `<div class="login-box"><h3>Bem-vindo à área da família</h3><p class="admin-hint">Entre com seu usuário e senha para editar o convite.</p><form id="login-form" class="admin-form"><label>Usuário<input name="username" required autocomplete="username" autocapitalize="none" spellcheck="false"></label><label>Senha<input type="password" name="password" required autocomplete="current-password"></label><button class="button button-primary">Entrar</button></form></div>`; return; }
  const tabs = [['guests','Convidados'],['gifts','Presentes'],['photos','Álbum'],['settings','Evento']];
  box.innerHTML = `${mode === 'local' ? '<div class="admin-banner">Modo local: as alterações ficam apenas neste navegador. Para compartilhar dados entre convidados, configure o banco no deploy.</div>' : '<div class="admin-banner success">Dados compartilhados estão ativos.</div>'}<div class="admin-tabs">${tabs.map(([id,label]) => `<button data-tab="${id}" class="${activeTab === id ? 'active' : ''}">${label}</button>`).join('')}</div><div class="admin-panel">${adminPanel()}</div><div class="admin-toolbar"><span class="admin-hint">${mode === 'local' ? 'Prévia local' : 'Painel protegido'}</span>${mode === 'cloud' ? '<button id="admin-logout">Sair</button>' : ''}</div>`;
}
function adminPanel() {
  if (activeTab === 'guests') {
    const guests = state.guests || [];
    const adults = guests.reduce((sum, g) => sum + (Number(g.adults ?? 1) || 0), 0);
    const children = guests.reduce((sum, g) => sum + (Number(g.children) || 0), 0);
    const total = adults + children;
    const filtered = guests.filter(g => guestFilter === 'all' || (guestFilter === 'adults' ? Number(g.adults ?? 1) > 0 : Number(g.children) > 0));
    return `<h3>Lista de convidados</h3><p>Informe quantos adultos e crianças estão incluídos em cada convite.</p><form id="guest-form" class="admin-form"><label>Nome do convidado<input name="name" required maxlength="80" placeholder="Ex.: Maria e família"></label><div class="guest-count-fields"><label>Adultos<input type="number" name="adults" min="0" max="99" value="1" required></label><label>Crianças<input type="number" name="children" min="0" max="99" value="0" required></label></div><button class="button button-primary">+ Adicionar convidado</button></form><section class="guest-summary" aria-label="Resumo de convidados"><div><strong>${total}</strong><span>Total de pessoas</span></div><div><strong>${adults}</strong><span>Adultos</span></div><div><strong>${children}</strong><span>Crianças</span></div></section><div class="guest-filters" role="group" aria-label="Filtrar convidados">${[['all','Todos'],['adults','Adultos'],['children','Crianças']].map(([filter,label]) => `<button type="button" data-guest-filter="${filter}" class="${guestFilter === filter ? 'active' : ''}">${label}</button>`).join('')}</div>${filtered.length ? filtered.map(g => { const a = Number(g.adults ?? 1) || 0; const c = Number(g.children) || 0; return `<div class="admin-row ${g.status === 'yes' ? 'guest-confirmed' : ''}"><div class="admin-row-text"><strong>${esc(g.name)}</strong><small>${a} ${a === 1 ? 'adulto' : 'adultos'} · ${c} ${c === 1 ? 'criança' : 'crianças'} · ${g.status === 'yes' ? '✓ Confirmou presença' : g.status === 'no' ? '✕ Não poderá ir' : 'Aguardando resposta'}</small></div><button data-copy="${esc(g.id)}">Copiar link</button><button class="danger" data-delete-guest="${esc(g.id)}" aria-label="Excluir ${esc(g.name)}">×</button></div>`; }).join('') : '<div class="empty-state">Nenhum convidado nesta categoria.</div>'}`;
  }
  if (activeTab === 'gifts') return `<h3>Lista de presentes</h3><p>Os convidados podem escolher um item disponível no link pessoal.</p><form id="gift-form" class="admin-form"><label>Presente<input name="name" required maxlength="100" placeholder="Ex.: Livros infantis"></label><label>Detalhes (opcional)<input name="note" maxlength="180" placeholder="Tamanho, cor ou sugestão"></label><button class="button button-primary">+ Adicionar presente</button></form>${state.gifts.length ? state.gifts.map(g => `<div class="admin-row"><div class="admin-row-text"><strong>${esc(g.name)}</strong><small>${esc(g.note || '')}${g.reservedBy ? ' · Reservado' : ' · Disponível'}</small></div><button class="danger" data-delete-gift="${esc(g.id)}">Excluir</button></div>`).join('') : '<div class="empty-state">A lista está vazia.</div>'}`;
  if (activeTab === 'photos') return `<h3>Álbum de fotos</h3><p>Escolha uma imagem JPEG, PNG ou WebP de até 20 MB. Ela será preparada e publicada no álbum.</p><form id="photo-form" class="admin-form"><label>Foto<input type="file" name="file" accept="image/jpeg,image/png,image/webp" required></label><label>Legenda<input name="caption" maxlength="100" placeholder="Um momento especial"></label><button class="button button-primary">+ Publicar foto</button></form><details class="advanced-photo"><summary>Adicionar por link</summary><form id="photo-link-form" class="admin-form"><label>Endereço da imagem<input name="url" required placeholder="https://... ou ./images/foto.jpg"></label><label>Legenda<input name="caption" maxlength="100" placeholder="Um momento especial"></label><button class="button button-outline">Adicionar link</button></form></details>${state.photos.map(p => `<div class="admin-row"><div class="admin-row-text"><strong>${esc(p.caption)}</strong><small>${p.url.startsWith('data:') ? 'Foto salva neste navegador' : esc(p.url)}</small></div>${mode === 'cloud' && p.id.startsWith('laura-') ? '' : `<button class="danger" data-delete-photo="${esc(p.id)}">Excluir</button>`}</div>`).join('')}`;
  const s = state.settings; const localDate = new Date(s.date); const dateValue = Number.isNaN(localDate.getTime()) ? '' : new Intl.DateTimeFormat('sv-SE', { timeZone:'America/Sao_Paulo', year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' }).format(localDate).replace(' ', 'T');
  return `<h3>Informações da festa</h3><p>Confira a data e o endereço antes de enviar os convites.</p><form id="settings-form" class="admin-form"><label>Data e horário<input type="datetime-local" name="date" value="${esc(dateValue)}" required></label><label>Nome do local<input name="venue" value="${esc(s.venue)}" required></label><label>Endereço<input name="address" value="${esc(s.address)}" required></label><label>Link do mapa (opcional)<input name="mapUrl" value="${esc(s.mapUrl)}"></label><button class="button button-primary">Salvar evento</button></form>`;
}

document.addEventListener('click', async event => {
  const target = event.target.closest('button'); if (!target) return;
  try {
    if (target.id === 'admin-open') { $('#admin-dialog').showModal(); await loadAdmin(); }
    else if (target.id === 'admin-close') $('#admin-dialog').close();
    else if (target.dataset.tab) { activeTab = target.dataset.tab; renderAdmin(); }
    else if (target.dataset.guestFilter) { guestFilter = target.dataset.guestFilter; renderAdmin(); }
    else if (target.dataset.rsvp) { await mutate('rsvp', { status:target.dataset.rsvp }); toast('Resposta salva com carinho!'); }
    else if (target.dataset.gift) { const gift = state.gifts.find(g => g.id === target.dataset.gift); await mutate(gift.reservedBy === inviteToken ? 'unreserveGift' : 'reserveGift', { id:gift.id }); toast(gift.reservedBy === inviteToken ? 'Reserva desfeita.' : 'Presente reservado! Obrigado ♡'); }
    else if (target.dataset.photo) { const photo = state.photos.find(p => p.id === target.dataset.photo); if (photo) { $('#lightbox-image').src = safeUrl(photo.url); $('#lightbox-image').alt = photo.caption; $('#lightbox-caption').textContent = photo.caption; $('#lightbox').showModal(); } }
    else if (target.id === 'lightbox-close') $('#lightbox').close();
    else if (target.id === 'gallery-more') { allPhotos = !allPhotos; renderPhotos(); }
    else if (target.dataset.copy) { const url = new URL(location.href); url.search = ''; url.hash = ''; url.searchParams.set('convite', target.dataset.copy); await navigator.clipboard.writeText(url.href); toast('Link copiado!'); }
    else if (target.dataset.deleteGuest) { if (confirm('Excluir este convidado e suas reservas?')) { await mutate('deleteGuest',{ id:target.dataset.deleteGuest }); toast('Convidado excluído.'); } }
    else if (target.dataset.deleteGift) { if (confirm('Excluir este presente?')) { await mutate('deleteGift',{ id:target.dataset.deleteGift }); toast('Presente excluído.'); } }
    else if (target.dataset.deletePhoto) { if (confirm('Excluir esta foto do álbum?')) { await mutate('deletePhoto',{ id:target.dataset.deletePhoto }); toast('Foto excluída.'); } }
    else if (target.id === 'admin-logout') { if (mode === 'cloud') await api('logout',{}); admin = false; renderAdmin(); }
  } catch (error) { toast(error.message || 'Algo deu errado. Tente novamente.'); }
});
document.addEventListener('submit', async event => {
  event.preventDefault(); const form = event.target; const data = Object.fromEntries(new FormData(form));
  try {
    if (form.id === 'login-form') { await api('login',{ username:data.username.trim(), password:data.password }); await loadAdmin(); toast('Bem-vinda!'); }
    else if (form.id === 'guest-form') { const adults=Number(data.adults), children=Number(data.children); if (adults + children < 1) throw new Error('Informe pelo menos um adulto ou uma criança.'); await mutate('addGuest',{ name:data.name, adults, children }); toast('Convidado adicionado!'); }
    else if (form.id === 'gift-form') { await mutate('addGift',{ name:data.name, note:data.note }); toast('Presente adicionado!'); }
    else if (form.id === 'photo-form') { const button=form.querySelector('button'); button.disabled=true; button.textContent='Enviando foto...'; await uploadPhoto(form.elements.file.files[0], data.caption?.trim() || 'Laura'); toast('Foto publicada no álbum!'); }
    else if (form.id === 'photo-link-form') { if (!safeUrl(data.url)) throw new Error('Use uma URL de imagem válida.'); await mutate('addPhoto',{ url:data.url, caption:data.caption }); toast('Foto adicionada!'); }
    else if (form.id === 'settings-form') { const settings = { date: `${data.date}:00-03:00`, venue:data.venue.trim(), address:data.address.trim(), mapUrl:data.mapUrl.trim() }; await mutate('settings',{ settings }); toast('Informações atualizadas!'); }
  } catch (error) { toast(error.message || 'Não foi possível salvar.'); const button=form.querySelector('button'); if (button) { button.disabled=false; if (form.id === 'photo-form') button.textContent='+ Publicar foto'; } }
});
if (familyAccess) $('#admin-open').hidden = false;
loadPublic().then(async () => {
  if (familyAccess) {
    $('#admin-dialog').showModal();
    await loadAdmin();
  }
});
setInterval(renderCountdown, 1000);
