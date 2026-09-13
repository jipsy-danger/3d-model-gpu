import React, { useEffect } from 'react';

const API = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000';
const ORIGIN = [-4, -1.15, -4];
const LENGTH = 3.5;

export default function AxisLabels() {
  useEffect(() => {
    let dead = false;
    let timer = 0;
    let reconnectTimer = 0;
    let ws = null;
    let camera = null;
    let stage = null;
    const labels = {};

    const makeLabels = () => {
      stage = document.querySelector('.three-stage');
      if (!stage) return false;
      stage.style.position = 'absolute';
      stage.querySelectorAll('.three-axis-end-label').forEach(el => el.remove());
      ['X', 'Y', 'Z'].forEach(axis => {
        const el = document.createElement('span');
        el.className = `three-axis-end-label axis-${axis.toLowerCase()}`;
        el.textContent = axis;
        stage.appendChild(el);
        labels[axis] = el;
      });
      return true;
    };

    const project = ([x, y, z]) => {
      if (!camera?.position || !camera?.right || !camera?.up || !camera?.forward || !stage) return null;
      const p = [x - camera.position[0], y - camera.position[1], z - camera.position[2]];
      const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
      const depth = dot(p, camera.forward);
      if (!(depth > 0.001)) return null;
      const fov = (Number(camera.fov) || 48) * Math.PI / 180;
      const aspect = Math.max(.1, Number(camera.aspect) || 1);
      const tanHalf = Math.tan(fov / 2);
      const sx = dot(p, camera.right) / (depth * tanHalf * aspect);
      const sy = dot(p, camera.up) / (depth * tanHalf);
      return {
        x: (sx * .5 + .5) * stage.clientWidth,
        y: (1 - (sy * .5 + .5)) * stage.clientHeight,
      };
    };

    const render = () => {
      if (!stage || !stage.isConnected) makeLabels();
      if (!stage || !camera) return;
      const endpoints = {
        X: [ORIGIN[0] + LENGTH, ORIGIN[1], ORIGIN[2]],
        Y: [ORIGIN[0], ORIGIN[1] + LENGTH, ORIGIN[2]],
        Z: [ORIGIN[0], ORIGIN[1], ORIGIN[2] + LENGTH],
      };
      Object.entries(endpoints).forEach(([axis, point]) => {
        const q = project(point);
        const el = labels[axis];
        if (!el) return;
        if (!q) {
          el.style.display = 'none';
          return;
        }
        el.style.display = 'block';
        el.style.left = `${q.x}px`;
        el.style.top = `${q.y}px`;
      });
    };

    const loadState = () => fetch(`${API}/api/state`).then(r => r.ok ? r.json() : null).then(d => {
      if (!dead && d) { camera = d; render(); }
    }).catch(() => {});

    const connect = () => {
      if (dead) return;
      try {
        ws = new WebSocket(API.replace(/^http/, 'ws') + '/ws/view');
        ws.onopen = render;
        ws.onmessage = e => {
          try {
            const next = JSON.parse(e.data);
            if (next?.type === 'view_state') { camera = next; render(); }
          } catch {}
        };
        ws.onclose = () => {
          if (!dead) reconnectTimer = window.setTimeout(connect, 500);
        };
        ws.onerror = () => { try { ws.close(); } catch {} };
      } catch {
        if (!dead) reconnectTimer = window.setTimeout(connect, 500);
      }
    };

    const tick = () => {
      if (dead) return;
      if (!document.querySelector('.three-stage')) return timer = window.setTimeout(tick, 100);
      if (!stage || !stage.isConnected) makeLabels();
      render();
      if (!ws || ws.readyState !== WebSocket.OPEN) loadState();
      timer = window.setTimeout(tick, 100);
    };

    const start = () => {
      if (makeLabels()) {
        loadState();
        connect();
        tick();
      } else {
        timer = window.setTimeout(start, 100);
      }
    };
    start();

    const onResize = () => render();
    window.addEventListener('resize', onResize);
    return () => {
      dead = true;
      clearTimeout(timer);
      clearTimeout(reconnectTimer);
      ws?.close();
      window.removeEventListener('resize', onResize);
      Object.values(labels).forEach(el => el?.remove());
    };
  }, []);

  return null;
}
