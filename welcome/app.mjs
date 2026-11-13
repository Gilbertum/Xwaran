import {RULES_KEY,CLIENT_ID_KEY,COOLDOWN_KEY,DEFAULT_RULES,TWIR_IMPORT_KEY,mergeTwirRules,normalizeLogin,validLogin,normalizeRule,parseRules,pickGreeting} from './core.mjs?v=1.3';
import {SHOUT_RULES_KEY,SHOUT_HISTORY_KEY,SHOUT_INTERVAL_KEY,DEFAULT_SHOUTS,DEFAULT_SHOUT_TEXT,normalizeShoutRule,parseShoutRules,renderShoutText,matchShout,cleanHistory,chooseShoutMethod,remainingShoutCooldown,stampShout} from './shoutouts.mjs?v=1.3';

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
function saveShoutRules(){localStorage.setItem(SHOUT_RULES_KEY,JSON.stringify(S.shoutRules));renderShoutRules();renderShoutStats();}
function renderShoutStats(){
 $('shoutTotal').textContent=String(S.shoutRules.length);$('shoutEnabled').textContent=String(S.shoutRules.filter(r=>r.enabled).length);
 $('shoutSent').textContent=String(S.shoutSent.size);$('sideShoutCount').textContent=String(S.shoutRules.length);
 $('shoutCount').textContent=String(S.shoutRules.length);
 $('shoutFoot').textContent=`${S.shoutRules.length} стримеров · ${S.shoutRules.filter(r=>r.enabled).length} включено`;
 $('nativeScopeNote').textContent=S.hasNativeScope?'Разрешение на нативный шотаут получено: во время эфира появится кнопка Follow.':'Для кнопки Follow в эфире переподключи Twitch в настройках. Пока будет отправляться текст со ссылкой.';
}
function renderShoutRules(){
 const query=$('shoutSearch').value.trim().toLowerCase();const body=$('shoutBody');body.replaceChildren();let found=0;
 for(const rule of S.shoutRules){if(query&&!`${rule.login} ${rule.message}`.toLowerCase().includes(query))continue;found++;
  const tr=document.createElement('tr'),user=document.createElement('td'),name=document.createElement('div');name.className='user-cell';
  const avatar=document.createElement('span');avatar.className='user-avatar';avatar.textContent=rule.login[0].toUpperCase();const nick=document.createElement('span');nick.textContent=rule.login;name.append(avatar,nick);user.append(name);
  const tdMessage=document.createElement('td'),msg=document.createElement('div');msg.className='message';msg.textContent=rule.message;msg.title=rule.message;tdMessage.append(msg);
  const toggleCell=document.createElement('td'),label=document.createElement('label');label.className='switch';const ck=document.createElement('input');ck.type='checkbox';ck.checked=rule.enabled;ck.setAttribute('aria-label','Шотаут для '+rule.login);ck.onchange=()=>{rule.enabled=ck.checked;saveShoutRules();log(`Шотаут ${rule.login}: ${rule.enabled?'включён':'выключен'}`);};const track=document.createElement('span');label.append(ck,track);toggleCell.append(label);
  const tdActions=document.createElement('td'),actions=document.createElement('div');actions.className='row-actions';
  const preview=document.createElement('button');preview.className='mini-btn';preview.textContent='◉';preview.title='Предпросмотр текста';preview.setAttribute('aria-label','Предпросмотр '+rule.login);preview.onclick=()=>{const text=renderShoutText(rule.message,rule.login,rule.login);$('shoutPreviewText').textContent=text;$('shoutPreviewDialog').showModal();};
  const edit=document.createElement('button');edit.className='mini-btn';edit.textContent='✎';edit.title='Редактировать';edit.onclick=()=>openShoutDialog(rule);
  const del=document.createElement('button');del.className='mini-btn danger';del.textContent='⌫';del.title='Удалить';del.onclick=()=>{if(confirm(`Удалить шотаут ${rule.login}?`)){S.shoutRules=S.shoutRules.filter(r=>r!==rule);saveShoutRules();}};
  actions.append(preview,edit,del);tdActions.append(actions);tr.append(user,tdMessage,toggleCell,tdActions);body.append(tr);
 }
 $('shoutEmpty').hidden=found!==0;
}
function openShoutDialog(rule=null){S.shoutEditing=rule;$('shoutHeading').textContent=rule?'Редактировать шотаут':'Добавить стримера';$('shoutLogin').value=rule?.login||'';$('shoutText').value=rule?.message||DEFAULT_SHOUT_TEXT;$('shoutRuleEnabled').checked=rule?.enabled??false;$('shoutDialog').showModal();}
function closeShoutDialog(){$('shoutDialog').close();S.shoutEditing=null;}
function saveShoutDialog(e){e.preventDefault();let next;try{next=normalizeShoutRule({login:$('shoutLogin').value,message:$('shoutText').value,enabled:$('shoutRuleEnabled').checked});}catch(err){toast(err.message);return;}
 if(S.shoutRules.some(r=>r!==S.shoutEditing&&normalizeLogin(r.login)===normalizeLogin(next.login))){toast('Этот стример уже добавлен.');return;}
 if(S.shoutEditing)Object.assign(S.shoutEditing,next);else S.shoutRules.push(next);saveShoutRules();log('Правило шотаута сохранено: @'+next.login,'success');closeShoutDialog();}
