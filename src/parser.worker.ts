import {LibreDwg,Dwg_File_Type} from '@mlightcad/libredwg-web';
import {buildScene} from './geometry';
let engine:Awaited<ReturnType<typeof LibreDwg.create>>;
let database:any,unknown=0,warnings:number[]=[];
self.onmessage=async(event)=>{
 try{
  const {buffer,space,wasmUrl}=event.data;
  if(buffer){
   self.postMessage({progress:'正在解析 DWG 数据…'});
   engine??=await LibreDwg.create(wasmUrl.replace(/\/$/,''));
   warnings=[];const originalWarn=console.warn;let pointer:number|undefined;
   try{console.warn=(...args:unknown[])=>{if(String(args[0]).includes('Open dwg file with error code:'))warnings.push(Number(args[1]));originalWarn(...args);};pointer=engine.dwg_read_data(buffer,Dwg_File_Type.DWG);}finally{console.warn=originalWarn;}
   if(!pointer)throw new Error('无法读取此 DWG。文件可能损坏，或使用了暂不支持的版本。');
   try{const result=engine.convertEx(pointer);database=result.database;unknown=result.stats.unknownEntityCount;}finally{engine.dwg_free(pointer);}
  }
  if(!database)throw new Error('请先打开图纸');
  self.postMessage({progress:'正在构建图纸和定位目录…'});
  self.postMessage({scene:{...buildScene(database,space,unknown),warnings}});
 }catch(error){self.postMessage({error:error instanceof Error?error.message:String(error)});}
};
