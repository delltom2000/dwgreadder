import type {Bounds,Scene,Primitive,Point} from './types';
import {valid} from './geometry';
import {drawingColor} from './colors';
export class Viewer {
 scene:Scene|null=null;scale=1;cx=0;cy=0;w=0;h=0;selected=new Set<number>();hidden=new Set<string>();selection:Bounds|null=null;
 private ctx:CanvasRenderingContext2D;private frame=0;private drag:{x:number;y:number;cx:number;cy:number}|null=null;
 onChange:()=>void=()=>{};
 constructor(public canvas:HTMLCanvasElement){
  this.ctx=canvas.getContext('2d')!;
  new ResizeObserver(()=>{this.w=canvas.clientWidth;this.h=canvas.clientHeight;canvas.width=Math.round(this.w*devicePixelRatio);canvas.height=Math.round(this.h*devicePixelRatio);this.draw();}).observe(canvas);
  canvas.addEventListener('pointerdown',e=>{if(e.button!==0&&e.button!==1)return;canvas.focus();this.drag={x:e.clientX,y:e.clientY,cx:this.cx,cy:this.cy};canvas.setPointerCapture(e.pointerId);canvas.classList.add('dragging');});
  canvas.addEventListener('pointermove',e=>{if(this.drag){this.cx=this.drag.cx-(e.clientX-this.drag.x)/this.scale;this.cy=this.drag.cy+(e.clientY-this.drag.y)/this.scale;this.draw();}});
  const release=()=>{this.drag=null;canvas.classList.remove('dragging');};canvas.addEventListener('pointerup',release);canvas.addEventListener('pointercancel',release);canvas.addEventListener('lostpointercapture',release);
  canvas.addEventListener('wheel',e=>{e.preventDefault();const r=canvas.getBoundingClientRect();this.zoom(Math.exp(-Math.max(-200,Math.min(200,e.deltaY))*.002),{x:e.clientX-r.left,y:e.clientY-r.top});},{passive:false});
  canvas.addEventListener('dblclick',()=>this.fit());
  canvas.addEventListener('keydown',e=>{if(e.key==='Home'||e.key.toLowerCase()==='f'){e.preventDefault();this.fit();}if(e.key==='Escape'){this.selected.clear();this.selection=null;this.draw();}if(e.key==='+'||e.key==='=')this.zoom(1.3);if(e.key==='-')this.zoom(1/1.3);});
 }
 load(scene:Scene){this.scene=scene;this.hidden.clear();this.selected.clear();this.selection=null;this.fit();}
 fit(bounds=this.scene?.bounds){if(!bounds||!valid(bounds))return;this.w=this.canvas.clientWidth;this.h=this.canvas.clientHeight;if(!this.w||!this.h)return;this.cx=(bounds.minX+bounds.maxX)/2;this.cy=(bounds.minY+bounds.maxY)/2;this.scale=Math.min(this.w/Math.max(bounds.maxX-bounds.minX,1),this.h/Math.max(bounds.maxY-bounds.minY,1))*.82;this.draw();}
 focus(bounds:Bounds,ids:number[]){this.selected=new Set(ids);this.selection=bounds;ids.forEach(i=>this.hidden.delete(this.scene!.primitives[i].layer));const global=this.scene?.bounds;
  const minSpan=global?Math.max(global.maxX-global.minX,global.maxY-global.minY)*.015:10;
  const width=Math.max((bounds.maxX-bounds.minX)*2.2,minSpan),height=Math.max((bounds.maxY-bounds.minY)*2.2,minSpan);
  this.fit({minX:(bounds.minX+bounds.maxX-width)/2,maxX:(bounds.minX+bounds.maxX+width)/2,minY:(bounds.minY+bounds.maxY-height)/2,maxY:(bounds.minY+bounds.maxY+height)/2});
 }
 zoom(factor:number,p:Point={x:this.w/2,y:this.h/2}){const before=this.world(p),next=Math.max(1e-8,Math.min(1e5,this.scale*factor));this.scale=next;const after=this.world(p);this.cx+=before.x-after.x;this.cy+=before.y-after.y;this.draw();}
 world(p:Point){return{x:this.cx+(p.x-this.w/2)/this.scale,y:this.cy-(p.y-this.h/2)/this.scale};}
 draw(){if(this.frame)return;this.frame=requestAnimationFrame(()=>{this.frame=0;this.render();this.onChange();});}
 private render(){
  const c=this.ctx,d=devicePixelRatio;c.setTransform(d,0,0,d,0,0);c.clearRect(0,0,this.w,this.h);
  if(!this.scene)return;
  c.save();c.translate(this.w/2,this.h/2);c.scale(this.scale,-this.scale);c.translate(-this.cx,-this.cy);c.lineWidth=1/this.scale;c.lineJoin='round';c.lineCap='round';
  const left=this.cx-this.w/2/this.scale,right=this.cx+this.w/2/this.scale,bottom=this.cy-this.h/2/this.scale,top=this.cy+this.h/2/this.scale;
  const paint=(p:Primitive,highlight=false)=>{
   if(this.hidden.has(p.layer)||p.bounds.maxX<left||p.bounds.minX>right||p.bounds.maxY<bottom||p.bounds.minY>top)return;
   c.globalAlpha=this.selected.size&&!highlight ? .65:1;
   const color=highlight?'#0069ab':drawingColor(p.color);c.strokeStyle=color;c.fillStyle=color;c.lineWidth=(highlight?2:1)/this.scale;
   if(p.text!==undefined&&p.matrix){
    const m=p.matrix,h=p.height!;if(h*Math.hypot(m[2],m[3])*this.scale<2)return;c.save();c.transform(...m);c.scale(1,-1);c.font=`${h}px "Microsoft YaHei", "SimSun", sans-serif`;c.textBaseline='alphabetic';
    p.text.split('\n').forEach((line,i)=>c.fillText(line,0,i*h*1.3));c.restore();
   }else{c.beginPath();p.points.forEach((v,i)=>i?c.lineTo(v.x,v.y):c.moveTo(v.x,v.y));if(p.points.length===1){const p0=p.points[0];c.lineTo(p0.x+2/this.scale,p0.y);}if(p.closed)c.closePath();if(p.fill)c.fill('evenodd');else c.stroke();}
  };
  this.scene.primitives.forEach(p=>paint(p));this.selected.forEach(i=>paint(this.scene!.primitives[i],true));c.restore();
  if(this.selection){const b=this.selection,x=(b.minX-this.cx)*this.scale+this.w/2,y=(this.cy-b.maxY)*this.scale+this.h/2,w=(b.maxX-b.minX)*this.scale,h=(b.maxY-b.minY)*this.scale;c.strokeStyle='#0069ab';c.lineWidth=1;c.setLineDash([5,5]);c.strokeRect(x-7,y-7,w+14,h+14);c.setLineDash([]);}
 }
}
