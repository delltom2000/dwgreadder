// A synthetic fixture only: no user drawing/model is read or copied.
import fs from 'node:fs';
import rhino3dm from 'rhino3dm';
const rhino=await rhino3dm(),doc=new rhino.File3dm();
for(let n=0;n<2;n++){
 const mesh=new rhino.Mesh();
 for(const [x,y,z] of [[0,0,0],[1,0,0],[1,1,0],[0,1,0],[0,0,1],[1,0,1],[1,1,1],[0,1,1]])mesh.vertices().add(x+n*1.8,y,z);
 for(const face of [[0,3,2,1],[4,5,6,7],[0,1,5,4],[1,2,6,5],[2,3,7,6],[3,0,4,7]])mesh.faces().addQuadFace(...face);
 const attributes=new rhino.ObjectAttributes();attributes.name=`Test cube ${n+1}`;doc.objects().add(mesh,attributes);attributes.delete();mesh.delete();
}
fs.mkdirSync('.local',{recursive:true});fs.writeFileSync('.local/generated-smoke.3dm',Buffer.from(doc.toByteArray()));doc.delete();
console.log('Generated synthetic two-cube fixture in ignored local directory.');
