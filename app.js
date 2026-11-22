(()=>{'use strict';
const STORE='phaze-v0.1.0',MINUTES=960;
const CATS={work:{name:'Работа',color:'#5d9aff'},family:{name:'Семья',color:'#f1b85b'},ritual:{name:'Ритуалы',color:'#ad91fa'},personal:{name:'Личное',color:'#67d8b0'},rest:{name:'Отдых',color:'#fa829a'},other:{name:'Другое',color:'#aab5c7'}};
const $=id=>document.getElementById(id);
const ZONE='Asia/Jerusalem';
const zoned=new Intl.DateTimeFormat('sv-SE',{timeZone:ZONE,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
const localDate=d=>zoned.format(d).slice(0,10);
const fromDate=s=>new Date(s+'T12:00:00Z');
const shiftDate=(date,days)=>new Date(fromDate(date).getTime()+days*86400000).toISOString().slice(0,10);
function wallTime(date,time){
 const desired=Date.parse(date+'T'+time+':00Z');
 const candidates=[desired-86400000,desired+86400000].map(probe=>{
  const wall=Date.parse(zoned.format(new Date(probe)).replace(' ','T')+'Z');
  return desired-(wall-probe);
 }).sort((a,b)=>a-b);
 return new Date(candidates.find(t=>zoned.format(new Date(t)).slice(0,16)===date+' '+time)??candidates[1]);
}
const dayDiff=(a,b)=>Math.round((Date.UTC(+a.slice(0,4),+a.slice(5,7)-1,+a.slice(8,10))-Date.UTC(+b.slice(0,4),+b.slice(5,7)-1,+b.slice(8,10)))/86400000);
const safe=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const minsToText=n=>{n=Math.max(0,Math.round(n));let h=Math.floor(n/60),m=n%60;return h?`${h} ч${m?' '+m+' мин':''}`:`${m} мин`};
const uuid=()=>crypto.randomUUID?crypto.randomUUID():String(Date.now())+Math.random().toString(36).slice(2);
const defaultState=()=>({version:1,wake:'07:00',events:[],google:{clientId:'',selectedIds:[],cache:{},calendars:[]}});
let state=defaultState();try{const v=JSON.parse(localStorage.getItem(STORE)||'null');if(v&&v.version===1&&Array.isArray(v.events)){state={...defaultState(),...v,google:{...defaultState().google,...(v.google||{})}}}}catch{}
let selectedDate=localDate(new Date()),googleAccessToken='',googleExpire=0,tokenClient=null,toastTimer=null;
function save(){try{localStorage.setItem(STORE,JSON.stringify(state))}catch{toast('Недостаточно места для сохранения')}}
function toast(s){const el=$('toast');el.textContent=s;el.classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('visible'),3500)}
function wakeWindow(date=selectedDate){const start=wallTime(date,state.wake);return{start,end:new Date(start.getTime()+MINUTES*60000)}}
function activeDate(now=new Date()){
 const date=localDate(now), previous=shiftDate(date,-1);
 return now<wakeWindow(previous).end?previous:date;
}
selectedDate=activeDate();
const clockStr=d=>d.toLocaleTimeString('ru-RU',{timeZone:ZONE,hour:'2-digit',minute:'2-digit',hour12:false});
function positionOf(event,win){
 if(event.startMode==='relative')return win.start.getTime()+Number(event.offsetMin)*60000;
 const date=event.start<state.wake?shiftDate(selectedDate,1):selectedDate;
 return wallTime(date,event.start).getTime();
}
function applies(e,date){const r=e.repeat||{type:'none',date};switch(r.type){case 'daily':return true;case 'weekly':return (r.weekdays||[]).includes(fromDate(date).getUTCDay());case 'interval':return dayDiff(date,r.anchor)>=0&&dayDiff(date,r.anchor)%Math.max(1,r.everyDays)===0;case 'dates':return(r.dates||[]).includes(date);case 'none':return r.date===date;default:return false}}
function getLocal(win){return state.events.filter(e=>applies(e,selectedDate)&&!(e.skipDates||[]).includes(selectedDate)).map(e=>{let startMs=positionOf(e,win);return {...e,source:'local',startMs,endMs:startMs+Number(e.durationMin)*60000,done:(e.doneDates||[]).includes(selectedDate)}}).filter(e=>e.startMs<win.end.getTime()&&e.endMs>win.start.getTime()).sort((a,b)=>a.startMs-b.startMs)}
function getGoogle(win){const raw=state.google.cache[selectedDate]||[];return raw.map(e=>({...e,source:'google',startMs:Date.parse(e.start),endMs:Date.parse(e.end)})).filter(e=>e.allDay||(Number.isFinite(e.startMs)&&e.startMs<win.end.getTime()&&e.endMs>win.start.getTime())).sort((a,b)=>a.startMs-b.startMs)}
function intervals(events,win){return events.filter(e=>!e.allDay).map(e=>[Math.max(0,(e.startMs-win.start.getTime())/60000),Math.min(MINUTES,(e.endMs-win.start.getTime())/60000)]).filter(p=>p[1]>p[0]).sort((a,b)=>a[0]-b[0])}
function unionMinutes(intervals){let n=0,end=-1;for(const [a,b] of intervals){if(a>=end){n+=b-a;end=b}else if(b>end){n+=b-end;end=b}}return Math.round(n)}
const pt=(r,min)=>{let a=min/MINUTES*Math.PI*2-Math.PI/2;return [220+r*Math.cos(a),220+r*Math.sin(a)]};
const arcPath=(s,e,ro,ri)=>{s=Math.max(0,s);e=Math.min(MINUTES,e);if(e<=s)return '';if(e-s>=MINUTES)e=s+MINUTES-.001;const [x1,y1]=pt(ro,s),[x2,y2]=pt(ro,e),[x3,y3]=pt(ri,e),[x4,y4]=pt(ri,s),large=(e-s>MINUTES/2)?1:0;return `M${x1.toFixed(2)},${y1.toFixed(2)} A${ro},${ro} 0 ${large} 1 ${x2.toFixed(2)},${y2.toFixed(2)} L${x3.toFixed(2)},${y3.toFixed(2)} A${ri},${ri} 0 ${large} 0 ${x4.toFixed(2)},${y4.toFixed(2)} Z`};
function renderDial(locals,google,win){let markup=`<circle cx="220" cy="220" r="191" fill="none" stroke="#2e405c" stroke-width="3"/><circle cx="220" cy="220" r="174" fill="none" stroke="#26374f" stroke-width="49"/><circle cx="220" cy="220" r="112" fill="none" stroke="#273d53" stroke-width="17"/><circle cx="220" cy="220" r="97" fill="#101a2a" stroke="#30415a" stroke-width="1"/>`;
 for(let i=0;i<16;i++){const [x1,y1]=pt(i%4===0?183:188,i*60),[x2,y2]=pt(i%4===0?198:195,i*60);markup+=`<line class="tick ${i%4===0?'major':''}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`;if(i%4===0){let [x,y]=pt(211,i*60);markup+=`<text class="ring-label" x="${x}" y="${y}">${i===0?'0/16':i}</text>`}else if(i%2===0){let[x,y]=pt(211,i*60);markup+=`<text class="minor-label" x="${x}" y="${y}">${i}</text>`}};
 let laneEnds=[-1,-1,-1];for(const e of locals){const s=Math.max(0,(e.startMs-win.start.getTime())/60000),end=Math.min(MINUTES,(e.endMs-win.start.getTime())/60000);let lane=laneEnds.findIndex(x=>x<=s);if(lane<0)lane=2;laneEnds[lane]=Math.max(laneEnds[lane],end);const rr=[[175,153],[151,132],[130,123]][lane],color=CATS[e.category]?.color||CATS.other.color;markup+=`<path tabindex="0" role="button" aria-label="${safe(e.title)}" class="event-sector ${e.done?'done':''}" d="${arcPath(s,end,rr[0],rr[1])}" fill="${color}" data-event-id="${safe(e.id)}"><title>${safe(e.title)} · ${minsToText(e.durationMin)}</title></path>`}
 const googleLaneEnds=[-1,-1,-1];
 for(const e of google){if(e.allDay)continue;const s=(e.startMs-win.start.getTime())/60000,end=(e.endMs-win.start.getTime())/60000;let lane=googleLaneEnds.findIndex(value=>value<=Math.max(0,s));if(lane<0)lane=2;googleLaneEnds[lane]=Math.max(googleLaneEnds[lane],end);const outer=119-lane*6;markup+=`<path tabindex="0" role="button" aria-label="${safe(e.title)}" class="calendar-sector" d="${arcPath(s,end,outer,outer-5)}" fill="${safe(e.color||'#75cbd5')}" data-google-event="${safe(e.id)}"><title>${safe(e.title)} · Google Calendar</title></path>`}
 markup+=`<circle class="day-progress" id="dayProgress" cx="220" cy="220" r="191" fill="none" stroke-width="3.8" stroke-linecap="round" transform="rotate(-90 220 220)" stroke-dasharray="0 1200"/><line class="current-hand" id="currentHand" x1="220" y1="220" x2="220" y2="62"/><circle class="current-dot" id="currentDot" cx="220" cy="220" r="4"/>`;
 $('dial').innerHTML=markup;
 $('dial').querySelectorAll('[data-event-id]').forEach(el=>{const run=()=>openEvent(state.events.find(e=>e.id===el.dataset.eventId));el.addEventListener('click',run);el.addEventListener('keydown',ev=>{if(ev.key==='Enter'||ev.key===' '){ev.preventDefault();run()}})});
 $('dial').querySelectorAll('[data-google-event]').forEach(el=>el.addEventListener('click',()=>toast('Событие Google Calendar доступно только для просмотра')));
 $('dial').onclick=ev=>{if(ev.target.closest('[data-event-id],[data-google-event]'))return;const rect=$('dial').getBoundingClientRect(),x=(ev.clientX-rect.left)*440/rect.width-220,y=(ev.clientY-rect.top)*440/rect.height-220,r=Math.hypot(x,y);if(r<122||r>182)return;let angle=(Math.atan2(y,x)+Math.PI/2+Math.PI*2)%(Math.PI*2),offset=Math.round(angle/(Math.PI*2)*MINUTES/15)*15;offset=Math.min(offset,959);openEvent({title:'',category:'personal',durationMin:60,startMode:'relative',offsetMin:offset,start:state.wake,repeat:{type:'daily'},doneDates:[],skipDates:[]})};tickClock();
}
function tickClock(){const now=new Date();const p=now.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit',hour12:true,timeZone:ZONE}).split(' ');$('clockTime').textContent=p[0];$('clockAmPm').textContent=p[1]||'';
 const win=wakeWindow();const frac=(now-win.start)/(win.end-win.start),cl=Math.max(0,Math.min(1,frac));let val=MINUTES*(Number.isFinite(frac)?cl:0),[hx,hy]=pt(177,val);
 if($('currentHand')){$('currentHand').setAttribute('x2',hx);$('currentHand').setAttribute('y2',hy);$('currentHand').style.display=selectedDate===activeDate(now)&&frac>=0&&frac<=1?'':'none';}
 const prog=$('dayProgress');if(prog){prog.setAttribute('stroke-dasharray',`${(191*2*Math.PI*cl).toFixed(2)} 1200`);prog.style.display=selectedDate===activeDate(now)?'':'none'}
 $('awakeRemaining').textContent=selectedDate===activeDate(now)?(frac<0?'День ещё не начался':frac>1?'16 часов завершены':`${minsToText((1-cl)*MINUTES)} до сна`):'Режим живых часов';
 $('elapsedLabel').textContent=selectedDate===activeDate(now)?`Пройдено ${minsToText(cl*MINUTES)} из 16 ч`:'Выбран другой день';
}
function render(){const win=wakeWindow(),locals=getLocal(win),google=getGoogle(win),all=[...locals,...google];$('dateLabel').textContent=fromDate(selectedDate).toLocaleDateString('ru-RU',{weekday:'long',day:'numeric',month:'long',timeZone:'UTC'});$('dayRange').textContent=`${clockStr(win.start)} → ${clockStr(win.end)} · 16 часов`;renderDial(locals,google,win);
 const occupied=unionMinutes(intervals(all,win));$('plannedStat').textContent=minsToText(occupied);$('freeStat').textContent=minsToText(MINUTES-occupied);$('doneStat').textContent=minsToText(unionMinutes(intervals(locals.filter(x=>x.done),win)));$('eventSubtitle').textContent=`${locals.length} своих · ${google.length} из Google Calendar`;
 let html='';for(const e of [...all].sort((a,b)=>(a.allDay?-Infinity:a.startMs)-(b.allDay?-Infinity:b.startMs))){const isG=e.source==='google',from=e.allDay?'Весь день':clockStr(new Date(e.startMs)),to=e.allDay?'':clockStr(new Date(e.endMs)),color=isG?(e.color||'#75cbd5'):(CATS[e.category]?.color||CATS.other.color);const cat=isG?'Google Calendar':(CATS[e.category]?.name||'Другое');html+=`<div class="event-item ${e.done?'completed':''}"><i class="event-color" style="background:${safe(color)}"></i><div class="event-text"><div class="event-title">${safe(e.title)}</div><div class="event-meta">${from}${to?'–'+to:''} · ${cat}${!isG&&e.repeat.type!=='none'?' · ↻':''}</div></div><div class="event-actions">${isG?'':`<button class="event-check ${e.done?'checked':''}" aria-label="${e.done?'Отменить выполнение':'Отметить выполнение'}" data-done="${safe(e.id)}">${e.done?'✓':'○'}</button><button class="event-edit" aria-label="Редактировать" data-edit="${safe(e.id)}">✎</button>`}</div></div>`}
 $('eventList').innerHTML=html||`<div class="empty-events">В этом дне пока нет событий.<br>Добавь первое событие и раскрась время.</div>`;
 $('eventList').querySelectorAll('[data-edit]').forEach(b=>b.addEventListener('click',()=>openEvent(state.events.find(e=>e.id===b.dataset.edit))));$('eventList').querySelectorAll('[data-done]').forEach(b=>b.addEventListener('click',()=>{const e=state.events.find(x=>x.id===b.dataset.done);if(!e)return;e.doneDates=e.doneDates||[];e.doneDates=e.doneDates.includes(selectedDate)?e.doneDates.filter(x=>x!==selectedDate):[...e.doneDates,selectedDate];save();render()}));
 $('cloudStatus').textContent=googleAccessToken&&Date.now()<googleExpire?'● Google подключён':'● Локальный режим'+(google.length?' · кэш Google':'');}
function modal(id,show){$(id).hidden=!show;document.body.style.overflow=show?'hidden':''}
function renderRepeatFields(){const r=$('repeatField').value;for(const id of ['weekRow','intervalRow','datesRow','singleRow'])$(id).hidden=!(id===({weekly:'weekRow',interval:'intervalRow',dates:'datesRow',none:'singleRow'}[r]));}
function renderModeFields(){const rel=$('startMode').value==='relative';$('relativeRow').hidden=!rel;$('clockRow').hidden=rel}
function openEvent(e){if(!e)return;const edit=!!e.id;$('eventModalTitle').textContent=edit?'Редактировать повторение':'Новое событие';$('eventId').value=edit?e.id:'';$('titleField').value=e.title||'';$('categoryField').value=e.category||'family';$('durationField').value=e.durationMin||60;$('startMode').value=e.startMode||'relative';$('offsetField').value=e.offsetMin??0;$('startField').value=e.start||state.wake;$('repeatField').value=e.repeat?.type||'daily';$('intervalField').value=e.repeat?.everyDays||2;$('anchorField').value=e.repeat?.anchor||selectedDate;$('datesField').value=(e.repeat?.dates||[]).join(', ');$('singleField').value=e.repeat?.date||selectedDate;$('weekRow').querySelectorAll('input[type=checkbox]').forEach(b=>b.checked=(e.repeat?.weekdays||[1,2,3,4,5]).includes(Number(b.value)));$('deleteEventBtn').hidden=!edit;renderModeFields();renderRepeatFields();modal('eventModal',true)}
function onSaveEvent(ev){ev.preventDefault();const rtype=$('repeatField').value,duration=Number($('durationField').value),offset=Number($('offsetField').value);if(!Number.isFinite(duration)||duration<1||duration>960||!Number.isFinite(offset)||offset<0||offset>959){toast('Проверь время и продолжительность');return}let repeat={type:rtype};if(rtype==='weekly'){repeat.weekdays=[...$('weekRow').querySelectorAll('input:checked')].map(b=>Number(b.value));if(!repeat.weekdays.length){toast('Выбери хотя бы один день недели');return}}if(rtype==='interval'){repeat.everyDays=Math.round(Number($('intervalField').value));repeat.anchor=$('anchorField').value;if(!repeat.anchor||repeat.everyDays<2||repeat.everyDays>365){toast('Проверь правило повторения');return}}if(rtype==='dates'){repeat.dates=$('datesField').value.split(/[,;\n]+/).map(s=>s.trim()).filter(Boolean);if(!repeat.dates.length||repeat.dates.some(x=>!/^\d{4}-\d{2}-\d{2}$/.test(x)||!Number.isFinite(fromDate(x).getTime())||fromDate(x).toISOString().slice(0,10)!==x)){toast('Укажи корректные даты ГГГГ-ММ-ДД');return}}if(rtype==='none'){repeat.date=$('singleField').value;if(!repeat.date){toast('Выбери дату');return}}
 const id=$('eventId').value;const original=state.events.find(e=>e.id===id);const next={id:id||uuid(),title:$('titleField').value.trim(),category:$('categoryField').value,durationMin:duration,startMode:$('startMode').value,offsetMin:Math.round(offset),start:$('startField').value,repeat,doneDates:original?.doneDates||[],skipDates:original?.skipDates||[]};if(!next.title){toast('Введите название');return}if(next.startMode==='relative'&&offset+duration>960){toast('Событие выходит за пределы 16-часового дня');return}if(id)state.events=state.events.map(e=>e.id===id?next:e);else state.events.push(next);save();modal('eventModal',false);render();toast('Событие сохранено')}
function dayMove(delta){selectedDate=shiftDate(selectedDate,delta);render();if(googleAccessToken&&Date.now()<googleExpire)syncGoogle(false)}
function exportData(){const data={...state,google:{...state.google,cache:{},calendars:[]}};const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`phaze-backup-${localDate(new Date())}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('Резервная копия сохранена (без кэша Google)')}
const validTime=value=>typeof value==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(value);
const validDate=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(+fromDate(value))&&fromDate(value).toISOString().slice(0,10)===value;
const validDates=value=>Array.isArray(value)&&value.every(validDate);
function validRepeat(rule){
 if(!rule)return false;
 switch(rule.type){
  case 'daily':return true;
  case 'none':return validDate(rule.date);
  case 'weekly':return Array.isArray(rule.weekdays)&&rule.weekdays.length>0&&rule.weekdays.every(day=>Number.isInteger(day)&&day>=0&&day<=6);
  case 'interval':return validDate(rule.anchor)&&Number.isInteger(rule.everyDays)&&rule.everyDays>=2&&rule.everyDays<=365;
  case 'dates':return validDates(rule.dates)&&rule.dates.length>0;
  default:return false;
 }
}
function validEvent(e){
 return e&&typeof e.id==='string'&&e.id&&typeof e.title==='string'&&e.title.trim()&&e.title.length<=80
  &&Number.isInteger(e.durationMin)&&e.durationMin>=1&&e.durationMin<=960
  &&(e.startMode==='clock'?validTime(e.start):e.startMode==='relative'&&Number.isInteger(e.offsetMin)&&e.offsetMin>=0&&e.offsetMin+e.durationMin<=960)
  &&validRepeat(e.repeat)&&validDates(e.doneDates??[])&&validDates(e.skipDates??[]);
}
async function importData(file){try{if(file.size>2e6)throw Error('Файл слишком большой');const v=JSON.parse(await file.text());if(v.version!==1||!Array.isArray(v.events)||v.events.length>3000||!v.events.every(validEvent)||new Set(v.events.map(e=>e.id)).size!==v.events.length||!validTime(v.wake))throw Error('Формат файла не подходит');if(!confirm(`Заменить локальные события (${state.events.length}) событиями из файла (${v.events.length})?`))return;state.events=v.events;state.wake=v.wake;state.google.cache={};googleSyncVersion++;save();render();toast('Данные восстановлены')}catch(err){toast('Не удалось импортировать: '+err.message)}}
function setGoogleMessage(s){$('googleMessage').textContent=s}
function googleError(e){const msg=e.message||String(e);setGoogleMessage(msg);toast('Google: '+msg)}
function startGoogleAuth(){const clientId=$('clientIdField').value.trim();if(!/^[\w-]+\.apps\.googleusercontent\.com$/.test(clientId)){googleError(Error('Введи OAuth Client ID веб-приложения'));return}if(!window.google?.accounts?.oauth2){toast('Google Identity недоступен — проверь сеть');return}try{tokenClient=google.accounts.oauth2.initTokenClient({client_id:clientId,scope:'https://www.googleapis.com/auth/calendar.readonly',callback:async res=>{if(res.error||!res.access_token){googleError(Error(res.error_description||res.error||'Google не выдал токен'));return}googleSyncVersion++;state.google.cache={};render();googleAccessToken=res.access_token;googleExpire=Date.now()+(Number(res.expires_in)||3600)*1000-60000;setGoogleMessage('Доступ предоставлен на текущую сессию');try{await fetchCalendars();await syncGoogle(true)}catch(err){googleError(err)}},error_callback:e=>googleError(Error(({popup_closed:'Окно Google закрыто',popup_failed_to_open:'Разреши всплывающие окна для PHAZE'})[e.type]||e.message||'Ошибка авторизации'))});tokenClient.requestAccessToken({prompt:googleAccessToken?'':'consent'})}catch(e){googleError(e)}}
async function calendarGet(path,params={}){if(!googleAccessToken||Date.now()>=googleExpire)throw Error('Сессия Google истекла, подключись снова');const url=new URL('https://www.googleapis.com/calendar/v3/'+path);for(const [k,v]of Object.entries(params))url.searchParams.set(k,v);const r=await fetch(url,{headers:{Authorization:'Bearer '+googleAccessToken},signal:AbortSignal.timeout(15000)});if(!r.ok){const messages={401:'Доступ истёк. Подключи Google снова.',403:'Нет доступа к календарю или Calendar API. Проверь разрешения и настройки Google Cloud.',429:'Google ограничил число запросов. Повтори позже.'};throw Error(messages[r.status]||`Google Calendar API: HTTP ${r.status}`)}return r.json()}
async function fetchCalendars(){let c=[],page='';do{const o=await calendarGet('users/me/calendarList',{maxResults:'250',...(page?{pageToken:page}:{})});c.push(...(o.items||[]));page=o.nextPageToken||''}while(page);state.google.calendars=c.map(x=>({id:x.id,name:x.summary||x.id,color:x.backgroundColor||'#75cbd5',primary:!!x.primary}));const known=state.google.selectionSet||state.google.selectedIds.length>0;state.google.selectedIds=known?state.google.selectedIds.filter(id=>c.some(item=>item.id===id)):c.map(x=>x.id);state.google.selectionSet=true;save();renderCalendarChooser()}
function renderCalendarChooser(){const c=state.google.calendars;if(!c.length){$('calendarChooser').hidden=true;return}$('calendarChooser').hidden=false;$('calendarOptions').innerHTML=c.map(x=>`<label><input type="checkbox" data-calendar-id="${safe(x.id)}" ${state.google.selectedIds.includes(x.id)?'checked':''}><span style="color:${/^#[0-9a-fA-F]{6}$/.test(x.color)?x.color:'#75cbd5'}">●</span>${safe(x.name)}</label>`).join('');$('calendarOptions').querySelectorAll('input').forEach(el=>el.addEventListener('change',()=>{const id=el.dataset.calendarId;state.google.selectedIds=el.checked?[...new Set([...state.google.selectedIds,id])]:state.google.selectedIds.filter(x=>x!==id);state.google.cache={};save();render();syncGoogle(true)}))}
let googleSyncVersion=0;
async function syncGoogle(showToast=true){
 const request=++googleSyncVersion;
 if(!googleAccessToken||Date.now()>=googleExpire){
  if(showToast)setGoogleMessage('Подключи Google снова, чтобы обновить календарь');
  return;
 }
 const date=selectedDate,win=wakeWindow(date),events=[],ids=[...state.google.selectedIds];
 const isCurrent=()=>request===googleSyncVersion&&date===selectedDate;
 setGoogleMessage('Загружаю события…');
 try{
  for(const id of ids){
   const meta=state.google.calendars.find(x=>x.id===id);
   const color=/^#[0-9a-fA-F]{6}$/.test(meta?.color||'')?meta.color:'#75cbd5';
   let page='';
   do{
    const data=await calendarGet('calendars/'+encodeURIComponent(id)+'/events',{
     timeMin:win.start.toISOString(),timeMax:win.end.toISOString(),timeZone:ZONE,
     singleEvents:'true',showDeleted:'false',maxResults:'2500',...(page?{pageToken:page}:{})
    });
    if(!isCurrent())return;
    for(const item of data.items||[]){
     if(item.status==='cancelled'||!item.start||!item.end)continue;
     const allDay=Boolean(item.start.date);
     if(allDay&&!(item.start.date<=date&&date<item.end.date))continue;
     const start=allDay?wallTime(item.start.date,'00:00').toISOString():item.start.dateTime;
     const end=allDay?wallTime(item.end.date,'00:00').toISOString():item.end.dateTime;
     if(!Number.isFinite(Date.parse(start))||!(Date.parse(end)>Date.parse(start)))continue;
     events.push({id:id+'/'+item.id,title:item.summary||'(Без названия)',start,end,allDay,color,calendarId:id});
    }
    page=data.nextPageToken||'';
   }while(page);
  }
  state.google.cache[date]=events;
  for(const key of Object.keys(state.google.cache).sort().sort((a,b)=>Math.abs(dayDiff(a,date))-Math.abs(dayDiff(b,date))).slice(14))delete state.google.cache[key];
  save();render();
  setGoogleMessage(`Обновлено в ${clockStr(new Date())} · ${events.length} событий`);
  if(showToast)toast(`Получено ${events.length} событий из Google Calendar`);
 }catch(error){if(isCurrent())googleError(error)}
}
function setup(){const events=[['prevBtn','click',()=>dayMove(-1)],['nextBtn','click',()=>dayMove(1)],['todayBtn','click',()=>{selectedDate=activeDate();render();if(googleAccessToken)syncGoogle(false)}],['addBtn','click',()=>openEvent({title:'',category:'family',durationMin:60,startMode:'relative',offsetMin:0,start:state.wake,repeat:{type:'daily'},doneDates:[],skipDates:[]})],['settingsBtn','click',()=>{$('wakeField').value=state.wake;$('clientIdField').value=state.google.clientId;renderCalendarChooser();modal('settingsModal',true)}],['eventForm','submit',onSaveEvent],['repeatField','change',renderRepeatFields],['startMode','change',renderModeFields],['exportBtn','click',exportData],['exportFooter','click',exportData],['importBtn','click',()=>$('importFile').click()],['importFile','change',ev=>{if(ev.target.files[0])importData(ev.target.files[0]);ev.target.value=''}],['connectGoogleBtn','click',startGoogleAuth],['syncGoogleBtn','click',()=>syncGoogle()],['clearCalendarBtn','click',()=>{googleSyncVersion++;state.google.cache={};save();render();setGoogleMessage('Кэш Google очищен');toast('Кэш Google очищен')}]];for(const [id,t,f]of events)$(id).addEventListener(t,f);
 $('deleteEventBtn').addEventListener('click',()=>{const id=$('eventId').value;if(!id||!confirm('Удалить событие и все его повторения?'))return;state.events=state.events.filter(e=>e.id!==id);save();modal('eventModal',false);render();toast('Событие удалено')});
 $('wakeField').addEventListener('change',e=>{if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(e.target.value))return;state.wake=e.target.value;googleSyncVersion++;state.google.cache={};save();render();if(googleAccessToken)syncGoogle(false);toast('Время пробуждения обновлено')});
 $('clientIdField').addEventListener('change',e=>{const v=e.target.value.trim();if(v!==state.google.clientId){state.google.clientId=v;googleSyncVersion++;state.google.selectedIds=[];state.google.selectionSet=false;state.google.calendars=[];state.google.cache={};googleAccessToken='';googleExpire=0;renderCalendarChooser();setGoogleMessage('Не подключено');save();render()}});
 $('dateBtn').addEventListener('click',()=>{const input=$('dateInput');input.value=selectedDate;input.showPicker?input.showPicker():input.click()});$('dateInput').addEventListener('change',e=>{if(/^\d{4}-\d{2}-\d{2}$/.test(e.target.value)){selectedDate=e.target.value;render();if(googleAccessToken)syncGoogle(false)}});
 document.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>modal(b.dataset.close,false)));document.querySelectorAll('.modal-overlay').forEach(el=>el.addEventListener('mousedown',e=>{if(e.target===el)modal(el.id,false)}));document.addEventListener('keydown',e=>{if(e.key==='Escape'){modal('eventModal',false);modal('settingsModal',false)}});
 document.addEventListener('visibilitychange',()=>{if(!document.hidden){tickClock();render()}});
 if('serviceWorker'in navigator&&location.protocol.startsWith('http'))navigator.serviceWorker.register('./service-worker.js').catch(()=>{});
 render();setInterval(tickClock,1000)}
setup();
})();
