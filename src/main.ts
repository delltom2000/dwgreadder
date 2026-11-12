import './style.css';
import {Viewer} from './viewer';
import {emptyBounds,union,valid} from './geometry';
import type {Scene,Item,Bounds} from './types';
import {listHistory,rememberDrawing,deleteHistory} from './history';
import {drawingColor} from './colors';
import type {ModelViewer,ModelPart} from './model-viewer';

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
// Codex-style workspace: file history on the left, structure and properties on the right.
const propertiesPanel=document.querySelector('main > aside') as HTMLElement;
propertiesPanel.id='properties-panel';propertiesPanel.classList.add('properties-panel');
document.querySelector('main')!.append(propertiesPanel);
propertiesPanel.querySelector('.aside-heading > span')!.textContent='结构与属性';
propertiesPanel.querySelector('.aside-heading')!.insertAdjacentHTML('afterend','<div id="properties" class="property-summary"><span class="property-placeholder">打开文件后显示属性</span></div>');
document.querySelector('main')!.insertAdjacentHTML('afterbegin',`<aside id="files-panel" class="files-panel"><div class="panel-heading"><strong>文件</strong><span class="badge">本机</span></div><button id="file-panel-open" class="new-file">${icon('folder')}打开图纸或模型<span>＋</span></button><div class="files-section-title">最近打开</div><div id="file-history-host" class="files-list"></div><div class="files-footer"><span>历史副本仅保存在本机</span><button id="file-history-clear">清空记录</button></div></aside>`);
$('file-history-host').append($('history-list'));
document.querySelector('.header-actions')!.insertAdjacentHTML('afterbegin','<button id="toggle-files" class="panel-toggle" aria-label="展开或收起文件面板" title="展开或收起文件面板" aria-expanded="true">☰</button>');
document.querySelector('.header-actions')!.insertAdjacentHTML('beforeend','<button id="toggle-properties" class="panel-toggle" aria-label="展开或收起属性面板" title="展开或收起属性面板" aria-expanded="true">◧</button>');
$('canvas').insertAdjacentHTML('afterend','<div id="model-host" hidden></div>');
$('spaces').insertAdjacentHTML('afterend','<div id="space-buttons" class="space-buttons" role="group" aria-label="切换图纸空间" hidden></div>');
$('file').setAttribute('accept','.dwg,.3dm');document.querySelector('.brand-sub')!.textContent='DWG / 3DM';
$('file-name').textContent='图纸与模型阅读器';$('stats').textContent='DWG 二维 / 3DM 三维';
document.querySelector('h1')!.textContent='从图纸，到空间。';
document.querySelector('.welcome p')!.textContent='DWG 浏览二维图纸，3DM 旋转查看模型。从右侧目录直达对应对象。';
$('choose').innerHTML=`${icon('folder')}选择 DWG / 3DM 文件`;
$('open').innerHTML=`${icon('folder')}打开文件<span class="key">Ctrl O</span>`;
document.querySelector('.history-note')!.textContent='历史副本保存在当前浏览器，可重开 DWG 图纸和 3DM 模型。';
let mode:'dwg'|'3dm'='dwg',model:ModelViewer|null=null,modelController:AbortController|null=null,activeFile:File|null=null;
const viewer=new Viewer($<HTMLCanvasElement>('canvas'));
let scene:Scene|null=null,worker:Worker|null=null,tab='layers',busy=false,fileName='',timer:ReturnType<typeof setTimeout>|null=null,requestId=0;
const drawingCache=new Map<string,{worker:Worker;scenes:Map<string,Scene>}>();let drawingKey='';
const nodes=new Map<string,Item>();let allNodes:Item[]=[];
let pendingHistoryFile:File|null=null;
viewer.onChange=()=>{if(mode==='dwg')$('zoom-label').textContent=scene?`1 px ≈ ${(1/viewer.scale).toLocaleString('zh-CN',{maximumFractionDigits:2})} 图纸单位`: '—';};
function setMode(next:'dwg'|'3dm'){
 mode=next;$('canvas').hidden=next==='3dm';model?.setActive(next==='3dm');(document.querySelector('.axis') as HTMLElement).hidden=next==='3dm';
 document.querySelector('.canvas-hint')!.textContent=next==='3dm'?'左键旋转 · 右键 / Shift 拖动平移 · 滚轮缩放 · 点击部件聚焦':'拖动平移 · 滚轮缩放 · 双击显示全图';
 document.querySelector('[data-tab=blocks]')!.textContent=next==='3dm'?'部件':'图块';(document.querySelector('[data-tab=texts]') as HTMLElement).hidden=next==='3dm';
 tab=next==='3dm'?'blocks':'layers';document.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach(b=>b.setAttribute('aria-selected',String(b.dataset.tab===tab)));
 $<HTMLInputElement>('search').value='';$('search').setAttribute('placeholder',next==='3dm'?'搜索图层、部件名称':'搜索图层、图块、文字');$('selection').hidden=true;
}
function showProperties(rows:[string,string][]){const root=$('properties');root.replaceChildren();for(const [label,value] of rows){const row=document.createElement('div');row.className='property-row';const key=document.createElement('span'),val=document.createElement('span');key.textContent=label;val.textContent=value;val.title=value;row.append(key,val);root.append(row);}}
const number=(n:number)=>n.toLocaleString('zh-CN',{maximumFractionDigits:2});
function fileProperties(){if(activeFile)showProperties([['文件',activeFile.name],['格式',mode==='3dm'?'Rhino 3DM · 三维':'AutoCAD DWG · 二维'],['大小',`${(activeFile.size/1024/1024).toFixed(2)} MB`],['操作',mode==='3dm'?'旋转 / 平移 / 部件聚焦':'平移 / 缩放 / 对象定位']]);}
function toast(message:string){$('toast').textContent=message;$('toast').hidden=false;setTimeout(()=>$('toast').hidden=true,7000);}
let previewState:{mode:'dwg'|'3dm';welcomeHidden:boolean}|null=null;
function restorePreview(){if(!previewState)return;const previous=previewState;previewState=null;setMode(previous.mode);$('welcome').hidden=previous.welcomeHidden;renderTree();fileProperties();}
function loading(value:boolean){busy=value;$('loading').hidden=!value;$<HTMLButtonElement>('open').disabled=value;$<HTMLButtonElement>('recent').disabled=value;$<HTMLSelectElement>('spaces').disabled=value;document.querySelectorAll<HTMLButtonElement>('#space-buttons button').forEach(button=>button.disabled=value);}
function failure(message:string){restorePreview();pendingHistoryFile=null;loading(false);if(timer)clearTimeout(timer);toast(message);$('status').textContent=activeFile?'读取失败 · 保留当前文件':'读取失败';$('status-dot').classList.add('warn');}
function discardWorker(){if(worker){worker.terminate();for(const [key,entry] of drawingCache)if(entry.worker===worker)drawingCache.delete(key);worker=null;}}
function makeWorker(key:string){worker=new Worker(new URL('./parser.worker.ts',import.meta.url),{type:'module'});const owned=worker,entry={worker:owned,scenes:new Map<string,Scene>()};drawingCache.set(key,entry);while(drawingCache.size>3){const oldest=drawingCache.keys().next().value!;drawingCache.get(oldest)!.worker.terminate();drawingCache.delete(oldest);}worker.onmessage=e=>{
 if(worker!==owned)return;
 if(e.data.progress)$('progress').textContent=e.data.progress;
 if(e.data.error)failure(e.data.error);
 if(e.data.scene){if(timer)clearTimeout(timer);scene=e.data.scene;entry.scenes.set(scene!.space,scene!);loading(false);nodes.clear();allNodes=[];
  const walk=(items:Item[])=>items.forEach(n=>{nodes.set(n.id,n);allNodes.push(n);walk(n.children);});walk(scene!.items);
  setMode('dwg');model?.clear();viewer.load(scene!);$('welcome').hidden=true;$('file-name').textContent=fileName;$('file-name').title=fileName;
  if(pendingHistoryFile){const savedFile=pendingHistoryFile;activeFile=savedFile;pendingHistoryFile=null;void rememberDrawing(savedFile).then(renderHistory).catch(()=>toast('文件已打开，但浏览器未能保存历史副本。'));}fileProperties();
  $('drawing-state').textContent='只读预览';$('space-label').textContent=scene!.space.toLowerCase().includes('model')?'模型空间':'布局空间';$('item-count').textContent=allNodes.length.toLocaleString();
  const spaces=$<HTMLSelectElement>('spaces');spaces.replaceChildren(...scene!.spaces.map(s=>{const o=document.createElement('option');o.value=s;o.textContent=s.toLowerCase().includes('model')?'模型空间':`布局空间 · ${s}`;return o;}));spaces.value=scene!.space;spaces.hidden=true;
  const buttons=$('space-buttons');buttons.replaceChildren(...scene!.spaces.map((s,i)=>{const b=document.createElement('button');b.textContent=/model/i.test(s)?'模型空间':scene!.spaces.filter(n=>!/model/i.test(n)).length>1?`布局 ${i+1}`:'布局空间';b.setAttribute('aria-pressed',String(s===scene!.space));b.onclick=()=>{spaces.value=s;spaces.dispatchEvent(new Event('change'));};return b;}));buttons.hidden=scene!.spaces.length<2;
  const unsupported=Object.entries(scene!.unsupported),missing=unsupported.reduce((n,[,v])=>n+v,0)+scene!.unknown;
  $('status').textContent=missing?`已读取 · ${missing} 项兼容提示`:(scene!.warnings?.length?'已读取 · 有兼容提示':'已读取');$('status').title=unsupported.map(([t,n])=>`${t}：${n}`).join('；')+(scene!.unknown?`；解析器未知对象：${scene!.unknown}`:'')+(scene!.warnings?.length?`；DWG 解析告警：${scene!.warnings.join(', ')}，部分自定义对象可能不完整`:'');$('status-dot').classList.toggle('warn',!!missing||!!scene!.warnings?.length);
  $('stats').textContent=`${scene!.items.length.toLocaleString()} 个顶层对象 · ${scene!.layers.length} 个可见图层 · ${scene!.primitives.length.toLocaleString()} 个图元`;
  $('selection').hidden=true;renderTree();if(!valid(scene!.bounds))toast('当前空间没有可显示的图形，请切换空间。');
 }
};worker.onerror=e=>failure(`解析失败：${e.message||'解析器异常，请重新打开文件'}`);return worker;}
function timeout(){if(timer)clearTimeout(timer);timer=setTimeout(()=>{requestId++;discardWorker();modelController?.abort();failure('读取超过 120 秒，已停止。请尝试较小文件，或在原软件中保存显示网格后重试。');},120000);}
async function openFile(file:File){if(busy)return;if(!/\.(dwg|3dm)$/i.test(file.name)){toast('请选择 DWG 图纸或 3DM 模型。');return;}if(file.size>100*1024*1024){toast('当前版本支持 100 MB 以内的文件。');return;}
 const current=++requestId;$('loading').classList.toggle('model-loading',/\.3dm$/i.test(file.name));loading(true);$('progress').textContent='正在读取文件…';timeout();try{
  const buffer=await file.arrayBuffer();if(current!==requestId)return;const isModel=/\.3dm$/i.test(file.name),header=new TextDecoder().decode(buffer.slice(0,32));
  if(isModel?!header.startsWith('3D Geometry File Format'):!header.startsWith('AC10'))throw new Error('文件头与格式不匹配，请确认文件未损坏。');
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',buffer)),b=>b.toString(16).padStart(2,'0')).join('');if(current!==requestId)return;
  fileName=file.name;pendingHistoryFile=file;
  if(!isModel){drawingKey=hash;const cached=drawingCache.get(hash);if(cached){drawingCache.delete(hash);drawingCache.set(hash,cached);worker=cached.worker;const existing=cached.scenes.get('*Model_Space')??cached.scenes.values().next().value;if(existing){worker.onmessage!(new MessageEvent('message',{data:{scene:existing}}));$('status').textContent+=' · 本机缓存';}else worker.postMessage({});}else makeWorker(hash).postMessage({buffer,wasmUrl:new URL('./',location.href).href},[buffer]);return;}
  $('progress').textContent='正在解析 3DM 几何与部件…';modelController=new AbortController();const signal=modelController.signal;
  if(!model){const module=await import('./model-viewer');if(current!==requestId)return;model=new module.ModelViewer($('model-host'));model.onSelect=part=>selectedModel(part,false);model.onChange=()=>{if(mode==='3dm')$('zoom-label').textContent='3DM · 透视视图';};}
  model.onPreview=()=>{if(current!==requestId)return;previewState={mode,welcomeHidden:!!$('welcome').hidden};setMode('3dm');$('welcome').hidden=true;$('progress').textContent='概貌已显示 · 正在后台补齐…';$('status').textContent='概貌已显示 · 后台解析完整模型与目录…';$('space-label').textContent='3DM · 概貌预览';$('tree').replaceChildren();const note=document.createElement('div');note.className='tree-empty';note.textContent='概貌已显示，可旋转、缩放。正在后台解析图层与部件…';$('tree').append(note);};
  const fromCache=await model.load(buffer,signal,hash);if(current!==requestId)return;if(timer)clearTimeout(timer);worker=null;scene=null;allNodes=[];nodes.clear();setMode('3dm');
  previewState=null;activeFile=file;pendingHistoryFile=null;void rememberDrawing(file).then(renderHistory).catch(()=>toast('模型已打开，但未能保存历史副本。'));
  $('welcome').hidden=true;$('file-name').textContent=file.name;$('file-name').title=file.name;fileProperties();$('spaces').hidden=true;$('space-buttons').hidden=true;$('space-label').textContent='3DM · 三维模型';$('drawing-state').textContent='只读预览';$('item-count').textContent=model.parts.length.toLocaleString();
  $('stats').textContent=`${model.parts.length.toLocaleString()} 个对象 · ${model.layers.length} 个图层`;$('status').textContent=(model.warnings.length?`已读取 · ${model.warnings.length} 项兼容提示`:'已读取')+(fromCache?' · 本机缓存':'');$('status').title=model.warnings.length?'部分对象没有显示网格或暂不支持，可能未完整显示。请在 Rhino 中保存显示网格后重试。':'';$('status-dot').classList.toggle('warn',!!model.warnings.length);loading(false);renderTree();
 }catch(e){if(current===requestId)failure(e instanceof Error?e.message:String(e));}
}
function indexes(item:Item):number[]{return[...item.primitives,...item.children.flatMap(indexes)];}
function focus(label:string,bounds:Bounds,ids:number[],element?:HTMLElement,item?:Item){if(!valid(bounds))return;viewer.focus(bounds,ids);document.querySelectorAll('.row.active').forEach(e=>e.classList.remove('active'));element?.classList.add('active');$('selection-text').textContent=label;$('selection').hidden=false;showProperties([['对象',label],['类型',item?.type??'图层'],['图层',item?.layer??label],['图元数',String(ids.length)],['宽 × 高',`${number(bounds.maxX-bounds.minX)} × ${number(bounds.maxY-bounds.minY)}`],['中心 X / Y',`${number((bounds.minX+bounds.maxX)/2)} / ${number((bounds.minY+bounds.maxY)/2)}`]]);}
function renderTree(){
 if(mode==='3dm'){renderModelTree();return;}const root=$('tree');root.replaceChildren();if(!scene)return;const query=$<HTMLInputElement>('search').value.trim().toLowerCase();
 const makeRow=(label:string,detail:string,onClick:()=>void,depth=0)=>{
  const row=document.createElement('div');row.className='row';row.style.paddingLeft=`${14+depth*16}px`;
  const button=document.createElement('button');button.className='row-label';button.title=label;button.innerHTML=`<span class="row-icon">${icon(tab==='layers'?'layers':'file')}</span><span class="label"></span><span class="row-detail"></span>`;
  button.querySelector('.label')!.textContent=label;button.querySelector('.row-detail')!.textContent=detail;button.onclick=()=>{onClick();document.querySelectorAll('.row.active').forEach(e=>e.classList.remove('active'));row.classList.add('active');};row.append(button);return row;
 };
 const appendItems=(parent:HTMLElement,items:Item[],depth=0)=>{
  let shown=0;const more=document.createElement('button');more.className='more';
  const append=()=>{more.remove();const end=Math.min(shown+80,items.length);for(;shown<end;shown++){
   const n=items[shown],row=makeRow(n.label,n.type,()=>focus(n.label,n.bounds,indexes(n),undefined,n),depth);parent.append(row);
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
$('cancel').onclick=()=>{requestId++;pendingHistoryFile=null;modelController?.abort();restorePreview();discardWorker();if(timer)clearTimeout(timer);loading(false);$('status').textContent=activeFile?'已取消 · 保留当前文件':'已取消';};
$('zoom-in').onclick=()=>mode==='3dm'?model?.zoom(1.4):viewer.zoom(1.4);$('zoom-out').onclick=()=>mode==='3dm'?model?.zoom(1/1.4):viewer.zoom(1/1.4);$('fit').onclick=()=>{if(mode==='3dm'){model?.fit();$('selection').hidden=true;fileProperties();}else viewer.fit();};
$('clear-selection').onclick=()=>{if(mode==='3dm')model?.clearSelection();else{viewer.selected.clear();viewer.selection=null;viewer.draw();}$('selection').hidden=true;fileProperties();};
$('status').onclick=()=>{if($('status').title)toast($('status').title);};
$<HTMLInputElement>('search').oninput=()=>renderTree();
document.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach(b=>b.onclick=()=>{tab=b.dataset.tab!;document.querySelectorAll('[data-tab]').forEach(t=>t.setAttribute('aria-selected',String(t===b)));renderTree();});
$<HTMLSelectElement>('spaces').onchange=e=>{if(!worker||busy)return;loading(true);const space=(e.target as HTMLSelectElement).value,cached=drawingCache.get(drawingKey)?.scenes.get(space);if(cached){worker.onmessage!(new MessageEvent('message',{data:{scene:cached}}));$('status').textContent+=' · 本机缓存';}else{worker.postMessage({space});timeout();}};
document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='o'){e.preventDefault();if(!busy)$<HTMLInputElement>('file').click();}if(e.key==='/'&&!(e.target instanceof HTMLInputElement)){e.preventDefault();$('search').focus();}});
let dragDepth=0;window.addEventListener('dragenter',e=>{e.preventDefault();dragDepth++;if(!busy)$('drop-mask').classList.add('visible');});window.addEventListener('dragover',e=>e.preventDefault());window.addEventListener('dragleave',()=>{dragDepth=Math.max(0,dragDepth-1);if(!dragDepth)$('drop-mask').classList.remove('visible');});window.addEventListener('drop',e=>{e.preventDefault();dragDepth=0;$('drop-mask').classList.remove('visible');if(e.dataTransfer?.files[0])void openFile(e.dataTransfer.files[0]);});
fetch('/api/sample-info').then(r=>r.ok?r.json():null).then(info=>{if(!info)return;$('sample').hidden=false;$('sample').onclick=async()=>{try{const r=await fetch('/api/sample');if(!r.ok)throw new Error('读取示例失败');await openFile(new File([await r.arrayBuffer()],info.name,{lastModified:0}));}catch(e){toast(String(e));}};}).catch(()=>{});

async function renderHistory(){
 const root=$('history-list');root.replaceChildren();
 try{
  const drawings=await listHistory();$('history-count').textContent=`${drawings.length} / 10 份 · 最多 250 MB`;$<HTMLButtonElement>('history-clear').disabled=!drawings.length;
  if(!drawings.length){const empty=document.createElement('div');empty.className='history-empty';empty.textContent='还没有历史记录，打开一份图纸后会自动保存。';root.append(empty);return;}
  for(const drawing of drawings){
   const row=document.createElement('div');row.className='history-row';row.classList.toggle('current',activeFile?.name===drawing.name&&activeFile?.lastModified===drawing.lastModified);const open=document.createElement('button');open.className='history-open';open.title=drawing.name;open.innerHTML=`${icon('file')}<span class="history-file"><span class="history-name"></span><span class="history-meta"></span></span>`;
   open.querySelector('.history-name')!.textContent=drawing.name;
   open.querySelector('.history-meta')!.textContent=`${(drawing.size/1024/1024).toFixed(2)} MB · ${new Date(drawing.openedAt).toLocaleString('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false})} 打开`;
   open.onclick=()=>{$<HTMLDialogElement>('history-dialog').close();void openFile(new File([drawing.blob],drawing.name,{lastModified:drawing.lastModified}));};
   const remove=document.createElement('button');remove.className='history-remove';remove.textContent='移除';remove.setAttribute('aria-label',`移除历史记录 ${drawing.name}`);remove.onclick=async()=>{try{await deleteHistory(drawing.id);await renderHistory();}catch{toast('移除历史记录失败，请重试。');}};row.append(open,remove);root.append(row);
  }
 }catch{root.textContent='当前浏览器无法使用本机存储，历史记录暂不可用。';$<HTMLButtonElement>('history-clear').disabled=true;}
}
$('recent').onclick=()=>{if(busy)return;togglePanel('files',true);void renderHistory();};
$('history-close').onclick=()=>$<HTMLDialogElement>('history-dialog').close();
$('history-clear').onclick=async()=>{try{await deleteHistory();await renderHistory();}catch{toast('清空历史记录失败，请重试。');}};
$('file-history-clear').onclick=$('history-clear').onclick;
$('file-panel-open').onclick=()=>$<HTMLInputElement>('file').click();
function togglePanel(name:'files'|'properties',force?:boolean){const panel=$(`${name}-panel`),expanded=force??panel.hidden;panel.hidden=!expanded;$(`toggle-${name}`).setAttribute('aria-expanded',String(expanded));try{localStorage.setItem(`reader-panel-${name}`,String(expanded));}catch{}}
for(const name of ['files','properties'] as const){$(`toggle-${name}`).onclick=()=>togglePanel(name);try{if(localStorage.getItem(`reader-panel-${name}`)==='false')togglePanel(name,false);}catch{}}
void renderHistory();

function selectedModel(part:ModelPart,move=true){if(move)model!.focus([part]);$('selection-text').textContent=part.label;$('selection').hidden=false;const size=part.bounds.getSize(part.object.position.clone());showProperties([['对象',part.label],['名称来源',part.named?'3DM 对象名称':'图层名＋类型＋序号'],['类型',part.kind],['图层',part.layer],['尺寸 X',number(size.x)],['尺寸 Y',number(size.y)],['尺寸 Z',number(size.z)],['坐标单位','模型原始单位']]);document.querySelectorAll('.row.active').forEach(e=>e.classList.remove('active'));document.querySelectorAll<HTMLElement>('[data-part]').forEach(e=>{if(e.dataset.part===part.id)e.classList.add('active');});}
function renderModelTree(){
 const root=$('tree');root.replaceChildren();if(!model)return;const query=$<HTMLInputElement>('search').value.trim().toLowerCase();
 const make=(label:string,detail:string,click:()=>void,depth=0)=>{const row=document.createElement('div');row.className='row';row.style.paddingLeft=`${14+depth*14}px`;const button=document.createElement('button');button.className='row-label';button.title=label;button.innerHTML=`<span class="row-icon">${icon('file')}</span><span class="label"></span><span class="row-detail"></span>`;button.querySelector('.label')!.textContent=label;button.querySelector('.row-detail')!.textContent=detail;button.onclick=()=>{click();document.querySelectorAll('.row.active').forEach(e=>e.classList.remove('active'));row.classList.add('active');};row.append(button);return row;};
 const expandable=(row:HTMLElement,parent:HTMLElement,fill:(sub:HTMLElement)=>void)=>{const button=document.createElement('button');button.className='expand';button.innerHTML=icon('chevron');button.setAttribute('aria-label',`展开 ${row.textContent}`);button.setAttribute('aria-expanded','false');row.prepend(button);const sub=document.createElement('div');sub.hidden=true;parent.append(row,sub);button.onclick=()=>{sub.hidden=!sub.hidden;button.classList.toggle('expanded',!sub.hidden);button.setAttribute('aria-expanded',String(!sub.hidden));if(!sub.hidden&&!sub.children.length)fill(sub);};};
 const append=(parent:HTMLElement,parts:ModelPart[],depth=0)=>{let count=0;const more=document.createElement('button');more.className='more';const batch=()=>{more.remove();const end=Math.min(count+80,parts.length);for(;count<end;count++){const part=parts[count],row=make(part.label,part.kind,()=>selectedModel(part),depth);row.dataset.part=part.id;if(part.children.length)expandable(row,parent,sub=>append(sub,part.children,depth+1));else parent.append(row);}if(count<parts.length){more.textContent=`再显示 ${Math.min(80,parts.length-count)} 项`;more.onclick=batch;parent.append(more);}};batch();};
 const layerRows=(parent:HTMLElement,layers:import('./model-tree').LayerNode[],depth=0)=>{for(const layer of layers){
  const parts=model!.partsForLayer(layer),matches=!query||layer.path.toLowerCase().includes(query),matchedParts=parts.filter(p=>`${p.label} ${p.layer} ${p.kind}`.toLowerCase().includes(query));
  if(!matches&&!matchedParts.length&&!hasMatchingLayer(layer))continue;
  const row=make(layer.label,String(parts.length),()=>{model!.focus(parts);$('selection-text').textContent=layer.path;$('selection').hidden=false;showProperties([['类型','模型图层'],['图层',layer.path],['对象数',String(parts.length)]]);},depth);row.dataset.layer=String(layer.index);row.title=layer.path;row.querySelector('.row-icon')!.innerHTML=icon('layers');
  const eye=document.createElement('button');eye.className='eye';eye.innerHTML=icon('eye');eye.setAttribute('aria-label',`显示或隐藏 ${layer.path}`);
  const updateEyes=()=>{root.querySelectorAll<HTMLButtonElement>('[data-layer] .eye').forEach(button=>{const id=Number(button.closest<HTMLElement>('[data-layer]')!.dataset.layer),node=findLayer(model!.layerTree,id)!;const items=model!.partsForLayer(node),shown=items.filter(p=>p.object.visible).length;button.classList.toggle('muted',!!items.length&&!shown);button.setAttribute('aria-pressed',shown>0&&shown<items.length?'mixed':String(!items.length||shown>0));});};
  eye.setAttribute('aria-pressed',String(!parts.length||parts.some(p=>p.object.visible)));eye.classList.toggle('muted',!!parts.length&&!parts.some(p=>p.object.visible));eye.onclick=()=>{const visible=!parts.some(p=>p.object.visible);parts.forEach(p=>p.object.visible=visible);model!.clearSelection();updateEyes();model!.draw();};row.append(eye);
  const direct=model!.roots.filter(p=>p.layerIndex===layer.index),showParts=query&&!matches?direct.filter(p=>`${p.label} ${p.kind}`.toLowerCase().includes(query)):direct;
  if(layer.children.length||showParts.length)expandable(row,parent,sub=>{layerRows(sub,layer.children,depth+1);append(sub,showParts,depth+1);});else parent.append(row);
 }};
 const findLayer=(layers:import('./model-tree').LayerNode[],id:number):import('./model-tree').LayerNode|undefined=>{for(const layer of layers){if(layer.index===id)return layer;const child=findLayer(layer.children,id);if(child)return child;}};
 const hasMatchingLayer=(layer:import('./model-tree').LayerNode):boolean=>layer.path.toLowerCase().includes(query)||layer.children.some(hasMatchingLayer);
 layerRows(root,model.layerTree);
 const unlayered=model.roots.filter(p=>!findLayer(model!.layerTree,p.layerIndex));if(unlayered.length)append(root,query?unlayered.filter(p=>p.label.toLowerCase().includes(query)):unlayered);
 if(!root.children.length){const empty=document.createElement('div');empty.className='tree-empty';empty.textContent='没有匹配的项目';root.append(empty);}
}

// Warm only the bundled local reader while the page is idle. No model data is read.
const prepareModel=()=>{void import('./model-viewer').then(m=>m.prepareModelReader()).catch(()=>{});};
if('requestIdleCallback' in window)window.requestIdleCallback(prepareModel,{timeout:2000});else setTimeout(prepareModel,500);
