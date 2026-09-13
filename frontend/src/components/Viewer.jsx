import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import './viewer.css';

const API = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000';
const norm = (a) => ((a % 360) + 360) % 360;

function PolarView({ heading }) {
  return (
    <article className="view-card">
      <div className="card-head"><span>2D</span><small>3D heading projection · synchronized grid</small></div>
      <div className="polar-wrap two-d-wrap">
        <div className="two-d-grid">
          {Array.from({ length: 13 }, (_, i) => <div className="two-d-grid-line vertical" key={`v-${i}`} style={{ left: `${i * 8.333}%` }} />)}
          {Array.from({ length: 11 }, (_, i) => <div className="two-d-grid-line horizontal" key={`h-${i}`} style={{ top: `${i * 10}%` }} />)}
          <div className="two-d-center" />
          <div className="two-d-heading" style={{ transform: `translate(-50%, -100%) rotate(${heading}deg)` }} />
        </div>
        <div className="angle-readout">{String(heading).padStart(3, '0')}°</div>
      </div>
      <div className="card-footer">2D GRID · 3D HEADING LINKED</div>
    </article>
  );
}

function GridView({ heading }) {
  const grid = useRef(null);
  useEffect(() => {
    if (grid.current) grid.current.style.transform = `rotate(${heading}deg)`;
  }, [heading]);

  return (
    <article className="view-card">
      <div className="card-head"><span>2.5D</span><small>Backend range grid · 360° ruler</small></div>
      <div className="grid-wrap">
        <div className="grid-surface" ref={grid}>
          <div className="grid-floor" />
          {Array.from({ length: 9 }, (_, i) => <div className="scan-row" key={`row-${i}`} style={{ top: `${10 + i * 10}%` }} />)}
          {Array.from({ length: 11 }, (_, i) => <div className="scan-col" key={`col-${i}`} style={{ left: `${5 + i * 9}%` }} />)}
          <div className="fov-ring ring-a" /><div className="fov-ring ring-b" /><div className="fov-ring ring-c" />
          <div className="object" /><div className="ego" />
        </div>
        <div className="ruler">
          {[0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330, 360].map((degree) => (
            <span key={degree} style={{ '--pos': `${(degree / 360) * 100}` }}>{degree}°</span>
          ))}
          <div className="ruler-pointer" style={{ '--pointer': `${(heading / 360) * 100}%` }} />
        </div>
      </div>
      <div className="card-footer">Pan · Rotate · Measure 360°</div>
    </article>
  );
}

function makeDegreeSprite(text) {
  const canvas = document.createElement('canvas');
  canvas.width = 220;
  canvas.height = 84;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.font = 'bold 32px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#b9e9f2';
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  texture.minFilter = THREE.LinearFilter;
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(1.05, 0.40, 1);
  return sprite;
}

function add3DRuler(scene) {
  const radius = 3.28;
  const rulerGroup = new THREE.Group();
  rulerGroup.name = '360-degree-ruler';
  const circlePoints = [];
  for (let i = 0; i <= 128; i += 1) {
    const angle = (i / 128) * Math.PI * 2;
    circlePoints.push(new THREE.Vector3(-Math.sin(angle) * radius, -1.485, Math.cos(angle) * radius));
  }
  const circleGeometry = new THREE.BufferGeometry().setFromPoints(circlePoints);
  rulerGroup.add(new THREE.Line(circleGeometry, new THREE.LineBasicMaterial({ color: 0x477b88, transparent: true, opacity: 0.72 })));
  for (let degree = 0; degree <= 360; degree += 10) {
    const angle = (degree * Math.PI) / 180;
    const major = degree % 30 === 0;
    const outer = radius + 0.13;
    const inner = radius - (major ? 0.26 : 0.15);
    const points = [
      new THREE.Vector3(-Math.sin(angle) * inner, -1.48, Math.cos(angle) * inner),
      new THREE.Vector3(-Math.sin(angle) * outer, -1.48, Math.cos(angle) * outer),
    ];
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    rulerGroup.add(new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: major ? 0x8fe9f5 : 0x456b75, transparent: true, opacity: major ? 0.9 : 0.6 })));
    if (major) {
      const label = makeDegreeSprite(`${degree}°`);
      const labelRadius = radius + 0.58;
      label.position.set(-Math.sin(angle) * labelRadius, -1.43, Math.cos(angle) * labelRadius);
      if (degree === 360) { label.position.x -= 0.30; label.position.z += 0.30; }
      rulerGroup.add(label);
    }
  }
  scene.add(rulerGroup);
}

