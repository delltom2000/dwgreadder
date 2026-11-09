import './style.css';
import {Viewer} from './viewer';
import {emptyBounds,union,valid} from './geometry';
import type {Scene,Item,Bounds} from './types';
import {listHistory,rememberDrawing,deleteHistory} from './history';
import {drawingColor} from './colors';

const icon=(name:string)=>{const paths:Record<string,string>={file:'<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v5h5M9 12h6M9 16h6"/>',folder:'<path d="M3 7V5h7l2 3h9l-3 12H3z"/>',layers:'<path d="m12 3 10 6-10 6L2 9zM3 13l9 5 9-5M3 17l9 5 9-5"/>',search:'<circle cx="10" cy="10" r="6"/><path d="m15 15 5 5"/>',fit:'<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/><rect x="8" y="8" width="8" height="8"/>',cross:'<path d="M12 2v6m0 8v6M2 12h6m8 0h6"/><circle cx="12" cy="12" r="4"/>',chevron:'<path d="m9 5 7 7-7 7"/>',check:'<path d="m5 12 4 4L19 6"/>',eye:'<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'};return`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]??paths.file}</svg>`;};
document.querySelector('#app')!.innerHTML=`
 <header><div class="brand"><span class="brand-icon">${icon('layers')}</span><strong>图阅</strong><span class="brand-separator"></span><span class="brand-sub">DWG READER</span></div><div class="header-file" id="file-name">轻量图纸阅读器</div><div class="header-actions"><button class="recent-button" id="recent">${icon('file')}最近打开</button><button class="primary" id="open">${icon('folder')}打开图纸<span class="key">Ctrl O</span></button></div></header>
 <main><aside><div class="aside-heading"><span>图纸结构</span><span id="item-count" class="badge">—</span></div><div class="search">${icon('search')}<input id="search" placeholder="搜索图层、图块、文字" aria-label="搜索图纸结构"><kbd>/</kbd></div><div class="tabs" role="tablist"><button role="tab" data-tab="layers" aria-selected="true">图层</button><button role="tab" data-tab="blocks" aria-selected="false">图块</button><button role="tab" data-tab="texts" aria-selected="false">文字</button></div><div class="tree" id="tree"><div class="tree-empty">打开图纸后<br>在这里浏览图纸结构</div></div><div class="aside-footer">${icon('cross')}<span>点击项目，自动定位到图中</span></div></aside>
 <section class="workspace" id="workspace"><div class="canvas-heading"><div class="crumb"><span class="live-dot"></span><span id="space-label">绘图空间</span><span id="drawing-state">等待打开文件</span></div><select id="spaces" aria-label="绘图空间" hidden></select></div><canvas id="canvas" tabindex="0" aria-label="图纸主视图，可拖动平移、滚轮缩放"></canvas>
 <div class="welcome" id="welcome"><div class="welcome-art">${icon('layers')}<span class="art-corner a"></span><span class="art-corner b"></span><span class="art-corner c"></span><span class="art-corner d"></span></div><div class="eyebrow">YOUR DRAWING, IN FOCUS</div><h1>打开图纸，看清每个细节。</h1><p>拖入 DWG 文件，开始阅读。<br>从左侧结构目录，直达图中的每一处。</p><button class="primary large" id="choose">${icon('folder')}选择 DWG 文件</button><button id="sample" class="sample" hidden>打开你的 128 户型示例图纸 →</button><div class="local-note"><span class="live-dot"></span>本机解析 · 文件无需上传</div></div>
 <div class="selection" id="selection" hidden>${icon('cross')}<span id="selection-text"></span><button id="clear-selection" aria-label="取消高亮">×</button></div>
 <div class="view-tools"><button id="zoom-in" title="放大" aria-label="放大">+</button><button id="zoom-out" title="缩小" aria-label="缩小">−</button><span></span><button id="fit" title="显示全图（F）" aria-label="显示全图">${icon('fit')}</button></div><div class="axis"><span class="y">Y</span><i></i><span class="x">X</span></div><div class="canvas-hint">拖动平移<span>·</span>滚轮缩放<span>·</span>双击显示全图</div><div class="drop-mask" id="drop-mask">松开，打开这份图纸</div>
 <div class="loading" id="loading" hidden><span class="spinner"></span><strong id="progress">正在读取图纸…</strong><span>图纸正在本机处理</span><button id="cancel">取消读取</button></div></section></main>
 <footer><span><i id="status-dot"></i><span id="status">就绪</span></span><span id="stats">DWG · 二维图纸阅读</span><span id="zoom-label">—</span></footer><div id="toast" role="alert" hidden></div><input id="file" type="file" accept=".dwg" hidden>
 <dialog class="history-dialog" id="history-dialog" aria-labelledby="history-title"><div class="history-heading"><h2 id="history-title">最近打开的图纸</h2><button id="history-close" aria-label="关闭历史记录">×</button></div><p class="history-note">自动保留最近 10 份图纸的本机副本，点击即可重新打开。<br>记录只保存在当前浏览器中，重新打开的是上次读取时的版本。</p><div id="history-list" class="history-list"></div><div class="history-footer"><span id="history-count">本机历史记录</span><button id="history-clear">清空记录</button></div></dialog>`;
