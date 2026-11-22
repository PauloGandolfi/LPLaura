import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
import handler, { KEY } from '../api/data.js';
import * as guests from '../src/guests.js';

function app(initial, token = 'guest-a') {
  let saved = JSON.stringify(initial);
  const nodes = new Map();
  const context = vm.createContext({
    URL, URLSearchParams, crypto:webcrypto, ...guests,
    location:{ search:`?convite=${token}`, href:'http://localhost/', origin:'http://localhost' },
    localStorage:{ getItem:() => saved, setItem:(_, value) => { saved = value; } },
    document:{ addEventListener() {}, querySelector(selector) { if (!nodes.has(selector)) nodes.set(selector, {}); return nodes.get(selector); } }
  });
  let source = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  source = source.replace(/^import .*;\r?\n/gm, '');
  source = source.slice(0, source.indexOf("if (familyAccess) $('#admin-open')"));
  vm.runInContext(source + '\nrenderPublic = () => {}; renderAdmin = () => {}; useLocal();', context);
  return { run:code => vm.runInContext(code, context), data:() => JSON.parse(saved), nodes };
}

const initial = () => ({ guests:[{ id:'guest-a' },{ id:'guest-b' }], gifts:[], photos:[] });

test('create and edit gifts with quantity and photo, preserving reservations', async () => {
  const client = app(initial());
  await client.run("mutate('addGift', {name:'Livro', quantity:2, imageUrl:'https://example.com/book.jpg'})");
  const id = client.data().gifts[0].id;
  await client.run(`mutate('reserveGift', {id:${JSON.stringify(id)}})`);
  await client.run(`mutate('updateGift', {id:${JSON.stringify(id)}, name:'Livro novo', quantity:3, imageUrl:''})`);
  const gift = client.data().gifts[0];
  assert.equal(gift.name, 'Livro novo');
  assert.equal(gift.quantity, 3);
  assert.equal(gift.imageUrl, '');
  assert.deepEqual(gift.reservations, ['guest-a']);
});

test('multiple guests reserve remaining units; cancellation frees a unit', async () => {
  const data = initial(); data.gifts = [{id:'book', name:'Livro', quantity:2, reservations:['guest-b']}];
  const client = app(data);
  await client.run("mutate('reserveGift', {id:'book'})");
  assert.equal(client.data().gifts[0].reservations.length, 2);
  await assert.rejects(client.run("mutate('updateGift', {id:'book', quantity:1})"), /menor/);
  await assert.rejects(client.run("mutate('reserveGift', {id:'book'})"), /indisponível/);
  await client.run("mutate('unreserveGift', {id:'book'})");
  assert.deepEqual(client.data().gifts[0].reservations, ['guest-b']);
});

test('legacy reservations survive editing and guest deletion releases them', async () => {
  const data = initial(); data.gifts = [{id:'book', name:'Livro', reservedBy:'guest-a'}];
  const client = app(data);
  assert.equal(client.run("giftIsMine(state.gifts[0])"), true);
  await client.run("mutate('updateGift', {id:'book', name:'Novo nome', quantity:2})");
  assert.equal(client.run("giftCount(state.gifts[0])"), 1);
  await client.run("mutate('deleteGuest', {id:'guest-a'})");
  assert.equal(client.run("giftCount(state.gifts[0])"), 0);
});

test('cards place the full title before actions and show photo and availability', () => {
  const data = initial(); data.gifts = [{id:'book', name:'Livro Interativo Educativo Bilíngue Infantil com Som', quantity:3, reservations:['guest-b'], imageUrl:'https://example.com/book.jpg', shopUrl:'https://example.com'}];
  const client = app(data);
  client.run('renderGifts()');
  const html = client.nodes.get('#gift-list').innerHTML;
  assert.ok(html.indexOf(data.gifts[0].name) < html.indexOf('class="gift-actions"'));
  assert.match(html, /2 de 3 unidades disponíveis/);
  assert.match(html, /class="gift-image"/);
  client.run("state.gifts[0].imageUrl = ''; renderGifts()");
  assert.doesNotMatch(client.nodes.get('#gift-list').innerHTML, /class="gift-image"/);
});

test('public API hides reservation identities and reports legacy availability', async () => {
  const originalFetch = globalThis.fetch;
  const env = {...process.env};
  Object.assign(process.env, {UPSTASH_REDIS_REST_URL:'https://redis.test', UPSTASH_REDIS_REST_TOKEN:'test', ADMIN_PASSWORD:'test', SESSION_SECRET:'test'});
  globalThis.fetch = async (_, options) => {
    const [command, key] = JSON.parse(options.body);
    const result = command === 'HGETALL' && key === KEY.gifts ? ['book', JSON.stringify({id:'book', name:'Livro', reservedBy:'guest-a'})] : command === 'HGETALL' ? [] : null;
    return {ok:true, json:async () => ({result})};
  };
  try {
    let body;
    const res = {setHeader() {}, status(code) { assert.equal(code, 200); return this; }, json(value) { body=value; }};
    await handler({method:'GET', query:{convite:'guest-a'}, headers:{}}, res);
    assert.equal(body.gifts[0].reservedCount, 1);
    assert.equal(body.gifts[0].quantity, 1);
    assert.equal(body.gifts[0].reservedByMe, true);
    assert.equal('reservations' in body.gifts[0], false);
    assert.equal('reservedBy' in body.gifts[0], false);
  } finally { globalThis.fetch = originalFetch; for (const key of ['UPSTASH_REDIS_REST_URL','UPSTASH_REDIS_REST_TOKEN','ADMIN_PASSWORD','SESSION_SECRET']) { if (env[key] === undefined) delete process.env[key]; else process.env[key]=env[key]; } }
});
