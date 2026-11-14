import asyncio,re,json
from pathlib import Path
from playwright.async_api import async_playwright
ROOT=Path(__file__).resolve().parents[1]
def unmodule(s):
 return re.sub(r'^export\s+','',re.sub(r'^import[^\n]+\n','',s,flags=re.M),flags=re.M)
js='\n'.join(unmodule((ROOT/x).read_text()) for x in ('core.mjs','shoutouts.mjs','profiles.mjs','app.mjs'))+'\nwindow.__test={S,handleChat,stopBot};'
html=(ROOT/'index.html').read_text()
html=re.sub(r'<script[^>]+src="./app.mjs[^>]*></script>','',html)
html=re.sub(r'<link[^>]+rel="stylesheet"[^>]*>','',html)
html=html.replace('</head>','<style>'+ (ROOT/'styles.css').read_text() +'</style></head>')

async def run():
 async with async_playwright() as pw:
  browser=await pw.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
  page=await browser.new_page(viewport={'width':1440,'height':960},device_scale_factor=1)
  errors=[]
  page.on('pageerror',lambda exc:errors.append(str(exc)))
  print('STEP   await page.set_content(html)',flush=True)
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
  print('STEP   await page.evaluate(js)',flush=True)
  await page.evaluate(js)
  await page.wait_for_timeout(150)
  print('STEP   assert await page.locator(_#totalRules_)',flush=True)
  assert await page.locator('#totalRules').inner_text()=='22'
  assert await page.locator('#enabledRules').inner_text()=='0'
  assert await page.locator('#shoutEnabled').inner_text()=='0'
  assert await page.locator('#rulesBody tr').count()==22
  assert not await page.locator('#navShoutouts').count()
  assert not await page.locator('#shoutoutsView').count()
  # modal: one record has two independent controls; saved custom texts
  row=page.locator('#rulesBody tr').filter(has_text='Hell_Fox_X')
  print('STEP   await row.get_by_label(_Редактировать Hell_Fox_X_).click()',flush=True)
  await row.get_by_label('Редактировать Hell_Fox_X').click()
  assert await page.locator('#ruleDialog').is_visible()
  assert await page.locator('#ruleEnabled').count()==1 and await page.locator('#shoutRuleEnabled').count()==1
  await page.locator('#ruleText').fill('Салют, {user}!')
  await page.locator('#shoutText').fill('Загляните к {user}: {url}')
  await page.locator('#ruleEnabled').evaluate('(el)=>el.checked=true')
  await page.locator('#shoutRuleEnabled').evaluate('(el)=>el.checked=true')
  print('STEP   await page.locator(_#ruleForm button[type=submit]_).click()',flush=True)
  await page.locator('#ruleForm button[type=submit]').click()
  await page.wait_for_timeout(60)
  assert await page.locator('#enabledRules').inner_text()=='1'
  assert await page.locator('#shoutEnabled').inner_text()=='1'
  print('STEP   assert await page.locator(_#totalRules_)',flush=True)
  assert await page.locator('#totalRules').inner_text()=='22'
  assert await row.get_by_label('Приветствие: Hell_Fox_X').is_checked()
  assert await row.get_by_label('Шотаут: Hell_Fox_X').is_checked()
  print('STEP   await page.screenshot(path=',flush=True)
  await page.screenshot(path='/mnt/data/Xwaran_Welcome_v14_preview.png',full_page=True)
  # Check independent toggle does not overwrite welcome or shout texts
  await row.get_by_label('Шотаут: Hell_Fox_X').evaluate('(el)=>{el.checked=false;el.dispatchEvent(new Event("change"));}')
  await row.get_by_label('Шотаут: Hell_Fox_X').evaluate('(el)=>{el.checked=true;el.dispatchEvent(new Event("change"));}')
  print('STEP   await row.get_by_label(_Редактировать Hell_Fox_X_).click()',flush=True)
  await row.get_by_label('Редактировать Hell_Fox_X').click()
  assert await page.locator('#ruleText').input_value()=='Салют, {user}!'
  assert await page.locator('#shoutText').input_value()=='Загляните к {user}: {url}'
  await page.locator('#dialogClose').click()
  # single message triggers BOTH actions; simulate stream offline and make mocked time progress so chat anti-spam pause is honored
  await page.evaluate('''() => {
   const originalNow=Date.now;let t=0;
   Date.now=()=>originalNow()+ (t++ * 20000);
  }''')
  print('STEP   await page.locator(_#startBtn_).click()',flush=True)
  await page.locator('#startBtn').click()
  await page.wait_for_timeout(130)
  assert await page.locator('#runTitle').inner_text()=='Автоматика работает', await page.locator('#eventLog').inner_text()
  print('STEP   await page.evaluate(___() => {window.__ws.onmessage',flush=True)
  await page.evaluate('''() => {window.__ws.onmessage({data:JSON.stringify({metadata:{message_type:'notification'},payload:{subscription:{type:'channel.chat.message'},event:{chatter_user_login:'Hell_Fox_X',chatter_user_name:'Hell_Fox_X',chatter_user_id:'1111',message_id:'evt-1'}}})})}''')
  await page.wait_for_timeout(300)
  msgs=await page.evaluate('window.__messages')
  assert len(msgs)==2,msgs
  assert any('Салют, Hell_Fox_X!' in x['message'] for x in msgs),msgs
  assert any('https://www.twitch.tv/hell_fox_x' in x['message'] for x in msgs),msgs
  print('STEP   await page.evaluate(___() => {window.__ws.onmessage',flush=True)
  await page.evaluate('''() => {window.__ws.onmessage({data:JSON.stringify({metadata:{message_type:'notification'},payload:{subscription:{type:'channel.chat.message'},event:{chatter_user_login:'Hell_Fox_X',chatter_user_name:'Hell_Fox_X',chatter_user_id:'1111',message_id:'evt-2'}}})})}''')
  await page.wait_for_timeout(100)
  assert len(await page.evaluate('window.__messages'))==2
  # native shoutout when online for shout-only profile
  row2=page.locator('#rulesBody tr').filter(has_text='Gretel_RS')
  await row2.get_by_label('Шотаут: Gretel_RS').evaluate('(el)=>{el.checked=true;el.dispatchEvent(new Event("change"));}')
  await page.evaluate('''() => {window.__test.S.live=true;window.__test.S.shoutHistory=cleanHistory({});window.__ws.onmessage({data:JSON.stringify({metadata:{message_type:'notification'},payload:{subscription:{type:'channel.chat.message'},event:{chatter_user_login:'Gretel_RS',chatter_user_name:'Gretel_RS',chatter_user_id:'2222',message_id:'evt-3'}}})})}''')
  await page.wait_for_timeout(160)
  assert len(await page.evaluate('window.__native'))==1,await page.evaluate('window.__native')
  # Save and reload rules via localStorage object for existing session, verify no lost custom contents
  state=await page.evaluate('''() => ({g:JSON.parse(localStorage.getItem("xwaran_welcome_rules_v1")),s:JSON.parse(localStorage.getItem("xwaran_welcome_shoutouts_v1"))})''')
  greet=next(x for x in state['g'] if x['login'].lower()=='hell_fox_x')
  shout=next(x for x in state['s'] if x['login'].lower()=='hell_fox_x')
  assert greet['message']=='Салют, {user}!' and shout['message']=='Загляните к {user}: {url}'
  print('STEP   await page.locator(_#stopBtn_).click()',flush=True)
  await page.locator('#stopBtn').click()
  assert not errors,errors
  print('PASS: 22 unique profiles, two toggles in one modal, no reset, both offline messages, no duplicates, native shoutout online')
  await browser.close()

asyncio.run(run())