/**
 * main.js (Leaflet версія)
 * Точка входу. Ініціалізує Leaflet-карту (OpenStreetMap tiles, без API-ключа
 * і без білінгу), збирає всі модулі докупи, підключає toolbar і pointer-обробники.
 */

function initMap() {
  const map = L.map('map', {
    center: [49.593, 23.482], // Дрогобич, як приклад стартової точки
    zoom: 19,
    maxZoom: 22,
  });

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(map);

  const store = new window.FP.model.DataStore();
  const editorState = new window.FP.model.EditorState();
  const sm = new window.FP.StateMachine(editorState);
  const history = new window.FP.History(store);
  const draw = new window.FP.DrawController(store, sm, history);
  const snap = new window.FP.SnapController(store);
  const jointCtrl = new window.FP.JointController(store);

  window.FP.geo.bindMap(map);

  const svgEl = document.getElementById('editor-svg');
  const selection = new window.FP.SelectionController(
    store,
    sm,
    history,
    map,
    () => rerender(),
    snap,
    (pointAId, pointBId) => openLengthPopover(pointAId, pointBId)
  );
  const overlay = new window.FP.EditorOverlay(map, svgEl, store, sm, draw, selection);

  function rerender() {
    try {
      overlay.render();
      updateStatusText();
      updateJointPopover();
    } catch (err) {
      console.error('Editor render failed:', err);
    }
  }
  sm.onChange(rerender);

  function updateStatusText() {
    const runsCount = store.runs.size;
    const pointsCount = store.points.size;
    document.getElementById('status-text').textContent =
      `Прогонів: ${runsCount} · Точок: ${pointsCount} · Undo: ${history.undoStack.length} · Redo: ${history.redoStack.length}`;
  }

  /**
   * EditorState (draftRunId, selection) НЕ входить у DataStore.snapshot(),
   * тому після Undo/Redo потрібно перевірити, чи досі існує прогін/елемент,
   * на який посилається поточний стан редактора, і скинути посилання,
   * якщо він був видалений відкатом.
   */
  function resyncEditorStateAfterHistoryChange() {
    const s = sm.state;
    if (s.draftRunId && !store.runs.has(s.draftRunId)) {
      s.draftRunId = null;
      draw.livePreviewGeo = null;
    }
    if (s.selectedRunId && !store.runs.has(s.selectedRunId)) {
      s.selectedRunId = null;
    }
    if (s.selectedPointId && !store.points.has(s.selectedPointId)) {
      s.selectedPointId = null;
    }
  }

  // --- Toolbar wiring ---
  const toolButtons = document.querySelectorAll('.tool-btn');
  toolButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      toolButtons.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      sm.setTool(btn.dataset.tool);
      updateFinishButton();
    });
  });

  document.getElementById('btn-new-run').addEventListener('click', () => {
    draw.startNewRun();
    rerender();
    updateFinishButton();
  });
  document.getElementById('btn-undo').addEventListener('click', () => {
    history.undo();
    resyncEditorStateAfterHistoryChange();
    rerender();
    updateFinishButton();
  });
  document.getElementById('btn-redo').addEventListener('click', () => {
    history.redo();
    resyncEditorStateAfterHistoryChange();
    rerender();
    updateFinishButton();
  });

  const finishBtn = document.getElementById('btn-finish-run');
  finishBtn.addEventListener('click', () => {
    draw.finishRun();
    rerender();
    updateFinishButton();
  });

  function updateFinishButton() {
    // UI-002: кнопка видима лише поки триває малювання прогону
    finishBtn.hidden = !draw.isDrafting();
  }

  // --- Map pointer wiring ---
  // PTR-003: клік по карті в режимі select не повинен нічого малювати —
  // панорамування Leaflet лишається штатним, бо ми не викликаємо
  // L.DomEvent.stop() і не блокуємо взаємодію з картою.
  map.on('click', (e) => {
    if (sm.state.activeTool === 'draw') {
      const geoPoint = { lat: e.latlng.lat, lng: e.latlng.lng };
      draw.onMapClick(geoPoint);
      rerender();
      updateFinishButton();
      return;
    }
    if (sm.state.activeTool === 'select') {
      // Клік по порожній карті (не по лінії/вузлу — ті самі мають stopPropagation)
      // знімає вибір, UI-005.
      selection.handleEmptyMapClick();
    }
  });

  map.on('mousemove', (e) => {
    if (sm.state.activeTool !== 'draw' || !draw.isDrafting()) return;
    draw.livePreviewGeo = { lat: e.latlng.lat, lng: e.latlng.lng };
    rerender();
  });

  // Коли активний інструмент "draw" — тимчасово вимикаємо перетягування карти,
  // щоб клік по карті не одночасно і панорамував, і малював (PTR-003).
  sm.onChange((state) => {
    if (state.activeTool === 'draw') {
      map.dragging.disable();
    } else {
      map.dragging.enable();
    }
  });

  // --- Keyboard wiring ---
  window.FP.bindKeyboard({
    sm,
    draw,
    history,
    callbacks: {
      onToolChanged: (tool) => {
        toolButtons.forEach((b) => b.classList.toggle('active', b.dataset.tool === tool));
        updateFinishButton();
      },
      onGeometryChanged: () => {
        rerender();
        updateFinishButton();
      },
      onHistoryChanged: () => {
        resyncEditorStateAfterHistoryChange();
      },
      closeNumberField: () => {
        closeLengthPopover();
      },
      togglePosts: () => {
        /* TODO: PST-003, наступний крок */
      },
      toggleJointLock: () => {
        // L: для вибраного стику — роз'єднати (розділ 9.3, розділ 20)
        const s = sm.state;
        if (s.selectedPointId) {
          const point = store.points.get(s.selectedPointId);
          if (point && point.jointId) {
            history.beginAction();
            snap.unlockJoint(point.jointId);
            history.commitAction();
            rerender();
          }
        }
      },
      onDelete: () => {
        selection.deleteSelected();
      },
      onDuplicate: () => {
        /* TODO: Duplicate, розділ 5 */
      },
    },
  });

  // --- Точна довжина сегмента (розділ 7.3) ---
  let activeLengthSegment = null; // { pointAId, pointBId }
  const lengthPopover = document.getElementById('length-popover');
  const lengthInput = document.getElementById('length-input');

  function openLengthPopover(pointAId, pointBId) {
    const pointA = store.points.get(pointAId);
    const pointB = store.points.get(pointBId);
    if (!pointA || !pointB) return;

    activeLengthSegment = { pointAId, pointBId };
    const currentMeters = window.FP.geo.roundLength(
      window.FP.geo.distanceMeters(pointA.geographicPosition, pointB.geographicPosition)
    );
    lengthInput.value = currentMeters.toFixed(1);

    // Позиціонуємо popover біля середини сегмента, обмежуючи в межах viewport (UI-003)
    const a = window.FP.geo.toScreen(pointA.geographicPosition);
    const b = window.FP.geo.toScreen(pointB.geographicPosition);
    const mapWrap = document.getElementById('map-wrap').getBoundingClientRect();
    let left = (a.x + b.x) / 2;
    let top = (a.y + b.y) / 2 - 40;
    left = Math.max(8, Math.min(left, mapWrap.width - 160));
    top = Math.max(8, top);

    lengthPopover.style.left = `${left}px`;
    lengthPopover.style.top = `${top}px`;
    lengthPopover.hidden = false;
    sm.enterEditNumber();
    lengthInput.focus();
    lengthInput.select();
  }

  function closeLengthPopover() {
    lengthPopover.hidden = true;
    activeLengthSegment = null;
    sm.exitEditNumber();
  }

  function applyExactLength() {
    if (!activeLengthSegment) return;
    const desired = parseFloat(lengthInput.value);
    if (Number.isNaN(desired) || desired <= 0) {
      return; // розділ 22: неприпустима довжина — не змінювати геометрію
    }

    const { pointAId, pointBId } = activeLengthSegment;
    const pointA = store.points.get(pointAId);
    const pointB = store.points.get(pointBId);
    if (!pointA || !pointB) return;

    const aJointed = !!pointA.jointId;
    const bJointed = !!pointB.jointId;

    if (aJointed && bJointed) {
      // 7.3: обидва кінці зафіксовані — не змінювати геометрію автоматично
      alert('Обидва кінці сегмента зафіксовані. Спочатку роз\'єднайте один стик (клавіша L).');
      return;
    }

    history.beginAction();
    if (bJointed && !aJointed) {
      // Рухається вільна сторона — тут це A
      const newPos = window.FP.geo.pointAtDistanceAlongDirection(
        pointB.geographicPosition,
        pointA.geographicPosition,
        desired
      );
      store.movePoint(pointAId, newPos);
    } else {
      // За замовчуванням: A лишається на місці, рухається B
      const newPos = window.FP.geo.pointAtDistanceAlongDirection(
        pointA.geographicPosition,
        pointB.geographicPosition,
        desired
      );
      store.movePoint(pointBId, newPos);
    }
    history.commitAction();

    closeLengthPopover();
    rerender();
  }

  document.getElementById('length-apply').addEventListener('click', applyExactLength);
  document.getElementById('length-close').addEventListener('click', closeLengthPopover);
  lengthInput.addEventListener('keydown', (e) => {
    if (e.code === 'Enter') {
      e.preventDefault();
      applyExactLength();
    } else if (e.code === 'Escape') {
      e.preventDefault();
      closeLengthPopover();
    }
  });

  // --- Контекстна панель кута (розділ 10, JNT-002) ---
  const jointPopover = document.getElementById('joint-popover');
  const jointAngleInput = document.getElementById('joint-angle-input');

  function updateJointPopover() {
    const pointId = sm.state.selectedPointId;
    if (!pointId) {
      jointPopover.hidden = true;
      return;
    }
    const corner = jointCtrl.getSimpleCorner(pointId);
    if (!corner) {
      // JNT-006: більше двох гілок, або з'єднаний з іншим прогоном — панель кута не показуємо
      jointPopover.hidden = true;
      return;
    }

    const angle = jointCtrl.getAngleDeg(pointId);
    jointAngleInput.value = Math.round(angle);

    const screen = window.FP.geo.toScreen(corner.point.geographicPosition);
    const mapWrap = document.getElementById('map-wrap').getBoundingClientRect();
    let left = screen.x + 16;
    let top = screen.y - 20;
    left = Math.max(8, Math.min(left, mapWrap.width - 180));
    top = Math.max(8, Math.min(top, mapWrap.height - 60));
    jointPopover.style.left = `${left}px`;
    jointPopover.style.top = `${top}px`;
    jointPopover.hidden = false;
  }

  document.getElementById('joint-90').addEventListener('click', () => {
    const pointId = sm.state.selectedPointId;
    if (!pointId) return;
    history.beginAction();
    jointCtrl.setRightAngle(pointId);
    history.commitAction();
    rerender();
  });

  document.getElementById('joint-angle-apply').addEventListener('click', () => {
    const pointId = sm.state.selectedPointId;
    if (!pointId) return;
    const deg = parseInt(jointAngleInput.value, 10);
    if (Number.isNaN(deg) || deg < 1 || deg > 179) return; // JNT-004: 1-179°
    history.beginAction();
    jointCtrl.setAngleDeg(pointId, deg);
    history.commitAction();
    rerender();
  });

  document.getElementById('joint-close').addEventListener('click', () => {
    sm.clearSelection();
    rerender();
  });

  window.__fp_debug = { map, store, sm, history, draw, overlay, selection, snap, jointCtrl };
}

window.addEventListener('DOMContentLoaded', initMap);
