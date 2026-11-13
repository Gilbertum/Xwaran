/** Pure, browser-independent greeting rules. */
export const RULES_KEY = 'xwaran_welcome_rules_v1';
export const CLIENT_ID_KEY = 'xwaran_welcome_client_id_v1';
export const COOLDOWN_KEY = 'xwaran_welcome_cooldown_v1';
export const MAX_MESSAGE = 500;
export const DEFAULT_RULES = [
  {login:'Hell_Fox_X', message:'К нам забежала булочка на огонёк! Привет-привет, {user} :)', enabled:false},
  {login:'PsPuer', message:'К нам забежала булочка на огонёк! Привет-привет, {user} :)', enabled:false},
  {login:'Gretel_RS', message:'К нам забежала булочка на огонёк! Привет-привет, {user} :)', enabled:false},
  {login:'Old_Banex', message:'Модер в здании, всем внимание! Привет, {user}!', enabled:false},
  {login:'Akira_Mirei', message:'К нам забежала булочка на огонёк! Привет-привет, {user} :)', enabled:false},
  {login:'safutara_prasenz', message:'Привет, {user}! Проходи, у нас тут уютно ✦', enabled:false},
  {login:'yusyasha', message:'Привет, {user}! Проходи, у нас тут уютно ✦', enabled:false},
  {login:'sleepy___hollow', message:'Модер в здании, всем внимание! Привет, {user}!', enabled:false}
];
export function normalizeLogin(s){return String(s||'').trim().replace(/^@/,'').toLowerCase();}
export function validLogin(s){return /^[a-zA-Z0-9_]{3,25}$/.test(String(s||'').trim().replace(/^@/,''));}
export function sanitizeMessage(s){return String(s??'').trim().slice(0,MAX_MESSAGE);}
export function renderGreeting(template, displayName){const name=String(displayName||'').replace(/[^\p{L}\p{N}_]/gu,'').slice(0,25);return sanitizeMessage(template).replace(/\{user\}/gi,name).slice(0,MAX_MESSAGE);}
export function normalizeRule(raw){
 const login=String(raw?.login||'').trim().replace(/^@/,'');
 const message=sanitizeMessage(raw?.message);
 if(!validLogin(login)||!message)throw Error('Нужен корректный Twitch-логин и непустое сообщение.');
 return {login,message,enabled:raw?.enabled===true};
}
export function parseRules(input){
 const data=Array.isArray(input)?input:input?.rules;
 if(!Array.isArray(data)||data.length>1000)throw Error('Файл должен содержать массив rules (максимум 1000).');
 const seen=new Set();const out=[];
 for(const raw of data){const rule=normalizeRule(raw);const key=normalizeLogin(rule.login);if(seen.has(key))throw Error('Один из зрителей встречается дважды: '+rule.login);seen.add(key);out.push(rule);}
 return out;
}
export function pickGreeting(event,rules,sentUsers,streamId){
 if(!streamId||!event?.chatter_user_login)return null;
 const login=normalizeLogin(event.chatter_user_login);
 if(sentUsers.has(login))return null;
 const rule=rules.find(r=>normalizeLogin(r.login)===login&&r.enabled);
 if(!rule)return null;
 const text=renderGreeting(rule.message,event.chatter_user_name||event.chatter_user_login);
 return text?{login,text,rule}:null;
}
export function streamSentKey(userId,streamId){return `xwaran_welcome_sent_${String(userId)}_${String(streamId)}`;}