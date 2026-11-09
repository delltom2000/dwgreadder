export type RecentDrawing = {id:string;name:string;size:number;lastModified:number;openedAt:number;blob:Blob};
const MAX_FILES=10;
const MAX_BYTES=250*1024*1024;
let database:Promise<IDBDatabase>|undefined;
function db(){
 return database??=new Promise<IDBDatabase>((resolve,reject)=>{
  const request=indexedDB.open('dwg-reader-history',1);
  request.onupgradeneeded=()=>request.result.createObjectStore('drawings',{keyPath:'id'});
  request.onsuccess=()=>resolve(request.result);
  request.onerror=()=>reject(request.error);
 });
}
function result<T>(request:IDBRequest<T>):Promise<T>{return new Promise((resolve,reject)=>{request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});}
function completed(transaction:IDBTransaction){return new Promise<void>((resolve,reject)=>{transaction.oncomplete=()=>resolve();transaction.onerror=()=>reject(transaction.error);transaction.onabort=()=>reject(transaction.error??new Error('历史记录保存中断'));});}
export async function listHistory():Promise<RecentDrawing[]>{
 const database=await db();return (await result(database.transaction('drawings').objectStore('drawings').getAll()) as RecentDrawing[]).sort((a,b)=>b.openedAt-a.openedAt);
}
export async function rememberDrawing(file:File){
 const database=await db(),tx=database.transaction('drawings','readwrite'),done=completed(tx),store=tx.objectStore('drawings');
 const drawing:RecentDrawing={id:JSON.stringify([file.name,file.size,file.lastModified]),name:file.name,size:file.size,lastModified:file.lastModified,openedAt:Date.now(),blob:file};
 // Read and prune within one transaction so concurrent openings cannot exceed the limit.
 const request=store.getAll();request.onsuccess=()=>{
  const drawings=(request.result as RecentDrawing[]).filter(d=>d.id!==drawing.id);drawings.unshift(drawing);drawings.sort((a,b)=>b.openedAt-a.openedAt);
  let bytes=0;drawings.forEach((d,i)=>{bytes+=d.size;if(i>=MAX_FILES||bytes>MAX_BYTES)store.delete(d.id);else if(d.id===drawing.id)store.put(d);});
 };
 await done;
}
export async function deleteHistory(id?:string){const database=await db(),tx=database.transaction('drawings','readwrite'),done=completed(tx);if(id)tx.objectStore('drawings').delete(id);else tx.objectStore('drawings').clear();await done;}
