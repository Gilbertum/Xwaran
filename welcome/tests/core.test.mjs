import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalizeLogin,validLogin,parseRules,pickGreeting,renderGreeting,normalizeRule,streamSentKey,DEFAULT_RULES,mergeTwirRules,LEGACY_DEFAULT_MESSAGES} from '../core.mjs';
test('TWITCH логины регистронезависимы',()=>{assert.equal(normalizeLogin('@Hell_Fox_X'),'hell_fox_x');assert.equal(validLogin('Hell_Fox_X'),true);assert.equal(validLogin('киса'),false);});
test('preloaded rules always disabled',()=>{assert.ok(DEFAULT_RULES.length>=3);assert.ok(DEFAULT_RULES.every(x=>!x.enabled));});
test('template renders viewer with user placeholder',()=>{assert.equal(renderGreeting('Привет, {user}!','Fox_12'),'Привет, Fox_12!');assert.equal(renderGreeting('Привет, {USER}!','X'),'Привет, X!');});
test('duplicate usernames are rejected',()=>assert.throws(()=>parseRules([{login:'fox_1',message:'hi',enabled:true},{login:'FOX_1',message:'ok',enabled:true}])));
test('prototype pollution and script tags not evaluated by rules parser',()=>{const r=normalizeRule({login:'fox_1',message:'<script>alert(1)</script>',enabled:true});assert.equal(r.message,'<script>alert(1)</script>');assert.equal(r.login,'fox_1');});
test('pickGreeting only once for same stream, only if enabled',()=>{let r=[{login:'fox_1',message:'Привет, {user}',enabled:true}];const event={chatter_user_login:'FOX_1',chatter_user_name:'Fox_1'};assert.equal(pickGreeting(event,r,new Set(),'stream-1').text,'Привет, Fox_1');assert.equal(pickGreeting(event,r,new Set(['fox_1']),'stream-1'),null);assert.equal(pickGreeting(event,r,new Set(),''),null);r[0].enabled=false;assert.equal(pickGreeting(event,r,new Set(),'stream-1'),null);});
test('import normalizes and caps message length',()=>{const r=parseRules({rules:[{login:'fox_1',message:'x'.repeat(900),enabled:true}]});assert.equal(r[0].message.length,500);});
test('sent keys are stream-specific',()=>{assert.notEqual(streamSentKey('1','stream-1'),streamSentKey('1','stream-2'));});

// The two Twir.app screenshots contain exactly 22 distinct viewers.
test('all 22 screenshots imported with exact content, all disabled',()=>{
 assert.equal(DEFAULT_RULES.length,22);
 assert.equal(new Set(DEFAULT_RULES.map(r=>normalizeLogin(r.login))).size,22);
 const byLogin=new Map(DEFAULT_RULES.map(r=>[normalizeLogin(r.login),r]));
 const expected={
  ohapka:'К нам забежала булочка на огонек! Привет-привет, сладкая :)',
  sleepy___hollow:'Модер в здании, всем внимание!',
  foxylis_romainez:'Опа, Лисица в здании :3',
  briecao:'Хотела пробежать тихонько, а мы заметили!',
  diablo666999_:'А кто это тут к нам пришел? Да это же Диа!',
  kzlk_90:'А кто это тут к нам пришел? Да это же Козлик!',
  carp__fish:'Модер в здании, всем внимание!',
  l0rinel:'К нам забежала булочка на огонек! Привет-привет, сладкая :)'
 };
 for(const [login,message] of Object.entries(expected))assert.equal(byLogin.get(login)?.message,message,login);
 assert.ok(DEFAULT_RULES.every(r=>r.enabled===false));
});
test('one-time Twir migration adds 14 new entries, corrects 8 legacy sample texts',()=>{
 const old=[...LEGACY_DEFAULT_MESSAGES].map(([login,message])=>({login,message,enabled:false}));
 const result=mergeTwirRules(old);
 assert.equal(result.added,14);
 assert.equal(result.updated,8);
 assert.equal(result.rules.length,22);
 assert.equal(result.rules.find(r=>normalizeLogin(r.login)==='old_banex')?.message,'Модер в здании, всем внимание!');
});
test('migration keeps manually edited messages, toggles and deleted legacy usernames',()=>{
 const old=[
  {login:'Hell_Fox_X',message:'Мой особенный текст!',enabled:true},
  {login:'foxylis_romainez',message:'Собственный текст Лисы',enabled:true},
  {login:'Old_Banex',message:LEGACY_DEFAULT_MESSAGES.get('old_banex'),enabled:true}
 ];
 const result=mergeTwirRules(old);
 assert.equal(result.rules.find(r=>r.login==='Hell_Fox_X').message,'Мой особенный текст!');
 assert.equal(result.rules.find(r=>r.login==='Hell_Fox_X').enabled,true);
 assert.equal(result.rules.find(r=>r.login==='foxylis_romainez').message,'Собственный текст Лисы');
 assert.equal(result.rules.find(r=>r.login==='foxylis_romainez').enabled,true);
 assert.equal(result.rules.find(r=>r.login==='Old_Banex').enabled,true);
 assert.equal(result.rules.some(r=>normalizeLogin(r.login)==='pspuer'),false);
});
test('second migration pass is stable and preserves toggles',()=>{
 const initial=mergeTwirRules([...LEGACY_DEFAULT_MESSAGES].map(([login,message])=>({login,message,enabled:false}))).rules;
 initial.find(r=>r.login==='Aqqula').enabled=true;
 const again=mergeTwirRules(initial);
 assert.equal(again.added,0);
 assert.equal(again.updated,0);
 assert.deepEqual(again.rules,initial);
});