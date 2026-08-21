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

  window.FP.geo.bindMap(map);

  const svgEl = document.getElementById('editor-svg');
  const selection = new window.FP.SelectionController(store, sm, history, map, () => rerender());
  const overlay = new window.FP.EditorOverlay(map, svgEl, store, sm, draw, selection);

  function rerender() {
    try {
      overlay.render();
      updateStatusText();
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
        document.getElementById('length-popover').hidden = true;
      },
      togglePosts: () => {
        /* TODO: PST-003, наступний крок */
      },
      toggleJointLock: () => {
        /* TODO: розділ 9.3, наступний крок */
      },
      onDelete: () => {
        selection.deleteSelected();
      },
      onDuplicate: () => {
        /* TODO: Duplicate, розділ 5 */
      },
    },
  });

  window.__fp_debug = { map, store, sm, history, draw, overlay };
}

window.addEventListener('DOMContentLoaded', initMap);
