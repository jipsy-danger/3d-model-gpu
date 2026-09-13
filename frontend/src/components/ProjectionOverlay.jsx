import React, { useEffect } from 'react';
import * as THREE from 'three';

const API = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000';

const VERTEX_SHADER = `
uniform vec3 uPosition; uniform vec3 uRight; uniform vec3 uUp; uniform vec3 uForward;
uniform float uTanHalf; uniform float uAspect; uniform float uFitScale; uniform vec2 uFitCenter;
uniform float uAxis; uniform float uPointSize;
attribute vec3 aPosition; varying float vDepth;
void main(){
  vec3 p=aPosition-uPosition; float depth=dot(p,uForward); vDepth=depth;
  float sx=dot(p,uRight)/max(.001,depth*uTanHalf*uAspect);
  float sy=dot(p,uUp)/max(.001,depth*uTanHalf);
  float axisValue=mix(sx,sy,uAxis);
  vec2 ndc=vec2(mix(axisValue,0.,uAxis),mix(0.,axisValue,uAxis));
  ndc=(ndc-uFitCenter)*uFitScale;
  gl_Position=vec4(ndc,clamp(depth/200.,-.99,.99),1.); gl_PointSize=uPointSize;
}`;
const POINT_FRAGMENT = `uniform vec3 uColor; uniform float uOpacity; void main(){vec2 p=gl_PointCoord-.5;if(dot(p,p)>.25)discard;gl_FragColor=vec4(uColor,uOpacity);}`;
const FLAT_VERTEX = `
uniform vec3 uPosition; uniform vec3 uRight; uniform vec3 uUp; uniform vec3 uForward;
uniform float uTanHalf; uniform float uAspect; uniform float uFitScale; uniform vec2 uFitCenter;
attribute vec3 aPosition; varying float vDepth;
void main(){
  vec3 p=aPosition-uPosition; float depth=dot(p,uForward); vDepth=depth;
  float sx=dot(p,uRight)/max(.001,depth*uTanHalf*uAspect);
  float sy=dot(p,uUp)/max(.001,depth*uTanHalf);
  vec2 ndc=(vec2(sx,sy)-uFitCenter)*uFitScale;
  gl_Position=vec4(ndc,clamp(depth/200.,-.99,.99),1.);
}`;
const FLAT_FRAGMENT = `uniform vec3 uColor; uniform float uOpacity; void main(){gl_FragColor=vec4(uColor,uOpacity);}`;
const SCREEN_LINE_VERTEX = `attribute vec2 aClip; void main(){gl_Position=vec4(aClip,0.,1.);}`;
const SCREEN_LINE_FRAGMENT = `uniform vec3 uColor; uniform float uOpacity; void main(){gl_FragColor=vec4(uColor,uOpacity);}`;

