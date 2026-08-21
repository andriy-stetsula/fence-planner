/**
 * joint.js
 * Кути, 90° і точний градус — розділ 10 ТЗ.
 *
 * MVP-версія працює з "простим стиком" — внутрішньою точкою прогону
 * (не на самому початку і не в самому кінці pointIds), де сходяться
 * рівно два сегменти: P->prev (опорна гілка, referenceBranch) і
 * P->next (гілка, що рухається, movingBranch).
 *
 * JNT-001: стик можна рухати — обробляється окремо через SelectionController
 * (перетягування вузла), цей модуль лише про кут.
 * JNT-003/004: 90° і точний градус (1-179°) обертають рухому гілку навколо
 * стику, зберігаючи довжину сегмента і координату самого стику.
 * JNT-005: опорна гілка стабільна — завжди P->prev, рухається P->next.
 * JNT-006: якщо в точці сходиться більше двох сегментів (тобто вона є
 * внутрішньою точкою АБО з'єднана Joint-ом з третім прогоном) — кут
 * неоднозначний, ця операція недоступна.
 */

window.FP = window.FP || {};

window.FP.JointController = class JointController {
  /**
   * @param {InstanceType<typeof window.FP.model.DataStore>} store
   */
  constructor(store) {
    this.store = store;
  }

  /**
   * Перевіряє, чи точка є "простим стиком" (рівно два сегменти,
   * жодного додаткового Joint-зв'язку з третім прогоном).
   * Для замкненого контуру (розділ 11) кожна точка має двох сусідів по
   * колу (prev/next з переходом через 0/n-1) — LOOP-003 показує те саме
   * меню стику для кута закритого контуру.
   * @returns {{run: object, index: number, prevPoint: object, nextPoint: object} | null}
   */
  getSimpleCorner(pointId) {
    const point = this.store.points.get(pointId);
    if (!point) return null;
    if (point.jointId) return null; // JNT-006 дух правила: з'єднаний стик з іншим прогоном — окремий випадок

    const run = this.store.runs.get(point.runId);
    if (!run) return null;
    const idx = run.pointIds.indexOf(pointId);
    if (idx === -1) return null;

    if (run.closed) {
      const n = run.pointIds.length;
      if (n < 3) return null;
      const prevPoint = this.store.points.get(run.pointIds[(idx - 1 + n) % n]);
      const nextPoint = this.store.points.get(run.pointIds[(idx + 1) % n]);
      return { run, index: idx, prevPoint, nextPoint, point };
    }

    if (idx <= 0 || idx >= run.pointIds.length - 1) return null; // не внутрішня точка
    const prevPoint = this.store.points.get(run.pointIds[idx - 1]);
    const nextPoint = this.store.points.get(run.pointIds[idx + 1]);
    return { run, index: idx, prevPoint, nextPoint, point };
  }

  /** Поточний кут у градусах (0-180) між P->prev і P->next */
  getAngleDeg(pointId) {
    const corner = this.getSimpleCorner(pointId);
    if (!corner) return null;
    return this._angleBetween(corner.point, corner.prevPoint, corner.nextPoint);
  }

  _angleBetween(vertexPoint, aPoint, bPoint) {
    const origin = vertexPoint.geographicPosition;
    const a = window.FP.geo.toLocalXY(origin, aPoint.geographicPosition);
    const b = window.FP.geo.toLocalXY(origin, bPoint.geographicPosition);
    const angA = Math.atan2(a.y, a.x);
    const angB = Math.atan2(b.y, b.x);
    let diff = Math.abs(angA - angB) * (180 / Math.PI);
    if (diff > 180) diff = 360 - diff;
    return diff;
  }

  /**
   * Встановити точний кут (1-179°) між referenceBranch (P->prev) і
   * movingBranch (P->next), обертаючи next навколо P (JNT-004/JNT-005).
   */
  setAngleDeg(pointId, desiredDeg) {
    const corner = this.getSimpleCorner(pointId);
    if (!corner) return false;
    const clamped = Math.max(1, Math.min(179, desiredDeg));

    const origin = corner.point.geographicPosition;
    const refXY = window.FP.geo.toLocalXY(origin, corner.prevPoint.geographicPosition);
    const movXY = window.FP.geo.toLocalXY(origin, corner.nextPoint.geographicPosition);

    const refAngle = Math.atan2(refXY.y, refXY.x);
    const movingDist = Math.hypot(movXY.x, movXY.y);

    // Зберігаємо той самий бік (за чи проти годинникової), в який зараз повернута movingBranch
    const currentDiff = Math.atan2(movXY.y, movXY.x) - refAngle;
    const sign = Math.sin(currentDiff) >= 0 ? 1 : -1;

    const newAngleRad = refAngle + sign * (clamped * Math.PI) / 180;
    const newXY = {
      x: Math.cos(newAngleRad) * movingDist,
      y: Math.sin(newAngleRad) * movingDist,
    };
    const newGeo = window.FP.geo.fromLocalXY(origin, newXY);
    this.store.movePoint(corner.nextPoint.id, newGeo);
    return true;
  }

  /** Кнопка 90° (JNT-003) */
  setRightAngle(pointId) {
    return this.setAngleDeg(pointId, 90);
  }
};
