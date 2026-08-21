/**
 * slidingGate.js
 * Розсувні ворота — розділ 14 ТЗ.
 *
 * 14.1: малювання по двох точках. Перший клік — стартова стійка, одразу
 * починається live preview з живим розміром (як у draw.js). Другий клік
 * задає напрямок і завершує ворота.
 *
 * SLD-001: без діапазонів — одне точне значення ширини.
 * Якщо поле точної ширини порожнє — використовується фактична відстань між
 * кліками. Якщо введено значення — використовується воно, а другий клік
 * задає лише напрямок (постB кладеться на промені до кліку, на відстані
 * widthOverride).
 * SLD-004: Esc до другого кліка скасовує чернетку і видаляє тимчасову
 * першу стійку.
 *
 * Цей контролер не займається рендером — лише даними, так само як draw.js.
 */

window.FP = window.FP || {};

window.FP.SlidingGateController = class SlidingGateController {
  /**
   * @param {InstanceType<typeof window.FP.model.DataStore>} store
   * @param {InstanceType<typeof window.FP.StateMachine>} sm
   * @param {InstanceType<typeof window.FP.History>} history
   */
  constructor(store, sm, history) {
    this.store = store;
    this.sm = sm;
    this.history = history;

    /** перша стійка поточної незавершеної чернетки, null якщо не малюємо */
    this.draftFirstGeo = null;
    /** живий кінець під курсором під час малювання */
    this.livePreviewGeo = null;
  }

  isDrafting() {
    return !!this.draftFirstGeo;
  }

  /**
   * Клік по карті в режимі Sliding gates.
   * @param {{lat:number,lng:number}} geoPoint
   * @param {number|null} widthOverride - точна ширина з поля, якщо задана
   * @returns {{success: boolean, gateId?: string} | null} null, якщо це був лише перший клік
   */
  onMapClick(geoPoint, widthOverride) {
    if (this.sm.state.activeTool !== 'slidingGate') return null;

    if (!this.isDrafting()) {
      // 14.1 крок 2: перша стійка
      this.draftFirstGeo = geoPoint;
      this.livePreviewGeo = geoPoint;
      return null;
    }

    // 14.1 крок 3: друга стійка — завершує ворота
    const postAGeo = this.draftFirstGeo;
    let postBGeo;
    let widthM;

    if (widthOverride && widthOverride > 0) {
      // 14.1 крок 4: значення введено — другий клік задає лише напрямок
      widthM = widthOverride;
      postBGeo = window.FP.geo.pointAtDistanceAlongDirection(postAGeo, geoPoint, widthM);
    } else {
      widthM = window.FP.geo.roundLength(window.FP.geo.distanceMeters(postAGeo, geoPoint));
      postBGeo = geoPoint;
    }

    this.history.beginAction();
    const gate = this.store.createGate({
      type: 'sliding',
      postAGeo,
      postBGeo,
      widthM,
    });
    this.history.commitAction();

    this.draftFirstGeo = null;
    this.livePreviewGeo = null;

    return { success: true, gateId: gate.id };
  }

  /** Рух вказівника під час малювання — керує живим preview (аналог draw.js) */
  onPointerMove(geoPoint) {
    if (this.sm.state.activeTool !== 'slidingGate' || !this.isDrafting()) {
      return null;
    }
    this.livePreviewGeo = geoPoint;
    const lengthMeters = window.FP.geo.roundLength(
      window.FP.geo.distanceMeters(this.draftFirstGeo, geoPoint)
    );
    return { from: this.draftFirstGeo, to: geoPoint, lengthMeters };
  }

  /** SLD-004: Esc до другого кліка скасовує чернетку */
  cancelDraft() {
    this.draftFirstGeo = null;
    this.livePreviewGeo = null;
  }

  /** 14.1/SLD-002: дві стрілки по осі воріт — куди йде полотно у відкритому положенні */
  setSlideDirection(gateId, direction) {
    const gate = this.store.gates.get(gateId);
    if (!gate || gate.type !== 'sliding' || (direction !== 'left' && direction !== 'right')) return false;
    gate.slideDirection = direction;
    return true;
  }
};
