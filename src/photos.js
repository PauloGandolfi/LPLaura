export function orderPhotos(photos, order = []) {
  const positions = new Map((Array.isArray(order) ? order : []).map((id, index) => [id, index]));
  return [...photos].sort((a, b) => {
    const rank = (positions.get(a.id) ?? Infinity) - (positions.get(b.id) ?? Infinity);
    return (Number.isNaN(rank) ? 0 : rank) || (a.createdAt || 0) - (b.createdAt || 0) || a.id.localeCompare(b.id);
  });
}
export function validatePhotoOrder(photos, ids) {
  if (!Array.isArray(ids) || ids.length !== photos.length || new Set(ids).size !== ids.length || ids.some(id => !photos.some(p => p.id === id))) {
    throw new Error('O álbum mudou. Atualize a página e tente ordenar novamente.');
  }
  return ids;
}
