const types = ['adult', 'child'];
export function membersOf(guest) {
  if (Array.isArray(guest.members)) return guest.members.map(p => ({ ...p }));
  return types.flatMap(type => Array.from({ length: Number(type === 'adult' ? guest.adults ?? 1 : guest.children ?? 0) }, (_, i) => ({
    id: `${type}-${i}`, type, name: '', status: ['yes', 'no'].includes(guest.status) ? guest.status : 'pending'
  })));
}
export function withMembers(guest, members) {
  const statuses = new Set(members.map(p => p.status));
  return { ...guest, members, adults: members.filter(p => p.type === 'adult').length, children: members.filter(p => p.type === 'child').length,
    status: statuses.size === 1 ? members[0].status : 'mixed' };
}
export function resizeGuest(guest, adults, children) {
  const previous = membersOf(guest);
  const members = types.flatMap(type => {
    const kept = previous.filter(p => p.type === type).slice(0, type === 'adult' ? adults : children);
    while (kept.length < (type === 'adult' ? adults : children)) kept.push({ id: crypto.randomUUID(), type, name: '', status: 'pending' });
    return kept;
  });
  return withMembers(guest, members);
}
export function answerGuest(guest, input) {
  if (!Array.isArray(input) || !input.length || input.length > 198) throw new Error('Informe as respostas dos convidados.');
  const previous = membersOf(guest);
  const seen = new Set();
  const members = input.map(p => {
    if (!p || typeof p.id !== 'string' || !p.id || p.id.length > 100 || seen.has(p.id) || !types.includes(p.type) || !['yes', 'no', 'pending'].includes(p.status)) throw new Error('Resposta individual inválida.');
    seen.add(p.id);
    const old = previous.find(x => x.id === p.id);
    const name = String(p.name || '').trim().slice(0, 80);
    if (old && old.type !== p.type) throw new Error('A categoria do convidado não pode ser alterada.');
    if (!old && !name) throw new Error('Informe o nome de cada novo acompanhante.');
    return { id: p.id, type: p.type, name, status: p.status };
  });
  if (previous.some(p => !seen.has(p.id))) throw new Error('Responda por todos os convidados do convite.');
  if (types.some(type => members.filter(p => p.type === type).length > 99)) throw new Error('O limite é de 99 adultos e 99 crianças por convite.');
  return withMembers(guest, members);
}
export function guestSummary(guests, status) {
  const people = guests.flatMap(membersOf).filter(p => !status || p.status === status);
  return { total: people.length, adults: people.filter(p => p.type === 'adult').length, children: people.filter(p => p.type === 'child').length };
}
