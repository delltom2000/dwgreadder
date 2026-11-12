export type LayerInfo={id?:string;parentLayerId?:string;index?:number;name?:string;fullPath?:string};
export type LayerNode={id:string;index:number;label:string;path:string;children:LayerNode[]};
export function modelLayers(info:LayerInfo[]):{roots:LayerNode[];byIndex:Map<number,LayerNode>}{
 const byId=new Map<string,LayerNode>(),byIndex=new Map<number,LayerNode>();
 const nodes=info.map((l,i)=>{const node:LayerNode={id:l.id||`layer-${i}`,index:l.index??i,label:l.name?.trim()||`图层 ${i+1}`,path:'',children:[]};byId.set(node.id,node);byIndex.set(node.index,node);return node;});
 const roots:LayerNode[]=[];
 nodes.forEach((node,i)=>{let parent=byId.get(info[i].parentLayerId??'');const seen=new Set([node.id]);let ancestor=parent;while(ancestor){if(seen.has(ancestor.id)){parent=undefined;break;}seen.add(ancestor.id);const n=nodes.indexOf(ancestor);ancestor=byId.get(info[n].parentLayerId??'');}if(parent)parent.children.push(node);else roots.push(node);});
 const paths=(list:LayerNode[],prefix='')=>{for(const node of list){node.path=prefix?`${prefix}::${node.label}`:node.label;paths(node.children,node.path);}};paths(roots);
 return {roots,byIndex};
}
export function modelName(name:unknown,objectName:string,layer:string,kind:string,number:number){
 const explicit=typeof name==='string'?name.trim():'';
 return {label:explicit||objectName.trim()||`${layer} · ${kind} ${String(number).padStart(3,'0')}`,named:!!(explicit||objectName.trim())};
}
