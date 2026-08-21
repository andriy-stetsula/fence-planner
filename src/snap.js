/**
 * snap.js
 * Прилипання і з'єднання прогонів — розділ 9 ТЗ.
 *
 * Ця перша версія реалізує найважливіший випадок: endpoint-to-endpoint
 * (вільний кінець одного прогону з'єднується з вільним кінцем іншого).
 * T-стик (endpoint-to-segment) і snap до воріт/об'єктів — наступні кроки.
 *
 * SNP-001: показувати лише найближчу ціль.
 * SNP-003: реальний зв'язок створюється на pointerup, поки малюємо/тягнемо — лише preview.
 * 9.4: гістерезис — attachRadius (щоб прилипнути) і detachRadius (щоб відірватись),
 * detachRadius помітно більший, щоб об'єкт не тремтів на межі.
 */

window.FP = window.FP || {};

window.FP.SnapController = class SnapController {
  /**
   * @param {InstanceType<typeof window.FP.model.DataStore>} store
   */
  constructor(store) {
    this.store = store;
    this.ATTACH_RADIUS_PX = 14;
    this.DETACH_RADIUS_PX = 34; // 9.4: помітно більший за attach (тут ~2.4x)
  }

  /**
   * Знайти найближчий вільний кінець ІНШОГО прогону в радіусі прилипання.
   * @param {string} draggedPointId - точка, яку зараз тягнемо (щоб не пропонувати саму себе)
   * @param {{lat:number,lng:number}} currentGeo - поточна geo-позиція під курсором
   * @returns {{pointId: string, runId: string} | null}
   */
  findEndpointSnapTarget(draggedPointId, currentGeo) {
    let best = null;
    let bestDist = Infinity;

    for (const [pid, point] of this.store.points) {
      if (pid === draggedPointId) continue;
      if (point.jointId) continue; // вже з'єднаний — не пропонуємо повторно (SNP-005 дух правила)
      if (!this._isFreeEnd(point)) continue;

      const distPx = window.FP.geo.distanceScreenPx(currentGeo, point.geographicPosition);
      if (distPx <= this.ATTACH_RADIUS_PX && distPx < bestDist) {
        bestDist = distPx;
        best = { pointId: pid, runId: point.runId };
      }
    }
    return best;
  }

  /** Вільний кінець = перша або остання точка в pointIds свого прогону, без jointId */
  _isFreeEnd(point) {
    const run = this.store.runs.get(point.runId);
    if (!run || run.closed) return false;
    const idx = run.pointIds.indexOf(point.id);
    return idx === 0 || idx === run.pointIds.length - 1;
  }

  /**
   * Створити реальний зв'язок (SNP-003, на pointerup).
   * Обидві точки лишаються окремими об'єктами (Point A і Point B на тій самій
   * координаті), але отримують спільний jointId — це і є "з'єднаний стик".
   * Просте MVP-рішення: сумісні з JNT-001 (можна рухати) реалізації підуть пізніше.
   */
  createJoint(pointIdA, pointIdB) {
    const pointA = this.store.points.get(pointIdA);
    const pointB = this.store.points.get(pointIdB);
    if (!pointA || !pointB) return null;

    // Вирівнюємо координати — A "прилипає" до B (простіше і передбачувано для MVP)
    pointA.geographicPosition = { ...pointB.geographicPosition };

    const joint = new window.FP.model.Joint([pointIdA, pointIdB]);
    this.store.joints.set(joint.jointId, joint);
    pointA.jointId = joint.jointId;
    pointB.jointId = joint.jointId;
    pointA.linkedRunId = pointB.runId;
    pointA.linkedPointId = pointB.id;
    pointB.linkedRunId = pointA.runId;
    pointB.linkedPointId = pointA.id;
    return joint;
  }

  /**
   * Роз'єднати стик (розділ 9.3 — кнопка замка в контекстній панелі).
   * Координати лишаються, зв'язок знімається.
   */
  unlockJoint(jointId) {
    const joint = this.store.joints.get(jointId);
    if (!joint) return;
    for (const pid of joint.memberPointIds) {
      const p = this.store.points.get(pid);
      if (p) {
        p.jointId = null;
        p.linkedRunId = null;
        p.linkedPointId = null;
      }
    }
    this.store.joints.delete(jointId);
  }
};
