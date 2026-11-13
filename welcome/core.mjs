/** Pure, browser-independent greeting rules. */
export const RULES_KEY = 'xwaran_welcome_rules_v1';
export const CLIENT_ID_KEY = 'xwaran_welcome_client_id_v1';
export const COOLDOWN_KEY = 'xwaran_welcome_cooldown_v1';
export const MAX_MESSAGE = 500;
// Copy of all 22 welcomes visible in the user-provided Twir.app screenshots.
// Disabled by default to prevent any unexpected chat messages.
export const TWIR_IMPORT_KEY = 'xwaran_welcome_twir_screenshots_20261114_v1';
export const DEFAULT_RULES = [
  {login:'Akira_Mirei', message:'К нам забежала булочка на огонек! Привет-привет, сладкая :)', enabled:false},
  {login:'Ohapka', message:'К нам забежала булочка на огонек! Привет-привет, сладкая :)', enabled:false},
  {login:'safutara_prasenz', message:'К нам забежала булочка на огонек! Привет-привет, сладкая :)', enabled:false},
  {login:'Old_Banex', message:'Модер в здании, всем внимание!', enabled:false},
  {login:'PsPuer', message:'К нам забежала булочка на огонек! Привет-привет, сладкая :)', enabled:false},
  {login:'yusyasha', message:'К нам забежала булочка на огонек! Привет-привет, сладкая :)', enabled:false},
  {login:'Gretel_RS', message:'К нам забежала булочка на огонек! Привет-привет, сладкая :)', enabled:false},
  {login:'sleepy___hollow', message:'Модер в здании, всем внимание!', enabled:false},
  {login:'Hell_Fox_X', message:'К нам забежала булочка на огонек! Привет-привет, сладкая :)', enabled:false},
  {login:'Luna_Wolfy', message:'К нам забежала булочка на огонек! Привет-привет, сладкая :)', enabled:false},
  {login:'Sourwaters', message:'К нам забежала булочка на огонек! Привет-привет, сладкая :)', enabled:false},
  {login:'foxylis_romainez', message:'Опа, Лисица в здании :3', enabled:false},
  {login:'briecao', message:'Хотела пробежать тихонько, а мы заметили!', enabled:false},
  {login:'Carp__Fish', message:'Модер в здании, всем внимание!', enabled:false},
  {login:'Aqqula', message:'К нам забежала булочка на огонек! Привет-привет, сладкая :)', enabled:false},
  {login:'murmurhea', message:'К нам забежала булочка на огонек! Привет-привет, сладкая :)', enabled:false},
  {login:'diablo666999_', message:'А кто это тут к нам пришел? Да это же Диа!', enabled:false},
  {login:'L0rinel', message:'К нам забежала булочка на огонек! Привет-привет, сладкая :)', enabled:false},
  {login:'1vobly1', message:'Модер в здании, всем внимание!', enabled:false},
  {login:'nokturne0', message:'Модер в здании, всем внимание!', enabled:false},
  {login:'kzlk_90', message:'А кто это тут к нам пришел? Да это же Козлик!', enabled:false},
  {login:'avrorush', message:'К нам забежала булочка на огонек! Привет-привет, сладкая :)', enabled:false}
];

// Messages shipped in v1.0. Only these exact, untouched examples are eligible
// to be replaced with the screenshot-accurate Twir wording on the first update.
export const LEGACY_DEFAULT_MESSAGES = new Map([
  ['Hell_Fox_X','К нам забежала булочка на огонёк! Привет-привет, {user} :)'],
  ['PsPuer','К нам забежала булочка на огонёк! Привет-привет, {user} :)'],
  ['Gretel_RS','К нам забежала булочка на огонёк! Привет-привет, {user} :)'],
  ['Old_Banex','Модер в здании, всем внимание! Привет, {user}!'],
  ['Akira_Mirei','К нам забежала булочка на огонёк! Привет-привет, {user} :)'],
  ['safutara_prasenz','Привет, {user}! Проходи, у нас тут уютно ✦'],
  ['yusyasha','Привет, {user}! Проходи, у нас тут уютно ✦'],
  ['sleepy___hollow','Модер в здании, всем внимание! Привет, {user}!']
].map(([login, message]) => [login.toLowerCase(), message]));

/** One-time migration. Add the 14 new names without resetting any existing toggles.
 * Match legacy starter messages exactly before updating them; custom text is safe.
 * Do not re-create missing legacy entries: the owner may have deleted them.
 */
export function mergeTwirRules(existing){
 const rules=existing.map(rule=>({...rule}));
 const byLogin=new Map(rules.map(rule=>[normalizeLogin(rule.login),rule]));
 const legacyNames=new Set(LEGACY_DEFAULT_MESSAGES.keys());
 let added=0, updated=0;
 for(const item of DEFAULT_RULES){
  const key=normalizeLogin(item.login);
  const current=byLogin.get(key);
  if(current){
   if(LEGACY_DEFAULT_MESSAGES.get(key)===current.message&&current.message!==item.message){
    current.message=item.message;updated++;
   }
   continue;
  }
  // Avoid restoring legacy rules that a viewer explicitly removed in v1.0.
  if(legacyNames.has(key)||rules.length>=1000)continue;
  rules.push({...item});byLogin.set(key,rules[rules.length-1]);added++;
 }
 return {rules,added,updated};
}
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