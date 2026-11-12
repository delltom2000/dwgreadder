// Decode fallback profiles locally for extrusions lacking Rhino display meshes.
declare const rhino3dm:(config:unknown)=>Promise<any>;
self.onmessage=async(e:MessageEvent)=>{
 try{
  const url=new URL(e.data.libraryUrl);importScripts(new URL('rhino3dm.js',url).href);
  const rhino=await rhino3dm({locateFile:(name:string)=>new URL(name,url).href});
  const doc=rhino.File3dm.fromByteArray(new Uint8Array(e.data.buffer)),out:any[]=[];
  for(let i=0;i<doc.objects().count;i++){
   const obj=doc.objects().get(i),g=obj.geometry();if(g.objectType!==rhino.ObjectType.Extrusion)continue;
   const existing=g.getMesh(rhino.MeshType.Any);if(existing){existing.delete();continue;}
   const profiles:any[]=[];
   for(let p=0;p<g.profileCount;p++){
    const start=g.profile3d(p,0),end=g.profile3d(p,1);if(!start||!end)continue;
    const count=Math.min(256,Math.max(64,Math.ceil((start.spanCount||1)*16))),d0=start.domain,d1=end.domain,bottom=[],top=[];
    for(let j=0;j<count;j++){const t=j/count;bottom.push(start.pointAt(d0[0]+(d0[1]-d0[0])*t));top.push(end.pointAt(d1[0]+(d1[1]-d1[0])*t));}
    profiles.push({bottom,top,closed:start.isClosed});start.delete();end.delete();
   }
   const a=obj.attributes();if(profiles.length)out.push({profiles,attributes:{id:a.id,name:a.name,layerIndex:a.layerIndex},bottom:g.isCappedAtBottom,top:g.isCappedAtTop});
  }
  doc.delete();self.postMessage({out});
 }catch(error){self.postMessage({error:error instanceof Error?error.message:String(error)});}
};
