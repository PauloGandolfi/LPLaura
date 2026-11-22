import test from 'node:test';
import assert from 'node:assert/strict';
import { membersOf, answerGuest, resizeGuest, guestSummary } from '../src/guests.js';

test('legacy answers count people by age, including children-only invitations', () => {
  const guests = [{ adults:2, children:1, status:'yes' }, { adults:0, children:2, status:'no' }, { name:'Legacy', status:'pending' }];
  assert.deepEqual(guestSummary(guests), {total:6,adults:3,children:3});
  assert.deepEqual(guestSummary(guests,'yes'), {total:3,adults:2,children:1});
  assert.deepEqual(guestSummary(guests,'no'), {total:2,adults:0,children:2});
});
test('individual answers and companions survive saving and resizing', () => {
  const guest = {adults:2,children:1,status:'yes'};
  const people = membersOf(guest);
  people[1].status='no';
  people.push({id:'new-child',type:'child',name:'Ana',status:'yes'});
  const saved=answerGuest(guest,people);
  assert.equal(saved.status,'mixed');
  assert.deepEqual(guestSummary([saved],'yes'),{total:3,adults:1,children:2});
  assert.deepEqual(membersOf(saved),people);
  const resized=resizeGuest(saved,3,2);
  assert.equal(resized.members.filter(p=>p.status==='pending').length,1);
  assert.equal(resized.members.find(p=>p.id==='new-child').name,'Ana');
  assert.equal(resized.members.find(p=>p.id==='adult-1').status,'no');
});
test('invalid responses cannot remove people, change categories, or duplicate ids', () => {
  const guest={adults:1,children:1,status:'pending'};
  const people=membersOf(guest);
  assert.throws(()=>answerGuest(guest,people.slice(0,1)));
  assert.throws(()=>answerGuest(guest,[people[0],people[0]]));
  assert.throws(()=>answerGuest(guest,[{...people[0],type:'child'},people[1]]));
  assert.throws(()=>answerGuest(guest,[...people,{id:'extra',type:'adult',name:'',status:'yes'}]));
  assert.throws(()=>answerGuest(guest,[{...people[0],status:'invalid'},people[1]]));
});
import handler, { KEY } from '../api/data.js';

test('API saves individual replies and companions and returns them on reopening', async () => {
  const previousFetch=globalThis.fetch;
  const keys=['UPSTASH_REDIS_REST_URL','UPSTASH_REDIS_REST_TOKEN','ADMIN_PASSWORD','SESSION_SECRET'];
  const previousEnv=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
  keys.forEach(k=>process.env[k]='test');
  let saved={id:'family',name:'Família',adults:1,children:1,status:'pending'};
  globalThis.fetch=async (_,options)=>{
    const [command,key,id,value]=JSON.parse(options.body);
    let result=null;
    if(command==='HGET' && key===KEY.guests && id==='family') result=JSON.stringify(saved);
    if(command==='HSET') { saved=JSON.parse(value); result=1; }
    if(command==='HGETALL') result=[];
    return {ok:true,json:async()=>({result})};
  };
  try {
    let code,body;
    const res={setHeader(){},status(value){code=value;return this;},json(value){body=value;}};
    const members=membersOf(saved).map(p=>({...p,status:p.type==='adult'?'yes':'no'}));
    members.push({id:'companion',type:'adult',name:'João',status:'yes'});
    await handler({method:'POST',query:{action:'rsvp',convite:'family'},headers:{},body:{members}},res);
    assert.equal(code,200);
    assert.equal(saved.adults,2);
    assert.deepEqual(body.guest.members,members);
    await handler({method:'GET',query:{convite:'family'},headers:{}},res);
    assert.deepEqual(body.guest.members,members);
    assert.deepEqual(body.guests,[]);
    await handler({method:'POST',query:{action:'rsvp',convite:'family'},headers:{},body:{members:[]}},res);
    assert.equal(code,400);
    assert.equal(saved.members.length,3);
  } finally {
    globalThis.fetch=previousFetch;
    keys.forEach(k=>{if(previousEnv[k]===undefined) delete process.env[k];else process.env[k]=previousEnv[k];});
  }
});
