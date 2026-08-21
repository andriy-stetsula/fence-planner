/**
 * gap.js
 * Fence gap — розділ 15 ТЗ.
 *
 * Розрив — НЕ об'єкт (немає хрестика чи вставки), а реальна порожнеча:
 * вихідний прогін ділиться на два незалежних прогони, між ними немає лінії.
 *
 * GAP-001: перевірка ширини — не можна створити розрив ширший за доступний
 * сегмент з мінімальними залишками по краях.
 */

window.FP = window.FP || {};

window.FP.GapController = class GapController {
  /**
   * @param {InstanceType<typeof window.FP.model.DataStore>} store
   */
  constructor(store) {
    this.store = store;
    this.MIN_MARGIN_M = 0.2; // мінімальний залишок з кожного краю сегмента
  }

  /**
   * @param {string} runId
   * @param {string} pointAId - початок сегмента, що ріжеться
   * @param {string} pointBId - кінець сегмента (наступна точка в pointIds)
   * @param {{lat:number,lng:number}} clickGeo - де саме клікнули на сегменті
   * @param {number} widthMeters - ширина розриву
   * @returns {{success: boolean, message?: string, run1Id?: string, run2Id?: string}}
   */
  createGap(runId, pointAId, pointBId, clickGeo, widthMeters) {
    const run = this.store.runs.get(runId);
    const pointA = this.store.points.get(pointAId);
    const pointB = this.store.points.get(pointBId);
    if (!run || !pointA || !pointB) {
      return { success: false, message: 'Внутрішня помилка: сегмент не знайдено' };
    }

    const idxA = run.pointIds.indexOf(pointAId);
    const idxB = run.pointIds.indexOf(pointBId);
    if (idxB !== idxA + 1) {
      return { success: false, message: 'Невірний сегмент' };
    }

    const origin = pointA.geographicPosition;
    const dirXY = window.FP.geo.toLocalXY(origin, pointB.geographicPosition);
    const segLength = Math.hypot(dirXY.x, dirXY.y);
    if (segLength < 1e-6) return { success: false, message: 'Сегмент занадто короткий' };
    const unit = { x: dirXY.x / segLength, y: dirXY.y / segLength };

    const clickXY = window.FP.geo.toLocalXY(origin, clickGeo);
    const t = clickXY.x * unit.x + clickXY.y * unit.y; // проекція кліку вздовж сегмента, у метрах від A

    const gapStart = t - widthMeters / 2;
    const gapEnd = t + widthMeters / 2;

    // GAP-001: перевірка ширини з мінімальними залишками по краях
    if (gapStart < this.MIN_MARGIN_M || gapEnd > segLength - this.MIN_MARGIN_M) {
      return {
        success: false,
        message: `Розрив ${widthMeters.toFixed(1)} m не вміщується в цей сегмент (${segLength.toFixed(1)} m). Потрібні відступи з країв.`,
      };
    }

    const gapStartGeo = window.FP.geo.fromLocalXY(origin, { x: unit.x * gapStart, y: unit.y * gapStart });
    const gapEndGeo = window.FP.geo.fromLocalXY(origin, { x: unit.x * gapEnd, y: unit.y * gapEnd });

    const { Point } = window.FP.model;

    // run1 (лишається під старим id): точки до A включно + нова кінцева точка на межі розриву
    const newEndPoint = new Point(gapStartGeo, run.id);
    this.store.points.set(newEndPoint.id, newEndPoint);
    const run1PointIds = [...run.pointIds.slice(0, idxA + 1), newEndPoint.id];

    // run2 (новий незалежний прогін): нова стартова точка на іншій межі розриву + решта точок
    const run2 = this.store.createRun();
    const newStartPoint = new Point(gapEndGeo, run2.id);
    this.store.points.set(newStartPoint.id, newStartPoint);
    const tailPointIds = run.pointIds.slice(idxB);
    for (const pid of tailPointIds) {
      const p = this.store.points.get(pid);
      if (p) p.runId = run2.id;
    }
    run2.pointIds = [newStartPoint.id, ...tailPointIds];
    run2.closed = false; // розрив завжди розкриває контур, якщо він був замкнений

    run.pointIds = run1PointIds;
    run.closed = false;

    return { success: true, run1Id: run.id, run2Id: run2.id };
  }
};