function makeRenderer(root){
  const renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2)); renderer.setClearColor(0,0);
  renderer.domElement.style.cssText='position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none;z-index:999;';
  root.appendChild(renderer.domElement); return renderer;
}
function baseUniforms(camera){return {
  uPosition:{value:new THREE.Vector3().fromArray(camera.position||[0,0,0])},uRight:{value:new THREE.Vector3().fromArray(camera.right||[1,0,0])},
  uUp:{value:new THREE.Vector3().fromArray(camera.up||[0,1,0])},uForward:{value:new THREE.Vector3().fromArray(camera.forward||[0,0,1])},
  uTanHalf:{value:Math.tan((Number(camera.fov)||48)*Math.PI/360)},uAspect:{value:Math.max(.1,Number(camera.aspect)||1)},
  uFitScale:{value:1},uFitCenter:{value:new THREE.Vector2()},uColor:{value:new THREE.Color('#9bf5ff')},uOpacity:{value:1}
};}
function syncUniforms(material,camera,center,scale){
  material.uniforms.uPosition.value.fromArray(camera.position);material.uniforms.uRight.value.fromArray(camera.right);material.uniforms.uUp.value.fromArray(camera.up);material.uniforms.uForward.value.fromArray(camera.forward);
  material.uniforms.uTanHalf.value=Math.tan((Number(camera.fov)||48)*Math.PI/360);material.uniforms.uAspect.value=Math.max(.1,Number(camera.aspect)||1);
  material.uniforms.uFitCenter.value.copy(center);material.uniforms.uFitScale.value=scale;
}
function createPoints(vertices,camera,axis=0,size=5.5,color='#9bf5ff'){
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('aPosition',new THREE.BufferAttribute(new Float32Array(vertices.flat().map(Number)),3));
  const uniforms=baseUniforms(camera);uniforms.uAxis={value:axis};uniforms.uPointSize={value:size};uniforms.uColor.value.set(color);
  const material=new THREE.ShaderMaterial({vertexShader:VERTEX_SHADER,fragmentShader:POINT_FRAGMENT,uniforms,transparent:true,depthTest:false,depthWrite:false});
  const object=new THREE.Points(geometry,material);object.frustumCulled=false;return {object,geometry,material};
}
function createSurface(vertices,camera){
  const indices=[0,1,2,0,2,3,4,6,5,4,7,6,0,4,5,0,5,1,3,2,6,3,6,7,1,5,6,1,6,2,0,3,7,0,7,4],positions=[];
  for(const i of indices)positions.push(...vertices[i].map(Number));
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('aPosition',new THREE.BufferAttribute(new Float32Array(positions),3));
  const uniforms=baseUniforms(camera);uniforms.uColor.value.set('#788f98');uniforms.uOpacity.value=.30;
  const material=new THREE.ShaderMaterial({vertexShader:FLAT_VERTEX,fragmentShader:FLAT_FRAGMENT,uniforms,transparent:true,depthTest:true,depthWrite:true,side:THREE.DoubleSide});
  const object=new THREE.Mesh(geometry,material);object.frustumCulled=false;return {object,geometry,material};
}
function createProjectedLine(points,camera,color='#76ff91'){
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('aPosition',new THREE.BufferAttribute(new Float32Array(points.flat().map(Number)),3));
  const uniforms=baseUniforms(camera);uniforms.uColor.value.set(color);uniforms.uOpacity.value=1;
  const material=new THREE.ShaderMaterial({vertexShader:FLAT_VERTEX,fragmentShader:FLAT_FRAGMENT,uniforms,transparent:true,depthTest:false,depthWrite:false});
  const object=new THREE.Line(geometry,material);object.renderOrder=1000;object.frustumCulled=false;return {object,geometry,material};
}
function createScreenLine(color='#76ff91'){
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('aClip',new THREE.BufferAttribute(new Float32Array([-1,0,1,0]),2));
  const material=new THREE.ShaderMaterial({vertexShader:SCREEN_LINE_VERTEX,fragmentShader:SCREEN_LINE_FRAGMENT,uniforms:{uColor:{value:new THREE.Color(color)},uOpacity:{value:.72}},transparent:true,depthTest:false,depthWrite:false});
  const object=new THREE.Line(geometry,material);object.frustumCulled=false;object.renderOrder=1000;return {object,geometry,material};
}
function cameraProject(point,camera){
  const p=new THREE.Vector3().fromArray(point).sub(new THREE.Vector3().fromArray(camera.position));
  const right=new THREE.Vector3().fromArray(camera.right||[1,0,0]),up=new THREE.Vector3().fromArray(camera.up||[0,1,0]),forward=new THREE.Vector3().fromArray(camera.forward||[0,0,1]);
  const depth=p.dot(forward);if(depth<=.001)return null;const tanHalf=Math.tan((Number(camera.fov)||48)*Math.PI/360),aspect=Math.max(.1,Number(camera.aspect)||1);
  return {x:p.dot(right)/(depth*tanHalf*aspect),y:p.dot(up)/(depth*tanHalf)};
}
function fit2D(vertices,camera){
  const projected=vertices.map(v=>cameraProject(v,camera)).filter(Boolean);if(!projected.length)return {center:new THREE.Vector2(),scale:1};
  const xs=projected.map(p=>p.x),ys=projected.map(p=>p.y),minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
  return {center:new THREE.Vector2((minX+maxX)/2,(minY+maxY)/2),scale:Math.min(1.44/Math.max(.001,maxX-minX),1.44/Math.max(.001,maxY-minY))};
}

