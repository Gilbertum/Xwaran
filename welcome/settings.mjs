import {CLIENT_ID_KEY} from './core.mjs?v=1.4';
const $=id=>document.getElementById(id);
const AUTH_TOKEN_KEY='xw_welcome_twitch_token';
const AUTH_EXP_KEY='xw_welcome_twitch_expires';
const AUTH_STATE_KEY='xw_welcome_auth_state';
const redirectUri=new URL('./',location.href).href;
function toast(msg){const el=$('toast');el.textContent=msg;el.classList.add('visible');setTimeout(()=>el.classList.remove('visible'),4500);}
function status(connected,text){$('connectionPill').className='pill '+(connected?'connected':'disconnected');$('connectionPill').replaceChildren();const dot=document.createElement('span');dot.className='dot';$('connectionPill').append(dot,document.createTextNode(' '+text));}
async function refreshAuth(){
 const token=sessionStorage.getItem(AUTH_TOKEN_KEY);
 const expiry=Number(sessionStorage.getItem(AUTH_EXP_KEY)||0);
 if(!token||expiry<Date.now()+30000){$('nativeScopeStatus').textContent='Потребуется разрешение на официальные Twitch Shoutout.';status(false,'Не подключено');$('authInfo').textContent='Twitch не подключён. Авторизуйся, чтобы отправлять приветствия от своего аккаунта.';$('disconnectBtn').hidden=true;return;}
 try{
  const res=await fetch('https://id.twitch.tv/oauth2/validate',{headers:{Authorization:'OAuth '+token},cache:'no-store'});
  if(!res.ok)throw new Error('Токен Twitch просрочен.');
  const data=await res.json();
  if(data.client_id!==localStorage.getItem(CLIENT_ID_KEY))throw Error('Client ID не совпадает с текущим приложением.');
  status(true,'@'+data.login);
  $('nativeScopeStatus').textContent=data.scopes?.includes('moderator:manage:shoutouts')?'Нативные шотауты с кнопкой Follow разрешены.':'Чтобы включить кнопку Follow во время эфира, нажми «Войти через Twitch» повторно и подтверди новое разрешение.';
  $('authInfo').textContent='Подключено: @'+data.login+'. Авторизация действительна до '+new Date(expiry).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'})+' (время браузера).';
  $('disconnectBtn').hidden=false;
 }catch(e){status(false,'Требуется повторный вход');$('authInfo').textContent=e.message+' Нажми «Войти через Twitch».';$('disconnectBtn').hidden=false;}
}
function authorize(){
 const id=$('clientId').value.trim();
 if(!/^[a-z0-9]{10,80}$/.test(id)){toast('Проверь Client ID — нужны латинские буквы и цифры.');return;}
 localStorage.setItem(CLIENT_ID_KEY,id);
 const state=crypto.randomUUID()+crypto.randomUUID();
 sessionStorage.setItem(AUTH_STATE_KEY,state);
 const q=new URLSearchParams({response_type:'token',client_id:id,redirect_uri:redirectUri,scope:'user:read:chat user:write:chat moderator:manage:shoutouts',state,force_verify:'true'});
 location.assign('https://id.twitch.tv/oauth2/authorize?'+q.toString());
}
function disconnect(){
 if(!confirm('Отключить Twitch на этом устройстве?'))return;
 sessionStorage.removeItem(AUTH_TOKEN_KEY);sessionStorage.removeItem(AUTH_EXP_KEY);sessionStorage.removeItem(AUTH_STATE_KEY);
 refreshAuth();toast('Twitch отключён от этой вкладки.');
}
$('clientId').value=localStorage.getItem(CLIENT_ID_KEY)||'';
$('redirectUri').textContent=redirectUri;
$('copyRedirect').addEventListener('click',()=>navigator.clipboard.writeText(redirectUri).then(()=>toast('Адрес скопирован')).catch(()=>toast('Не получилось скопировать — выдели вручную.')));
$('authorizeBtn').addEventListener('click',authorize);
$('disconnectBtn').addEventListener('click',disconnect);
refreshAuth().catch(e=>toast(e.message));