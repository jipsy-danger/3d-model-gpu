import React, { useEffect } from 'react';

const API = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000';

export default function ProjectionOverlay() {
  useEffect(() => {
    let dead = false;
    let timer = 0;
    let frameTimer = 0;
    let reconnectTimer = 0;
    let frame = null;
    let camera = null;
    let oneSvg = null;
    let twoSvg = null;
    let ws = null;
    let wsConnected = false;
    const hidden = [];

    const hideDiagnostics = root => {
      root?.querySelectorAll('.one-d-cloud-dot,.one-d-sync-indicator,.one-d-space-axis-label,.one-d-viewport-hint,.two-d-cloud-point,.two-d-sync-indicator,.two-d-space-axis-label,.two-d-viewport-hint').forEach(el => {
        if (!hidden.includes(el)) {
          hidden.push(el);
          el.style.display = 'none';
        }
      });
    };
    const restoreDiagnostics = () => hidden.splice(0).forEach(el => { el.style.display = ''; });
    const removeSvg = () => { oneSvg?.remove(); twoSvg?.remove(); oneSvg = null; twoSvg = null; };
    const makeSvg = (root, old) => {
      const w = Math.max(1, root.clientWidth), h = Math.max(1, root.clientHeight);
      const svg = old || document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('width', String(w)); svg.setAttribute('height', String(h)); svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
      Object.assign(svg.style, { position:'absolute', left:'0', top:'0', width:'100%', height:'100%', display:'block', overflow:'hidden', pointerEvents:'none', zIndex:'999' });
      return svg;
    };
    const ensureMounted = () => {
      const one = document.querySelector('.one-d-space'), two = document.querySelector('.two-d-space');
      if (!one || !two) return null;
      hideDiagnostics(one); hideDiagnostics(two);
      if (!oneSvg || oneSvg.parentNode !== one) { oneSvg?.remove(); oneSvg = makeSvg(one, null); one.appendChild(oneSvg); }
      if (!twoSvg || twoSvg.parentNode !== two) { twoSvg?.remove(); twoSvg = makeSvg(two, null); two.appendChild(twoSvg); }
      return { one, two };
    };
    const syncEnabled = () => {
      const b = document.querySelector('.sync-button'); if (!b) return true;
      return b.classList.contains('sync-active') || (b.textContent || '').toUpperCase().includes('SYNC ON');
    };
    const clearSvg = svg => { while (svg.firstChild) svg.removeChild(svg.firstChild); };
    const project = vertex => {
      if (!camera?.position || !camera?.right || !camera?.up || !camera?.forward) return null;
      const p = [Number(vertex[0])-Number(camera.position[0]), Number(vertex[1])-Number(camera.position[1]), Number(vertex[2])-Number(camera.position[2])];
      const dot = (a,b) => a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
      const depth = dot(p, camera.forward); if (!(depth > .001)) return null;
      const tanHalf = Math.tan((Number(camera.fov)||48)*Math.PI/360), aspect = Math.max(.1, Number(camera.aspect)||1);
      return { x:dot(p,camera.right)/(depth*tanHalf*aspect), y:dot(p,camera.up)/(depth*tanHalf) };
    };
    const line = (svg,x1,y1,x2,y2,stroke,width,opacity=1,dash=null) => {
      const el=document.createElementNS('http://www.w3.org/2000/svg','line');
      el.setAttribute('x1',x1); el.setAttribute('y1',y1); el.setAttribute('x2',x2); el.setAttribute('y2',y2); el.setAttribute('stroke',stroke); el.setAttribute('stroke-width',width); el.setAttribute('stroke-opacity',opacity); if(dash) el.setAttribute('stroke-dasharray',dash); svg.appendChild(el);
    };
    const circle = (svg,cx,cy,r,fill) => { const el=document.createElementNS('http://www.w3.org/2000/svg','circle'); el.setAttribute('cx',cx); el.setAttribute('cy',cy); el.setAttribute('r',r); el.setAttribute('fill',fill); svg.appendChild(el); };
    const convexHull = points => {
      const sorted=points.map((p,i)=>({...p,i})).sort((a,b)=>a.x-b.x||a.y-b.y); if(sorted.length<=2)return sorted;
      const cross=(o,a,b)=>(a.x-o.x)*(b.y-o.y)-(a.y-o.y)*(b.x-o.x), lower=[], upper=[];
      for(const p of sorted){while(lower.length>=2&&cross(lower[lower.length-2],lower[lower.length-1],p)<=0)lower.pop();lower.push(p);}
      for(let i=sorted.length-1;i>=0;i--){const p=sorted[i];while(upper.length>=2&&cross(upper[upper.length-2],upper[upper.length-1],p)<=0)upper.pop();upper.push(p);}
      lower.pop(); upper.pop(); return lower.concat(upper);
    };
    const render = () => {
      const mounted=ensureMounted(); if(!mounted||!frame?.input?.vertices||!camera)return;
      if(!syncEnabled()){removeSvg();restoreDiagnostics();return;}
      const {one,two}=mounted; oneSvg=makeSvg(one,oneSvg); twoSvg=makeSvg(two,twoSvg); clearSvg(oneSvg); clearSvg(twoSvg);
      const vertices=frame.input.vertices, cameraPoints=vertices.map(project);
      const axisButton=document.querySelector('.one-d-controls .axis-option.selected');
      const axis=((axisButton?.textContent||'X-AXIS').trim().toUpperCase().startsWith('Y'))?'y':'x';
      const centroidScreen=camera?.centroid_screen;

      const ow=one.clientWidth, oh=one.clientHeight, oneX=v=>ow/2+v*ow/2, oneY=v=>oh/2-v*oh/2;
      const values=cameraPoints.filter(Boolean).map(p=>axis==='x'?p.x:p.y);
      if(values.length){
        const lo=Math.min(...values),hi=Math.max(...values),rect=document.createElementNS('http://www.w3.org/2000/svg','rect');
        if(axis==='x'){const a=oneX(lo),b=oneX(hi);rect.setAttribute('x',a);rect.setAttribute('y',oh/2-11);rect.setAttribute('width',Math.max(2,b-a));rect.setAttribute('height',22);}
        else{const a=oneY(hi),b=oneY(lo);rect.setAttribute('x',ow/2-11);rect.setAttribute('y',a);rect.setAttribute('width',22);rect.setAttribute('height',Math.max(2,b-a));}
        rect.setAttribute('fill','#788f98');rect.setAttribute('fill-opacity','.92');rect.setAttribute('stroke','#9bf5ff');rect.setAttribute('stroke-width','1.5');rect.setAttribute('rx','2');oneSvg.appendChild(rect);
        values.forEach(v=>circle(oneSvg,axis==='x'?oneX(v):ow/2,axis==='x'?oh/2:oneY(v),2.2,'#9bf5ff'));
      }
      if(centroidScreen&&Number.isFinite(Number(centroidScreen.x))){const cx=oneX(Number(centroidScreen.x)),cy=oh/2;line(oneSvg,0,cy,ow,cy,'#76ff91',1.5,.72,'4 4');circle(oneSvg,cx,cy,5,'#76ff91');}

      const tw=two.clientWidth, th=two.clientHeight, visible=cameraPoints.filter(Boolean); if(!visible.length)return;
      const hull=convexHull(visible), minHX=Math.min(...hull.map(p=>p.x)),maxHX=Math.max(...hull.map(p=>p.x)),minHY=Math.min(...hull.map(p=>p.y)),maxHY=Math.max(...hull.map(p=>p.y));
      const hullCenterX=(minHX+maxHX)/2,hullCenterY=(minHY+maxHY)/2,scale=Math.min((tw*.72)/Math.max(.001,maxHX-minHX),(th*.72)/Math.max(.001,maxHY-minHY));
      const xy=p=>[tw/2+(p.x-hullCenterX)*scale,th/2-(p.y-hullCenterY)*scale];
      if(hull.length>=3){const poly=document.createElementNS('http://www.w3.org/2000/svg','polygon');poly.setAttribute('points',hull.map(xy).map(p=>p.join(',')).join(' '));poly.setAttribute('fill','#788f98');poly.setAttribute('fill-opacity','.30');poly.setAttribute('stroke','#9bf5ff');poly.setAttribute('stroke-width','1.5');twoSvg.appendChild(poly);}
      visible.forEach(p=>{const q=xy(p);circle(twoSvg,q[0],q[1],2.8,'#9bf5ff');});

      // 2D centroid is a LINE, not a dot. It is the projected centerline of the
      // real cuboid X-axis, exactly like the green centroid line in the 3D view.
      // The backend/3D centroid remains the single source of truth.
      const rawCentroid=Array.isArray(frame.centroid)?frame.centroid:null;
      const size=Array.isArray(frame.input.size)?frame.input.size:null;
      if(rawCentroid&&size&&size.length>=1){
        const halfX=Number(size[0])/2;
        const a=project([Number(rawCentroid[0])-halfX,Number(rawCentroid[1]),Number(rawCentroid[2])]);
        const b=project([Number(rawCentroid[0])+halfX,Number(rawCentroid[1]),Number(rawCentroid[2])]);
        if(a&&b){
          const A=xy(a),B=xy(b);
          line(twoSvg,A[0],A[1],B[0],B[1],'#76ff91',3,1);
          const c=xy(project(rawCentroid)||{x:hullCenterX,y:hullCenterY});
          circle(twoSvg,c[0],c[1],3.5,'#76ff91');
        }
      }
    };
    const loadFrame=()=>fetch(`${API}/api/frame`).then(r=>r.ok?r.json():null).then(d=>{if(!dead&&d){frame=d;render();}}).catch(()=>{});
    const loadState=()=>fetch(`${API}/api/state`).then(r=>r.ok?r.json():null).then(d=>{if(!dead&&d){camera=d;render();}}).catch(()=>{});
    const connect=()=>{if(dead)return;try{ws=new WebSocket(API.replace(/^http/,'ws')+'/ws/view');ws.onopen=()=>{wsConnected=true;render();};ws.onmessage=e=>{try{const n=JSON.parse(e.data);if(n?.type==='view_state'){camera=n;render();}}catch{}};ws.onclose=()=>{wsConnected=false;if(!dead)reconnectTimer=window.setTimeout(connect,500);};ws.onerror=()=>{try{ws.close();}catch{}};}catch{wsConnected=false;if(!dead)reconnectTimer=window.setTimeout(connect,500);}};
    const poll=()=>{if(dead)return;ensureMounted();if(!wsConnected)loadState();render();timer=window.setTimeout(poll,100);};
    const framePoll=()=>{if(dead)return;loadFrame();frameTimer=window.setTimeout(framePoll,250);};
    loadFrame();loadState();connect();poll();framePoll();
    const observer=new MutationObserver(render);observer.observe(document.body,{subtree:true,attributes:true,attributeFilter:['class']});
    const onClick=()=>window.setTimeout(render,0),onResize=()=>render();document.addEventListener('click',onClick);window.addEventListener('resize',onResize);
    return()=>{dead=true;clearTimeout(timer);clearTimeout(frameTimer);clearTimeout(reconnectTimer);ws?.close();observer.disconnect();document.removeEventListener('click',onClick);window.removeEventListener('resize',onResize);removeSvg();restoreDiagnostics();};
  }, []);
  return null;
}
