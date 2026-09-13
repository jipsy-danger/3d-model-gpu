import React, { useEffect } from 'react';

const API = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000';

const DEFAULT_RAW = {
  origin: [0, 0, 0],
  vertices: [
    [-1.15, -1.15, -1.15], [1.15, -1.15, -1.15],
    [1.15, 1.15, -1.15], [-1.15, 1.15, -1.15],
    [-1.15, -1.15, 1.15], [1.15, -1.15, 1.15],
    [1.15, 1.15, 1.15], [-1.15, 1.15, 1.15]
  ]
};

const EDGES = [[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]];
const FACES = [[0,1,2,3],[4,7,6,5],[0,4,5,1],[3,2,6,7],[1,5,6,2],[0,3,7,4]];

function project(point, yaw, pitch, zoom, panX, panY, width, height) {
  let [x, y, z] = point;
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  const x1 = x * cy - z * sy;
  const z1 = x * sy + z * cy;
  const cp = Math.cos(pitch), sp = Math.sin(pitch);
  const y1 = y * cp - z1 * sp;
  const z2 = y * sp + z1 * cp;
  const perspective = 1 / (1 + z2 * 0.045);
  return [width / 2 + panX + x1 * zoom * perspective, height / 2 + panY - y1 * zoom * perspective, z2];
}

function pointsAttr(points) {
  return points.map(p => `${p[0].toFixed(2)},${p[1].toFixed(2)}`).join(' ');
}

export default function SolidWireframe3D() {
  useEffect(() => {
    let dead = false;
    let raw = DEFAULT_RAW;
    let yaw = -0.55;
    let pitch = 0.48;
    let zoom = 105;
    let panX = 0;
    let panY = 0;
    let dragging = false;
    let panMode = false;
    let lastX = 0;
    let lastY = 0;

    const timer = setInterval(() => {
      const root = document.querySelector('.three-stage');
      if (!root || root.dataset.rawSvgViewer === '1') return;
      clearInterval(timer);
      root.dataset.rawSvgViewer = '1';

      const oldCanvas = root.querySelector('canvas');
      if (oldCanvas) oldCanvas.style.display = 'none';
      root.style.position = 'relative';

      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', '0 0 600 330');
      svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
      svg.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;z-index:2;cursor:grab;touch-action:none;background:#05080a;';
      root.appendChild(svg);

      const grid = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const faces = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const edges = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const center = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      label.setAttribute('x', '18');
      label.setAttribute('y', '25');
      label.setAttribute('fill', '#6e8993');
      label.setAttribute('font-size', '10');
      label.setAttribute('font-family', 'ui-monospace,monospace');
      label.textContent = 'RAW INPUT · 3D WIREFRAME';
      svg.append(grid, faces, edges, center, label);

      const line = (a, b, stroke, width, opacity = 1) => {
        const el = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        el.setAttribute('x1', a[0]); el.setAttribute('y1', a[1]);
        el.setAttribute('x2', b[0]); el.setAttribute('y2', b[1]);
        el.setAttribute('stroke', stroke); el.setAttribute('stroke-width', width); el.setAttribute('opacity', opacity);
        return el;
      };

      const render = () => {
        const vertices = Array.isArray(raw.vertices) && raw.vertices.length === 8 ? raw.vertices : DEFAULT_RAW.vertices;
        const projected = vertices.map(v => project(v.map(Number), yaw, pitch, zoom, panX, panY, 600, 330));
        faces.replaceChildren(); edges.replaceChildren(); grid.replaceChildren();

        for (let i = -5; i <= 5; i++) {
          const p1 = project([i * 0.6, -1.3, -3], yaw, pitch, zoom, panX, panY, 600, 330);
          const p2 = project([i * 0.6, -1.3, 3], yaw, pitch, zoom, panX, panY, 600, 330);
          grid.appendChild(line(p1, p2, '#172a31', 1, 0.9));
          const q1 = project([-3, -1.3, i * 0.6], yaw, pitch, zoom, panX, panY, 600, 330);
          const q2 = project([3, -1.3, i * 0.6], yaw, pitch, zoom, panX, panY, 600, 330);
          grid.appendChild(line(q1, q2, '#172a31', 1, 0.9));
        }

        const faceDepth = FACES.map((face, index) => ({
          index,
          depth: face.reduce((sum, i) => sum + projected[i][2], 0) / 4
        })).sort((a, b) => b.depth - a.depth);
        for (const item of faceDepth) {
          const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
          poly.setAttribute('points', pointsAttr(item.index === undefined ? [] : FACES[item.index].map(i => projected[i])));
          poly.setAttribute('fill', item.depth > 0 ? '#5f7982' : '#3b4f56');
          poly.setAttribute('fill-opacity', '0.34');
          faces.appendChild(poly);
        }

        for (const [a, b] of EDGES) edges.appendChild(line(projected[a], projected[b], '#9bf5ff', 2, 1));

        const o = Array.isArray(raw.origin) ? raw.origin.map(Number) : [0,0,0];
        const c = project(o, yaw, pitch, zoom, panX, panY, 600, 330);
        center.setAttribute('cx', c[0]); center.setAttribute('cy', c[1]); center.setAttribute('r', '5');
        center.setAttribute('fill', '#76ff91'); center.setAttribute('filter', 'drop-shadow(0 0 5px #76ff91)');
      };

      const reset = () => { yaw = -0.55; pitch = 0.48; zoom = 105; panX = 0; panY = 0; render(); };
      const resetButton = root.parentElement?.querySelector('.three-tools button');
      resetButton?.addEventListener('click', reset);

      const pointerDown = e => { dragging = true; panMode = e.button === 2; lastX = e.clientX; lastY = e.clientY; svg.style.cursor = panMode ? 'move' : 'grabbing'; };
      const pointerMove = e => {
        if (!dragging) return;
        const dx = e.clientX - lastX, dy = e.clientY - lastY;
        lastX = e.clientX; lastY = e.clientY;
        if (panMode) { panX += dx; panY += dy; }
        else { yaw += dx * 0.008; pitch += dy * 0.008; pitch = Math.max(-1.35, Math.min(1.35, pitch)); }
        render();
      };
      const pointerUp = () => { dragging = false; svg.style.cursor = 'grab'; };
      const wheel = e => { e.preventDefault(); zoom *= e.deltaY < 0 ? 1.08 : 0.93; zoom = Math.max(45, Math.min(220, zoom)); render(); };
      const context = e => e.preventDefault();
      svg.addEventListener('pointerdown', pointerDown);
      window.addEventListener('pointermove', pointerMove);
      window.addEventListener('pointerup', pointerUp);
      svg.addEventListener('wheel', wheel, { passive: false });
      svg.addEventListener('contextmenu', context);

      fetch(`${API}/api/frame`).then(r => r.ok ? r.json() : null).then(data => {
        if (dead || !data?.input?.vertices) return;
        raw = data.input;
        render();
      }).catch(() => {});

      render();

      return () => {};
    }, 40);

    return () => {
      dead = true;
      clearInterval(timer);
    };
  }, []);

  return null;
}
