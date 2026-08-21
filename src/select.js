/**
 * select.js
 * Вибір і перетягування геометрії — розділ 8 ТЗ, переміщення прогонів — розділ 12.
 *
 * SEL-001: клік по лінії вибирає прогін і найближчий сегмент.
 * SEL-002: перетягування лінії рухає весь прогін (MOV-001).
 * SEL-003: клік по вільному кінцю вибирає саме кінець, його можна тягнути вільно.
 * SEL-005: не підсвічувати всі вузли одночасно — лише вибраний елемент.
 * PTR-001: клік перетворюється на drag лише після невеликого руху вказівника.
 * PTR-003: коли не тягнемо елемент редактора — панорамування карти працює штатно.
 * HIS-001: один drag від pointerdown до pointerup — один крок історії.
 * 8.1: Delete видаляє вибраний вузол/прогін.
 */

window.FP = window.FP || {};

window.FP.SelectionController = class SelectionController {
  /**
   * @param {InstanceType<typeof window.FP.model.DataStore>} store
   * @param {InstanceType<typeof window.FP.StateMachine>} sm
   * @param {InstanceType<typeof window.FP.History>} history
   * @param {L.Map} map
   * @param {() => void} rerender
   */
  constructor(store, sm, history, map, rerender) {
    this.store = store;
    this.sm = sm;
    this.history = history;
    this.map = map;
    this.rerender = rerender;

    this.DRAG_THRESHOLD_PX = 5; // PTR-001

    /** активна drag-сесія: null | { type: 'point'|'run', id, startScreen, moved, lastGeo } */
    this.session = null;

    this._onWindowPointerMove = this._onWindowPointerMove.bind(this);
    this._onWindowPointerUp = this._onWindowPointerUp.bind(this);
  }

  isActive() {
    return this.sm.state.activeTool === 'select';
  }

  /** Викликається з overlay.js при рендері кожної лінії прогону */
  attachLineHandlers(lineEl, runId) {
    if (!this.isActive()) return;
    lineEl.style.pointerEvents = 'stroke';
    lineEl.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      this._startSession('run', runId, e);
    });
  }

  /** Викликається з overlay.js при рендері кожного вузла */
  attachNodeHandlers(nodeEl, pointId, runId) {
    if (!this.isActive()) return;
    nodeEl.style.pointerEvents = 'all';
    nodeEl.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      this._startSession('point', pointId, e, runId);
    });
  }

  /** Клік по порожній карті знімає вибір (UI-005) */
  handleEmptyMapClick() {
    if (!this.isActive()) return;
    this.sm.clearSelection();
    this.rerender();
  }

  _startSession(type, id, pointerEvent, extraRunId = null) {
    this.map.dragging.disable(); // PTR-003: під час взаємодії з елементом карта не панорамується
    this.session = {
      type,
      id,
      runId: extraRunId,
      startScreen: { x: pointerEvent.clientX, y: pointerEvent.clientY },
      moved: false,
    };
    window.addEventListener('pointermove', this._onWindowPointerMove);
    window.addEventListener('pointerup', this._onWindowPointerUp);
  }

  _onWindowPointerMove(e) {
    if (!this.session) return;
    const dx = e.clientX - this.session.startScreen.x;
    const dy = e.clientY - this.session.startScreen.y;
    const dist = Math.hypot(dx, dy);

    if (!this.session.moved && dist < this.DRAG_THRESHOLD_PX) {
      return; // PTR-001: ще звичайний клік, не drag
    }

    if (!this.session.moved) {
      // Перший кадр справжнього drag — почати транзакцію історії (HIS-001/HIS-002)
      this.history.beginAction();
      this.sm.startDrag({ targetType: this.session.type, targetId: this.session.id });
    }
    this.session.moved = true;

    const mapContainerPoint = this.map.mouseEventToContainerPoint(e);
    const newGeo = window.FP.geo.toGeo({ x: mapContainerPoint.x, y: mapContainerPoint.y });

    if (this.session.type === 'point') {
      this._dragPoint(this.session.id, newGeo);
    } else {
      this._dragRun(this.session.id, newGeo);
    }

    this.rerender();
  }

  _dragPoint(pointId, newGeo) {
    if (!this.session.lastGeo) {
      const point = this.store.points.get(pointId);
      this.session.lastGeo = point.geographicPosition;
    }
    this.store.movePoint(pointId, newGeo);
  }

  _dragRun(runId, newGeo) {
    if (!this.session.lastGeo) this.session.lastGeo = newGeo;
    const deltaLat = newGeo.lat - this.session.lastGeo.lat;
    const deltaLng = newGeo.lng - this.session.lastGeo.lng;
    this.store.moveRun(runId, deltaLat, deltaLng);
    this.session.lastGeo = newGeo;
  }

  _onWindowPointerUp() {
    window.removeEventListener('pointermove', this._onWindowPointerMove);
    window.removeEventListener('pointerup', this._onWindowPointerUp);
    this.map.dragging.enable();

    if (!this.session) return;

    if (this.session.moved) {
      // Реальний drag завершено — зафіксувати крок історії (HIS-001)
      this.history.commitAction();
      this.sm.endDrag();
    } else {
      // Це був звичайний клік без руху — обробити як вибір (SEL-001/SEL-003/SEL-004)
      if (this.session.type === 'point') {
        this.sm.select({ pointId: this.session.id, runId: this.session.runId });
      } else {
        this.sm.select({ runId: this.session.id });
      }
    }

    this.session = null;
    this.rerender();
  }

  /**
   * Delete/Backspace — розділ 8.1.
   * Вибрано прогін -> видалити весь прогін.
   * Вибрано вільний вузол -> видалити точку, сусідні сегменти з'єднуються.
   */
  deleteSelected() {
    const s = this.sm.state;
    if (!s.selectedPointId && !s.selectedRunId) return;

    this.history.beginAction();
    if (s.selectedPointId) {
      this.store.removePoint(s.selectedPointId);
    } else if (s.selectedRunId) {
      this.store.removeRun(s.selectedRunId);
    }
    this.history.commitAction();

    this.sm.clearSelection();
    this.rerender();
  }
};
