'use strict';

const SHIP_SKINS = {
  classic: {
    name: 'Clásica',
    color: '#fff',
    vertices: [[20, 0], [-12, -9], [-7, 0], [-12, 9]],
    thruster: { color: 'rgba(255,130,0,0.85)', flicker: true, lengthRange: [6, 14] },
    speedIndicator: '#ffd700',
    drawExtras: () => {}
  },
  neon: {
    name: 'Neón',
    color: '#0ff',
    glowColor: 'rgba(0,255,255,0.35)',
    vertices: [[22, 0], [-10, -12], [-5, 0], [-10, 12]],
    thruster: { color: 'rgba(255,0,255,0.9)', pulse: true, lengthRange: [8, 16] },
    speedIndicator: '#ff0',
    drawExtras: (ctx, t) => {
      ctx.shadowBlur = 12 + Math.sin(t * 5) * 6;
      ctx.shadowColor = '#0ff';
    }
  },
  red: {
    name: 'Escarlata',
    color: '#f44',
    vertices: [[20, 0], [-14, -10], [-6, 0], [-14, 10]],
    thruster: { color: 'rgba(255,80,80,0.9)', flicker: true, lengthRange: [5, 13] },
    speedIndicator: '#ffaa00',
    drawExtras: (ctx) => {
      ctx.shadowBlur = 4;
      ctx.shadowColor = '#f44';
    }
  },
  stealth: {
    name: 'Sigilo',
    color: '#888',
    vertices: [[18, 0], [-10, -8], [-4, 0], [-10, 8]],
    thruster: { color: 'rgba(100,200,255,0.5)', steady: true, lengthRange: [4, 10] },
    speedIndicator: '#0ff',
    drawExtras: () => {}
  },
  gold: {
    name: 'Dorada',
    color: '#ffd700',
    vertices: [[22, 0], [-12, -11], [-5, 0], [-12, 11]],
    thruster: { color: 'rgba(255,215,0,0.95)', pulse: true, lengthRange: [7, 15] },
    speedIndicator: '#fff',
    drawExtras: (ctx, t) => {
      ctx.shadowBlur = 8 + Math.sin(t * 3) * 4;
      ctx.shadowColor = '#ffd700';
      ctx.strokeStyle = 'rgba(255,255,255,0.3)';
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(0, -8);
      ctx.lineTo(0, 8);
      ctx.stroke();
    }
  }
};

const SKIN_ORDER = ['classic', 'neon', 'red', 'stealth', 'gold'];