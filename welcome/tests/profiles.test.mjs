import test from 'node:test';
import assert from 'node:assert/strict';
import {combineProfiles,putProfile,removeProfile,toggleProfile,DEFAULT_GREETING_TEXT} from '../profiles.mjs';
import {DEFAULT_SHOUT_TEXT} from '../shoutouts.mjs';
const g=[{login:'Akira_Mirei',message:'Тёплый привет!',enabled:true},{login:'Hell_Fox_X',message:'Привет, лис!',enabled:false}];
const s=[{login:'akira_mirei',message:'Канал {url}',enabled:true},{login:'Gretel_RS',message:'Подписка {url}',enabled:false}];
test('same Twitch login appears once with two independent modes',()=>{
 const list=combineProfiles(g,s);assert.equal(list.length,3);assert.equal(list[0].login,'Akira_Mirei');assert.equal(list[0].greeting.message,'Тёплый привет!');assert.equal(list[0].shoutout.message,'Канал {url}');
 assert.equal(list[1].shoutout,null);assert.equal(list[2].greeting,null);
});
test('toggle shoutout for existing greeting without overwriting personal text',()=>{
 const result=toggleProfile(g,s,'Hell_Fox_X','shoutout',true);
 assert.equal(result.greetings[1].message,'Привет, лис!');assert.equal(result.greetings[1].enabled,false);
 assert.equal(result.shoutouts.at(-1).login,'Hell_Fox_X');assert.equal(result.shoutouts.at(-1).enabled,true);
 assert.equal(result.shoutouts.length,3);
});
test('toggle greeting for shoutout-only streamer, keep prior shoutout data',()=>{
 const result=toggleProfile(g,s,'Gretel_RS','greeting',true);
 assert.equal(result.shoutouts[1].message,'Подписка {url}');assert.equal(result.shoutouts[1].enabled,false);
 assert.equal(result.greetings.at(-1).enabled,true);
});
test('editing both texts saves independent fields without changing ordering',()=>{
 const result=putProfile(g,s,{login:'Akira_Mirei',greetEnabled:false,shoutEnabled:true,greetText:'Свой текст!',shoutText:'Мой SO {url}'},'Akira_Mirei');
 assert.equal(result.greetings[0].message,'Свой текст!');assert.equal(result.greetings[0].enabled,false);
 assert.equal(result.shoutouts[0].message,'Мой SO {url}');assert.equal(result.shoutouts[0].enabled,true);
});
test('adding greeting only does not create shoutout by default',()=>{
 const next=putProfile([],[],{login:'new_streamer',greetEnabled:true,shoutEnabled:false,greetText:DEFAULT_GREETING_TEXT,shoutText:DEFAULT_SHOUT_TEXT});
 assert.equal(next.greetings.length,1);assert.equal(next.shoutouts.length,0);
});
test('adding shoutout only does not create greeting by default',()=>{
 const next=putProfile([],[],{login:'new_streamer',greetEnabled:false,shoutEnabled:true,greetText:DEFAULT_GREETING_TEXT,shoutText:'Хоп сюда {url}'});
 assert.equal(next.greetings.length,0);assert.equal(next.shoutouts.length,1);
});
test('both disabled persist edited old content',()=>{
 const next=putProfile(g,s,{login:'Akira_Mirei',greetEnabled:false,shoutEnabled:false,greetText:'Тёплый привет!',shoutText:'Канал {url}'},'akira_mirei');
 assert.equal(next.greetings[0].enabled,false);assert.equal(next.shoutouts[0].enabled,false);
 assert.equal(next.greetings[0].message,'Тёплый привет!');assert.equal(next.shoutouts[0].message,'Канал {url}');
});
test('renames update both records, reject conflicts and overlong templates',()=>{
 const next=putProfile(g,s,{login:'Renamed',greetEnabled:true,shoutEnabled:true,greetText:'Hello',shoutText:'SO'},'Akira_Mirei');
 assert.equal(next.greetings[0].login,'Renamed');assert.equal(next.shoutouts[0].login,'Renamed');
 assert.throws(()=>putProfile(g,s,{login:'Gretel_RS',greetEnabled:true,greetText:'Hello'},'Akira_Mirei'),/уже есть/);
 assert.throws(()=>putProfile(g,s,{login:'Newperson',greetEnabled:true,greetText:'A'.repeat(501)}),/500/);
});
test('delete profile removes both records with same canonical login',()=>{
 const next=removeProfile(g,s,'AKIRA_MIREI');assert.equal(next.greetings.length,1);assert.equal(next.shoutouts.length,1);
});