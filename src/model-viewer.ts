import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {Rhino3dmLoader} from 'three/addons/loaders/3DMLoader.js';

export type ModelPart={id:string;label:string;kind:string;layer:string;object:THREE.Object3D;bounds:THREE.Box3;children:ModelPart[]};
export class ModelViewer{
 readonly scene=new THREE.Scene();
 readonly camera=new THREE.PerspectiveCamera(42,1,.01,1e8);
 readonly renderer:THREE.WebGLRenderer;
 readonly controls:OrbitControls;
 parts:ModelPart[]=[];roots:ModelPart[]=[];layers:string[]=[];warnings:string[]=[];root:THREE.Object3D|null=null;
 onSelect:(part:ModelPart)=>void=()=>{};onChange:()=>void=()=>{};
 private objectParts=new Map<THREE.Object3D,ModelPart>();private frame=0;private active=false;
 private originalMaterials=new Map<THREE.Object3D,THREE.Material|THREE.Material[]>();
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
 setActive(value:boolean){this.active=value;this.controls.enabled=value;this.host.hidden=!value;if(value){const w=this.host.clientWidth,h=this.host.clientHeight;if(w&&h){this.renderer.setSize(w,h);this.camera.aspect=w/h;this.camera.updateProjectionMatrix();}if(this.root)this.fit(true);this.draw();}else{cancelAnimationFrame(this.frame);this.frame=0;}}
 async load(buffer:ArrayBuffer,signal:AbortSignal){
  const manager=new THREE.LoadingManager();
  manager.setURLModifier(url=>{
   if(url.startsWith('data:')||url.startsWith('blob:'))return url;
   const parsed=new URL(url,location.href);
   if(parsed.origin!==location.origin||!parsed.pathname.includes('/rhino/'))throw new Error('模型引用了外部资源，已阻止联网读取。请把显示网格和纹理嵌入 3DM。');
   return parsed.href;
  });
  const loader=new Rhino3dmLoader(manager).setLibraryPath(new URL('./rhino/',location.href).href).setWorkerLimit(1);
  const object=await new Promise<THREE.Object3D>((resolve,reject)=>{
   const abort=()=>{loader.dispose();reject(new DOMException('已取消读取','AbortError'));};signal.addEventListener('abort',abort,{once:true});
   if(signal.aborted){abort();return;}
   loader.parse(buffer,result=>{signal.removeEventListener('abort',abort);loader.dispose();if(signal.aborted){this.disposeObject(result);reject(new DOMException('已取消读取','AbortError'));}else resolve(result);},error=>{signal.removeEventListener('abort',abort);loader.dispose();reject(new Error(error?.message||'无法解析 3DM，请检查文件是否损坏。'));});
  });
  if(signal.aborted){this.disposeObject(object);throw new DOMException('已取消读取','AbortError');}
  object.updateMatrixWorld(true);
  const initialBox=new THREE.Box3();object.traverseVisible(o=>{const g=(o as THREE.Mesh).geometry;if(g){if(!g.boundingBox)g.computeBoundingBox();if(g.boundingBox)initialBox.union(g.boundingBox.clone().applyMatrix4(o.matrixWorld));}});
  if(initialBox.isEmpty()||!Number.isFinite(initialBox.min.length()+initialBox.max.length())){this.disposeObject(object);throw new Error('此 3DM 没有可显示的几何对象。请在 Rhino 中开启保存显示网格后另存。');}
  const center=initialBox.getCenter(new THREE.Vector3());object.position.sub(center);object.updateMatrixWorld(true);
  const parts:ModelPart[]=[],map=new Map<THREE.Object3D,ModelPart>();
  const layerInfo=object.userData.layers??[];let number=0;
  const walk=(o:THREE.Object3D):ModelPart|null=>{
   const children=o.children.map(walk).filter((n):n is ModelPart=>n!==null);
   const geometry=(o as THREE.Mesh).geometry;if(!geometry&&!children.length)return null;
   const bounds=new THREE.Box3().setFromObject(o);if(bounds.isEmpty())return null;
   const attr=o.userData.attributes??{},type=o.userData.objectType??(children.length?'InstanceReference':o.type);
   const labels:Record<string,string>={Brep:'曲面部件',Extrusion:'拉伸体',Mesh:'网格',Curve:'曲线',Point:'点',PointSet:'点云',SubD:'细分曲面',InstanceReference:'组合部件'};
   const layer=layerInfo[attr.layerIndex]?.fullPath||layerInfo[attr.layerIndex]?.name||'未分层';
   const part:ModelPart={id:o.uuid,label:attr.name||o.name||`${labels[type]??type} ${String(++number).padStart(3,'0')}`,kind:labels[type]??type,layer,object:o,bounds,children};
   map.set(o,part);parts.push(part);return part;
  };
  const priority=(p:ModelPart)=>p.children.length?0:p.kind==='曲线'?10:p.kind==='点'||p.kind==='点云'?20:1;
  const roots=object.children.map(walk).filter((n):n is ModelPart=>n!==null).sort((a,b)=>priority(a)-priority(b));
  this.clear();this.parts=parts;this.roots=roots;this.objectParts=map;this.layers=[...new Set(parts.map(p=>p.layer))];
  this.warnings=(object.userData.warnings??[]).map((w:{type?:string;message?:string})=>w.type||w.message||'未知对象');
  // Retain the original geometry/materials; Rhino lights do not control the reader lighting.
  object.traverse(o=>{if((o as THREE.Light).isLight)o.visible=false;});
  this.root=object;this.scene.add(object);this.fit(true);
 }
 private visibleBounds(){const bounds=new THREE.Box3();this.root?.traverseVisible(o=>{const g=(o as THREE.Mesh).geometry;if(g){if(!g.boundingBox)g.computeBoundingBox();if(g.boundingBox)bounds.union(g.boundingBox.clone().applyMatrix4(o.matrixWorld));}});return bounds;}
 fit(initial=false){const b=this.visibleBounds();if(b.isEmpty())return;this.clearSelection();this.frameBox(b,initial);}
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
 toggleLayer(layer:string){const parts=this.parts.filter(p=>p.layer===layer),visible=parts.some(p=>p.object.visible);parts.forEach(p=>p.object.visible=!visible);this.draw();return !visible;}
 layerVisible(layer:string){return this.parts.some(p=>p.layer===layer&&p.object.visible);}
 zoom(factor:number){this.animation=null;this.camera.position.sub(this.controls.target).multiplyScalar(1/factor).add(this.controls.target);this.controls.update();this.draw();}
 private pick(event:PointerEvent){if(!this.root)return;const rect=this.renderer.domElement.getBoundingClientRect(),mouse=new THREE.Vector2((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1),ray=new THREE.Raycaster();ray.setFromCamera(mouse,this.camera);ray.params.Line.threshold=this.camera.position.distanceTo(this.controls.target)*.001;ray.params.Points.threshold=ray.params.Line.threshold;
  const hits=ray.intersectObject(this.root,true).filter(hit=>{for(let p:THREE.Object3D|null=hit.object;p;p=p.parent)if(!p.visible)return false;return true;});
  if(hits[0]){let o:THREE.Object3D|null=hits[0].object;while(o&&!this.objectParts.has(o))o=o.parent;if(o){const part=this.objectParts.get(o)!;this.focus([part]);this.onSelect(part);}}
 }
 draw(){if(!this.active||this.frame)return;this.frame=requestAnimationFrame(()=>{this.frame=0;if(this.animation){const a=this.animation,t=Math.min(1,(performance.now()-a.start)/380),s=1-(1-t)**3;this.camera.position.lerpVectors(a.from,a.to,s);this.controls.target.lerpVectors(a.targetFrom,a.targetTo,s);if(t===1)this.animation=null;}const changed=this.controls.update();this.renderer.render(this.scene,this.camera);this.onChange();if(this.animation||changed)this.draw();});}
 clear(){this.clearSelection();if(this.root){this.scene.remove(this.root);this.disposeObject(this.root);}this.root=null;this.parts=[];this.roots=[];this.layers=[];this.objectParts.clear();}
 private disposeObject(object:THREE.Object3D){const materials=new Set<THREE.Material>(),geometries=new Set<THREE.BufferGeometry>(),textures=new Set<THREE.Texture>();object.traverse(o=>{const mesh=o as THREE.Mesh;if(mesh.geometry)geometries.add(mesh.geometry);if(mesh.material)for(const m of Array.isArray(mesh.material)?mesh.material:[mesh.material])materials.add(m);});materials.forEach(m=>{Object.values(m).forEach(v=>{if(v instanceof THREE.Texture)textures.add(v);});m.dispose();});textures.forEach(t=>t.dispose());geometries.forEach(g=>g.dispose());}
}
