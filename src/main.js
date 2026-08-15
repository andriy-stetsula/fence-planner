/**
 * main.js
 * Точка входу. Ініціалізує Google Maps, збирає всі модулі докупи,
 * підключає toolbar і pointer-обробники карти.
 *
 * Google Maps викликає window.initMap() через callback= в URL скрипта (index.html).
 */

function initMap() {
  const map = new google.maps.Map(document.getElementById('map'), {
    center: { lat: 49.593, lng: 23.482 }, // Дрогобич, як приклад стартової точки
    zoom: 19,
    mapTypeId: 'satellite',
    tilt: 0,
    disableDefaultUI: false,
  });

  const store = new window.FP.model.DataStore();
  const editorState = new window.FP.model.EditorState();
  const sm = new window.FP.StateMachine(editorState);
  const history = new window.FP.History(store);
  const draw = new window.FP.DrawController(store, sm, history);

  const svgEl = document.getElementById('editor-svg');
  const overlay = new window.FP.EditorOverlay(map, svgEl, store, sm, draw);

  function rerender() {
    overlay.render();
  }
  sm.onChange(rerender);

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
    rerender();
  });
  document.getElementById('btn-redo').addEventListener('click', () => {
    history.redo();
    rerender();
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
  // panoramування Google Maps лишається штатним, бо ми не викликаємо
  // e.stop() і не блокуємо defaultUI.
  map.addListener('click', (e) => {
    if (sm.state.activeTool !== 'draw') return;
    const geoPoint = { lat: e.latLng.lat(), lng: e.latLng.lng() };
    draw.onMapClick(geoPoint);
    rerender();
    updateFinishButton();
  });

  map.addListener('mousemove', (e) => {
    if (sm.state.activeTool !== 'draw' || !draw.isDrafting()) return;
    draw.livePreviewGeo = { lat: e.latLng.lat(), lng: e.latLng.lng() };
    rerender();
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
        /* TODO: розділ 8.1, наступний крок */
      },
      onDuplicate: () => {
        /* TODO: Duplicate, розділ 5 */
      },
    },
  });

  // Ре-рендер overlay при зумі/панорамуванні виконує сам Google Maps
  // через OverlayView.draw() — додаткова підписка не потрібна.

  window.__fp_debug = { map, store, sm, history, draw, overlay };
}

window.initMap = initMap;
