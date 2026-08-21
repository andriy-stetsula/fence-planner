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
  const gapCtrl = new window.FP.GapController(store);
  const gateCtrl = new window.FP.GateController(store, gapCtrl);
  const slidingGateCtrl = new window.FP.SlidingGateController(store, sm, history);
  const postsCtrl = new window.FP.PostsController(store);
  const shapesCtrl = new window.FP.ShapesController(store);
  snap.setShapesController(shapesCtrl); // 17.4: найнижчий тир прилипання

  window.FP.geo.bindMap(map);

  const svgEl = document.getElementById('editor-svg');
  const selection = new window.FP.SelectionController(
    store,
    sm,
    history,
    map,
    () => rerender(),
    snap,
    (pointAId, pointBId) => openLengthPopover(pointAId, pointBId),
    (runId, pointAId, pointBId, clickGeo) => handleGapClick(runId, pointAId, pointBId, clickGeo),
    (runId, pointAId, pointBId, clickGeo) => handleGateLineClick(runId, pointAId, pointBId, clickGeo),
    (runId, pointAId, pointBId, clickGeo) => handlePostLineClick(runId, pointAId, pointBId, clickGeo),
    shapesCtrl
  );
  const overlay = new window.FP.EditorOverlay(map, svgEl, store, sm, draw, selection, slidingGateCtrl, postsCtrl, shapesCtrl);

  function rerender() {
    try {
      overlay.render();
      updateStatusText();
      // UI-005/GEN-003: гарантовано ховаємо всі контекстні панелі перед тим,
      // як кожна з чотирьох функцій нижче вирішить, чи показати себе заново.
      // Друга лінія захисту (перша — select.js тепер оновлює selection після
      // drag): навіть якщо десь лишиться застаріле selectedObjectId, дві
      // панелі одночасно більше показані не будуть.
      jointPopover.hidden = true;
      gatePopover.hidden = true;
      slidingGatePopover.hidden = true;
      shapeResizePopover.hidden = true;
      updateJointPopover();
      updateGatePopover();
      updateSlidingGatePopover();
      updateShapeResizePopover();
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
    if (
      s.selectedObjectId &&
      !store.gates.has(s.selectedObjectId) &&
      !store.posts.has(s.selectedObjectId) &&
      !store.shapes.has(s.selectedObjectId)
    ) {
      s.selectedObjectId = null;
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
    if (sm.state.activeTool === 'slidingGate') {
      // 14.1: перший клік — стійка, другий — напрямок і завершення
      const geoPoint = { lat: e.latlng.lat, lng: e.latlng.lng };
      const widthInput = document.getElementById('sliding-gate-width-input');
      const rawWidth = widthInput.value.trim();
      const widthOverride = rawWidth === '' ? null : parseFloat(rawWidth);
      const result = slidingGateCtrl.onMapClick(geoPoint, widthOverride);
      if (result && result.success) {
        sm.select({ objectId: result.gateId });
      }
      rerender();
      return;
    }
    if (sm.state.activeTool === 'shapes') {
      // 5/17: "Розміщення об'єкта" — наступний клік по карті ставить обраний тип
      const geoPoint = { lat: e.latlng.lat, lng: e.latlng.lng };
      const type = document.getElementById('shape-type-select').value;
      history.beginAction();
      const result = shapesCtrl.placeAt(type, geoPoint);
      if (!result.success) {
        history.cancelAction();
        alert(result.message);
        return;
      }
      history.commitAction();
      sm.select({ objectId: result.shapeId });
      rerender();
      return;
    }
    if (sm.state.activeTool === 'select') {
      // Клік по порожній карті (не по лінії/вузлу — ті самі мають stopPropagation)
      // знімає вибір, UI-005.
      selection.handleEmptyMapClick();
    }
  });

  map.on('mousemove', (e) => {
    if (sm.state.activeTool === 'draw' && draw.isDrafting()) {
      draw.livePreviewGeo = { lat: e.latlng.lat, lng: e.latlng.lng };
      rerender();
      return;
    }
    if (sm.state.activeTool === 'slidingGate' && slidingGateCtrl.isDrafting()) {
      slidingGateCtrl.livePreviewGeo = { lat: e.latlng.lat, lng: e.latlng.lng };
      rerender();
    }
  });

  // Коли активний інструмент "draw", "gap" або "gate*" — тимчасово вимикаємо
  // перетягування карти, щоб клік по карті не одночасно і панорамував,
  // і малював/різав/ставив ворота (PTR-003).
  sm.onChange((state) => {
    if (
      state.activeTool === 'draw' ||
      state.activeTool === 'gap' ||
      state.activeTool === 'gate' ||
      state.activeTool === 'slidingGate' ||
      state.activeTool === 'posts' ||
      state.activeTool === 'shapes'
    ) {
      map.dragging.disable();
    } else {
      map.dragging.enable();
    }
  });

  function handleGapClick(runId, pointAId, pointBId, clickGeo) {
    const widthInput = document.getElementById('gap-width-input');
    const widthMeters = parseFloat(widthInput.value);
    if (Number.isNaN(widthMeters) || widthMeters <= 0) {
      alert('Вкажіть коректну ширину розриву (> 0 м)');
      return;
    }

    history.beginAction();
    const result = gapCtrl.createGap(runId, pointAId, pointBId, clickGeo, widthMeters);
    if (!result.success) {
      history.cancelAction();
      alert(result.message);
      return;
    }
    history.commitAction();
    rerender();
  }

  // 13.1: розміщення розпашних воріт на існуючій лінії
  function handleGateLineClick(runId, pointAId, pointBId, clickGeo) {
    const widthInput = document.getElementById('gate-width-input');
    const widthMeters = parseFloat(widthInput.value);
    if (Number.isNaN(widthMeters) || widthMeters <= 0) {
      alert('Вкажіть коректну ширину воріт (> 0 м)');
      return;
    }

    history.beginAction();
    const result = gateCtrl.placeOnLine(runId, pointAId, pointBId, clickGeo, widthMeters);
    if (!result.success) {
      history.cancelAction();
      alert(result.message);
      return;
    }
    history.commitAction();
    sm.select({ objectId: result.gateId });
    rerender();
  }

  // 16.1/розділ 5: розміщення Additional post на існуючій лінії
  function handlePostLineClick(runId, pointAId, pointBId, clickGeo) {
    history.beginAction();
    const result = postsCtrl.placeOnSegment(runId, pointAId, pointBId, clickGeo);
    if (!result.success) {
      history.cancelAction();
      alert(result.message);
      return;
    }
    history.commitAction();
    sm.select({ objectId: result.postId });
    rerender();
  }

  // PST-003: Show/Hide posts — перемикач видимості лише автоматичних LINE posts
  const togglePostsBtn = document.getElementById('btn-toggle-posts');
  function updateTogglePostsButton() {
    togglePostsBtn.classList.toggle('active', sm.state.showAutoPosts);
  }
  togglePostsBtn.addEventListener('click', () => {
    sm.togglePosts();
    updateTogglePostsButton();
    rerender();
  });
  sm.onChange(updateTogglePostsButton);
  updateTogglePostsButton();

  // --- Keyboard wiring ---
  window.FP.bindKeyboard({
    sm,
    draw,
    history,
    slidingGate: slidingGateCtrl,
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
        sm.togglePosts();
        updateTogglePostsButton();
        rerender();
      },
      toggleJointLock: () => handleToggleLock(),
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

  // --- Контекстна панель стику: замок, 90°, точний кут (розділ 10 JNT-002; 9.3; LOOP-003) ---
  const jointPopover = document.getElementById('joint-popover');
  const jointAngleInput = document.getElementById('joint-angle-input');
  const jointLockBtn = document.getElementById('joint-lock');
  const joint90Btn = document.getElementById('joint-90');
  const jointAngleApplyBtn = document.getElementById('joint-angle-apply');

  /**
   * Панель стику показується у двох випадках:
   * 1. Вибраний вузол з'єднаний (jointId) з іншим прогоном (endpoint-to-endpoint
   *    або T-стик, SNP-004) — лише кнопка замка (9.3), 90°/кут не рахуємо для
   *    міжпрогінного з'єднання.
   * 2. Вибраний "простий" внутрішній кут одного прогону, ВКЛЮЧНО з кутом
   *    замкненого контуру (LOOP-003) — замок відкриває контур, плюс 90°/кут.
   */
  function updateJointPopover() {
    const pointId = sm.state.selectedPointId;
    if (!pointId) {
      jointPopover.hidden = true;
      return;
    }
    const point = store.points.get(pointId);
    if (!point) {
      jointPopover.hidden = true;
      return;
    }
    const run = store.runs.get(point.runId);
    const isCrossJoint = !!point.jointId;
    const isLoopCorner = !!(run && run.closed);
    const corner = jointCtrl.getSimpleCorner(pointId); // null для isCrossJoint (за дизайном)

    if (!isCrossJoint && !corner) {
      // Ні з'єднаний стик, ні внутрішній кут (вільний кінець без зв'язку) — нічого показувати
      jointPopover.hidden = true;
      return;
    }

    jointLockBtn.hidden = false; // показуємо завжди коли панель видима (JNT-002)
    jointLockBtn.textContent = isCrossJoint || isLoopCorner ? '🔒' : '🔓';
    jointLockBtn.disabled = !isCrossJoint && !isLoopCorner; // немає що розривати для звичайного кута

    // JNT-006 дух правила: 90°/точний кут лише для простого 2-гілкового кута,
    // не для міжпрогінного з'єднання (там ще немає reference/moving branch)
    const showAngle = !!corner && !isCrossJoint;
    joint90Btn.hidden = !showAngle;
    jointAngleInput.hidden = !showAngle;
    jointAngleApplyBtn.hidden = !showAngle;

    if (showAngle) {
      const angle = jointCtrl.getAngleDeg(pointId);
      jointAngleInput.value = Math.round(angle);
    }

    const screen = window.FP.geo.toScreen(point.geographicPosition);
    const mapWrap = document.getElementById('map-wrap').getBoundingClientRect();
    let left = screen.x + 16;
    let top = screen.y - 20;
    left = Math.max(8, Math.min(left, mapWrap.width - 180));
    top = Math.max(8, Math.min(top, mapWrap.height - 60));
    jointPopover.style.left = `${left}px`;
    jointPopover.style.top = `${top}px`;
    jointPopover.hidden = false;
  }

  /**
   * Кнопка замка / клавіша L (розділ 20):
   * - вибраний з'єднаний стик (jointId) -> роз'єднати (9.3)
   * - вибраний кут ЗАМКНЕНОГО контуру -> відкрити контур у цьому куті (LOOP-003)
   * В обох випадках стара ціль тимчасово блокується від резнапу (9.3/LOOP-004).
   */
  function handleToggleLock() {
    const pointId = sm.state.selectedPointId;
    if (!pointId) return;
    const point = store.points.get(pointId);
    if (!point) return;
    const run = store.runs.get(point.runId);

    if (point.jointId) {
      history.beginAction();
      snap.unlockJoint(point.jointId);
      history.commitAction();
      rerender();
    } else if (run && run.closed) {
      history.beginAction();
      const result = store.openRunAt(run.id, pointId);
      if (result) snap.blockAfterSeparation([result.firstId, result.lastId]);
      history.commitAction();
      sm.clearSelection();
      rerender();
    }
  }

  jointLockBtn.addEventListener('click', handleToggleLock);

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

  // --- Контекстна панель воріт: стрілки керування (розділ 13.3) ---
  // Без текстових підписів — лише ← → ↑ ↓. ← → міняють сторону петель
  // вздовж лінії (стійка A/B). ↑ ↓ міняють сторону відкриття поперек лінії.
  const gatePopover = document.getElementById('gate-popover');
  const gateArrowButtons = gatePopover.querySelectorAll('button[data-gate-action]');

  function updateGatePopover() {
    const gateId = sm.state.selectedObjectId;
    if (!gateId) {
      gatePopover.hidden = true;
      return;
    }
    const gate = store.gates.get(gateId);
    if (!gate || gate.type !== 'swing') {
      gatePopover.hidden = true;
      return;
    }

    gateArrowButtons.forEach((btn) => {
      const action = btn.dataset.gateAction;
      const isActive =
        (action === 'hinge-a' && gate.hingeSide === 'A') ||
        (action === 'hinge-b' && gate.hingeSide === 'B') ||
        (action === 'swing-left' && gate.swingSide === 'left') ||
        (action === 'swing-right' && gate.swingSide === 'right');
      btn.classList.toggle('active', isActive);
    });

    const a = window.FP.geo.toScreen(gate.postAGeo);
    const b = window.FP.geo.toScreen(gate.postBGeo);
    const mapWrap = document.getElementById('map-wrap').getBoundingClientRect();
    let left = (a.x + b.x) / 2;
    let top = Math.min(a.y, b.y) - 56;
    left = Math.max(8, Math.min(left, mapWrap.width - 140));
    top = Math.max(8, top);
    gatePopover.style.left = `${left}px`;
    gatePopover.style.top = `${top}px`;
    gatePopover.hidden = false;
  }

  gateArrowButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const gateId = sm.state.selectedObjectId;
      if (!gateId) return;
      const action = btn.dataset.gateAction;
      history.beginAction();
      if (action === 'hinge-a') gateCtrl.setHingeSide(gateId, 'A');
      if (action === 'hinge-b') gateCtrl.setHingeSide(gateId, 'B');
      if (action === 'swing-left') gateCtrl.setSwingSide(gateId, 'left');
      if (action === 'swing-right') gateCtrl.setSwingSide(gateId, 'right');
      history.commitAction();
      rerender();
    });
  });

  // --- Контекстна панель розсувних воріт: напрямок відкату (SLD-002) ---
  const slidingGatePopover = document.getElementById('sliding-gate-popover');
  const slidingGateButtons = slidingGatePopover.querySelectorAll('button[data-slide-action]');

  function updateSlidingGatePopover() {
    const gateId = sm.state.selectedObjectId;
    if (!gateId) {
      slidingGatePopover.hidden = true;
      return;
    }
    const gate = store.gates.get(gateId);
    if (!gate || gate.type !== 'sliding') {
      slidingGatePopover.hidden = true;
      return;
    }

    slidingGateButtons.forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.slideAction === gate.slideDirection);
    });

    const a = window.FP.geo.toScreen(gate.postAGeo);
    const b = window.FP.geo.toScreen(gate.postBGeo);
    const mapWrap = document.getElementById('map-wrap').getBoundingClientRect();
    let left = (a.x + b.x) / 2;
    let top = Math.min(a.y, b.y) - 56;
    left = Math.max(8, Math.min(left, mapWrap.width - 100));
    top = Math.max(8, top);
    slidingGatePopover.style.left = `${left}px`;
    slidingGatePopover.style.top = `${top}px`;
    slidingGatePopover.hidden = false;
  }

  slidingGateButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const gateId = sm.state.selectedObjectId;
      if (!gateId) return;
      history.beginAction();
      slidingGateCtrl.setSlideDirection(gateId, btn.dataset.slideAction);
      history.commitAction();
      rerender();
    });
  });

  // --- Контекстна панель ресайзу об'єкта ділянки: house/pool (розділ 17.1/OBJ-003) ---
  const shapeResizePopover = document.getElementById('shape-resize-popover');
  const shapeWidthInput = document.getElementById('shape-width-input');
  const shapeHeightInput = document.getElementById('shape-height-input');

  function updateShapeResizePopover() {
    const shapeId = sm.state.selectedObjectId;
    if (!shapeId) {
      shapeResizePopover.hidden = true;
      return;
    }
    const shape = store.shapes.get(shapeId);
    const cfg = shape ? shapesCtrl.getTypeConfig(shape.type) : null;
    if (!shape || !cfg || !cfg.resizable) {
      shapeResizePopover.hidden = true;
      return;
    }

    // Захист: якщо widthM/heightM з якоїсь причини відсутні — беремо дефолт типу,
    // а не показуємо порожнє поле (розділ 22: дані завжди мають бути коректні).
    shapeWidthInput.value = (shape.widthM || cfg.widthM).toFixed(1);
    shapeHeightInput.value = (shape.heightM || cfg.heightM).toFixed(1);

    const geo = shapesCtrl.getGeo(shape);
    const screen = window.FP.geo.toScreen(geo);
    const mapWrap = document.getElementById('map-wrap').getBoundingClientRect();
    let left = screen.x + 16;
    let top = screen.y - 20;
    left = Math.max(8, Math.min(left, mapWrap.width - 180));
    top = Math.max(8, Math.min(top, mapWrap.height - 60));
    shapeResizePopover.style.left = `${left}px`;
    shapeResizePopover.style.top = `${top}px`;
    shapeResizePopover.hidden = false;
  }

  function applyShapeResize() {
    const shapeId = sm.state.selectedObjectId;
    if (!shapeId) return;
    const widthM = parseFloat(shapeWidthInput.value);
    const heightM = parseFloat(shapeHeightInput.value);
    if (Number.isNaN(widthM) || widthM <= 0 || Number.isNaN(heightM) || heightM <= 0) return;

    history.beginAction();
    shapesCtrl.resize(shapeId, widthM, heightM);
    history.commitAction();
    rerender();
  }

  document.getElementById('shape-resize-apply').addEventListener('click', applyShapeResize);
  document.getElementById('shape-resize-close').addEventListener('click', () => {
    sm.clearSelection();
    rerender();
  });

  window.__fp_debug = { map, store, sm, history, draw, overlay, selection, snap, jointCtrl, gapCtrl, gateCtrl, slidingGateCtrl, postsCtrl, shapesCtrl };
}

window.addEventListener('DOMContentLoaded', initMap);
