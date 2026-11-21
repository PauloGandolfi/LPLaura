// Read and change reservations atomically so simultaneous requests cannot overbook.
export const GIFT_CHANGE = `
local raw = redis.call('HGET', KEYS[1], ARGV[1])
if not raw then return 'missing' end
local gift = cjson.decode(raw)
local reservations = gift.reservations or {}
if not gift.reservations and gift.reservedBy and gift.reservedBy ~= cjson.null then
  table.insert(reservations, gift.reservedBy)
end
local action = ARGV[2]
local token = ARGV[3]
local found = nil
for i, value in ipairs(reservations) do if value == token then found = i end end
if action == 'reserve' then
  if not redis.call('HGET', KEYS[2], token) then return 'guest' end
  if not found then
    if #reservations >= (gift.quantity or 1) then return 'full' end
    table.insert(reservations, token)
  end
elseif action == 'unreserve' then
  if not found then return 'forbidden' end
  table.remove(reservations, found)
elseif action == 'update' then
  local changes = cjson.decode(ARGV[3])
  if changes.quantity < #reservations then return 'quantity' end
  for key, value in pairs(changes) do gift[key] = value end
end
gift.reservations = reservations
gift.reservedBy = nil
redis.call('HSET', KEYS[1], ARGV[1], cjson.encode(gift))
return 'ok'
`;

export function giftReservations(gift) {
  return Array.isArray(gift.reservations) ? gift.reservations : gift.reservedBy ? [gift.reservedBy] : [];
}