function showActiveView(){const tab=location.hash==='#shoutouts'?'shoutouts':'greetings';$('greetingsView').hidden=tab!=='greetings';$('shoutoutsView').hidden=tab!=='shoutouts';$('navGreetings').classList.toggle('active',tab==='greetings');$('navShoutouts').classList.toggle('active',tab==='shoutouts');}
function saveRules(){localStorage.setItem(RULES_KEY,JSON.stringify(S.rules));renderRules();renderStats();}
function renderStats(){$('totalRules').textContent=String(S.rules.length);$('enabledRules').textContent=String(S.rules.filter(r=>r.enabled).length);$('sentCount').textContent=String(S.sentUsers.size);$('sideCount').textContent=String(S.rules.length);$('rulesCounter').textContent=String(S.rules.length);$('tableFoot').textContent=`${S.rules.length} записей · ${S.rules.filter(r=>r.enabled).length} включено`;
 $('streamStatus').textContent=S.live?'В эфире':S.userId?'Офлайн':'Не проверено';$('streamDetail').textContent=S.live?'Приветствия и шотауты доступны':S.userId?'Текстовые шотауты работают офлайн':'Подключи Twitch';}
function renderRules(){const query=$('search').value.trim().toLowerCase();const tbody=$('rulesBody');tbody.replaceChildren();let count=0;for(const rule of S.rules){if(query&&!`${rule.login} ${rule.message}`.toLowerCase().includes(query))continue;count++;
 const row=document.createElement('tr');const tdUser=document.createElement('td');const div=document.createElement('div');div.className='user-cell';const avatar=document.createElement('span');avatar.className='user-avatar';avatar.textContent=rule.login.slice(0,1).toUpperCase();const user=document.createElement('span');user.textContent=rule.login;div.append(avatar,user);tdUser.append(div);
 const tdText=document.createElement('td');const message=document.createElement('div');message.className='message';message.title=rule.message;message.textContent=rule.message;tdText.append(message);
 const tdOn=document.createElement('td');const label=document.createElement('label');label.className='switch';const checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.checked=rule.enabled;checkbox.setAttribute('aria-label','Приветствие '+rule.login);checkbox.addEventListener('change',()=>{rule.enabled=checkbox.checked;saveRules();log(`${rule.login}: ${rule.enabled?'включено':'выключено'}`);});const track=document.createElement('span');label.append(checkbox,track);tdOn.append(label);
 const tdActions=document.createElement('td');const actions=document.createElement('div');actions.className='row-actions';const edit=document.createElement('button');edit.className='mini-btn';edit.textContent='✎';edit.title='Редактировать';edit.setAttribute('aria-label','Редактировать '+rule.login);edit.addEventListener('click',()=>openRuleDialog(rule));const del=document.createElement('button');del.className='mini-btn danger';del.textContent='⌫';del.title='Удалить';del.setAttribute('aria-label','Удалить '+rule.login);del.addEventListener('click',()=>{if(confirm(`Удалить приветствие для ${rule.login}?`)){S.rules=S.rules.filter(r=>r!==rule);saveRules();log(`${rule.login}: удалено`);}});actions.append(edit,del);tdActions.append(actions);row.append(tdUser,tdText,tdOn,tdActions);tbody.append(row);
 }$('emptyState').hidden=count!==0;}
