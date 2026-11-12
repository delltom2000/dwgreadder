import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {Rhino3dmLoader} from './vendor/Rhino3dmLoader';

import {modelLayers,modelName,type LayerNode} from './model-tree';

export type ModelPart={id:string;label:string;kind:string;layer:string;layerIndex:number;named:boolean;object:THREE.Object3D;bounds:THREE.Box3;children:ModelPart[]};
function makeLoader(){
  const manager=new THREE.LoadingManager();
  manager.setURLModifier(url=>{
   if(url.startsWith('data:')||url.startsWith('blob:'))return url;
   const parsed=new URL(url,location.href);
   if(parsed.origin!==location.origin||!parsed.pathname.includes('/rhino/'))throw new Error('模型引用了外部资源，已阻止联网读取。请把显示网格和纹理嵌入 3DM。');
   return parsed.href;
  });
  return new Rhino3dmLoader(manager).setLibraryPath(new URL('./rhino/',location.href).href).setWorkerLimit(1);
}
let preparedLoader:Rhino3dmLoader|null=null;
export function prepareModelReader(){
 if(preparedLoader)return;const loader=makeLoader();preparedLoader=loader;
 void loader._getWorker(0).catch(()=>{if(preparedLoader===loader)preparedLoader=null;loader.dispose();});
}
export class ModelViewer{
 readonly scene=new THREE.Scene();
 readonly camera=new THREE.PerspectiveCamera(42,1,.01,1e8);
 readonly renderer:THREE.WebGLRenderer;
 readonly controls:OrbitControls;
 layerTree:LayerNode[]=[];
 parts:ModelPart[]=[];roots:ModelPart[]=[];layers:string[]=[];warnings:string[]=[];root:THREE.Object3D|null=null;
 onPreview:()=>void=()=>{};
 onSelect:(part:ModelPart)=>void=()=>{};onChange:()=>void=()=>{};
 private objectParts=new Map<THREE.Object3D,ModelPart>();private frame=0;private active=false;
 private originalMaterials=new Map<THREE.Object3D,THREE.Material|THREE.Material[]>();
 private cache=new Map<string,{root:THREE.Object3D;parts:ModelPart[];roots:ModelPart[];layers:string[];warnings:string[];map:Map<THREE.Object3D,ModelPart>}>();
 private helper:THREE.Box3Helper|null=null;
 private animation:{start:number;from:THREE.Vector3;to:THREE.Vector3;targetFrom:THREE.Vector3;targetTo:THREE.Vector3}|null=null;
 constructor(readonly host:HTMLElement){
  this.renderer=new THREE.WebGLRenderer({antialias:true,alpha:false});this.renderer.setPixelRatio(Math.min(devicePixelRatio,2));this.renderer.setClearColor('#e8f2fb');
  this.renderer.domElement.tabIndex=0;this.renderer.domElement.setAttribute('aria-label','三维模型，左键旋转，右键拖动，滚轮缩放，点击部件聚焦');host.append(this.renderer.domElement);
  this.camera.up.set(0,0,1);this.controls=new OrbitControls(this.camera,this.renderer.domElement);this.controls.enableDamping=true;
  this.controls.addEventListener('change',()=>this.draw());this.controls.addEventListener('start',()=>{this.animation=null;});
  this.scene.add(new THREE.HemisphereLight(0xffffff,0x6c7c99,2.5));
  const light=new THREE.DirectionalLight(0xffffff,2.3);light.position.set(1,-2,4);this.scene.add(light);
  const fill=new THREE.DirectionalLight(0xb8d7ff,1.6);fill.position.set(-2,3,1);this.scene.add(fill);
  new ResizeObserver(()=>{const w=host.clientWidth,h=host.clientHeight;if(!w||!h)return;this.renderer.setSize(w,h);this.camera.aspect=w/h;this.camera.updateProjectionMatrix();this.draw();}).observe(host);
  let down:{x:number;y:number}|null=null;
  this.renderer.domElement.addEventListener('pointerdown',e=>{down=e.button===0?{x:e.clientX,y:e.clientY}:null;});
  this.renderer.domElement.addEventListener('pointerup',e=>{if(!down||Math.hypot(e.clientX-down.x,e.clientY-down.y)>4)return;down=null;this.pick(e);});
  this.renderer.domElement.addEventListener('contextmenu',e=>e.preventDefault());
  this.renderer.domElement.addEventListener('dblclick',()=>this.fit());
  this.renderer.domElement.addEventListener('keydown',e=>{if(e.key==='Home'||e.key.toLowerCase()==='f'){e.preventDefault();this.fit();}if(e.key==='Escape')this.clearSelection();if(e.key==='+'||e.key==='=')this.zoom(1.3);if(e.key==='-')this.zoom(1/1.3);});
 }
 setActive(value:boolean){const wasActive=this.active;this.active=value;this.controls.enabled=value;this.host.hidden=!value;if(value){const w=this.host.clientWidth,h=this.host.clientHeight;if(w&&h){this.renderer.setSize(w,h);this.camera.aspect=w/h;this.camera.updateProjectionMatrix();}if(this.root&&!wasActive)this.fit(true);this.draw();}else{cancelAnimationFrame(this.frame);this.frame=0;}}
 async load(buffer:ArrayBuffer,signal:AbortSignal,key:string){
  const cached=this.cache.get(key);if(cached){this.clear();this.cache.delete(key);this.cache.set(key,cached);this.layerTree=modelLayers(cached.root.userData.layers??[]).roots;this.root=cached.root;this.parts=cached.parts;this.roots=cached.roots;this.layers=cached.layers;this.warnings=cached.warnings;this.objectParts=cached.map;this.scene.add(cached.root);this.fit(true);return true;}
  const previous={root:this.root,parts:this.parts,roots:this.roots,layers:this.layers,layerTree:this.layerTree,warnings:this.warnings,map:this.objectParts};
  const restore=()=>{this.clear();this.root=previous.root;this.parts=previous.parts;this.roots=previous.roots;this.layers=previous.layers;this.layerTree=previous.layerTree;this.warnings=previous.warnings;this.objectParts=previous.map;if(this.root)this.scene.add(this.root);this.draw();};
  const loader=preparedLoader??makeLoader();preparedLoader=null;
  let preview:THREE.Object3D|null=null;let previewView:{position:THREE.Vector3;target:THREE.Vector3}|null=null;
  (loader as typeof loader & {onPreview:(result:THREE.Object3D)=>void}).onPreview=(result:THREE.Object3D)=>{if(signal.aborted){this.disposeObject(result);return;}preview=result;this.addExtrusions(result);result.traverse(o=>{const mesh=o as THREE.Mesh;if(mesh.material)mesh.material=Array.isArray(mesh.material)?mesh.material.map(m=>m.clone()):mesh.material.clone();if(!(o as THREE.Light).isLight)o.visible=true;});this.clear();this.root=result;this.scene.add(result);this.setActive(true);this.fit(true);this.onPreview();};
  const object=await new Promise<THREE.Object3D>((resolve,reject)=>{
   const abort=()=>{if(preview){this.clear();this.disposeObject(preview);preview=null;restore();}loader.dispose();reject(new DOMException('已取消读取','AbortError'));};signal.addEventListener('abort',abort,{once:true});
   if(signal.aborted){abort();return;}
   loader.parse(buffer,(result:THREE.Object3D)=>{signal.removeEventListener('abort',abort);loader.dispose();if(signal.aborted){this.disposeObject(result);reject(new DOMException('已取消读取','AbortError'));}else resolve(result);},(error:{message?:string})=>{if(preview){this.clear();this.disposeObject(preview);preview=null;restore();}signal.removeEventListener('abort',abort);loader.dispose();reject(new Error(error?.message||'无法解析 3DM，请检查文件是否损坏。'));});
  });
  if(signal.aborted){this.disposeObject(object);throw new DOMException('已取消读取','AbortError');}
  if(preview){previewView={position:this.camera.position.clone(),target:this.controls.target.clone()};this.clear();this.disposeObject(preview);preview=null;}
  performance.mark('3dm-decoded',{detail:object.userData.decodeTiming});
  this.addExtrusions(object);
  performance.mark('3dm-extrusions');
  // Show geometry on initially hidden layers too; users can hide layers in the panel.
  object.traverse(o=>{if(!(o as THREE.Light).isLight)o.visible=true;});
  object.updateMatrixWorld(true);
  const initialBox=new THREE.Box3();object.traverseVisible(o=>{const g=(o as THREE.Mesh).geometry;if(g){if(!g.boundingBox)g.computeBoundingBox();if(g.boundingBox)initialBox.union(g.boundingBox.clone().applyMatrix4(o.matrixWorld));}});
  if(initialBox.isEmpty()||!Number.isFinite(initialBox.min.length()+initialBox.max.length())){this.disposeObject(object);throw new Error('此 3DM 没有可显示的几何对象。请在 Rhino 中开启保存显示网格后另存。');}
  const center=initialBox.getCenter(new THREE.Vector3());object.position.sub(center);object.updateMatrixWorld(true);
  const parts:ModelPart[]=[],map=new Map<THREE.Object3D,ModelPart>();
  const layerInfo=modelLayers(object.userData.layers??[]);let number=0;
  const walk=(o:THREE.Object3D):ModelPart|null=>{
   const children=o.children.map(walk).filter((n):n is ModelPart=>n!==null);
   const geometry=(o as THREE.Mesh).geometry;if(!geometry&&!children.length)return null;
   const bounds=new THREE.Box3().setFromObject(o);if(bounds.isEmpty())return null;
   const attr=o.userData.attributes??{},type=o.userData.objectType??(children.length?'InstanceReference':o.type);
   const labels:Record<string,string>={Brep:'曲面部件',Extrusion:'拉伸体',Mesh:'网格',Curve:'曲线',Point:'点',PointSet:'点云',SubD:'细分曲面',InstanceReference:'组合部件'};
   const layer=layerInfo.byIndex.get(attr.layerIndex)?.path||'未分层';
   const kind=labels[type]??type,name=modelName(attr.name,o.name,layer,kind,++number);
   const part:ModelPart={id:o.uuid,label:name.label,named:name.named,kind,layer,layerIndex:attr.layerIndex??-1,object:o,bounds,children};
   map.set(o,part);parts.push(part);return part;
  };
  const priority=(p:ModelPart)=>p.children.length?0:p.kind==='曲线'?10:p.kind==='点'||p.kind==='点云'?20:1;
  const roots=object.children.map(walk).filter((n):n is ModelPart=>n!==null).sort((a,b)=>priority(a)-priority(b));
  performance.mark('3dm-indexed');
  this.clear();this.parts=parts;this.roots=roots;this.objectParts=map;this.layerTree=layerInfo.roots;this.layers=[...layerInfo.byIndex.values()].map(l=>l.path);
  this.warnings=(object.userData.warnings??[]).map((w:{type?:string;message?:string})=>w.type||w.message||'未知对象');
  // Retain the original geometry/materials; Rhino lights do not control the reader lighting.
  object.traverse(o=>{if((o as THREE.Light).isLight)o.visible=false;});
  this.root=object;this.scene.add(object);if(previewView){this.camera.position.copy(previewView.position).sub(center);this.controls.target.copy(previewView.target).sub(center);this.controls.update();this.draw();}else this.fit(true);
  this.cache.set(key,{root:object,parts:this.parts,roots:this.roots,layers:this.layers,warnings:this.warnings,map:this.objectParts});
  while(this.cache.size>3){const oldest=this.cache.keys().next().value!;const entry=this.cache.get(oldest)!;this.cache.delete(oldest);this.disposeObject(entry.root);}
  return false;
 }
 private addExtrusions(object:THREE.Object3D){
  const extrusions=object.userData.fallbackExtrusions??[];
  for(const entry of extrusions){
   const positions:number[]=[],indices:number[]=[],profiles=entry.profiles as {bottom:number[][];top:number[][];closed:boolean}[];
   let offset=0;for(const p of profiles){const n=p.bottom.length;if(n<3)continue;for(const v of p.bottom)positions.push(...v);for(const v of p.top)positions.push(...v);for(let i=0;i<(p.closed?n:n-1);i++){const j=(i+1)%n;indices.push(offset+i,offset+j,offset+n+j,offset+i,offset+n+j,offset+n+i);}offset+=n*2;}
   if(!positions.length)continue;
   // Triangulate caps in their own plane, including inner profile holes.
   const outer=profiles[0],origin=new THREE.Vector3().fromArray(outer.bottom[0]),axis=new THREE.Vector3().fromArray(outer.top[0]).sub(origin).normalize();
   let u=new THREE.Vector3().fromArray(outer.bottom[1]).sub(origin).normalize();if(!u.lengthSq())u.set(1,0,0);const v=new THREE.Vector3().crossVectors(axis,u).normalize();u=new THREE.Vector3().crossVectors(v,axis).normalize();
   const planar=profiles.map(p=>p.bottom.map(q=>{const point=new THREE.Vector3().fromArray(q).sub(origin);return new THREE.Vector2(point.dot(u),point.dot(v));}));
   const flatBottom:number[]=[],flatTop:number[]=[];let base=0;for(const p of profiles){for(let i=0;i<p.bottom.length;i++){flatBottom.push(base+i);flatTop.push(base+p.bottom.length+i);}base+=p.bottom.length*2;}
   if(outer.closed&&(entry.bottom||entry.top))for(const tri of THREE.ShapeUtils.triangulateShape(planar[0],planar.slice(1))){if(entry.bottom)indices.push(...tri.map(i=>flatBottom[i]));if(entry.top)indices.push(...tri.map(i=>flatTop[i]));}
   const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setIndex(indices);geometry.computeVertexNormals();
   const mesh=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color:'#a8b9c5',side:THREE.DoubleSide,roughness:.8}));mesh.userData={attributes:entry.attributes,objectType:'Extrusion',fallbackExtrusion:true};object.add(mesh);
  }
  delete object.userData.fallbackExtrusions;
 }
 private visibleBounds(){const bounds=new THREE.Box3();this.root?.traverseVisible(o=>{const g=(o as THREE.Mesh).geometry;if(g){if(!g.boundingBox)g.computeBoundingBox();if(g.boundingBox)bounds.union(g.boundingBox.clone().applyMatrix4(o.matrixWorld));}});return bounds;}
 fit(initial=false){let b=this.visibleBounds();if(initial&&this.root){const preferred=new THREE.Box3();this.root.traverseVisible(o=>{if(o.userData.fallbackExtrusion)preferred.union(new THREE.Box3().setFromObject(o));});if(!preferred.isEmpty())b=preferred;}if(b.isEmpty())return;this.clearSelection();this.frameBox(b,initial);}
 private frameBox(bounds:THREE.Box3,initial=false){
  const center=bounds.getCenter(new THREE.Vector3()),size=bounds.getSize(new THREE.Vector3()),radius=Math.max(size.length()/2,.001);
  const vFov=THREE.MathUtils.degToRad(this.camera.fov),hFov=2*Math.atan(Math.tan(vFov/2)*this.camera.aspect),distance=radius/Math.sin(Math.min(vFov,hFov)/2)*1.2;
  const direction=initial?new THREE.Vector3(1,-1,.7).normalize():this.camera.position.clone().sub(this.controls.target).normalize();if(!direction.lengthSq())direction.set(1,-1,1).normalize();
  const all=this.root?new THREE.Box3().setFromObject(this.root).getSize(new THREE.Vector3()).length():radius*2;
  this.camera.near=Math.max(distance/10000,.00001);this.camera.far=Math.max(distance*100,all*30);this.camera.updateProjectionMatrix();
  this.controls.minDistance=Math.max(radius*.001,.00001);this.controls.maxDistance=Math.max(all*100,distance*100);
  const to=center.clone().addScaledVector(direction,distance);
  if(initial){this.animation=null;this.controls.target.copy(center);this.camera.position.copy(to);this.controls.update();}else this.animation={start:performance.now(),from:this.camera.position.clone(),to,targetFrom:this.controls.target.clone(),targetTo:center};
  this.draw();
 }
 focus(parts:ModelPart[]){
  this.clearSelection();const bounds=new THREE.Box3();const selected=new Set<THREE.Object3D>();
  for(const part of parts){for(let o:THREE.Object3D|null=part.object;o&&o!==this.scene;o=o.parent)o.visible=true;bounds.union(part.bounds);part.object.traverse(o=>selected.add(o));}
  if(bounds.isEmpty())return;
  selected.forEach(o=>{const mesh=o as THREE.Mesh;if(!mesh.material)return;this.originalMaterials.set(o,mesh.material);const highlight=(m:THREE.Material)=>{const clone=m.clone() as THREE.MeshStandardMaterial;if(clone.color)clone.color.set('#3799cf');if(clone.emissive)clone.emissive.set('#16374b');return clone;};mesh.material=Array.isArray(mesh.material)?mesh.material.map(highlight):highlight(mesh.material);});
  this.helper=new THREE.Box3Helper(bounds,0x177db4);this.scene.add(this.helper);this.frameBox(bounds);this.draw();
 }
 clearSelection(){this.originalMaterials.forEach((material,o)=>{const current=(o as THREE.Mesh).material;for(const m of Array.isArray(current)?current:[current])m.dispose();(o as THREE.Mesh).material=material;});this.originalMaterials.clear();if(this.helper){this.scene.remove(this.helper);this.helper.geometry.dispose();(this.helper.material as THREE.Material).dispose();this.helper=null;}this.draw();}
 partsForLayer(layer:LayerNode){const ids=new Set<number>();const visit=(n:LayerNode)=>{ids.add(n.index);n.children.forEach(visit);};visit(layer);return this.parts.filter(p=>ids.has(p.layerIndex));}
 toggleLayer(layer:string){const parts=this.parts.filter(p=>p.layer===layer),visible=parts.some(p=>p.object.visible);parts.forEach(p=>p.object.visible=!visible);this.draw();return !visible;}
 layerVisible(layer:string){return this.parts.some(p=>p.layer===layer&&p.object.visible);}
 zoom(factor:number){this.animation=null;this.camera.position.sub(this.controls.target).multiplyScalar(1/factor).add(this.controls.target);this.controls.update();this.draw();}
 private pick(event:PointerEvent){if(!this.root)return;const rect=this.renderer.domElement.getBoundingClientRect(),mouse=new THREE.Vector2((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1),ray=new THREE.Raycaster();ray.setFromCamera(mouse,this.camera);ray.params.Line.threshold=this.camera.position.distanceTo(this.controls.target)*.001;ray.params.Points.threshold=ray.params.Line.threshold;
  const hits=ray.intersectObject(this.root,true).filter(hit=>{for(let p:THREE.Object3D|null=hit.object;p;p=p.parent)if(!p.visible)return false;return true;});
  if(hits[0]){let o:THREE.Object3D|null=hits[0].object;while(o&&!this.objectParts.has(o))o=o.parent;if(o){const part=this.objectParts.get(o)!;this.focus([part]);this.onSelect(part);}}
 }
 draw(){if(!this.active||this.frame)return;this.frame=requestAnimationFrame(()=>{this.frame=0;if(this.animation){const a=this.animation,t=Math.min(1,(performance.now()-a.start)/380),s=1-(1-t)**3;this.camera.position.lerpVectors(a.from,a.to,s);this.controls.target.lerpVectors(a.targetFrom,a.targetTo,s);if(t===1)this.animation=null;}const changed=this.controls.update();this.renderer.render(this.scene,this.camera);this.onChange();if(this.animation||changed)this.draw();});}
 clear(){this.clearSelection();if(this.root)this.scene.remove(this.root);this.root=null;this.parts=[];this.roots=[];this.layers=[];this.layerTree=[];this.objectParts=new Map();}
 private disposeObject(object:THREE.Object3D){const materials=new Set<THREE.Material>(),geometries=new Set<THREE.BufferGeometry>(),textures=new Set<THREE.Texture>();object.traverse(o=>{const mesh=o as THREE.Mesh;if(mesh.geometry)geometries.add(mesh.geometry);if(mesh.material)for(const m of Array.isArray(mesh.material)?mesh.material:[mesh.material])materials.add(m);});materials.forEach(m=>{Object.values(m).forEach(v=>{if(v instanceof THREE.Texture)textures.add(v);});m.dispose();});textures.forEach(t=>t.dispose());geometries.forEach(g=>g.dispose());}
}
