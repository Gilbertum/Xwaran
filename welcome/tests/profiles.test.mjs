import test from 'node:test';
import assert from 'node:assert/strict';
import {combineProfiles,migrateLegacyProfiles,putProfile,removeProfile,toggleProfile,renderProfileText,DEFAULT_GREETING_TEXT} from '../profiles.mjs';
const g=[{login:'Akira_Mirei',message:'Тёплый привет!',enabled:true},{login:'Hell_Fox_X',message:'Привет, лис!',enabled:false}];
const s=[{login:'akira_mirei',message:'СТАРЫЙ текст шотаута {url}',enabled:true},{login:'Gretel_RS',message:'Подписка {url}',enabled:false}];
test('единственный профиль и текст в списке, даже при старых двух полях',()=>{
 const p=combineProfiles(g,s);assert.equal(p.length,3);assert.equal(p[0].message,'Тёплый привет!');assert.equal(p[0].withShout,true);assert.equal(p[2].message,'Подписка {url}');
});
test('один раз переносим старый шотаут без приветствия',()=>{
 const n=migrateLegacyProfiles(g,[...s,{login:'StreamOnly',message:'Я стример {url}',enabled:true}]);
 const p=combineProfiles(n.greetings,n.shoutouts).find(x=>x.login==='StreamOnly');
 assert.equal(p.message,'Я стример {url}');assert.equal(p.enabled,true);assert.equal(p.withShout,true);
});
test('включённый старый шотаут переводит неактивный профиль в активный без потери персонального текста',()=>{
 const n=migrateLegacyProfiles([{login:'Foo',message:'My greeting',enabled:false}],[{login:'foo',message:'My shout',enabled:true}]);
 assert.equal(n.greetings[0].enabled,true);assert.equal(n.greetings[0].message,'My greeting');assert.equal(n.shoutouts[0].message,'My shout');
});
test('выключенный в новой версии профиль остаётся выключен после редактирования',()=>{
 let n=putProfile(g,s,{login:'Akira_Mirei',enabled:false,shoutEnabled:true,text:'Привет, {user}!'},'Akira_Mirei');
 const p=combineProfiles(n.greetings,n.shoutouts)[0];assert.equal(p.enabled,false);assert.equal(p.withShout,true);
 n=putProfile(n.greetings,n.shoutouts,{login:p.login,enabled:false,shoutEnabled:true,text:p.message},p.login);
 assert.equal(n.greetings[0].enabled,false);
});
test('один текст редактируется, старый текст шотаута остаётся лишь для обратной совместимости',()=>{
 const n=putProfile(g,s,{login:'Akira_Mirei',enabled:true,shoutEnabled:true,text:'Единое сообщение!'},'Akira_Mirei');
 assert.equal(n.greetings[0].message,'Единое сообщение!');assert.equal(n.shoutouts[0].message,'СТАРЫЙ текст шотаута {url}');
});
test('включить Follow у выключенного зрителя — включает и сообщение',()=>{
 const n=toggleProfile(g,s,'Hell_Fox_X','shoutout',true);
 const p=combineProfiles(n.greetings,n.shoutouts).find(x=>x.login==='Hell_Fox_X');
 assert.equal(p.enabled,true);assert.equal(p.withShout,true);assert.equal(p.message,'Привет, лис!');
});
test('выключение профиля оставляет будущий режим Follow, но не запускает реакций',()=>{
 const n=toggleProfile(g,s,'Akira_Mirei','active',false);
 const p=combineProfiles(n.greetings,n.shoutouts)[0];assert.equal(p.enabled,false);assert.equal(p.withShout,true);
});
test('новый зритель: один текст, Follow выключен',()=>{
 const n=putProfile([],[],{login:'newstreamer',enabled:true,shoutEnabled:false,text:DEFAULT_GREETING_TEXT});
 assert.equal(n.greetings.length,1);assert.equal(n.shoutouts.length,0);
});
test('подстановка ссылки в ОДНО сообщение, без повторов',()=>{
 const msg=renderProfileText('Привет, {user}! {url}', 'Hell_Fox_X','Hell_Fox_X',true);
 assert.equal(msg,'Привет, Hell_Fox_X! https://www.twitch.tv/hell_fox_x');
 const auto=renderProfileText('Привет, {user}!','Hell_Fox_X','Hell_Fox_X',true);
 assert.equal((auto.match(/https:\/\/www\.twitch\.tv\/hell_fox_x/g)||[]).length,1);
 assert.ok(renderProfileText('Z'.repeat(500),'AA','Hell_Fox_X',true).length<=500);
});
test('текст без шотаута не получает чужую ссылку',()=>{
 assert.equal(renderProfileText('Привет, {user}!', 'X','hello_123',false),'Привет, X!');
});
test('переименование удаление и валидация',()=>{
 const n=putProfile(g,s,{login:'Renamed',enabled:true,shoutEnabled:true,text:'Hello'},'Akira_Mirei');
 assert.equal(n.greetings[0].login,'Renamed');assert.equal(n.shoutouts[0].login,'Renamed');
 assert.throws(()=>putProfile(g,s,{login:'Gretel_RS',enabled:true,text:'Hello'},'Akira_Mirei'),/уже есть/);
 assert.throws(()=>putProfile(g,s,{login:'Newperson',enabled:true,text:'A'.repeat(501)}),/500/);
 assert.equal(removeProfile(g,s,'Akira_Mirei').greetings.length,1);
});