function openRuleDialog(rule=null){S.editing=rule;$('modalHeading').textContent=rule?'Редактировать приветствие':'Добавить зрителя';$('ruleLogin').value=rule?.login||'';$('ruleText').value=rule?.message||'Привет, {user}! Устраивайся поудобнее ✦';$('ruleEnabled').checked=rule?.enabled??true;updateCharacters();$('ruleDialog').showModal();setTimeout(()=>$('ruleLogin').focus(),10);}
function closeDialog(){$('ruleDialog').close();S.editing=null;}
function updateCharacters(){$('charCounter').textContent=`${$('ruleText').value.length} / 500`;}
function saveDialog(evt){evt.preventDefault();let rule;try{rule=normalizeRule({login:$('ruleLogin').value,message:$('ruleText').value,enabled:$('ruleEnabled').checked});}catch(err){toast(err.message);return;}if(S.rules.some(r=>r!==S.editing&&normalizeLogin(r.login)===normalizeLogin(rule.login))){toast('Этот зритель уже есть в списке.');return;}if(S.editing)Object.assign(S.editing,rule);else S.rules.push(rule);saveRules();log(`${rule.login}: приветствие сохранено`);closeDialog();}
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
function handleChat(evt){if(!S.started||!S.sessionId||!evt)return;const mid=evt.message_id;if(mid){if(S.seenMessages.has(mid))return;S.seenMessages.add(mid);S.seenMessageOrder.push(mid);if(S.seenMessageOrder.length>500){S.seenMessages.delete(S.seenMessageOrder.shift());}}
 const login=normalizeLogin(evt.chatter_user_login);if(login===normalizeLogin(S.userLogin))return;
 const streamer=S.shoutRules.find(r=>r.enabled&&normalizeLogin(r.login)===login);
 if(streamer){const candidate=matchShout(evt,S.shoutRules,S.shoutSent);if(candidate)enqueueShout(candidate);return;}
 if(S.queuedUsers.has(login))return;const match=pickGreeting(evt,S.rules,S.sentUsers,S.sessionId);if(!match)return;if(S.queue.length>=40){log('Очередь приветствий переполнена, новое сообщение пропущено','error');return;}S.queuedUsers.add(login);S.queue.push(match);log(`${evt.chatter_user_name||login}: добавлено в очередь`);processQueue();}
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
function exportRules(){const data={version:1,exportedAt:new Date().toISOString(),rules:S.rules};const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='xwaran-welcome-'+new Date().toISOString().slice(0,10)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),5000);log('Скачана резервная копия приветствий','success');}
async function importRules(file){if(!file||file.size>1024*1024){toast('Файл не найден или слишком большой (макс. 1 МБ).');return;}try{const d=JSON.parse(await file.text());const incoming=parseRules(d);if(!confirm(`Заменить текущие ${S.rules.length} правил на ${incoming.length} из файла?`))return;S.rules=incoming;saveRules();log('Загружены правила из резервной копии','success');toast('Приветствия импортированы.');}catch(e){toast('Ошибка импорта: '+e.message);}}
function exportShouts(){const data={version:1,exportedAt:new Date().toISOString(),shoutouts:S.shoutRules};const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='xwaran-shoutouts-'+new Date().toISOString().slice(0,10)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),5000);}
async function importShouts(file){if(!file||file.size>1024*1024){toast('Файл слишком большой (максимум 1 МБ).');return;}try{const data=JSON.parse(await file.text());const list=parseShoutRules(data);if(!confirm(`Заменить ${S.shoutRules.length} шотаутов на ${list.length} из файла?`))return;S.shoutRules=list;saveShoutRules();toast('Шотауты импортированы.');}catch(e){toast('Ошибка файла: '+e.message);}}
function wire(){
 $('connectBtn').onclick=()=>{location.assign('./settings.html');};
 window.addEventListener('hashchange',showActiveView);
 $('addShoutBtn').onclick=()=>openShoutDialog();$('addShoutBottom').onclick=()=>openShoutDialog();
 $('shoutDialogClose').onclick=closeShoutDialog;$('cancelShout').onclick=closeShoutDialog;
 $('shoutForm').addEventListener('submit',saveShoutDialog);$('shoutSearch').oninput=renderShoutRules;
 $('shoutPreviewClose').onclick=()=>$('shoutPreviewDialog').close();
 $('shoutInterval').onchange=()=>localStorage.setItem(SHOUT_INTERVAL_KEY,$('shoutInterval').value);
 $('exportShouts').onclick=exportShouts;$('importShouts').onclick=()=>$('shoutFile').click();$('shoutFile').onchange=e=>{importShouts(e.target.files?.[0]);e.target.value='';};
 $('addBtn').onclick=()=>openRuleDialog();$('addBottom').onclick=()=>openRuleDialog();$('dialogClose').onclick=closeDialog;$('cancelRule').onclick=closeDialog;$('ruleForm').addEventListener('submit',saveDialog);$('ruleText').oninput=updateCharacters;$('search').oninput=renderRules;
 $('startBtn').onclick=startBot;$('stopBtn').onclick=()=>{stopBot();log('Автоматика остановлена');};$('cooldown').onchange=()=>localStorage.setItem(COOLDOWN_KEY,$('cooldown').value);$('clearLog').onclick=()=>{S.logs=[];renderLog();};$('exportBtn').onclick=exportRules;$('importBtn').onclick=()=>$('fileInput').click();$('fileInput').onchange=e=>{importRules(e.target.files?.[0]);e.target.value='';};
 window.addEventListener('beforeunload',()=>{if(S.ws)S.ws.close();if(S.reconnectWs)S.reconnectWs.close();});document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&S.token)refreshStream();});}
async function init(){wire();loadSettings();renderRules();renderShoutRules();renderStats();renderShoutStats();showActiveView();applySession();await oauthCallback();if(!S.token)await restoreAuth();log('Панель готова. Приветствия и шотауты отключены до запуска.');}
init().catch(err=>{log('Ошибка запуска панели: '+err.message,'error');toast('Ошибка запуска: '+err.message);});