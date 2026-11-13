import asyncio,re
from pathlib import Path
from playwright.async_api import async_playwright
root=Path('/mnt/data/xwaran-welcome-site/welcome')
core=re.sub(r'^export\s+', '',(root/'core.mjs').read_text(),flags=re.M)
app=(root/'app.mjs').read_text()
app=re.sub(r"^import\s+\{[^\n]+\}\s+from\s+'[^']+';\n",'',app,count=1)
js=core+'\n'+app+'''\nwindow.__welcomeTest={state:S, chat:handleChat};'''
html=(root/'index.html').read_text()
html=re.sub(r'<script[^>]*src="./app.mjs[^>]*></script>','',html)
html=re.sub(r'<link[^>]*stylesheet[^>]*>','',html)
async def main():
 async with async_playwright() as pw:
  b=await pw.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
  page=await b.new_page(viewport={'width':1200,'height':850})
  errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  await page.set_content(html)
  await page.evaluate('''() => {
   const ls=new Map([['xwaran_welcome_client_id_v1','testclientid012345']]);
   const ss=new Map([['xw_welcome_twitch_token','fake-token'],['xw_welcome_twitch_expires',String(Date.now()+3600000)]]);
   const storage=m=>({getItem:k=>m.has(k)?m.get(k):null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k),clear:()=>m.clear()});
   Object.defineProperty(window,'localStorage',{value:storage(ls),configurable:true});
   Object.defineProperty(window,'sessionStorage',{value:storage(ss),configurable:true});
   Object.defineProperty(window,'crypto',{value:{randomUUID:()=>String(Math.random()).slice(2)},configurable:true});
   window.__messages=[];
   window.__subscriptions=[];
   window.fetch=async (url,opts={})=>{
    if(url.includes('id.twitch.tv/oauth2/validate'))return {ok:true,json:async()=>({client_id:'testclientid012345',user_id:'777',login:'xwaran',scopes:['user:read:chat','user:write:chat'],expires_in:3600})};
    if(url.includes('/streams?'))return {ok:true,json:async()=>({data:[]})};
    if(url.includes('/eventsub/subscriptions')){window.__subscriptions.push(JSON.parse(opts.body));return {ok:true,json:async()=>({data:[]})};}
    if(url.includes('/chat/messages')){window.__messages.push(JSON.parse(opts.body));return {ok:true,json:async()=>({data:[{is_sent:true}]})};}
    return {ok:false,status:400,statusText:'Unknown',json:async()=>({})};
   };
   window.WebSocket=class {constructor(){this.readyState=1;window.__ws=this;setTimeout(()=>this.onmessage?.({data:JSON.stringify({metadata:{message_type:'session_welcome'},payload:{session:{id:'w1'}}})}),100)}close(){this.readyState=3;this.onclose?.({});}};
   window.WebSocket.OPEN=1;
  }''')
  await page.evaluate(js)
  await page.wait_for_timeout(300)
  assert await page.locator('#totalRules').inner_text()=='22'
  assert await page.locator('#streamStatus').inner_text()=='Офлайн'
  assert await page.locator('#startBtn').is_enabled(), 'start disabled offline'
  assert await page.locator('#setupPanel').count()==0
  await page.locator('tr:has-text("Hell_Fox_X") input[type=checkbox]').check()
  await page.locator('#startBtn').click()
  await page.wait_for_timeout(400)
  assert await page.locator('#runTitle').inner_text()=='Автоматика работает',await page.locator('#eventLog').inner_text()
  await page.evaluate('''() => {
   const evt=()=>({metadata:{message_type:'notification'},payload:{subscription:{type:'channel.chat.message'},event:{chatter_user_login:'Hell_Fox_X',chatter_user_name:'Hell_Fox_X',message_id:String(Math.random())}}});
   window.__ws.onmessage({data:JSON.stringify(evt())});
  }''')
  await page.wait_for_timeout(250)
  sent=await page.evaluate('window.__messages')
  assert len(sent)==1,sent
  assert sent[0]['broadcaster_id']=='777',sent
  assert await page.locator('#sentCount').inner_text()=='1'
  await page.evaluate('''() => {const e={metadata:{message_type:'notification'},payload:{subscription:{type:'channel.chat.message'},event:{chatter_user_login:'Hell_Fox_X',chatter_user_name:'Hell_Fox_X',message_id:String(Math.random())}}};window.__ws.onmessage({data:JSON.stringify(e)});}''')
  await page.wait_for_timeout(200)
  assert len(await page.evaluate('window.__messages'))==1
  await page.locator('#stopBtn').click()
  assert await page.locator('#runTitle').inner_text()=='Автоматика остановлена'
  assert len(await page.evaluate('window.__subscriptions'))==1
  assert not errors,errors
  print('PASS: 22 Twir rules, no settings on main, offline start works, EventSub mocked chat triggers single greeting, stop works, no JS errors')
  await b.close()
asyncio.run(main())