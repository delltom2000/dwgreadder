import {defineConfig} from 'vite';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
const sample = process.env.DWG_SAMPLE;
export default defineConfig({base:'./',plugins:[{name:'local-assets',configureServer(server){
  server.middlewares.use((req,res,next)=>{
    if(req.url==='/rhino/rhino3dm.js'||req.url==='/rhino/rhino3dm.wasm'){const name=req.url.split('/').pop()!;res.setHeader('Content-Type',name.endsWith('.wasm')?'application/wasm':'application/javascript');res.end(readFileSync(resolve('node_modules/rhino3dm',name)));return;}
    if(req.url==='/api/reader-health'){res.setHeader('Content-Type','text/plain');res.end('dwg-reader');return;}
    if(req.url==='/libredwg-web.wasm'){res.setHeader('Content-Type','application/wasm');res.end(readFileSync(resolve('node_modules/@mlightcad/libredwg-web/wasm/libredwg-web.wasm')));return;}
    if(req.url==='/api/sample-info'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify(sample?{name:sample.split(/[\\/]/).pop()}:null));return;}
    if(req.url==='/api/sample'&&sample){try{res.setHeader('Content-Type','application/octet-stream');res.end(readFileSync(sample));}catch{res.statusCode=404;res.end('文件不存在');}return;}next();
  });
},generateBundle(){this.emitFile({type:'asset',fileName:'libredwg-web.wasm',source:readFileSync(resolve('node_modules/@mlightcad/libredwg-web/wasm/libredwg-web.wasm'))});for(const name of ['rhino3dm.js','rhino3dm.wasm'])this.emitFile({type:'asset',fileName:`rhino/${name}`,source:readFileSync(resolve('node_modules/rhino3dm',name))});}}],server:{port:5173,strictPort:true},worker:{format:'es'}});
