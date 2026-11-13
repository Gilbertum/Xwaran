/** Pure shoutout rules & safety limits. No Twitch credentials are stored here. */
import {normalizeLogin,validLogin} from './core.mjs';
export const SHOUT_RULES_KEY='xwaran_welcome_shoutouts_v1';
export const SHOUT_HISTORY_KEY='xwaran_welcome_shoutout_history_v1';
export const SHOUT_INTERVAL_KEY='xwaran_welcome_shoutout_interval_v1';
export const TEXT_SHOUT_INTERVAL_MS=90_000;
export const SAME_USER_INTERVAL_MS=30*60_000;
export const NATIVE_INTERVAL_MS=120_000;
export const NATIVE_SAME_USER_MS=60*60_000;
export const DEFAULT_SHOUT_TEXT='К нам заглянул стример {user}! Поддержите канал фоллоу: {url} ✦';
export const DEFAULT_SHOUTS=[
 {login:'Hell_Fox_X',message:DEFAULT_SHOUT_TEXT,enabled:false},
 {login:'PsPuer',message:DEFAULT_SHOUT_TEXT,enabled:false},
 {login:'Gretel_RS',message:DEFAULT_SHOUT_TEXT,enabled:false},
 {login:'L0rinel',message:DEFAULT_SHOUT_TEXT,enabled:false},
];
export function normalizeShoutRule(raw){
 const login=String(raw?.login||'').trim().replace(/^@/,'');
 const message=String(raw?.message??'').trim();
 if(!validLogin(login))throw Error('Укажи правильный Twitch-логин стримера.');
 if(!message||message.length>450)throw Error('Текст шотаута должен содержать от 1 до 450 символов.');
 return {login,message,enabled:raw.enabled===true};
}
export function parseShoutRules(raw){
 const items=Array.isArray(raw)?raw:raw?.shoutouts;
 if(!Array.isArray(items)||items.length>500)throw Error('Шотауты: требуется список до 500 записей.');
 const seen=new Set();return items.map(item=>{
  const rule=normalizeShoutRule(item);const login=normalizeLogin(rule.login);
  if(seen.has(login))throw Error('Повторяется стример: '+rule.login);
  seen.add(login);return rule;
 });
}
export function renderShoutText(message,displayName,login){
 const name=String(displayName||login||'').replace(/[^\p{L}\p{N}_]/gu,'').slice(0,25);
 const safeLogin=normalizeLogin(login);
 if(!validLogin(safeLogin))throw Error('Некорректный логин канала.');
 const url='https://www.twitch.tv/'+safeLogin;
 let text=String(message).replace(/\{user\}/gi,name).replace(/\{login\}/gi,safeLogin).replace(/\{url\}/gi,url).replace(/[\r\n\t]/g,' ').trim();
 if(!text.includes(url))text+=' '+url;
 if(text.length>500){const withoutUrl=text.replaceAll(url,'').trim();return withoutUrl.slice(0,500-url.length-1).trimEnd()+' '+url;}
 return text;
}
export function matchShout(evt,rules,alreadySent){
 const login=normalizeLogin(evt?.chatter_user_login);
 if(!validLogin(login)||alreadySent.has(login))return null;
 const rule=rules.find(r=>r.enabled&&normalizeLogin(r.login)===login);
 return rule?{login,userId:String(evt.chatter_user_id||''),displayName:evt.chatter_user_name||rule.login,rule}:null;
}
export function cleanHistory(history,now=Date.now()){
 const original=history&&typeof history==='object'?history:{};
 const n=t=>Number.isFinite(Number(t)) && Number(t)>0 && now-Number(t)<48*60*60_000?Number(t):0;
 const trim=entries=>Object.fromEntries(Object.entries(entries&&typeof entries==='object'?entries:{}).filter(([k,v])=>validLogin(k)&&n(v)).slice(-500).map(([k,v])=>[normalizeLogin(k),n(v)]));
 return {lastAny:n(original.lastAny),nativeLast:n(original.nativeLast),byUser:trim(original.byUser),nativeUsers:trim(original.nativeUsers)};
}
export function chooseShoutMethod({live,hasNativeScope,history,login,now=Date.now()}){
 const h=cleanHistory(history,now);const key=normalizeLogin(login);
 const native=Boolean(live&&hasNativeScope&&now-h.nativeLast>=NATIVE_INTERVAL_MS&&now-(h.nativeUsers[key]||0)>=NATIVE_SAME_USER_MS);
 return native?'native':'text';
}
export function remainingShoutCooldown(history,login,now=Date.now(),interval=TEXT_SHOUT_INTERVAL_MS){
 const h=cleanHistory(history,now);const key=normalizeLogin(login);
 return {user:Math.max(0,SAME_USER_INTERVAL_MS-(now-(h.byUser[key]||0))),global:Math.max(0,interval-(now-h.lastAny))};
}
export function stampShout(history,login,kind,now=Date.now()){
 const h=cleanHistory(history,now),key=normalizeLogin(login);
 h.byUser[key]=now;h.lastAny=now;
 if(kind==='native'){h.nativeLast=now;h.nativeUsers[key]=now;}
 return h;
}