export default function Viewer() {
  const mount = useRef(null);
  const three = useRef(null);
  const wsRef = useRef(null);
  const state = useRef({ heading: 180, pitch: 35, zoom: 1, panX: 0, panY: 0, sync: true, applyingRemote: false });
  const [heading, setHeading] = useState(180);
  const [status, setStatus] = useState('3D READY');

  const publish = () => {
    const value = state.current;
    setHeading(Math.round(norm(value.heading)));
    try { wsRef.current?.send(JSON.stringify({ type: 'view_state', ...value })); } catch {}
  };

  useEffect(() => {
    let disposed = false;
    let cleanup = () => {};
    const root = mount.current;
    if (!root) return undefined;
    try {
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x05080a);
      const camera = new THREE.PerspectiveCamera(48, 1, 0.05, 200);
      camera.position.set(0, 5.5, -7.5);
      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setClearColor(0x05080a, 1);
      root.appendChild(renderer.domElement);
      scene.add(new THREE.HemisphereLight(0xdff7ff, 0x162027, 2.2));
      const key = new THREE.DirectionalLight(0xffffff, 4); key.position.set(6, 10, 8); scene.add(key);
      const fill = new THREE.DirectionalLight(0x73dfff, 2.5); fill.position.set(-7, 5, -5); scene.add(fill);
      const floor = new THREE.GridHelper(18, 36, 0x31515c, 0x172a31); floor.position.y = -1.55; scene.add(floor);
      const axes = new THREE.AxesHelper(3.5); axes.position.set(-4, -1.54, -4); scene.add(axes);
      const size = 2.3;
      const cubeGeometry = new THREE.BoxGeometry(size, size, size);
      const cubeMaterial = new THREE.MeshStandardMaterial({ color: 0x7896a0, metalness: 0.15, roughness: 0.35, emissive: 0x13272e, emissiveIntensity: 0.7 });
      const cuboid = new THREE.Mesh(cubeGeometry, cubeMaterial); cuboid.position.set(0, -0.4, 0); scene.add(cuboid);
      const edgeGeometry = new THREE.EdgesGeometry(cubeGeometry); const edgeMaterial = new THREE.LineBasicMaterial({ color: 0x9bf5ff }); cuboid.add(new THREE.LineSegments(edgeGeometry, edgeMaterial));
      cuboid.add(new THREE.Mesh(new THREE.SphereGeometry(0.1, 20, 20), new THREE.MeshBasicMaterial({ color: 0x76ff91 })));
      const base = new THREE.Mesh(new THREE.CircleGeometry(2.8, 64), new THREE.MeshBasicMaterial({ color: 0x0c171b, transparent: true, opacity: 0.75, side: THREE.DoubleSide })); base.rotation.x = -Math.PI / 2; base.position.y = -1.54; scene.add(base);
      const baseEdge = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.CylinderGeometry(2.8, 2.8, 0.02, 64)), new THREE.LineBasicMaterial({ color: 0x2c707e })); baseEdge.position.y = -1.52; scene.add(baseEdge);
      add3DRuler(scene);
      const controls = new OrbitControls(camera, renderer.domElement);
      const defaultTarget = new THREE.Vector3(0, -0.35, 0);
      controls.target.copy(defaultTarget);
      controls.enableDamping = true; controls.dampingFactor = 0.075; controls.enableRotate = true; controls.enablePan = true; controls.enableZoom = true;
      controls.rotateSpeed = 0.9; controls.panSpeed = 1; controls.zoomSpeed = 1; controls.minDistance = 3; controls.maxDistance = 35; controls.minPolarAngle = THREE.MathUtils.degToRad(8); controls.maxPolarAngle = THREE.MathUtils.degToRad(88); controls.screenSpacePanning = true;
      renderer.domElement.addEventListener('contextmenu', (event) => event.preventDefault());
      three.current = { camera, controls, defaultTarget: defaultTarget.clone() };
      setStatus('3D READY · CUBOID · 180° DEFAULT');
      const resize = () => { const width = Math.max(1, root.clientWidth), height = Math.max(1, root.clientHeight); renderer.setSize(width, height, false); camera.aspect = width / height; camera.updateProjectionMatrix(); };
      const observer = new ResizeObserver(resize); observer.observe(root); resize();
      controls.addEventListener('change', () => {
        const offset = camera.position.clone().sub(controls.target);
        state.current.heading = norm((Math.atan2(offset.x, offset.z) * 180) / Math.PI);
        state.current.pitch = (Math.asin(Math.max(-1, Math.min(1, offset.y / offset.length()))) * 180) / Math.PI;
        state.current.zoom = Math.max(0.55, Math.min(1.8, 6.7 / offset.length()));
        state.current.panX = controls.target.x; state.current.panY = controls.target.z;
        setHeading(Math.round(state.current.heading));
        if (state.current.applyingRemote) state.current.applyingRemote = false; else if (state.current.sync) publish();
      });
      let animationFrame = 0;
      const render = () => { if (disposed) return; controls.update(); renderer.render(scene, camera); animationFrame = requestAnimationFrame(render); };
      render();
      cleanup = () => { cancelAnimationFrame(animationFrame); observer.disconnect(); controls.dispose(); cubeGeometry.dispose(); cubeMaterial.dispose(); edgeGeometry.dispose(); edgeMaterial.dispose(); scene.traverse((object) => { if (object.geometry) object.geometry.dispose(); if (object.material) { if (object.material.map) object.material.map.dispose(); object.material.dispose(); } }); renderer.dispose(); root.innerHTML = ''; three.current = null; };
      fetch(`${API}/api/frame`).then((response) => (response.ok ? response.json() : Promise.reject(new Error('backend unavailable')))).then((data) => { if (disposed || !Array.isArray(data?.points) || !data.points.length) return; const positions = new Float32Array(data.points.flat()); const pointGeometry = new THREE.BufferGeometry(); pointGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3)); const pointMaterial = new THREE.PointsMaterial({ color: 0xa7efff, size: 0.065, sizeAttenuation: true, transparent: true, opacity: 0.8 }); scene.add(new THREE.Points(pointGeometry, pointMaterial)); setStatus(`BACKEND · ${data.point_count ?? data.points.length} PTS`); }).catch(() => setStatus('3D READY · LOCAL CUBOID · 180° DEFAULT'));
    } catch (error) { console.error(error); setStatus('3D RENDER ERROR'); }
    return () => { disposed = true; cleanup(); };
  }, []);

  useEffect(() => {
    let socket;
    try {
      socket = new WebSocket(API.replace(/^http/, 'ws') + '/ws/view'); wsRef.current = socket;
      socket.onopen = () => setStatus('BACKEND CONNECTED · 3D READY');
      socket.onmessage = (event) => { try { const message = JSON.parse(event.data); if (message.type !== 'view_state' || !state.current.sync) return; const nextHeading = norm(message.heading ?? state.current.heading); state.current.heading = nextHeading; setHeading(Math.round(nextHeading)); const viewer = three.current; if (!viewer) return; const offset = viewer.camera.position.clone().sub(viewer.controls.target); const radius = Math.max(0.001, Math.hypot(offset.x, offset.z)); const angle = (nextHeading * Math.PI) / 180; state.current.applyingRemote = true; viewer.camera.position.x = viewer.controls.target.x + Math.sin(angle) * radius; viewer.camera.position.z = viewer.controls.target.z + Math.cos(angle) * radius; viewer.controls.update(); } catch {} };
    } catch {}
    return () => { try { socket?.close(); } catch {} };
  }, []);

  const rotateBy = (amount) => {
    const viewer = three.current;
    if (viewer) {
      const offset = viewer.camera.position.clone().sub(viewer.controls.target);
      const angle = (amount * Math.PI) / 180;
      const x = offset.x * Math.cos(angle) + offset.z * Math.sin(angle);
      const z = -offset.x * Math.sin(angle) + offset.z * Math.cos(angle);
      state.current.applyingRemote = false;
      viewer.camera.position.x = viewer.controls.target.x + x;
      viewer.camera.position.z = viewer.controls.target.z + z;
      viewer.controls.update();
    } else {
      state.current.heading = norm(state.current.heading + amount); setHeading(Math.round(state.current.heading)); if (state.current.sync) publish();
    }
  };

  const reset3D = () => {
    const viewer = three.current;
    if (!viewer) return;
    const target = new THREE.Vector3(0, -0.35, 0);
    const position = new THREE.Vector3(0, 5.5, -7.5);
    state.current.applyingRemote = true;
    viewer.controls.target.copy(target);
    viewer.camera.position.copy(position);
    viewer.controls.update();
    state.current.heading = 180; state.current.pitch = 35; state.current.zoom = 1; state.current.panX = 0; state.current.panY = 0;
    setHeading(180); setStatus('3D RESET · 180° BOTTOM · CLOCKWISE');
    if (state.current.sync) publish();
    requestAnimationFrame(() => { if (three.current) { three.current.camera.position.copy(position); three.current.controls.target.copy(target); three.current.controls.update(); } });
  };

  return (
    <main className="page">
      <header className="topbar">
        <div><h1>Foveated LiDAR Mapping</h1><p>3D model · synchronized 2D · synchronized 2.5D</p></div>
        <div className="header-readout"><span className="dot" />{status}</div>
      </header>
      <section className="toolbar panel">
        <span className="pill">3 VIEWS</span><span className="pill muted">360° / 16 RINGS</span><span className="grow" />
        <button className={`btn ${state.current.sync ? 'active' : ''}`} onClick={() => { state.current.sync = !state.current.sync; setStatus(state.current.sync ? 'SYNC ON' : 'SYNC OFF'); }}>● SYNC {state.current.sync ? 'ON' : 'OFF'}</button>
        <button className="btn" onClick={() => rotateBy(-5)}>↶ 5°</button><button className="btn" onClick={() => rotateBy(5)}>5° ↷</button>
      </section>
      <section className="views">
        <article className="view-card">
          <div className="card-head"><span>3D</span><small>Interactive 3D space · orbit · pan · zoom</small><button className="view-reset" type="button" onClick={reset3D} title="Reset 3D view">↺ RESET</button></div>
          <div className="three-stage" ref={mount} />
          <div className="corner axis"><i>X</i> <i>Y</i> <i>Z</i></div>
          <div className="card-footer">Left drag · orbit &nbsp;&nbsp; Right drag · pan &nbsp;&nbsp; Wheel · zoom &nbsp;&nbsp; ↺ reset</div>
        </article>
        <PolarView heading={heading} />
        <GridView heading={heading} />
      </section>
      <section className="analysis panel"><div><span className="section-kicker">FOV / ORIENTATION</span><strong>{heading}°</strong><small>linked heading</small></div><div><span className="section-kicker">INPUT</span><strong>3D CUBOID</strong><small>local fallback / backend frame</small></div><div><span className="section-kicker">RULER</span><strong>CLOCKWISE 0° → 360°</strong><small>0° top · 90° right · 180° bottom · 270° left</small></div></section>
    </main>
  );
}
