/**
 * draw.js
 * Малювання прогону паркану — розділ 6 ТЗ, і живий розмір — розділ 7.
 *
 * DRW-001: розмір з'являється одразу при русі вказівника після першої точки.
 * DRW-002: вільний напрямок, без фіксації до 90°/горизонталі за замовчуванням.
 * DRW-003: округлення кроком проєкту (FP.geo.roundLength).
 * DRW-004: не створювати нульовий сегмент (клік майже в тій самій точці).
 * DRW-005: Finish run не перекриває розмір — кнопка у фіксованому куті (див. index.html).
 *
 * Цей модуль не займається рендером SVG напряму — він лише керує даними
 * і повертає геометрію, яку overlay.js малює. Так простіше тестувати логіку
 * окремо від DOM/Google Maps.
 */

window.FP = window.FP || {};

window.FP.DrawController = class DrawController {
  /**
   * @param {InstanceType<typeof window.FP.model.DataStore>} store
   * @param {InstanceType<typeof window.FP.StateMachine>} sm
   * @param {InstanceType<typeof window.FP.History>} history
   */
  constructor(store, sm, history) {
    this.store = store;
    this.sm = sm;
    this.history = history;

    this.MIN_NEW_POINT_DISTANCE_M = 0.15; // DRW-004: поріг для "майже та сама точка"

    /** живий (ще не підтверджений) кінець сегмента під час руху вказівника */
    this.livePreviewGeo = null;
  }

  isDrafting() {
    return !!this.sm.state.draftRunId;
  }

  /**
   * Клік по карті в режимі малювання.
   * @param {{lat:number,lng:number}} geoPoint
   */
  onMapClick(geoPoint) {
    if (this.sm.state.activeTool !== 'draw') return;

    if (!this.isDrafting()) {
      // 6.1 крок 2: перша точка
      this.history.beginAction();
      const run = this.store.createRun();
      this.store.addPointToRun(run.id, geoPoint);
      this.sm.state.draftRunId = run.id;
      this.history.commitAction();
      return;
    }

    // Є чернетка — перевіряємо DRW-004 перед додаванням нової точки
    const points = this.store.getRunPoints(this.sm.state.draftRunId);
    const lastPoint = points[points.length - 1];
    const distance = window.FP.geo.distanceMeters(lastPoint.geographicPosition, geoPoint);

    if (distance < this.MIN_NEW_POINT_DISTANCE_M) {
      this._showMessage('Занадто близько до попередньої точки — точку не додано');
      return;
    }

    // TODO(наступний крок): тут підключити snap.js -> findSnapTarget(geoPoint)
    // і, якщо ціль — вільний кінець/вузол/сегмент/ворота, обробити SNP-001..005
    // замість простого додавання вільної точки.
    this.history.beginAction();
    this.store.addPointToRun(this.sm.state.draftRunId, geoPoint);
    this.history.commitAction();
  }

  /**
   * Рух вказівника під час малювання — керує живим preview і розміром.
   * DRW-001: показувати одразу, не чекаючи другого сегмента.
   * @param {{lat:number,lng:number}} geoPoint
   */
  onPointerMove(geoPoint) {
    if (this.sm.state.activeTool !== 'draw' || !this.isDrafting()) {
      this.livePreviewGeo = null;
      return null;
    }
    this.livePreviewGeo = geoPoint;

    const points = this.store.getRunPoints(this.sm.state.draftRunId);
    const lastPoint = points[points.length - 1];
    const rawMeters = window.FP.geo.distanceMeters(lastPoint.geographicPosition, geoPoint);
    const lengthMeters = window.FP.geo.roundLength(rawMeters);

    // DIM-001: сторона живого розміру фіксується один раз на активний сегмент
    const run = this.store.runs.get(this.sm.state.draftRunId);
    if (run.dimensionSide === null) {
      run.dimensionSide = this._computePreferredSide(lastPoint.geographicPosition, geoPoint);
    }

    return {
      from: lastPoint.geographicPosition,
      to: geoPoint,
      lengthMeters,
      side: run.dimensionSide,
    };
  }

  /** Проста евристика сторони розміру: права сторона напрямку руху (замінити при потребі) */
  _computePreferredSide(from, to) {
    const dx = to.lng - from.lng;
    return dx >= 0 ? 'right' : 'left';
  }

  /**
   * Finish run / Enter — розділ 6.1 крок 6.
   * Завершує поточний прогін. Порожній однопунктовий прогін видаляється (розділ 6.2).
   */
  finishRun() {
    if (!this.isDrafting()) return;
    const run = this.store.runs.get(this.sm.state.draftRunId);
    if (!run) return;

    this.history.beginAction();
    if (run.pointIds.length < 2) {
      // тільки стартовий вузол без сегмента — видаляємо чернетку (розділ 6.2)
      this.store.removeRun(run.id);
    } else {
      run.dimensionSide = null; // готово до наступного незалежного прогону
    }
    this.history.commitAction();

    this.sm.state.draftRunId = null;
    this.livePreviewGeo = null;
  }

  /**
   * Esc під час малювання — розділ 6.2.
   * Якщо є завершені сегменти — вони зберігаються, зникає лише live preview.
   * Якщо є лише стартовий вузол без сегмента — прогін видаляється.
   */
  cancelDraft() {
    if (!this.isDrafting()) return;
    const run = this.store.runs.get(this.sm.state.draftRunId);
    if (run && run.pointIds.length < 2) {
      this.store.removeRun(run.id);
    }
    this.sm.state.draftRunId = null;
    this.livePreviewGeo = null;
    if (run) run.dimensionSide = null;
  }

  /** New run — примусово почати новий незалежний прогін, завершивши поточний */
  startNewRun() {
    this.finishRun();
  }
};