const $=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
const viewer=new Viewer($<HTMLCanvasElement>('canvas'));
let scene:Scene|null=null,worker:Worker|null=null,tab='layers',busy=false,fileName='',timer:ReturnType<typeof setTimeout>|null=null,requestId=0;
const nodes=new Map<string,Item>();let allNodes:Item[]=[];
let pendingHistoryFile:File|null=null;
viewer.onChange=()=>{$('zoom-label').textContent=scene?`1 px ≈ ${(1/viewer.scale).toLocaleString('zh-CN',{maximumFractionDigits:2})} 图纸单位`: '—';};
function toast(message:string){$('toast').textContent=message;$('toast').hidden=false;setTimeout(()=>$('toast').hidden=true,7000);}
function loading(value:boolean){busy=value;$('loading').hidden=!value;$<HTMLButtonElement>('open').disabled=value;$<HTMLButtonElement>('recent').disabled=value;$<HTMLSelectElement>('spaces').disabled=value;}
function failure(message:string){pendingHistoryFile=null;loading(false);if(timer)clearTimeout(timer);toast(message);$('status').textContent=scene?'读取失败 · 保留当前图纸':'读取失败';$('status-dot').classList.add('warn');}
function makeWorker(){worker?.terminate();worker=new Worker(new URL('./parser.worker.ts',import.meta.url),{type:'module'});worker.onmessage=e=>{
 if(e.data.progress)$('progress').textContent=e.data.progress;
 if(e.data.error)failure(e.data.error);
 if(e.data.scene){if(timer)clearTimeout(timer);scene=e.data.scene;loading(false);nodes.clear();allNodes=[];
  const walk=(items:Item[])=>items.forEach(n=>{nodes.set(n.id,n);allNodes.push(n);walk(n.children);});walk(scene!.items);
  viewer.load(scene!);$('welcome').hidden=true;$('file-name').textContent=fileName;$('file-name').title=fileName;
  if(pendingHistoryFile){const savedFile=pendingHistoryFile;pendingHistoryFile=null;void rememberDrawing(savedFile).catch(()=>toast('图纸已打开，但浏览器未能保存历史副本，可能是本机存储空间不足。'));}
  $('drawing-state').textContent='只读预览';$('space-label').textContent=scene!.space.toLowerCase().includes('model')?'模型空间':'布局空间';$('item-count').textContent=allNodes.length.toLocaleString();
  const spaces=$<HTMLSelectElement>('spaces');spaces.replaceChildren(...scene!.spaces.map(s=>{const o=document.createElement('option');o.value=s;o.textContent=s.toLowerCase().includes('model')?'模型空间':`布局空间 · ${s}`;return o;}));spaces.value=scene!.space;spaces.hidden=scene!.spaces.length<2;
  const unsupported=Object.entries(scene!.unsupported),missing=unsupported.reduce((n,[,v])=>n+v,0)+scene!.unknown;
  $('status').textContent=missing?`已读取 · ${missing} 项兼容提示`:(scene!.warnings?.length?'已读取 · 有兼容提示':'已读取');$('status').title=unsupported.map(([t,n])=>`${t}：${n}`).join('；')+(scene!.unknown?`；解析器未知对象：${scene!.unknown}`:'')+(scene!.warnings?.length?`；DWG 解析告警：${scene!.warnings.join(', ')}，部分自定义对象可能不完整`:'');$('status-dot').classList.toggle('warn',!!missing||!!scene!.warnings?.length);
  $('stats').textContent=`${scene!.items.length.toLocaleString()} 个顶层对象 · ${scene!.layers.length} 个可见图层 · ${scene!.primitives.length.toLocaleString()} 个图元`;
  $('selection').hidden=true;renderTree();if(!valid(scene!.bounds))toast('当前空间没有可显示的图形，请切换空间。');
 }
};worker.onerror=e=>failure(`解析失败：${e.message||'解析器异常，请重新打开文件'}`);return worker;}
function timeout(){if(timer)clearTimeout(timer);timer=setTimeout(()=>{worker?.terminate();worker=null;failure('读取超过 90 秒，已停止。请尝试较小图纸或另存为常规二维 DWG。');},90000);}
async function openFile(file:File){if(busy)return;if(!/\.dwg$/i.test(file.name)){toast('请选择 DWG 格式的图纸。');return;}if(file.size>100*1024*1024){toast('当前版本支持 100 MB 以内的 DWG。');return;}
 const current=++requestId;loading(true);$('progress').textContent='正在读取文件…';try{const buffer=await file.arrayBuffer();if(current!==requestId)return;if(new TextDecoder().decode(buffer.slice(0,4))!=='AC10')throw new Error('文件头不是有效的 DWG。请确认文件未损坏。');fileName=file.name;pendingHistoryFile=file;makeWorker().postMessage({buffer,wasmUrl:new URL('./',location.href).href},[buffer]);timeout();}catch(e){if(current===requestId)failure(e instanceof Error?e.message:String(e));}
}
function indexes(item:Item):number[]{return[...item.primitives,...item.children.flatMap(indexes)];}
function focus(label:string,bounds:Bounds,ids:number[],element?:HTMLElement){if(!valid(bounds))return;viewer.focus(bounds,ids);document.querySelectorAll('.row.active').forEach(e=>e.classList.remove('active'));element?.classList.add('active');$('selection-text').textContent=label;$('selection').hidden=false;}
function renderTree(){
 const root=$('tree');root.replaceChildren();if(!scene)return;const query=$<HTMLInputElement>('search').value.trim().toLowerCase();
 const makeRow=(label:string,detail:string,onClick:()=>void,depth=0)=>{
  const row=document.createElement('div');row.className='row';row.style.paddingLeft=`${14+depth*16}px`;
  const button=document.createElement('button');button.className='row-label';button.title=label;button.innerHTML=`<span class="row-icon">${icon(tab==='layers'?'layers':'file')}</span><span class="label"></span><span class="row-detail"></span>`;
  button.querySelector('.label')!.textContent=label;button.querySelector('.row-detail')!.textContent=detail;button.onclick=()=>{onClick();document.querySelectorAll('.row.active').forEach(e=>e.classList.remove('active'));row.classList.add('active');};row.append(button);return row;
 };
 const appendItems=(parent:HTMLElement,items:Item[],depth=0)=>{
  let shown=0;const more=document.createElement('button');more.className='more';
  const append=()=>{more.remove();const end=Math.min(shown+80,items.length);for(;shown<end;shown++){
   const n=items[shown],row=makeRow(n.label,n.type,()=>focus(n.label,n.bounds,indexes(n)),depth);parent.append(row);
   if(n.children.length){const expand=document.createElement('button');expand.className='expand';expand.innerHTML=icon('chevron');expand.setAttribute('aria-label',`展开 ${n.label}`);expand.setAttribute('aria-expanded','false');row.prepend(expand);const sub=document.createElement('div');sub.hidden=true;parent.append(sub);expand.onclick=()=>{sub.hidden=!sub.hidden;expand.classList.toggle('expanded',!sub.hidden);expand.setAttribute('aria-expanded',String(!sub.hidden));if(!sub.hidden&&!sub.children.length)appendItems(sub,n.children,depth+1);};}
  }if(shown<items.length){more.textContent=`再显示 ${Math.min(80,items.length-shown)} 项（剩余 ${items.length-shown}）`;more.onclick=append;parent.append(more);}};append();
 };
 if(tab==='layers'){
  const layerItems=scene.layers.filter(l=>!query||l.name.toLowerCase().includes(query));
  for(const layer of layerItems){const ids:number[]=[],bounds=emptyBounds();scene.primitives.forEach((p,i)=>{if(p.layer===layer.name){ids.push(i);union(bounds,p.bounds);}});
   const row=makeRow(layer.name,String(ids.length),()=>focus(layer.name,bounds,ids));const dot=row.querySelector<HTMLElement>('.row-icon')!;dot.style.color=drawingColor(layer.color);
   const eye=document.createElement('button');eye.className='eye';eye.title='显示 / 隐藏图层';eye.setAttribute('aria-label',`显示或隐藏 ${layer.name}`);eye.setAttribute('aria-pressed',String(!viewer.hidden.has(layer.name)));eye.innerHTML=icon('eye');eye.onclick=()=>{viewer.hidden.has(layer.name)?viewer.hidden.delete(layer.name):viewer.hidden.add(layer.name);eye.classList.toggle('muted',viewer.hidden.has(layer.name));eye.setAttribute('aria-pressed',String(!viewer.hidden.has(layer.name)));viewer.draw();};row.append(eye);
   const expand=document.createElement('button');expand.className='expand';expand.innerHTML=icon('chevron');expand.setAttribute('aria-label',`展开图层 ${layer.name}`);row.prepend(expand);root.append(row);const sub=document.createElement('div');sub.hidden=true;root.append(sub);expand.onclick=()=>{sub.hidden=!sub.hidden;expand.classList.toggle('expanded',!sub.hidden);expand.setAttribute('aria-expanded',String(!sub.hidden));if(!sub.hidden&&!sub.children.length)appendItems(sub,allNodes.filter(n=>n.layer===layer.name&&n.primitives.length>0),1);};
  }
 }else{
  const items=allNodes.filter(n=>(tab==='blocks'?n.type==='INSERT':['TEXT','MTEXT','ATTRIB'].includes(n.type))&&(!query||`${n.label} ${n.layer}`.toLowerCase().includes(query)));appendItems(root,items);
 }
 if(!root.children.length){const empty=document.createElement('div');empty.className='tree-empty';empty.textContent='没有匹配的项目';root.append(empty);}
}
$('open').onclick=$('choose').onclick=()=>$<HTMLInputElement>('file').click();
$<HTMLInputElement>('file').onchange=e=>{const input=e.target as HTMLInputElement;if(input.files?.[0])void openFile(input.files[0]);input.value='';};
$('cancel').onclick=()=>{requestId++;pendingHistoryFile=null;worker?.terminate();worker=null;if(timer)clearTimeout(timer);loading(false);$('status').textContent=scene?'已取消 · 保留当前图纸':'已取消';};
$('zoom-in').onclick=()=>viewer.zoom(1.4);$('zoom-out').onclick=()=>viewer.zoom(1/1.4);$('fit').onclick=()=>viewer.fit();
$('clear-selection').onclick=()=>{viewer.selected.clear();viewer.selection=null;viewer.draw();$('selection').hidden=true;};
$('status').onclick=()=>{if($('status').title)toast($('status').title);};
$<HTMLInputElement>('search').oninput=()=>renderTree();
document.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach(b=>b.onclick=()=>{tab=b.dataset.tab!;document.querySelectorAll('[data-tab]').forEach(t=>t.setAttribute('aria-selected',String(t===b)));renderTree();});
$<HTMLSelectElement>('spaces').onchange=e=>{if(!worker||busy)return;loading(true);worker.postMessage({space:(e.target as HTMLSelectElement).value});timeout();};
document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='o'){e.preventDefault();if(!busy)$<HTMLInputElement>('file').click();}if(e.key==='/'&&!(e.target instanceof HTMLInputElement)){e.preventDefault();$('search').focus();}});
let dragDepth=0;window.addEventListener('dragenter',e=>{e.preventDefault();dragDepth++;if(!busy)$('drop-mask').classList.add('visible');});window.addEventListener('dragover',e=>e.preventDefault());window.addEventListener('dragleave',()=>{dragDepth=Math.max(0,dragDepth-1);if(!dragDepth)$('drop-mask').classList.remove('visible');});window.addEventListener('drop',e=>{e.preventDefault();dragDepth=0;$('drop-mask').classList.remove('visible');if(e.dataTransfer?.files[0])void openFile(e.dataTransfer.files[0]);});
fetch('/api/sample-info').then(r=>r.ok?r.json():null).then(info=>{if(!info)return;$('sample').hidden=false;$('sample').onclick=async()=>{try{const r=await fetch('/api/sample');if(!r.ok)throw new Error('读取示例失败');await openFile(new File([await r.arrayBuffer()],info.name,{lastModified:0}));}catch(e){toast(String(e));}};}).catch(()=>{});

