import type {Bounds,Point,Matrix,Primitive,Item,Scene} from './types';
export const identity:Matrix=[1,0,0,1,0,0];
export const emptyBounds=():Bounds=>({minX:Infinity,minY:Infinity,maxX:-Infinity,maxY:-Infinity});
export const valid=(b:Bounds)=>[b.minX,b.minY,b.maxX,b.maxY].every(Number.isFinite);
export function union(a:Bounds,b:Bounds){if(valid(b)){a.minX=Math.min(a.minX,b.minX);a.minY=Math.min(a.minY,b.minY);a.maxX=Math.max(a.maxX,b.maxX);a.maxY=Math.max(a.maxY,b.maxY);}return a;}
export function transform(p:Point,m:Matrix):Point{return{x:m[0]*p.x+m[2]*p.y+m[4],y:m[1]*p.x+m[3]*p.y+m[5]};}
export function multiply(a:Matrix,b:Matrix):Matrix{return[a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]];}
export function cleanText(t:unknown):string{return String(t??'').replace(/\\U\+([0-9a-f]{4})/gi,(_,n)=>String.fromCharCode(parseInt(n,16))).replace(/%%d/gi,'°').replace(/%%p/gi,'±').replace(/%%c/gi,'Ø').replace(/%%[uo]/gi,'').replace(/\\P/g,'\n').replace(/\\~/g,' ').replace(/\\S([^;]*);/g,(_,s)=>s.replace(/[\^#]/g,'/')).replace(/\\[ACcFfHhQqTtWwp][^;]*;/g,'').replace(/\\[LlOoKk]/g,'').replace(/[{}]/g,'').trim();}
export function aci(index:number):string{
 const base=['#d9e1ed','#ff6767','#f4da61','#73dc90','#61dce9','#809aff','#e888e5','#d9e1ed','#8792a5','#a6b0bf'];index=Math.abs(index);
 if(index<10)return base[index];if(index>=250)return['#657082','#808b9d','#9da7b7','#b8c1ce','#d0d7e1','#eef1f7'][Math.min(index-250,5)];
 const hue=Math.floor((index-10)/10)*15,slot=(index-10)%10;return`hsl(${hue} ${slot%2?65:85}% ${[65,76,54,66,45,58,37,48,30,42][slot]}%)`;
}
export function arcPoints(c:Point,rx:number,ry:number,start:number,end:number,rotation=0):Point[]{
 while(end<=start)end+=Math.PI*2;const n=Math.max(8,Math.ceil((end-start)*24));return Array.from({length:n+1},(_,i)=>{const t=start+(end-start)*i/n,x=rx*Math.cos(t),y=ry*Math.sin(t);return{x:c.x+x*Math.cos(rotation)-y*Math.sin(rotation),y:c.y+x*Math.sin(rotation)+y*Math.cos(rotation)};});
}
export function polyline(vertices:any[],closed:boolean):Point[]{
 const out:Point[]=[];for(let i=0;i<vertices.length;i++){
  const a=vertices[i],b=vertices[(i+1)%vertices.length];out.push({x:a.x,y:a.y});if((i===vertices.length-1&&!closed)||!a.bulge||!b)continue;
  const chord=Math.hypot(b.x-a.x,b.y-a.y);if(!chord)continue;const theta=4*Math.atan(a.bulge),offset=chord*(1-a.bulge*a.bulge)/(4*a.bulge);
  const c={x:(a.x+b.x)/2-(b.y-a.y)/chord*offset,y:(a.y+b.y)/2+(b.x-a.x)/chord*offset},r=Math.hypot(a.x-c.x,a.y-c.y),start=Math.atan2(a.y-c.y,a.x-c.x),n=Math.ceil(Math.abs(theta)*24);
  for(let j=1;j<n;j++)out.push({x:c.x+r*Math.cos(start+theta*j/n),y:c.y+r*Math.sin(start+theta*j/n)});
 }return out;
}
function spline(e:any):Point[]{
 const cp=e.controlPoints??[],p=e.degree,k=e.knots??[];if(cp.length<=p||k.length<cp.length+p+1)return e.fitPoints??[];
 const start=k[p],end=k[cp.length],out:Point[]=[],n=Math.min(1024,cp.length*16);
 for(let j=0;j<=n;j++){
  const t=start+(end-start)*j/n;let span=p;while(span<cp.length-1&&t>=k[span+1])span++;
  const d=Array.from({length:p+1},(_,i)=>{const idx=span-p+i,w=e.weights?.[idx]??1;return[cp[idx].x*w,cp[idx].y*w,w];});
  for(let r=1;r<=p;r++)for(let i=p;i>=r;i--){const idx=span-p+i,den=k[idx+p-r+1]-k[idx],a=den?(t-k[idx])/den:0;d[i]=d[i].map((v,q)=>(1-a)*d[i-1][q]+a*v);}
  if(d[p][2])out.push({x:d[p][0]/d[p][2],y:d[p][1]/d[p][2]});
 }return out;
}
// Drawing contents are treated as data. Never insert CAD text as HTML.
export function buildScene(db:any,space='*Model_Space',unknown=0):Scene{
 const blocks=new Map<string,any>(db.tables.BLOCK_RECORD.entries.map((b:any)=>[b.name,b]));
 const layerMap=new Map<string,any>(db.tables.LAYER.entries.map((l:any)=>[l.name,l]));
 const primitives:Primitive[]=[],items:Item[]=[],unsupported:Record<string,number>={};let seq=0;
 const colorOf=(e:any,layer:string,inherited:string)=>e.colorIndex===0?inherited:e.color?`#${e.color.toString(16).padStart(6,'0')}`:aci(e.colorIndex!=null&&e.colorIndex!==256?e.colorIndex:layerMap.get(layer)?.colorIndex??7);
 function visit(e:any,parent:Matrix,inheritedLayer='0',inheritedColor='#d9e1ed',stack:string[]=[]):Item|null{
  const layer=e.layer==='0'?inheritedLayer:(e.layer||inheritedLayer),l=layerMap.get(layer);
  if(e.isVisible===false||l?.off||l?.frozen||e.type==='ATTDEF'||(e.type==='ATTRIB'&&(e.flags&1)))return null;
  const color=colorOf(e,layer,inheritedColor),id=`n${++seq}`,item:Item={id,label:'',type:e.type,layer,bounds:emptyBounds(),children:[],primitives:[]};
  const add=(points:Point[],closed=false,fill=false,text?:string,height?:number,matrix?:Matrix)=>{
   if(!points.length)return;points=points.map(p=>transform(p,parent));const bounds=emptyBounds();for(const p of points)union(bounds,{minX:p.x,minY:p.y,maxX:p.x,maxY:p.y});if(!valid(bounds))return;
   item.primitives.push(primitives.length);primitives.push({points,color,layer,closed,fill,text,height,matrix,bounds,node:id});union(item.bounds,bounds);
  };
  if(e.extrusionDirection?.z<0&&['ARC','CIRCLE','LWPOLYLINE','TEXT','ATTRIB','SOLID','INSERT'].includes(e.type))parent=multiply(parent,[-1,0,0,1,0,0]);
  const m=parent;
  if(e.type==='INSERT'||e.type==='DIMENSION'){
   const block=blocks.get(e.name);item.label=e.name||e.type;
   if(block&&!stack.includes(e.name)&&stack.length<32){
    let next=m;if(e.type==='DIMENSION'&&e.insertionPoint)next=multiply(m,[1,0,0,1,e.insertionPoint.x,e.insertionPoint.y]);if(e.type==='INSERT'){
     const a=e.rotation||0,sx=e.xScale??1,sy=e.yScale??1,b=block.basePoint??{x:0,y:0};
     const local:Matrix=[Math.cos(a)*sx,Math.sin(a)*sx,-Math.sin(a)*sy,Math.cos(a)*sy,e.insertionPoint.x,e.insertionPoint.y];next=multiply(m,multiply(local,[1,0,0,1,-b.x,-b.y]));
    }
    for(const child of block.entities){const n=visit(child,next,layer,color,[...stack,e.name]);if(n){item.children.push(n);union(item.bounds,n.bounds);}}
    for(const attr of e.attribs??[]){const n=visit(attr,m,layer,color,stack);if(n){item.children.push(n);union(item.bounds,n.bounds);}}
    const title=item.children.find(n=>n.type==='ATTRIB'&&/图|平面|系统/.test(n.label));if(title)item.label=`${title.label} · ${e.name}`;
   }else{const key=block?'循环图块':'缺失图块';unsupported[key]=(unsupported[key]||0)+1;}
  }else if(['TEXT','MTEXT','ATTRIB'].includes(e.type)){
   const t=e.type==='ATTRIB'?{...e,...e.text}:e,text=cleanText(t.text),h=t.textHeight||1,pos=t.insertionPoint??t.startPoint??{x:0,y:0},a=e.type==='MTEXT'&&t.direction?Math.atan2(t.direction.y,t.direction.x):(t.rotation||0),sx=t.xScale||1;
   const lines=text.split('\n'),w=Math.max(...lines.map(s=>Array.from(s).reduce((n,c)=>n+(/[\u2e80-\uffff]/.test(c)?1:0.62),0)))*h;
   const fit=(t.halign===3||t.halign===5)&&t.startPoint&&t.endPoint&&w>0,dx=fit?t.endPoint.x-t.startPoint.x:0,dy=fit?t.endPoint.y-t.startPoint.y:0,distance=Math.hypot(dx,dy),angle=fit&&distance?Math.atan2(dy,dx):a,scaleX=fit&&distance?distance/w:sx,scaleY=fit&&distance&&t.halign===3?scaleX:1;
   const tm:Matrix=multiply(m,[Math.cos(angle)*scaleX,Math.sin(angle)*scaleX,-Math.sin(angle)*scaleY,Math.cos(angle)*scaleY,pos.x,pos.y]);
   let x=t.halign===1||t.halign===4?-w/2:t.halign===2?-w:0,y=t.halign===4?-h/2:0;
   if(e.type==='MTEXT'){const at=t.attachmentPoint||1;x=(at-1)%3===1?-w/2:(at-1)%3===2?-w:0;y=at<=3?-h:at<=6?lines.length*h*.65:lines.length*h*1.3;}
   else if(t.valign)y=t.valign===2?-h/2:t.valign===3?-h:0;
   if(!fit&&(t.halign||t.valign)&&t.endPoint&&(t.endPoint.x||t.endPoint.y)){const p=transform(t.endPoint,m);tm[4]=p.x;tm[5]=p.y;}
   const textMatrix=multiply(tm,[1,0,0,1,x,y]);
   const corners=[{x:0,y:h},{x:w,y:h},{x:w,y:-h*1.3*(lines.length-1)},{x:0,y:-h*1.3*(lines.length-1)}].map(p=>transform(p,textMatrix));
   parent=identity;add(corners,false,false,text,h,textMatrix);const primitive=primitives[item.primitives[0]];if(primitive){primitive.textAlign=x===0?'left':x===-w/2?'center':'right';primitive.textOffsetX=x;if(fit&&distance)primitive.textFitWidth=w;}item.label=text.replace(/\n/g,' ');
  }else{
   let points:Point[]=[],closed=false,fill=false;
   switch(e.type){
    case 'LINE':points=[e.startPoint,e.endPoint];break;
    case 'LWPOLYLINE':case 'POLYLINE':case 'POLYLINE2D':case 'POLYLINE3D':closed=!!(e.flag&(e.type==='LWPOLYLINE'?512:1));points=polyline(e.vertices??[],closed);break;
    case 'CIRCLE':points=arcPoints(e.center,e.radius,e.radius,0,Math.PI*2);closed=true;break;
    case 'ARC':points=arcPoints(e.center,e.radius,e.radius,e.startAngle,e.endAngle);break;
    case 'ELLIPSE':{const v=e.majorAxisEndPoint,r=Math.hypot(v.x,v.y);points=arcPoints(e.center,r,r*e.axisRatio,e.startAngle,e.endAngle,Math.atan2(v.y,v.x));break;}
    case 'SOLID':case 'TRACE':points=[e.corner1,e.corner2,e.corner4,e.corner3].filter(Boolean);closed=true;fill=true;break;
    case '3DFACE':points=[e.firstCorner,e.secondCorner,e.thirdCorner,e.fourthCorner].filter(Boolean);closed=true;break;
    case 'LEADER':points=e.vertices??[];break;
    case 'SPLINE':points=spline(e);break;
    case 'POINT':{const p=e.position??e.point;if(p)points=[p];break;}
    case 'HATCH':for(const path of e.boundaryPaths??[]){
     if(path.vertices)add(polyline(path.vertices,true),true,!!e.solidFill);
     else{
      const contour:Point[]=[];
      for(const edge of path.edges??[]){
       let part:Point[]=[];
       if(edge.type===1)part=[edge.start,edge.end];
       else if(edge.type===2){part=arcPoints(edge.center,edge.radius,edge.radius,edge.isCCW===false?edge.endAngle:edge.startAngle,edge.isCCW===false?edge.startAngle:edge.endAngle);if(edge.isCCW===false)part.reverse();}
       else if(edge.type===3){const r=Math.hypot(edge.end.x,edge.end.y);part=arcPoints(edge.center,r,edge.lengthOfMinorAxis,edge.startAngle,edge.endAngle,Math.atan2(edge.end.y,edge.end.x));}
       else if(edge.type===4)part=spline({...edge,fitPoints:edge.fitDatum,weights:edge.controlPoints?.map((p:any)=>p.weight??1)});
       else unsupported['填充边界']=(unsupported['填充边界']||0)+1;
       contour.push(...part);
      }add(contour,true,!!e.solidFill);
     }
    }if(!e.solidFill)unsupported['图案填充仅显示边界']=(unsupported['图案填充仅显示边界']||0)+1;break;
    case 'VIEWPORT':return null;
    case 'SEQEND':return null;
    default:unsupported[e.type]=(unsupported[e.type]||0)+1;
   }
   if(points.length)add(points,closed,fill);item.label=`${({LINE:'直线',LWPOLYLINE:'多段线',CIRCLE:'圆',ARC:'圆弧',HATCH:'填充'} as Record<string,string>)[e.type]??e.type} · ${e.handle}`;
  }
  return valid(item.bounds)?item:null;
 }
 const model=blocks.get(space),roots=model?.entities??db.entities.filter((e:any)=>!e.isInPaperSpace);
 for(const e of roots){if(e.type==='ATTRIB')continue;const n=visit(e,identity);if(n)items.push(n);}
 // Paper-space viewports are windows into model space, not independent geometry.
 const viewports=roots.filter((e:any)=>e.type==='VIEWPORT'&&e.viewportId>1&&e.status>0&&!(e.statusBitFlags&131072));
 if(viewports.length){
  const modelName=[...blocks.keys()].find(n=>/^\*model_space$/i.test(n));
  const source=modelName?buildScene(db,modelName,unknown):null;
  if(source)for(const vp of viewports){
   if(!vp.width||!vp.height||!vp.viewHeight||!vp.displayCenter||!vp.viewportCenter)continue;
   if((vp.statusBitFlags&65537)||Math.abs(vp.viewDirection?.x||0)>1e-7||Math.abs(vp.viewDirection?.y||0)>1e-7||(vp.viewDirection?.z??1)<0){unsupported['不支持的视口投影']=(unsupported['不支持的视口投影']||0)+1;continue;}
   const s=vp.height/vp.viewHeight,a=-(vp.viewTwistAngle||0),cs=Math.cos(a)*s,sn=Math.sin(a)*s,center=vp.displayCenter,target=vp.targetPoint??{x:0,y:0};
   const matrix:Matrix=[cs,sn,-sn,cs,vp.viewportCenter.x-cs*(center.x+target.x)+sn*(center.y+target.y),vp.viewportCenter.y-sn*(center.x+target.x)-cs*(center.y+target.y)];
   const clip:Bounds={minX:vp.viewportCenter.x-vp.width/2,maxX:vp.viewportCenter.x+vp.width/2,minY:vp.viewportCenter.y-vp.height/2,maxY:vp.viewportCenter.y+vp.height/2};
   const frozen=new Set(vp.frozenLayerIds??[]),id=`n${++seq}`,group:Item={id,label:`视口 ${vp.viewportId}`,type:'VIEWPORT',layer:vp.layer||'0',bounds:emptyBounds(),children:[],primitives:[]};
   for(const p of source.primitives){
    if(frozen.has(layerMap.get(p.layer)?.handle))continue;
    const corners=[{x:p.bounds.minX,y:p.bounds.minY},{x:p.bounds.maxX,y:p.bounds.minY},{x:p.bounds.maxX,y:p.bounds.maxY},{x:p.bounds.minX,y:p.bounds.maxY}].map(v=>transform(v,matrix)),b=emptyBounds();for(const v of corners)union(b,{minX:v.x,minY:v.y,maxX:v.x,maxY:v.y});
    b.minX=Math.max(b.minX,clip.minX);b.minY=Math.max(b.minY,clip.minY);b.maxX=Math.min(b.maxX,clip.maxX);b.maxY=Math.min(b.maxY,clip.maxY);if(b.minX>b.maxX||b.minY>b.maxY)continue;
    group.primitives.push(primitives.length);primitives.push({...p,points:p.points.map(v=>transform(v,matrix)),matrix:p.matrix?multiply(matrix,p.matrix):undefined,bounds:b,clip,node:id});union(group.bounds,b);
   }
   if(valid(group.bounds))items.push(group);
  }
 }
 const bounds=emptyBounds();items.forEach(n=>union(bounds,n.bounds));const used=new Set(primitives.map(p=>p.layer));
 return{primitives,items,bounds,space,spaces:[...blocks.values()].filter(b=>/^\*.*space/i.test(b.name)&&((b.entities?.length??0)>0||b.name===space||/^\*model_space$/i.test(b.name))).map(b=>b.name),layers:[...layerMap.values()].filter(l=>used.has(l.name)).map(l=>({name:l.name,color:aci(l.colorIndex),off:!!(l.off||l.frozen)})),unsupported,unknown};
}