export default function ProjectionOverlay(){
  useEffect(()=>{
    let dead=false,frame=null,camera=null,ws=null,wsConnected=false,pollTimer=0,frameTimer=0,reconnectTimer=0;
    const renderers=new Map(),scenes=new Map();
    const roots=()=>({one:document.querySelector('.one-d-space'),two:document.querySelector('.two-d-space')});
    const syncEnabled=()=>{const b=document.querySelector('.sync-button');if(!b)return true;return b.classList.contains('sync-active')||(b.textContent||'').toUpperCase().includes('SYNC ON');};
    const disposeScene=key=>{const scene=scenes.get(key);if(scene){scene.traverse(o=>{o.geometry?.dispose();if(o.material){o.material.map?.dispose();o.material.dispose();}});scene.clear();}renderers.get(key)?.dispose();renderers.delete(key);scenes.delete(key);};
    const ensureRenderer=(key,root)=>{if(!root)return null;let r=renderers.get(key);if(!r||r.domElement.parentNode!==root){if(r)disposeScene(key);r=makeRenderer(root);renderers.set(key,r);scenes.set(key,new THREE.Scene());}r.setSize(Math.max(1,root.clientWidth),Math.max(1,root.clientHeight),false);return r;};
    const render=()=>{
      const {one,two}=roots();if(!one||!two||!frame?.input?.vertices||!camera)return;if(!syncEnabled()){disposeScene('one');disposeScene('two');return;}
      const vertices=frame.input.vertices.map(v=>v.map(Number)),r1=ensureRenderer('one',one),r2=ensureRenderer('two',two);if(!r1||!r2)return;const s1=scenes.get('one'),s2=scenes.get('two');s1.clear();s2.clear();
      const axisButton=document.querySelector('.one-d-controls .axis-option.selected'),axis=((axisButton?.textContent||'X-AXIS').trim().toUpperCase().startsWith('Y'))?1:0;
      const fit1={center:new THREE.Vector2(),scale:1},p1=createPoints(vertices,camera,axis,5.5);syncUniforms(p1.material,camera,fit1.center,fit1.scale);s1.add(p1.object);
      const cWorld=Array.isArray(frame.centroid)?frame.centroid.map(Number):[0,0,0],centroidScreen=camera.centroid_screen;
      if(centroidScreen&&Number.isFinite(Number(centroidScreen.x))){
        const guide=createScreenLine('#76ff91');s1.add(guide.object);
        const dot=createPoints([cWorld],camera,0,9,'#76ff91');syncUniforms(dot.material,camera,fit1.center,fit1.scale);s1.add(dot.object);
        const sx=(Number(centroidScreen.x))*1;dot.material.uniforms.uFitCenter.value.set(0,0);dot.material.uniforms.uFitScale.value=1;dot.material.uniforms.uPosition.value.fromArray(camera.position);dot.material.uniforms.uRight.value.fromArray(camera.right);dot.material.uniforms.uUp.value.fromArray(camera.up);dot.material.uniforms.uForward.value.fromArray(camera.forward);void sx;
      }
      r1.render(s1,new THREE.Camera());
      const fit=fit2D(vertices,camera),surface=createSurface(vertices,camera);syncUniforms(surface.material,camera,fit.center,fit.scale);s2.add(surface.object);
      const p2=createPoints(vertices,camera,0,5.5);syncUniforms(p2.material,camera,fit.center,fit.scale);s2.add(p2.object);
      const size=Array.isArray(frame.input.size)?frame.input.size:null;if(size?.length){const hx=Number(size[0])/2;const xline=createProjectedLine([[cWorld[0]-hx,cWorld[1],cWorld[2]],[cWorld[0]+hx,cWorld[1],cWorld[2]]],camera);syncUniforms(xline.material,camera,fit.center,fit.scale);s2.add(xline.object);}
      r2.render(s2,new THREE.Camera());
      s1.traverse(o=>{if(o.geometry)o.geometry.dispose();if(o.material)o.material.dispose();});s2.traverse(o=>{if(o.geometry)o.geometry.dispose();if(o.material)o.material.dispose();});
    };
    const loadFrame=()=>fetch(`${API}/api/frame`).then(r=>r.ok?r.json():null).then(d=>{if(!dead&&d){frame=d;render();}}).catch(()=>{});
    const loadState=()=>fetch(`${API}/api/state`).then(r=>r.ok?r.json():null).then(d=>{if(!dead&&d){camera=d;render();}}).catch(()=>{});
    const connect=()=>{if(dead)return;try{ws=new WebSocket(API.replace(/^http/,'ws')+'/ws/view');ws.onopen=()=>{wsConnected=true;render();};ws.onmessage=e=>{try{const n=JSON.parse(e.data);if(n?.type==='view_state'){camera=n;render();}}catch{}};ws.onclose=()=>{wsConnected=false;if(!dead)reconnectTimer=setTimeout(connect,500);};ws.onerror=()=>{try{ws.close();}catch{}};}catch{if(!dead)reconnectTimer=setTimeout(connect,500);}};
    const poll=()=>{if(dead)return;if(!wsConnected)loadState();render();pollTimer=setTimeout(poll,100);};const framePoll=()=>{if(dead)return;loadFrame();frameTimer=setTimeout(framePoll,250);};
    loadFrame();loadState();connect();poll();framePoll();
    const observer=new MutationObserver(render);observer.observe(document.body,{subtree:true,attributes:true,attributeFilter:['class']});
    const onClick=()=>setTimeout(render,0),onResize=()=>render();document.addEventListener('click',onClick);window.addEventListener('resize',onResize);
    return()=>{dead=true;clearTimeout(pollTimer);clearTimeout(frameTimer);clearTimeout(reconnectTimer);ws?.close();observer.disconnect();document.removeEventListener('click',onClick);window.removeEventListener('resize',onResize);renderers.forEach(r=>r.dispose());renderers.clear();scenes.clear();};
  },[]);return null;
}
