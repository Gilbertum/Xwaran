import asyncio,re
from pathlib import Path
from playwright.async_api import async_playwright
ROOT=Path('/mnt/data/xwaran-welcome-site/welcome')
def unmodule(text):
 return re.sub(r'^export\s+','',text,flags=re.M)
core=unmodule((ROOT/'core.mjs').read_text())
shout=unmodule(re.sub(r'^import[^\n]+\n','',(ROOT/'shoutouts.mjs').read_text(),flags=re.M))
app=re.sub(r'^import[^\n]+\n','',(ROOT/'app.mjs').read_text(),flags=re.M)
js=core+'\n'+shout+'\n'+app+'\nwindow.__test={S,handleChat,stopBot};'
html=(ROOT/'index.html').read_text()
html=re.sub(r'<script[^>]+src="./app.mjs[^>]*></script>','',html)
html=re.sub(r'<link[^>]+stylesheet[^>]*>','',html)
async def run():
 async with async_playwright() as pw:
  browser=await pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
  page=await browser.new_page(viewport={'width':1300,'height':900})
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
   window.WebSocket=class {constructor(){this.readyState=1;window.__ws=this;setTimeout(()=>this.onmessage?.({data:JSON.stringify({metadata:{message_type:'session_welcome'},payload:{session:{id:'ws-test'}}})}),60)}close(){this.readyState=3;this.onclose?.({});}};
   window.WebSocket.OPEN=1;
  }''')
  await page.evaluate(js)
  await page.wait_for_timeout(300)
  assert await page.locator('#totalRules').inner_text()=='22'
  assert await page.locator('#shoutTotal').inner_text()=='4'
  assert await page.locator('#startBtn').is_enabled()
  await page.locator('#navShoutouts').click()
  assert await page.locator('#shoutoutsView').is_visible()
  assert not await page.locator('#greetingsView').is_visible()
  await page.locator('#shoutBody tr:has-text("Hell_Fox_X") input[type=checkbox]').check()
  await page.locator('#startBtn').click()
  await page.wait_for_timeout(250)
  assert await page.locator('#runTitle').inner_text()=='Автоматика работает',await page.locator('#eventLog').inner_text()
  await page.evaluate('''() => {window.__ws.onmessage({data:JSON.stringify({metadata:{message_type:'notification'},payload:{subscription:{type:'channel.chat.message'},event:{chatter_user_login:'Hell_Fox_X',chatter_user_name:'Hell_Fox_X',chatter_user_id:'1111',message_id:'msg1'}}})})}''')
  await page.wait_for_timeout(250)
  msgs=await page.evaluate('window.__messages')
  assert len(msgs)==1,msgs
  assert 'https://www.twitch.tv/hell_fox_x' in msgs[0]['message'],msgs
  assert await page.locator('#shoutSent').inner_text()=='1'
  # duplicate event should not send another text
  await page.evaluate('''() => {window.__ws.onmessage({data:JSON.stringify({metadata:{message_type:'notification'},payload:{subscription:{type:'channel.chat.message'},event:{chatter_user_login:'Hell_Fox_X',chatter_user_name:'Hell_Fox_X',chatter_user_id:'1111',message_id:'msg2'}}})})}''')
  await page.wait_for_timeout(100)
  assert len(await page.evaluate('window.__messages'))==1
  # simulate live stream and clear local history for an unrelated streamer, native API should be used
  await page.locator('#shoutBody tr:has-text("PsPuer") input[type=checkbox]').check()
  await page.evaluate('''() => {window.__test.S.live=true;window.__test.S.shoutHistory=cleanHistory({});window.__ws.onmessage({data:JSON.stringify({metadata:{message_type:'notification'},payload:{subscription:{type:'channel.chat.message'},event:{chatter_user_login:'PsPuer',chatter_user_name:'PsPuer',chatter_user_id:'2222',message_id:'msg3'}}})})}''')
  await page.wait_for_timeout(200)
  natives=await page.evaluate('window.__native')
  assert len(natives)==1,natives
  assert 'to_broadcaster_id=2222' in natives[0],natives
  assert await page.locator('#shoutSent').inner_text()=='2'
  # adding a custom streamer through UI
  await page.locator('#addShoutBtn').click()
  await page.locator('#shoutLogin').fill('SomeStreamer')
  await page.locator('#shoutText').fill('Смотрите {url}!')
  await page.locator('#shoutForm button[type=submit]').click()
  assert await page.locator('#shoutTotal').inner_text()=='5'
  # switching views in same browser tab does NOT drop Twitch connection
  await page.locator('#navGreetings').click()
  await page.wait_for_timeout(80)
  assert await page.locator('#greetingsView').is_visible(),await page.evaluate('({hash:location.hash, greetHidden:document.getElementById("greetingsView").hidden,shoutHidden:document.getElementById("shoutoutsView").hidden})')
  assert await page.locator('#runTitle').inner_text()=='Автоматика работает'
  await page.locator('#stopBtn').click()
  assert await page.locator('#runTitle').inner_text()=='Автоматика остановлена'
  assert not errors,errors
  print('PASS browser: 22 legacy greetings retained, 4 opt-in shoutouts, offline text with URL, no duplicate, live native API follow, add rule, SPA tabs keep socket, stop works')
  await browser.close()
asyncio.run(run())