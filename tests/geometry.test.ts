import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildScene,cleanText,polyline} from '../src/geometry.ts';
const line={type:'LINE',handle:'l',layer:'0',startPoint:{x:0,y:0},endPoint:{x:10,y:0},isVisible:true};
const block=(name:string,entities:any[],basePoint={x:0,y:0})=>({name,entities,basePoint});
const db=(blocks:any[])=>({tables:{BLOCK_RECORD:{entries:blocks},LAYER:{entries:[{name:'0',colorIndex:7},{name:'WALL',colorIndex:3}]}}});
test('nested inserts honor base point, rotation, scaling, layer inheritance and focus bounds',()=>{
 const inner=block('inner',[line],{x:2,y:0});
 const outer=block('outer',[{type:'INSERT',name:'inner',layer:'0',insertionPoint:{x:10,y:0},rotation:Math.PI/2,xScale:2,yScale:2}]);
 const model=block('*Model_Space',[{type:'INSERT',name:'outer',layer:'WALL',insertionPoint:{x:100,y:200},xScale:1,yScale:1}]);
 const scene=buildScene(db([model,outer,inner]));
 assert.equal(scene.primitives.length,1);const p=scene.primitives[0];assert.equal(p.layer,'WALL');assert.deepEqual(p.points,[{x:110,y:196},{x:110,y:216}]);assert.deepEqual(scene.items[0].bounds,p.bounds);
});
test('dimension picture insertion offset is applied inside its parent block',()=>{
 const dim=block('*D1',[{...line,startPoint:{x:1000,y:1000},endPoint:{x:1010,y:1000}}]);
 const outer=block('outer',[{type:'DIMENSION',name:'*D1',layer:'0',insertionPoint:{x:-1000,y:-1000}}]);
 const model=block('*Model_Space',[{type:'INSERT',name:'outer',layer:'0',insertionPoint:{x:100,y:200}}]);
 assert.deepEqual(buildScene(db([model,outer,dim])).primitives[0].points,[{x:100,y:200},{x:110,y:200}]);
});
test('model and paper space stay separate; hidden entities stay hidden',()=>{
 const scene=buildScene(db([block('*Model_Space',[line,{...line,isVisible:false}]),block('*Paper_Space',[{...line,endPoint:{x:99,y:99}}])]));assert.equal(scene.primitives.length,1);assert.equal(scene.bounds.maxX,10);
});
test('recursive block references stop and are reported',()=>{
 const insert={type:'INSERT',name:'loop',layer:'0',insertionPoint:{x:0,y:0}};
 const scene=buildScene(db([block('*Model_Space',[insert]),block('loop',[line,insert])]));assert.equal(scene.primitives.length,1);assert.equal(scene.unsupported['循环图块'],1);
});
test('bulged polyline retains its arc rather than a straight chord',()=>{
 const p=polyline([{x:-1,y:0,bulge:1},{x:1,y:0}],false);assert.ok(p.length>20);assert.ok(p.some(v=>v.y<-.99));assert.deepEqual(p.at(-1),{x:1,y:0});
});
test('CAD formatting is cleaned while document text stays plain data',()=>{
 assert.equal(cleanText('{\\fSimSun;客厅\\P35.2%%d}'),'客厅\n35.2°');assert.equal(cleanText('<script>alert(1)</script>'),'<script>alert(1)</script>');
});
