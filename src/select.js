import { state } from './state.js';
import { renderOverlay } from './overlay.js';

export function hideAllPopovers() {
  const popovers = document.querySelectorAll('.popover');
  popovers.forEach(p => {
    p.hidden = true;
  });
}

export function selectEntity(type, id, extra = null) {
  hideAllPopovers();

  state.selectedEntity = { type, id, extra };
  renderOverlay();

  if (!type || !id) return;

  const screenPos = getEntityScreenPos(type, id, extra);
  if (!screenPos) return;

  switch (type) {
    case 'segment':
      showLengthPopover(id, screenPos);
      break;
    case 'joint':
      showJointPopover(id, screenPos);
      break;
    case 'gate':
      showGatePopover(id, screenPos);
      break;
    case 'slidingGate':
      showSlidingGatePopover(id, screenPos);
      break;
    case 'shape':
      showShapeResizePopover(id, screenPos);
      break;
  }
}

export function clearSelection() {
  state.selectedEntity = null;
  hideAllPopovers();
  renderOverlay();
}

function getEntityScreenPos(type, id, extra) {
  if (!window.FP || !window.FP.geo) return null;

  let geoPoint = null;

  if (type === 'shape') {
    const shape = state.shapes.find(s => s.id === id);
    if (shape) geoPoint = { lat: shape.lat, lng: shape.lng };
  } else if (type === 'joint') {
    const joint = state.joints.find(j => j.id === id);
    if (joint) geoPoint = { lat: joint.lat, lng: joint.lng };
  } else if (type === 'segment') {
    const seg = state.segments.find(s => s.id === id);
    if (seg) {
      const j1 = state.joints.find(j => j.id === seg.jointA);
      const j2 = state.joints.find(j => j.id === seg.jointB);
      if (j1 && j2) {
        geoPoint = {
          lat: (j1.lat + j2.lat) / 2,
          lng: (j1.lng + j2.lng) / 2
        };
      }
    }
  }

  if (!geoPoint) return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
  return window.FP.geo.toScreen(geoPoint);
}

function positionPopover(popover, pos) {
  popover.style.left = `${pos.x}px`;
  popover.style.top = `${pos.y - 45}px`;
  popover.hidden = false;
}

function showLengthPopover(segmentId, pos) {
  const popover = document.getElementById('length-popover');
  const input = document.getElementById('length-input');
  const seg = state.segments.find(s => s.id === segmentId);

  if (popover && input && seg) {
    input.value = seg.length ? seg.length.toFixed(1) : '';
    positionPopover(popover, pos);
  }
}

function showJointPopover(jointId, pos) {
  const popover = document.getElementById('joint-popover');
  if (popover) {
    positionPopover(popover, pos);
  }
}

function showGatePopover(gateId, pos) {
  const popover = document.getElementById('gate-popover');
  if (popover) {
    positionPopover(popover, pos);
  }
}

function showSlidingGatePopover(gateId, pos) {
  const popover = document.getElementById('sliding-gate-popover');
  if (popover) {
    positionPopover(popover, pos);
  }
}

function showShapeResizePopover(shapeId, pos) {
  const popover = document.getElementById('shape-resize-popover');
  const widthInput = document.getElementById('shape-width-input');
  const heightInput = document.getElementById('shape-height-input');
  const shape = state.shapes.find(s => s.id === shapeId);

  if (popover && shape) {
    if (widthInput) widthInput.value = shape.width || '';
    if (heightInput) heightInput.value = shape.height || '';
    positionPopover(popover, pos);
  }
}