/** Unified viewer profiles, without rewriting the existing Twitch greeting / shoutout storage. */
import {normalizeLogin,normalizeRule,validLogin} from './core.mjs';
import {normalizeShoutRule,DEFAULT_SHOUT_TEXT} from './shoutouts.mjs';

export const DEFAULT_GREETING_TEXT='Привет, {user}! Устраивайся поудобнее ✦';

export function combineProfiles(greetings,shoutouts){
 const profiles=new Map();
 for(const rule of greetings){
  const key=normalizeLogin(rule.login);
  profiles.set(key,{login:rule.login,greeting:rule,shoutout:null});
 }
 for(const rule of shoutouts){
  const key=normalizeLogin(rule.login);
  const current=profiles.get(key);
  if(current){current.shoutout=rule;}
  else profiles.set(key,{login:rule.login,greeting:null,shoutout:rule});
 }
 return [...profiles.values()];
}

/** Upsert the two independent reactions as one atomic UI operation. Preserves unedited data. */
export function putProfile(greetings,shoutouts,form,oldLogin=null){
 const login=String(form.login||'').trim().replace(/^@/,'');
 if(!validLogin(login))throw Error('Нужен корректный Twitch-ник (латиница, цифры, подчёркивание).');
 const key=normalizeLogin(login),oldKey=normalizeLogin(oldLogin||login);
 if(key!==oldKey&&combineProfiles(greetings,shoutouts).some(r=>normalizeLogin(r.login)===key))throw Error('Этот зритель уже есть в списке.');
 const oldG=greetings.find(r=>normalizeLogin(r.login)===oldKey);
 const oldS=shoutouts.find(r=>normalizeLogin(r.login)===oldKey);
 const greetEnabled=form.greetEnabled===true,shoutEnabled=form.shoutEnabled===true;
 const greetText=String(form.greetText??'').trim();
 const shoutText=String(form.shoutText??'').trim();
 if(greetEnabled&&!greetText)throw Error('Введи текст приветствия или выключи его.');
 if(shoutEnabled&&!shoutText)throw Error('Введи текст шотаута или выключи его.');
 if(greetText.length>500)throw Error('Приветствие не должно превышать 500 символов.');
 if(shoutText.length>450)throw Error('Шотаут не должен превышать 450 символов.');
 const updateGreeting=Boolean(oldG||greetEnabled||(greetText&&greetText!==DEFAULT_GREETING_TEXT));
 const updateShout=Boolean(oldS||shoutEnabled||(shoutText&&shoutText!==DEFAULT_SHOUT_TEXT));
 if(!updateGreeting&&!updateShout)throw Error('Включи хотя бы одну реакцию или напиши текст для неё.');
 const gRule=updateGreeting?normalizeRule({login,message:greetText||oldG?.message||DEFAULT_GREETING_TEXT,enabled:greetEnabled}):null;
 const sRule=updateShout?normalizeShoutRule({login,message:shoutText||oldS?.message||DEFAULT_SHOUT_TEXT,enabled:shoutEnabled}):null;
 const nextG=greetings.map(r=>normalizeLogin(r.login)===oldKey?gRule:r).filter(Boolean);
 const nextS=shoutouts.map(r=>normalizeLogin(r.login)===oldKey?sRule:r).filter(Boolean);
 if(gRule&&!oldG)nextG.push(gRule);
 if(sRule&&!oldS)nextS.push(sRule);
 if(nextG.length>1000||nextS.length>500)throw Error('Достигнут лимит правил.');
 return {greetings:nextG,shoutouts:nextS};
}

export function removeProfile(greetings,shoutouts,login){
 const key=normalizeLogin(login);
 return {greetings:greetings.filter(r=>normalizeLogin(r.login)!==key),shoutouts:shoutouts.filter(r=>normalizeLogin(r.login)!==key)};
}

export function toggleProfile(greetings,shoutouts,login,kind,enabled){
 const profile=combineProfiles(greetings,shoutouts).find(r=>normalizeLogin(r.login)===normalizeLogin(login));
 if(!profile)throw Error('Зритель не найден.');
 if(kind!=='greeting'&&kind!=='shoutout')throw Error('Неизвестная реакция.');
 return putProfile(greetings,shoutouts,{
  login:profile.login,
  greetEnabled:kind==='greeting'?enabled:Boolean(profile.greeting?.enabled),
  shoutEnabled:kind==='shoutout'?enabled:Boolean(profile.shoutout?.enabled),
  greetText:profile.greeting?.message||DEFAULT_GREETING_TEXT,
  shoutText:profile.shoutout?.message||DEFAULT_SHOUT_TEXT
 },profile.login);
}