import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_SHOUTS,DEFAULT_SHOUT_TEXT,parseShoutRules,normalizeShoutRule,renderShoutText,matchShout,chooseShoutMethod,stampShout,remainingShoutCooldown,cleanHistory} from '../shoutouts.mjs';
const T=Date.parse('2026-11-14T10:00:00.000Z');
test('preset streamer rules are opt-in',()=>{assert.equal(DEFAULT_SHOUTS.length,4);assert.ok(DEFAULT_SHOUTS.every(r=>r.enabled===false));});
test('strict login, unique streamers and text bounds',()=>{
 assert.throws(()=>normalizeShoutRule({login:'https://twitch.tv/x',message:'a'}));
 assert.throws(()=>parseShoutRules([{login:'Foo',message:'a'},{login:'fOo',message:'b'}]));
 assert.throws(()=>normalizeShoutRule({login:'foo',message:'z'.repeat(451)}));
});
test('Twitch URL generated and always included, replacements are safe',()=>{
 assert.equal(renderShoutText('Загляните к {user}: {url}','Gretel_RS','Gretel_RS'),'Загляните к Gretel_RS: https://www.twitch.tv/gretel_rs');
 assert.equal((renderShoutText('Стример {login}','X','L0rinel').match(/https:\/\/www.twitch.tv\/l0rinel/g)||[]).length,1);
 assert.equal(renderShoutText(DEFAULT_SHOUT_TEXT,'Hi\n!','PsPuer').includes('https://www.twitch.tv/pspuer'),true);
 assert.ok(renderShoutText('X'.repeat(450)+' {url} {url}','Name','pspuer').endsWith('https://www.twitch.tv/pspuer'));
 assert.ok(renderShoutText('X'.repeat(450)+' {url} {url}','Name','pspuer').length<=500);
});
test('only enabled exact matches, no generic user guessing',()=>{
 const rules=[{login:'PsPuer',message:'Text',enabled:true},{login:'Gretel_RS',message:'Text',enabled:false}];
 assert.equal(matchShout({chatter_user_login:'gretel_rs'},rules,new Set()),null);
 assert.equal(matchShout({chatter_user_login:'NotAStreamer'},rules,new Set()),null);
 const found=matchShout({chatter_user_login:'pspuer',chatter_user_id:'123'},rules,new Set());assert.equal(found.userId,'123');
 assert.equal(matchShout({chatter_user_login:'pspuer'},rules,new Set(['pspuer'])),null);
});
test('native only live and authorized',()=>{
 const history=cleanHistory({},T);
 assert.equal(chooseShoutMethod({live:false,hasNativeScope:true,history,login:'foo',now:T}),'text');
 assert.equal(chooseShoutMethod({live:true,hasNativeScope:false,history,login:'foo',now:T}),'text');
 assert.equal(chooseShoutMethod({live:true,hasNativeScope:true,history,login:'foo',now:T}),'native');
});
test('global cooldown: native 120s and per-channel 60 minutes',()=>{
 const history=stampShout({},'foo','native',T);
 assert.equal(chooseShoutMethod({live:true,hasNativeScope:true,history,login:'bar',now:T+119999}),'text');
 assert.equal(chooseShoutMethod({live:true,hasNativeScope:true,history,login:'bar',now:T+120000}),'native');
 assert.equal(chooseShoutMethod({live:true,hasNativeScope:true,history,login:'foo',now:T+59*60000}),'text');
 assert.equal(chooseShoutMethod({live:true,hasNativeScope:true,history,login:'foo',now:T+60*60000}),'native');
});
test('text shoutout history: 90s globally, 30m per streamer',()=>{
 const history=stampShout({},'foo','text',T);
 assert.equal(remainingShoutCooldown(history,'foo',T+100000).user,30*60000-100000);
 assert.equal(remainingShoutCooldown(history,'bar',T+45000).global,45000);
 assert.equal(remainingShoutCooldown(history,'foo',T+30*60000).user,0);
});
test('history prunes stale and invalid users',()=>{
 const history=cleanHistory({byUser:{foo:T-55*3600000,bar:T-120000,'http://evil':'123'},nativeLast:T-49*3600000},T);
 assert.equal(history.byUser.foo,undefined);assert.ok(history.byUser.bar);assert.equal(history.nativeLast,0);
});