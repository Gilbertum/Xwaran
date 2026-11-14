"""Chromium integration test with simulated Twitch EventSub and Helix, no actual account used."""
import asyncio,re,json
from pathlib import Path
from playwright.async_api import async_playwright
ROOT=Path(__file__).resolve().parents[1]
def unmodule(s):
 return re.sub(r'^export\s+','',re.sub(r'^import[^\n]+\n','',s,flags=re.M),flags=re.M)
js='\n'.join(unmodule((ROOT/x).read_text()) for x in ('core.mjs','shoutouts.mjs','profiles.mjs','app.mjs'))+'\nwindow.__test={S,handleChat,stopBot,renderProfileText,migrateLegacyProfiles};'
html=(ROOT/'index.html').read_text()
html=re.sub(r'<script[^>]+src="./app.mjs[^>]*></script>','',html)
html=re.sub(r'<link[^>]+rel="stylesheet"[^>]*>','',html)
html=html.replace('</head>','<style>'+ (ROOT/'styles.css').read_text() +'</style></head>')
async def run():
 async with async_playwright() as pw:
  browser=await pw.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
  page=await browser.new_page(viewport={'width':1440,'height':980},device_scale_factor=1)
  errors=[];page.on('pageerror',lambda exc:errors.append(str(exc)))
  await page.set_content(html)
  await page.evaluate('''() => {
   const local=new Map([['xwaran_welcome_client_id_v1','testclientid012345']]);
   const session=new Map([['xw_welcome_twitch_token','fake-token'],['xw_welcome_twitch_expires',String(Date.now()+3600000)]]);
   const storage=m=>({getItem:k=>m.has(k)?m.get(k):null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k),clear:()=>m.clear()});
   Object.defineProperty(window,'localStorage',{value:storage(local),configurable:true});
   Object.defineProperty(window,'sessionStorage',{value:storage(session),configurable:true});
   Object.defineProperty(window,'crypto',{value:{randomUUID:()=>String(Math.random()).slice(2)},configurable:true});
   window.__messages=[];window.__native=[];window.__subs=[];
   window.fetch=async (url,options={})=>{
    if(url.includes('id.twitch.tv/oauth2/validate'))return {ok:true,json:async()=>({client_id:'testclientid012345',user_id:'777',login:'xwaran',scopes:['user:read:chat','user:write:chat','moderator:manage:shoutouts'],expires_in:3600})};
    if(url.includes('/streams?'))return {ok:true,json:async()=>({data:[]})};
    if(url.includes('/eventsub/subscriptions')){window.__subs.push(JSON.parse(options.body));return {ok:true,json:async()=>({data:[]})};}
    if(url.includes('/chat/messages')){window.__messages.push(JSON.parse(options.body));return {ok:true,json:async()=>({data:[{is_sent:true}]})};}
    if(url.includes('/chat/shoutouts?')){window.__native.push(url);return {ok:true,status:204,json:async()=>({})};}
    if(url.includes('/users?'))return {ok:true,json:async()=>({data:[{id:'123'}]})};
    return {ok:false,status:400,statusText:'Unknown',json:async()=>({message:'Unexpected '+url})};
   };
   window.WebSocket=class {constructor(){this.readyState=1;window.__ws=this;setTimeout(()=>this.onmessage?.({data:JSON.stringify({metadata:{message_type:'session_welcome'},payload:{session:{id:'ws-test'}}})}),30)}close(){this.readyState=3;this.onclose?.({});}};
   window.WebSocket.OPEN=1;
  }''')
  await page.evaluate(js)
  await page.wait_for_timeout(160)
  assert not errors,errors
  assert await page.locator('#totalRules').inner_text()=='22'
  assert await page.locator('#rulesBody tr').count()==22
  row=page.locator('#rulesBody tr').filter(has_text='Hell_Fox_X')
  await row.get_by_label('Редактировать Hell_Fox_X').click()
  assert await page.locator('#ruleText').count()==1
  assert await page.locator('#shoutText').count()==0
  await page.locator('#ruleText').fill('Салют, {user}!')
  await page.locator('#ruleEnabled').evaluate('(el)=>{el.checked=true;el.dispatchEvent(new Event("change"))}')
  await page.locator('#shoutRuleEnabled').evaluate('(el)=>{el.checked=true;el.dispatchEvent(new Event("change"))}')
  assert 'https://www.twitch.tv/hell_fox_x' in await page.locator('#messagePreview').inner_text()
  await page.locator('#ruleForm button[type=submit]').click()
  await page.wait_for_timeout(60)
  assert await page.locator('#enabledRules').inner_text()=='1'
  assert await page.locator('#shoutEnabled').inner_text()=='1'
  assert await row.get_by_label('Активно: Hell_Fox_X').is_checked()
  assert await row.get_by_label('Шотаут: Hell_Fox_X').is_checked()
  # Toggle shoutout off/on; single personal text stays identical
  await row.get_by_label('Шотаут: Hell_Fox_X').evaluate('(el)=>{el.checked=false;el.dispatchEvent(new Event("change"))}')
  await row.get_by_label('Шотаут: Hell_Fox_X').evaluate('(el)=>{el.checked=true;el.dispatchEvent(new Event("change"))}')
  await row.get_by_label('Редактировать Hell_Fox_X').click()
  assert await page.locator('#ruleText').input_value()=='Салют, {user}!'
  await page.locator('#dialogClose').click()
  # simulate no cooldown to speed mock test
  await page.evaluate('''() => {window.__test.S.lastSent=0;const old=Date.now;let steps=0;Date.now=()=>old()+(steps++*20000);}''')
  await page.locator('#startBtn').click()
  await page.wait_for_timeout(150)
  assert await page.locator('#runTitle').inner_text()=='Автоматика работает',await page.locator('#eventLog').inner_text()
  async def dispatch(login,mid):
   await page.evaluate('''([login,mid]) => window.__ws.onmessage({data:JSON.stringify({metadata:{message_type:'notification'},payload:{subscription:{type:'channel.chat.message'},event:{chatter_user_login:login,chatter_user_name:login,chatter_user_id:'1111',message_id:mid}}})})''',[login,mid])
  await dispatch('Hell_Fox_X','evt-1')
  await page.wait_for_timeout(250)
  msgs=await page.evaluate('window.__messages')
  assert len(msgs)==1,msgs
  assert 'Салют, Hell_Fox_X!' in msgs[0]['message'] and 'https://www.twitch.tv/hell_fox_x' in msgs[0]['message'],msgs
  await dispatch('Hell_Fox_X','evt-2')
  await page.wait_for_timeout(80)
  assert len(await page.evaluate('window.__messages'))==1
  # Stream live on next profile; should still post only ONE custom text and one native Follow API call
  row2=page.locator('#rulesBody tr').filter(has_text='Gretel_RS')
  await row2.get_by_label('Шотаут: Gretel_RS').evaluate('(el)=>{el.checked=true;el.dispatchEvent(new Event("change"))}') # automatically activates the text
  await page.evaluate('''() => {window.__test.S.live=true;window.__test.S.shoutHistory=cleanHistory({});}''')
  await dispatch('Gretel_RS','evt-3')
  await page.wait_for_timeout(300)
  assert len(await page.evaluate('window.__messages'))==2,await page.evaluate('window.__messages')
  assert 'https://www.twitch.tv/gretel_rs' in (await page.evaluate('window.__messages'))[1]['message']
  assert len(await page.evaluate('window.__native'))==1,await page.evaluate('window.__native')
  state=await page.evaluate('''() => ({g:JSON.parse(localStorage.getItem("xwaran_welcome_rules_v1")),s:JSON.parse(localStorage.getItem("xwaran_welcome_shoutouts_v1")),migration:localStorage.getItem("xwaran_welcome_unified_text_v15")})''')
  assert state['migration']=='1'
  greet=next(x for x in state['g'] if x['login'].lower()=='hell_fox_x')
  assert greet['message']=='Салют, {user}!'
  await page.locator('#stopBtn').click()
  assert not errors,errors
  await page.screenshot(path='/mnt/data/Xwaran_Welcome_v15_preview.png',full_page=True)
  print('PASS: single input, two switches, 22 profiles, one offline text with link, no duplicate, one online text + native Follow, migration and storage preserved')
  await browser.close()
asyncio.run(run())