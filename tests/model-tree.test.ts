import {test} from 'node:test';
import assert from 'node:assert/strict';
import {modelLayers,modelName} from '../src/model-tree.ts';

test('Rhino parent IDs preserve hierarchy, empty layers and duplicate leaf names',()=>{
 const {roots,byIndex}=modelLayers([
  {id:'child',parentLayerId:'parent',index:8,name:'Panel'},
  {id:'other',index:12,name:'Panel'},
  {id:'parent',index:5,name:'Assembly'},
  {id:'empty',parentLayerId:'parent',index:9,name:'Empty'},
 ]);
 assert.deepEqual(roots.map(n=>n.index),[12,5]);
 assert.equal(byIndex.get(8)?.path,'Assembly::Panel');
 assert.equal(byIndex.get(12)?.path,'Panel');
 assert.deepEqual(byIndex.get(5)?.children.map(n=>n.index),[8,9]);
});

test('missing parents and cyclic layer metadata remain browsable',()=>{
 const {roots,byIndex}=modelLayers([{id:'a',parentLayerId:'b'},{id:'b',parentLayerId:'a'},{id:'c',parentLayerId:'missing'}]);
 assert.equal(roots.length,3);assert.equal(byIndex.size,3);
});

test('object names take priority; unnamed surfaces retain layer context without invented names',()=>{
 assert.deepEqual(modelName('Actual name','', 'Parent::Layer','曲面部件',7),{label:'Actual name',named:true});
 assert.deepEqual(modelName('   ','Definition name','Layer','组合部件',7),{label:'Definition name',named:true});
 assert.deepEqual(modelName(undefined,'','Parent::Layer','曲面部件',7),{label:'Parent::Layer · 曲面部件 007',named:false});
});
