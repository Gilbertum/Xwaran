/** One chat message per viewer, optional native Twitch Follow shoutout. Legacy keys remain intact. */
import {normalizeLogin,normalizeRule,validLogin,renderGreeting} from './core.mjs';
import {normalizeShoutRule,DEFAULT_SHOUT_TEXT,renderShoutText} from './shoutouts.mjs';

export const DEFAULT_GREETING_TEXT='Привет, {user}! Устраивайся поудобнее ✦';
export const UNIFIED_MIGRATION_KEY='xwaran_welcome_unified_text_v15';

export function combineProfiles(greetings,shoutouts){
 const profiles=new Map();
 for(const rule of greetings){
  const key=normalizeLogin(rule.login);
  profiles.set(key,{login:rule.login,greeting:rule,shoutout:null});
 }
 for(const rule of shoutouts){
  const key=normalizeLogin(rule.login),current=profiles.get(key);
  if(current)current.shoutout=rule;
  else profiles.set(key,{login:rule.login,greeting:null,shoutout:rule});
 }
 return [...profiles.values()].map(p=>({
  ...p,
  message:p.greeting?.message||p.shoutout?.message||DEFAULT_GREETING_TEXT,
  enabled:Boolean(p.greeting?.enabled||(!p.greeting&&p.shoutout?.enabled)),
  withShout:Boolean(p.shoutout?.enabled)
 }));
}

/** One-time conversion of pre-v1.5 data. Preserve greeting text first; for shoutout-only entries use old shoutout text. */
export function migrateLegacyProfiles(greetings,shoutouts){
 const nextG=greetings.map(r=>({...r}));
 const nextS=shoutouts.map(r=>({...r}));
 for(const s of nextS){
  const index=nextG.findIndex(g=>normalizeLogin(g.login)===normalizeLogin(s.login));
  if(index<0){
   nextG.push(normalizeRule({login:s.login,message:s.message||DEFAULT_GREETING_TEXT,enabled:s.enabled}));
  }else if(s.enabled&&!nextG[index].enabled){
   nextG[index]={...nextG[index],enabled:true};
  }
 }
 return {greetings:nextG,shoutouts:nextS};
}

/** Edits the only chat text and the two independent options: active + native Follow. */
export function putProfile(greetings,shoutouts,form,oldLogin=null){
 const login=String(form.login||'').trim().replace(/^@/,'');
 if(!validLogin(login))throw Error('Нужен корректный Twitch-ник (латиница, цифры, подчёркивание).');
 const key=normalizeLogin(login),oldKey=normalizeLogin(oldLogin||login);
 if(key!==oldKey&&combineProfiles(greetings,shoutouts).some(r=>normalizeLogin(r.login)===key))throw Error('Этот зритель уже есть в списке.');
 const oldG=greetings.find(r=>normalizeLogin(r.login)===oldKey);
 const oldS=shoutouts.find(r=>normalizeLogin(r.login)===oldKey);
 const message=String(form.text??'').trim();
 if(!message)throw Error('Введи текст сообщения — он отправляется в любом выбранном режиме.');
 if(message.length>500)throw Error('Сообщение не должно превышать 500 символов.');
 const enabled=form.enabled===true;
 const shoutEnabled=form.shoutEnabled===true;
 const gRule=normalizeRule({login,message,enabled});
 // Preserve old shoutout-specific copy for backup/rollback. Only one text is used by the app.
 const sRule=(oldS||shoutEnabled)?normalizeShoutRule({login,message:oldS?.message||DEFAULT_SHOUT_TEXT,enabled:shoutEnabled}):null;
 const nextG=greetings.map(r=>normalizeLogin(r.login)===oldKey?gRule:r);
 const nextS=shoutouts.map(r=>normalizeLogin(r.login)===oldKey?sRule:r).filter(Boolean);
 if(!oldG)nextG.push(gRule);
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
 if(kind!=='active'&&kind!=='shoutout')throw Error('Неизвестная реакция.');
 return putProfile(greetings,shoutouts,{
  login:profile.login,
  enabled:kind==='active'?enabled:(profile.enabled||enabled),
  shoutEnabled:kind==='shoutout'?enabled:profile.withShout,
  text:profile.message
 },profile.login);
}
/** Adding a link here avoids a separate chat message while preserving the author's personal text. */
export function renderProfileText(message,displayName,login,withShout=false){
 if(!validLogin(login))throw Error('Некорректный логин пользователя.');
 if(withShout)return renderShoutText(message,displayName,login);
 const safeLogin=normalizeLogin(login);
 return renderGreeting(message,displayName)
  .replace(/\{login\}/gi,safeLogin)
  .replace(/\{url\}/gi,'https://www.twitch.tv/'+safeLogin)
  .replace(/[\r\n\t]/g,' ').trim().slice(0,500);
}