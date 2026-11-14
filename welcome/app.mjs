import {RULES_KEY,CLIENT_ID_KEY,COOLDOWN_KEY,DEFAULT_RULES,TWIR_IMPORT_KEY,mergeTwirRules,normalizeLogin,validLogin,normalizeRule,parseRules,pickGreeting} from './core.mjs?v=1.4';
import {SHOUT_RULES_KEY,SHOUT_HISTORY_KEY,SHOUT_INTERVAL_KEY,DEFAULT_SHOUTS,DEFAULT_SHOUT_TEXT,parseShoutRules,renderShoutText,matchShout,cleanHistory,chooseShoutMethod,remainingShoutCooldown,stampShout} from './shoutouts.mjs?v=1.4';
import {combineProfiles,putProfile,removeProfile,toggleProfile,DEFAULT_GREETING_TEXT} from './profiles.mjs?v=1.4';

const $=id=>document.getElementById(id);
const S={rules:[],clientId:'',token:null,expiresAt:0,userId:'',userLogin:'',streamId:'',sessionId:'',live:false,started:false,starting:false,ws:null,reconnectWs:null,sentUsers:new Set(),queuedUsers:new Set(),queue:[],sending:false,lastSent:0,pollTimer:null,retryTimer:null,retryCount:0,editing:null,logs:[],lockRelease:null,lockHeld:false,stopping:false,clientTabId:crypto.randomUUID(),seenMessages:new Set(),seenMessageOrder:[],shoutRules:[],shoutEditing:null,shoutSent:new Set(),shoutQueued:new Set(),shoutQueue:[],sendingShout:false,shoutGeneration:0,shoutHistory:cleanHistory({}),hasNativeScope:false,chatSendChain:Promise.resolve()};
const AUTH_TOKEN_KEY='xw_welcome_twitch_token';
const AUTH_EXP_KEY='xw_welcome_twitch_expires';
const AUTH_STATE_KEY='xw_welcome_auth_state';
const API='https://api.twitch.tv/helix';
function toast(text){const t=$('toast');t.textContent=text;t.classList.add('visible');clearTimeout(toast.timer);toast.timer=setTimeout(()=>t.classList.remove('visible'),5000);}
function log(message,type='info'){const d=new Date();S.logs.unshift({message,type,date:d});S.logs=S.logs.slice(0,80);renderLog();}
function renderLog(){const target=$('eventLog');target.replaceChildren();if(!S.logs.length){const empty=document.createElement('div');empty.className='log-empty';empty.textContent='Здесь появятся события после запуска';target.append(empty);return;}for(const e of S.logs.slice(0,35)){const item=document.createElement('div');item.className='log-item';const icon=document.createElement('span');icon.className='log-icon';icon.textContent=e.type==='success'?'✓':e.type==='error'?'!':'✦';const span=document.createElement('span');span.textContent=e.message;const time=document.createElement('time');time.textContent=e.date.toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'});item.append(icon,span,time);target.append(item);}}
function loadSettings(){
 try{
  const raw=localStorage.getItem(RULES_KEY);
  S.rules=raw?parseRules(JSON.parse(raw)):DEFAULT_RULES.map(r=>({...r}));
  if(localStorage.getItem(TWIR_IMPORT_KEY)!=='1'){
   let added=0,updated=0;
   if(raw){const merge=mergeTwirRules(S.rules);S.rules=merge.rules;added=merge.added;updated=merge.updated;}
   // Store the migration marker alongside the new list. This prevents a manually
   // deleted Twir rule from returning on a later reload.
   localStorage.setItem(RULES_KEY,JSON.stringify(S.rules));
   localStorage.setItem(TWIR_IMPORT_KEY,'1');
   if(added||updated)log(`Перенос Twir.app: добавлено ${added}, обновлено ${updated}; пользовательские настройки сохранены.`,'success');
  }
 }catch(e){
  S.rules=DEFAULT_RULES.map(r=>({...r}));
  log('Ошибка чтения или сохранения настроек: показаны примеры Twir.app. Проверь хранилище браузера.','error');
 }
 S.clientId=localStorage.getItem(CLIENT_ID_KEY)||'';
 try{const raw=localStorage.getItem(SHOUT_RULES_KEY);S.shoutRules=raw?parseShoutRules(JSON.parse(raw)):DEFAULT_SHOUTS.map(x=>({...x}));}
 catch(e){S.shoutRules=DEFAULT_SHOUTS.map(x=>({...x}));log('Ошибка чтения списка шотаутов: показаны примеры, но старые данные не удалены.','error');}
 try{S.shoutHistory=cleanHistory(JSON.parse(localStorage.getItem(SHOUT_HISTORY_KEY)||'{}'));}catch{S.shoutHistory=cleanHistory({});}
 const shoutInterval=localStorage.getItem(SHOUT_INTERVAL_KEY);if(['60','90','120'].includes(shoutInterval))$('shoutInterval').value=shoutInterval;
 const cooldown=localStorage.getItem(COOLDOWN_KEY);
 if(['10','15','20','30'].includes(cooldown))$('cooldown').value=cooldown;
}
/** Both legacy storage keys remain unchanged, so no saved personal message is lost. */
function saveProfiles(){
 try{
  localStorage.setItem(RULES_KEY,JSON.stringify(S.rules));
  localStorage.setItem(SHOUT_RULES_KEY,JSON.stringify(S.shoutRules));
 }catch(e){log('Не удалось сохранить правила: '+e.message,'error');toast('Не получилось сохранить: проверь хранилище браузера.');}
 renderRules();renderStats();
}
function renderShoutStats(){
 const note=$('nativeScopeNote');
 if(note)note.textContent=S.hasNativeScope?'Кнопка Follow доступна во время эфира, если нет ограничений Twitch. Офлайн отправляется ссылка.':'Для официального Follow во время эфира переподключи Twitch в настройках; пока шотауты отправляются ссылкой.';
 $('shoutEnabled').textContent=String(S.shoutRules.filter(r=>r.enabled).length);
}
function renderStats(){
 const profiles=combineProfiles(S.rules,S.shoutRules);
 $('totalRules').textContent=String(profiles.length);
 $('enabledRules').textContent=String(S.rules.filter(r=>r.enabled).length);
 $('sideCount').textContent=String(profiles.length);
 $('rulesCounter').textContent=String(profiles.length);
 $('tableFoot').textContent=`${profiles.length} зрителей · ${S.rules.filter(r=>r.enabled).length} приветствий · ${S.shoutRules.filter(r=>r.enabled).length} шотаутов · отправлено за сессию ${S.sentUsers.size+S.shoutSent.size}`;
 $('streamStatus').textContent=S.live?'В эфире':S.userId?'Офлайн':'Не проверено';
 $('streamDetail').textContent=S.live?'Приветствия и Follow-шотауты доступны':S.userId?'Приветствия и ссылки работают офлайн':'Подключи Twitch';
 renderShoutStats();
}
function renderRules(){
 const query=$('search').value.trim().toLowerCase();const tbody=$('rulesBody');tbody.replaceChildren();let count=0;
 for(const profile of combineProfiles(S.rules,S.shoutRules)){
  if(query&&!`${profile.login} ${profile.greeting?.message||''} ${profile.shoutout?.message||''}`.toLowerCase().includes(query))continue;
  count++;
  const row=document.createElement('tr');
  const tdUser=document.createElement('td'),div=document.createElement('div');div.className='user-cell';
  const avatar=document.createElement('span');avatar.className='user-avatar';avatar.textContent=profile.login.slice(0,1).toUpperCase();
  const user=document.createElement('span');user.textContent=profile.login;div.append(avatar,user);tdUser.append(div);
  const tdText=document.createElement('td'),summaries=document.createElement('div');summaries.className='reaction-summaries';
  const info=(tag,rule)=>{if(!rule)return;const line=document.createElement('div');line.className='reaction-preview';const name=document.createElement('b');name.textContent=tag;const text=document.createElement('span');text.textContent=rule.message;text.title=rule.message;line.append(name,text);summaries.append(line);};
  info('✦',profile.greeting);info('↗',profile.shoutout);
  if(!profile.greeting&&!profile.shoutout){const empty=document.createElement('span');empty.textContent='Нет настроенных действий';summaries.append(empty);}
  tdText.append(summaries);
  const makeToggle=(kind,checked)=>{const td=document.createElement('td');td.className='toggle-column';const label=document.createElement('label');label.className='switch';const input=document.createElement('input');input.type='checkbox';input.checked=checked;input.setAttribute('aria-label',`${kind==='greeting'?'Приветствие':'Шотаут'}: ${profile.login}`);input.onchange=()=>{try{const next=toggleProfile(S.rules,S.shoutRules,profile.login,kind,input.checked);S.rules=next.greetings;S.shoutRules=next.shoutouts;saveProfiles();log(`@${profile.login}: ${kind==='greeting'?'приветствие':'шотаут'} ${input.checked?'включён':'выключен'}`);}catch(e){toast(e.message);input.checked=!input.checked;}};const track=document.createElement('span');label.append(input,track);td.append(label);return td;};
  const tdOn=makeToggle('greeting',Boolean(profile.greeting?.enabled));const tdShout=makeToggle('shoutout',Boolean(profile.shoutout?.enabled));
  const tdActions=document.createElement('td');const actions=document.createElement('div');actions.className='row-actions';
  const edit=document.createElement('button');edit.className='mini-btn';edit.textContent='✎';edit.title='Редактировать обе реакции';edit.setAttribute('aria-label','Редактировать '+profile.login);edit.onclick=()=>openRuleDialog(profile);
  const del=document.createElement('button');del.className='mini-btn danger';del.textContent='⌫';del.title='Удалить зрителя и обе реакции';del.setAttribute('aria-label','Удалить '+profile.login);del.onclick=()=>{if(!confirm(`Удалить @${profile.login} вместе с приветствием и шотаутом?`))return;const next=removeProfile(S.rules,S.shoutRules,profile.login);S.rules=next.greetings;S.shoutRules=next.shoutouts;saveProfiles();log(`@${profile.login}: удалён из списка`);};
  actions.append(edit,del);tdActions.append(actions);row.append(tdUser,tdText,tdOn,tdShout,tdActions);tbody.append(row);
 }
 $('emptyState').hidden=count!==0;
}
function updateCharacters(){$('charCounter').textContent=`${$('ruleText').value.length} / 500`;updateShoutPreview();}
function updateShoutPreview(){const login=$('ruleLogin').value.trim().replace(/^@/,'')||'Streamer';try{$('shoutPreviewText').textContent=renderShoutText($('shoutText').value||DEFAULT_SHOUT_TEXT,login,login);}catch{$('shoutPreviewText').textContent='Здесь появится предпросмотр ссылки на канал';}}
function openRuleDialog(profile=null){
 S.editing=profile?.login||null;
 $('modalHeading').textContent=profile?'Редактировать '+profile.login:'Добавить зрителя';
 $('ruleLogin').value=profile?.login||'';
 $('ruleText').value=profile?.greeting?.message||DEFAULT_GREETING_TEXT;
 $('shoutText').value=profile?.shoutout?.message||DEFAULT_SHOUT_TEXT;
 $('ruleEnabled').checked=profile?Boolean(profile.greeting?.enabled):true;
 $('shoutRuleEnabled').checked=Boolean(profile?.shoutout?.enabled);
 updateCharacters();$('ruleDialog').showModal();setTimeout(()=>$('ruleLogin').focus(),10);
}
function closeDialog(){$('ruleDialog').close();S.editing=null;}
function saveDialog(evt){
 evt.preventDefault();try{
  const next=putProfile(S.rules,S.shoutRules,{login:$('ruleLogin').value,greetEnabled:$('ruleEnabled').checked,shoutEnabled:$('shoutRuleEnabled').checked,greetText:$('ruleText').value,shoutText:$('shoutText').value},S.editing);
  S.rules=next.greetings;S.shoutRules=next.shoutouts;
  saveProfiles();log('@'+$('ruleLogin').value.trim()+': реакции сохранены','success');closeDialog();
 }catch(e){toast(e.message);}
}
function applySession(){const connected=Boolean(S.token&&S.userId);$('connectionPill').className='pill '+(connected?'connected':'disconnected');$('connectionPill').innerHTML='<span class="dot"></span>'; $('connectionPill').append(document.createTextNode(connected?` @${S.userLogin}`:' Не подключено'));
 $('bannerTitle').textContent=connected?`Twitch подключён: @${S.userLogin}`:'Подключи свой Twitch-аккаунт';$('bannerText').textContent=connected?'Приветствия и шотауты работают в одной вкладке. Без эфира отправляется ссылка, в эфире — Twitch Follow (при наличии разрешения).':'Чтобы отправлять сообщения от твоего аккаунта, настрой подключение на отдельной странице.';$('connectBtn').textContent=connected?'Настройки Twitch ↗':'Подключить Twitch ↗';renderRun();renderStats();renderShoutStats();}
function renderRun(){const active=S.started;const pending=S.starting;$('runIndicator').className='live-bullet'+(active?' on':'');$('runTitle').textContent=active?'Автоматика работает':pending?'Подключение к чату...':'Автоматика остановлена';$('runSub').textContent=active?'Слушаем чат: приветствия и шотауты включённых зрителей':pending?'Ожидаем подтверждение Twitch':S.token?'Можно запускать даже когда канал офлайн':'Подключи Twitch в настройках';$('startBtn').disabled=!S.token||active||pending;$('startBtn').textContent=pending?'Подключаемся...':'▶ Запустить автоматику';$('stopBtn').disabled=!active&&!pending;}
function rememberSent(login){S.sentUsers.add(normalizeLogin(login));renderStats();}
async function helix(path,{method='GET',body,token=S.token}={}){const ctl=new AbortController();const timeout=setTimeout(()=>ctl.abort(),12000);try{const resp=await fetch(API+path,{method,headers:{'Authorization':'Bearer '+token,'Client-Id':S.clientId,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal:ctl.signal,cache:'no-store'});let json;try{json=await resp.json();}catch{json={};}if(!resp.ok){const m=json.message||resp.statusText||'Ошибка Twitch API';throw Error(`${resp.status}: ${m}`);}return json;}finally{clearTimeout(timeout);}}
async function validateToken(token){const ctl=new AbortController();const timeout=setTimeout(()=>ctl.abort(),12000);try{const r=await fetch('https://id.twitch.tv/oauth2/validate',{headers:{Authorization:'OAuth '+token},signal:ctl.signal,cache:'no-store'});if(!r.ok)throw Error('Токен Twitch просрочен или отозван. Войди повторно.');const d=await r.json();if(d.client_id!==S.clientId)throw Error('Client ID не совпадает с приложением Twitch.');if(!d.scopes?.includes('user:read:chat')||!d.scopes?.includes('user:write:chat'))throw Error('Не хватает разрешений Twitch. Подключи аккаунт заново.');return d;}finally{clearTimeout(timeout);}}
function removeAuth(){sessionStorage.removeItem(AUTH_TOKEN_KEY);sessionStorage.removeItem(AUTH_EXP_KEY);S.token=null;S.expiresAt=0;S.userId='';S.userLogin='';S.hasNativeScope=false;S.streamId='';S.live=false;S.sessionId='';S.sentUsers.clear();applySession();}
async function restoreAuth(){const token=sessionStorage.getItem(AUTH_TOKEN_KEY);const expires=Number(sessionStorage.getItem(AUTH_EXP_KEY)||0);if(!token||expires<Date.now()+30000){sessionStorage.removeItem(AUTH_TOKEN_KEY);sessionStorage.removeItem(AUTH_EXP_KEY);return;}try{const d=await validateToken(token);S.token=token;S.userId=d.user_id;S.userLogin=d.login;S.hasNativeScope=d.scopes?.includes('moderator:manage:shoutouts')||false;S.expiresAt=Math.min(expires,Date.now()+d.expires_in*1000);log('Twitch подключён: @'+S.userLogin,'success');applySession();await refreshStream();startPolling();}catch(e){log('Нужно заново подключить Twitch: '+e.message,'error');removeAuth();}}
async function oauthCallback(){const params=new URLSearchParams(location.hash.slice(1));if(!params.has('access_token')){if(new URLSearchParams(location.search).has('error')){toast('Авторизация Twitch не разрешена.');history.replaceState(null,'',location.pathname);}return;}const state=params.get('state');const expected=sessionStorage.getItem(AUTH_STATE_KEY);history.replaceState(null,'',location.pathname+location.search);sessionStorage.removeItem(AUTH_STATE_KEY);if(!state||state!==expected){log('Ошибка безопасности: проверка OAuth state не прошла','error');toast('Ошибка авторизации. Попробуй ещё раз.');return;}const token=params.get('access_token');const expSec=Math.min(Number(params.get('expires_in'))||14400,86400);sessionStorage.setItem(AUTH_TOKEN_KEY,token);sessionStorage.setItem(AUTH_EXP_KEY,String(Date.now()+expSec*1000));await restoreAuth();}
async function refreshStream(){if(!S.token)return;try{const d=await helix('/streams?user_id='+encodeURIComponent(S.userId));const stream=d.data?.[0]||null;const id=stream?.id||'';const live=Boolean(stream);
 if(id!==S.streamId){S.streamId=id;if(id)log('Трансляция началась. Приветствия продолжают работать.','success');else if(S.live)log('Трансляция завершилась. Приветствия продолжают работать офлайн.','success');}
 S.live=live;renderStats();renderRun();}catch(err){log('Проверка эфира Twitch: '+err.message,'error');}}
function startPolling(){clearInterval(S.pollTimer);S.pollTimer=setInterval(async()=>{if(!S.token)return;if(Date.now()>=S.expiresAt-20000){log('Токен Twitch истёк — подключи аккаунт снова.','error');stopBot();removeAuth();return;}await refreshStream();},90000);}
function stopBot(){S.stopping=true;clearTimeout(S.retryTimer);if(S.ws){const ws=S.ws;S.ws=null;ws.onclose=null;ws.close();}if(S.reconnectWs){const ws=S.reconnectWs;S.reconnectWs=null;ws.onclose=null;ws.close();}S.started=false;S.starting=false;S.sessionId='';S.queue=[];S.queuedUsers.clear();S.sending=false;S.shoutGeneration++;S.shoutQueue=[];S.shoutQueued.clear();S.sendingShout=false;S.retryCount=0;if(S.lockRelease){S.lockRelease();S.lockRelease=null;}S.lockHeld=false;renderRun();S.stopping=false;}
function socketStart(url='wss://eventsub.wss.twitch.tv/ws',isReconnect=false){let ws;try{ws=new WebSocket(url);}catch(err){log('Не удалось открыть Twitch WebSocket: '+err.message,'error');stopBot();return;}if(isReconnect)S.reconnectWs=ws;else S.ws=ws;const watchdog=setTimeout(()=>{if(ws.readyState!==WebSocket.OPEN){ws.close();}},15000);
 ws.onmessage=async ev=>{let data;try{data=JSON.parse(ev.data);}catch{return;}const type=data.metadata?.message_type;
 if(type==='session_welcome'){clearTimeout(watchdog);if(isReconnect){const old=S.ws;S.ws=ws;S.reconnectWs=null;if(old&&old!==ws){old.onclose=null;old.close();}S.started=true;S.starting=false;log('Twitch EventSub переподключён','success');renderRun();}else{try{await helix('/eventsub/subscriptions',{method:'POST',body:{type:'channel.chat.message',version:'1',condition:{broadcaster_user_id:S.userId,user_id:S.userId},transport:{method:'websocket',session_id:data.payload.session.id}}});S.started=true;S.starting=false;S.retryCount=0;log('Слушаем сообщения Twitch-чата','success');renderRun();}catch(e){log('Подписка на Twitch-чат не удалась: '+e.message,'error');toast('Ошибка подписки Twitch: '+e.message);stopBot();}}}
 if(type==='notification'&&data.payload?.subscription?.type==='channel.chat.message')handleChat(data.payload.event);
 if(type==='session_reconnect'&&data.payload?.session?.reconnect_url){log('Twitch попросил переподключить WebSocket');socketStart(data.payload.session.reconnect_url,true);}
 if(type==='revocation'){log('Twitch отменил подписку: '+String(data.payload?.subscription?.status||'неизвестно'),'error');stopBot();}
 };
 ws.onerror=()=>{log('Ошибка соединения с чатом Twitch','error');};
 ws.onclose=()=>{clearTimeout(watchdog);if(S.stopping)return;if(isReconnect){if(S.reconnectWs===ws){S.reconnectWs=null;log('Не удалось перенести подключение, повторяем подключение','error');if(S.ws){S.ws.onclose=null;S.ws.close();S.ws=null;}reconnectLater();}return;}if(S.ws===ws){S.ws=null;if(S.started||S.starting){log('Соединение с чатом прервано. Переподключение...','error');S.started=false;S.starting=true;renderRun();reconnectLater();}}};}
function reconnectLater(){clearTimeout(S.retryTimer);if(!S.token)return;const delay=Math.min(30000,1500*Math.pow(2,Math.min(S.retryCount++,5)));S.retryTimer=setTimeout(()=>{if(S.starting&&S.token)socketStart();},delay);}
function handleChat(evt){
 if(!S.started||!S.sessionId||!evt)return;
 const mid=evt.message_id;if(mid){if(S.seenMessages.has(mid))return;S.seenMessages.add(mid);S.seenMessageOrder.push(mid);if(S.seenMessageOrder.length>500)S.seenMessages.delete(S.seenMessageOrder.shift());}
 const login=normalizeLogin(evt.chatter_user_login);if(!login||login===normalizeLogin(S.userLogin))return;
 // A viewer may independently receive greeting AND shoutout — neither suppresses the other.
 if(!S.queuedUsers.has(login)){
  const match=pickGreeting(evt,S.rules,S.sentUsers,S.sessionId);
  if(match){if(S.queue.length>=40)log('Очередь приветствий переполнена','error');else{S.queuedUsers.add(login);S.queue.push(match);log(`@${login}: приветствие в очереди`);processQueue();}}
 }
 const shout=matchShout(evt,S.shoutRules,S.shoutSent);
 if(shout)enqueueShout(shout);
}
function storeShoutHistory(){try{localStorage.setItem(SHOUT_HISTORY_KEY,JSON.stringify(S.shoutHistory));}catch{log('Не удалось сохранить историю шотаутов в браузере','error');}}
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function sendChat(text,session){
 const doSend=async()=>{
  if(!S.started||S.sessionId!==session)return false;
  const wait=Math.max(0,Number($('cooldown').value)*1000-(Date.now()-S.lastSent));if(wait)await pause(wait);
  if(!S.started||S.sessionId!==session)return false;
  const response=await helix('/chat/messages',{method:'POST',body:{broadcaster_id:S.userId,sender_id:S.userId,message:text}});
  if(response.data?.[0]?.is_sent===false)throw Error(response.data[0]?.drop_reason?.message||'Twitch отклонил сообщение');
  S.lastSent=Date.now();return true;
 };
 const result=S.chatSendChain.then(doSend,doSend);S.chatSendChain=result.catch(()=>{});return result;
}
function enqueueShout(item){
 if(S.shoutSent.has(item.login)||S.shoutQueued.has(item.login))return;
 const remaining=remainingShoutCooldown(S.shoutHistory,item.login);
 if(remaining.user){S.shoutSent.add(item.login);log(`Шотаут @${item.login} уже был недавно — не повторяем`);renderShoutStats();return;}
 if(S.shoutQueue.length>=25){log('Очередь шотаутов переполнена','error');return;}
 S.shoutQueued.add(item.login);S.shoutQueue.push(item);log(`@${item.login}: ждёт шотаут`);processShouts();
}
async function resolveStreamerId(item){
 if(/^\d+$/.test(item.userId))return item.userId;
 const data=await helix('/users?login='+encodeURIComponent(item.login));
 return String(data.data?.[0]?.id||'');
}
async function processShouts(){
 if(S.sendingShout||!S.started||!S.sessionId||!S.token)return;
 S.sendingShout=true;const generation=S.shoutGeneration,session=S.sessionId;
 try{while(S.started&&S.sessionId===session&&generation===S.shoutGeneration&&S.shoutQueue.length){
  const item=S.shoutQueue[0];
  // Put gaps between independent shoutouts: they should feel special, not flood the chat.
  const gap=remainingShoutCooldown(S.shoutHistory,item.login,Date.now(),Number($('shoutInterval').value)*1000);
  if(gap.user){S.shoutQueue.shift();S.shoutQueued.delete(item.login);S.shoutSent.add(item.login);renderShoutStats();continue;}
  if(gap.global){await pause(gap.global);if(!S.started||S.sessionId!==session||generation!==S.shoutGeneration)break;continue;}
  S.shoutQueue.shift();
  const enabled=S.shoutRules.find(x=>x.enabled&&normalizeLogin(x.login)===item.login);
  if(!enabled){S.shoutQueued.delete(item.login);continue;}
  let method=chooseShoutMethod({live:S.live,hasNativeScope:S.hasNativeScope,history:S.shoutHistory,login:item.login});
  let succeeded=false;
  if(method==='native'){
   try{
    const to=await resolveStreamerId(item);
    if(!to||to===S.userId)throw Error('Нельзя отправить шотаут на свой канал или канал не найден');
    const q=new URLSearchParams({from_broadcaster_id:S.userId,to_broadcaster_id:to,moderator_id:S.userId});
    await helix('/chat/shoutouts?'+q,{method:'POST'});
    succeeded=true;log(`Официальный Twitch Shoutout: @${item.login} (кнопка Follow)`,'success');
   }catch(e){log(`Нативный шотаут @${item.login} недоступен: ${e.message}. Пробуем ссылку.`,'error');method='text';}
  }
  if(method==='text'&&!succeeded){
   try{const text=renderShoutText(enabled.message,item.displayName,item.login);succeeded=await sendChat(text,session);
    if(succeeded)log(`Отправлен шотаут со ссылкой: @${item.login}`,'success');}
   catch(e){log(`Не удалось отправить шотаут @${item.login}: ${e.message}`,'error');}
  }
  if(succeeded){S.shoutHistory=stampShout(S.shoutHistory,item.login,method);storeShoutHistory();S.shoutSent.add(item.login);renderShoutStats();}
  S.shoutQueued.delete(item.login);
 }}finally{if(generation===S.shoutGeneration)S.sendingShout=false;}
}
async function processQueue(){if(S.sending||!S.started||!S.sessionId||!S.token)return;const session=S.sessionId;S.sending=true;try{while(S.started&&S.sessionId===session&&S.queue.length){const item=S.queue.shift();if(!item)break;if(!S.rules.some(r=>normalizeLogin(r.login)===item.login&&r.enabled)){S.queuedUsers.delete(item.login);continue;}
 try{if(await sendChat(item.text,session)){rememberSent(item.login);log(`Приветствие отправлено: @${item.login}`,'success');}}
 catch(e){log(`Не получилось приветствовать @${item.login}: ${e.message}`,'error');if(/401|403/.test(e.message)){stopBot();toast('Twitch отклонил отправку: проверь разрешения аккаунта.');break;}}
 finally{S.queuedUsers.delete(item.login);}
 }}finally{S.sending=false;}}
async function startBot(){if(S.started||S.starting)return;if(!S.token){toast('Сначала подключи Twitch.');return;}try{await validateToken(S.token);}catch(e){toast(e.message);return;}S.sessionId=crypto.randomUUID();S.sentUsers.clear();S.queuedUsers.clear();S.queue=[];S.shoutGeneration++;S.shoutSent.clear();S.shoutQueued.clear();S.shoutQueue=[];S.sendingShout=false;S.seenMessages.clear();S.seenMessageOrder=[];S.starting=true;S.stopping=false;renderStats();renderRun();
 if(navigator.locks?.request){navigator.locks.request('xwaran-welcome-one-active-tab',{mode:'exclusive',ifAvailable:true},async lock=>{if(!lock){S.starting=false;renderRun();toast('В другой вкладке уже запущены приветствия. Останови их там.');return;}S.lockHeld=true;socketStart();await new Promise(resolve=>{S.lockRelease=resolve;});S.lockHeld=false;}).catch(err=>{log('Не удалось установить защиту от двух вкладок: '+err.message,'error');stopBot();});}else{log('Браузер не поддерживает блокировку второй вкладки. Не запускай панель дважды.','error');socketStart();}}
function exportRules(){
 const data={version:2,exportedAt:new Date().toISOString(),rules:S.rules,shoutouts:S.shoutRules};
 const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');
 a.href=url;a.download='xwaran-reactions-'+new Date().toISOString().slice(0,10)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),5000);
 log('Скачана резервная копия приветствий и шотаутов','success');
}
async function importRules(file){
 if(!file||file.size>1024*1024){toast('Файл не найден или слишком большой (макс. 1 МБ).');return;}
 try{
  const raw=JSON.parse(await file.text());
  const hasG=Array.isArray(raw)||Array.isArray(raw?.rules),hasS=Array.isArray(raw?.shoutouts);
  if(!hasG&&!hasS)throw Error('Не найдены правила приветствий или шотаутов.');
  const nextG=hasG?parseRules(raw):S.rules,nextS=hasS?parseShoutRules(raw):S.shoutRules;
  const changes=[hasG?`${nextG.length} приветствий`:null,hasS?`${nextS.length} шотаутов`:null].filter(Boolean).join(' и ');
  if(!confirm(`Импортировать ${changes}? Соответствующие старые списки будут заменены.`))return;
  S.rules=nextG;S.shoutRules=nextS;saveProfiles();log('Импортированы реакции из резервной копии','success');toast('Правила загружены.');
 }catch(e){toast('Ошибка импорта: '+e.message);}
}
function wire(){
 $('connectBtn').onclick=()=>location.assign('./settings.html');
 $('addBtn').onclick=()=>openRuleDialog();$('addBottom').onclick=()=>openRuleDialog();
 $('dialogClose').onclick=closeDialog;$('cancelRule').onclick=closeDialog;
 $('ruleForm').addEventListener('submit',saveDialog);
 $('ruleText').oninput=updateCharacters;$('shoutText').oninput=updateShoutPreview;$('ruleLogin').oninput=updateShoutPreview;
 $('search').oninput=renderRules;
 $('startBtn').onclick=startBot;$('stopBtn').onclick=()=>{stopBot();log('Автоматика остановлена');};
 $('cooldown').onchange=()=>localStorage.setItem(COOLDOWN_KEY,$('cooldown').value);
 $('shoutInterval').onchange=()=>localStorage.setItem(SHOUT_INTERVAL_KEY,$('shoutInterval').value);
 $('clearLog').onclick=()=>{S.logs=[];renderLog();};
 $('exportBtn').onclick=exportRules;$('importBtn').onclick=()=>$('fileInput').click();$('fileInput').onchange=e=>{importRules(e.target.files?.[0]);e.target.value='';};
 window.addEventListener('beforeunload',()=>{if(S.ws)S.ws.close();if(S.reconnectWs)S.reconnectWs.close();});
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&S.token)refreshStream();});
}
async function init(){wire();loadSettings();renderRules();renderStats();applySession();await oauthCallback();if(!S.token)await restoreAuth();log('Панель готова. Приветствия и шотауты отключены до запуска.');}
init().catch(err=>{log('Ошибка запуска панели: '+err.message,'error');toast('Ошибка запуска: '+err.message);});