async function renderHistory(){
 const root=$('history-list');root.replaceChildren();
 try{
  const drawings=await listHistory();$('history-count').textContent=`${drawings.length} / 10 份 · 最多 250 MB`;$<HTMLButtonElement>('history-clear').disabled=!drawings.length;
  if(!drawings.length){const empty=document.createElement('div');empty.className='history-empty';empty.textContent='还没有历史记录，打开一份图纸后会自动保存。';root.append(empty);return;}
  for(const drawing of drawings){
   const row=document.createElement('div');row.className='history-row';const open=document.createElement('button');open.className='history-open';open.title=drawing.name;open.innerHTML=`${icon('file')}<span class="history-file"><span class="history-name"></span><span class="history-meta"></span></span>`;
   open.querySelector('.history-name')!.textContent=drawing.name;
   open.querySelector('.history-meta')!.textContent=`${(drawing.size/1024/1024).toFixed(2)} MB · ${new Date(drawing.openedAt).toLocaleString('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false})} 打开`;
   open.onclick=()=>{$<HTMLDialogElement>('history-dialog').close();void openFile(new File([drawing.blob],drawing.name,{lastModified:drawing.lastModified}));};
   const remove=document.createElement('button');remove.className='history-remove';remove.textContent='移除';remove.setAttribute('aria-label',`移除历史记录 ${drawing.name}`);remove.onclick=async()=>{try{await deleteHistory(drawing.id);await renderHistory();}catch{toast('移除历史记录失败，请重试。');}};row.append(open,remove);root.append(row);
  }
 }catch{root.textContent='当前浏览器无法使用本机存储，历史记录暂不可用。';$<HTMLButtonElement>('history-clear').disabled=true;}
}
$('recent').onclick=()=>{if(busy)return;$<HTMLDialogElement>('history-dialog').showModal();void renderHistory();};
$('history-close').onclick=()=>$<HTMLDialogElement>('history-dialog').close();
$('history-clear').onclick=async()=>{try{await deleteHistory();await renderHistory();}catch{toast('清空历史记录失败，请重试。');}};
