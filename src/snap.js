/**
 * snap.js
 * Прилипання і з'єднання прогонів — розділ 9 ТЗ, плюс замкнені контури —
 * розділ 11 (логічно про те саме: куди прилипає вільний кінець).
 *
 * Реалізовані цілі (9.1), у стабільному порядку пріоритету (SNP-002,
 * розділ 22 "Дві цілі однаково близько"):
 *   0. протилежний вільний кінець ТОГО САМОГО прогону -> замкнений контур (11)
 *   1. вільний кінець ІНШОГО прогону -> endpoint-to-endpoint joint
 *   2. існуючий (внутрішній) вузол іншого прогону -> joint без нової точки
 *   3. точка всередині сегмента іншого прогону -> T-стик (SNP-004),
 *      створює реальну точку в цільовому прогоні
 * Тіри 0/1 мають однаковий пріоритет "кінця" і порівнюються за відстанню
 * між собою; тіри 2 і 3 розглядаються лише якщо жоден "кінець" не в радіусі.
 *
 * SNP-001: показувати лише найближчу ціль.
 * SNP-003: реальний зв'язок створюється на pointerup, поки малюємо/тягнемо — лише preview.
 * SNP-005: не приєднувати кінець до довільної середини того самого прогону —
 * дозволено лише замикання з протилежним кінцем (>= 3 точки).
 * 9.4: гістерезис — attachRadius (щоб прилипнути) і detachRadius (щоб відірватись).
 * 9.3/LOOP-004: після роз'єднання (замка або відкриття контуру) перший рух
 * не повинен миттєво защіпнути назад — стара ціль тимчасово заблокована,
 * поки кінець не відведений помітно далі detachRadius або поки drag не завершиться.
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

    // 9.3/LOOP-004: тимчасово заблоковані цілі після роз'єднання/відкриття.
    // targetPointId -> geo позиція в момент блокування (щоб виміряти "помітно відведено")
    this._blockedOrigins = new Map();
  }

  /**
   * Знайти найкращу ціль прилипання для вільного кінця, який зараз тягнуть.
   * Єдина точка входу для select.js/draw.js — приховує внутрішню
   * пріоритетну логіку тирів (SNP-001/SNP-002).
   * @returns {{kind:'loop'|'endpoint'|'node', pointId:string, runId:string, distPx:number}
   *          | {kind:'segment', runId:string, pointAId:string, pointBId:string, geo:object, distPx:number}
   *          | null}
   */
  findSnapTarget(draggedPointId, currentGeo) {
    const loop = this._findLoopCloseTarget(draggedPointId, currentGeo);
    const endpoint = this._findFreeEndTarget(draggedPointId, currentGeo);

    let best = null;
    if (loop) best = loop;
    if (endpoint && (!best || endpoint.distPx < best.distPx)) best = endpoint;
    if (best) return best;

    const node = this._findExistingNodeTarget(draggedPointId, currentGeo);
    if (node) return node;

    return this._findSegmentSnapTarget(draggedPointId, currentGeo);
  }

  /** Розділ 11: протилежний вільний кінець того самого прогону (замикання) */
  _findLoopCloseTarget(draggedPointId, currentGeo) {
    const point = this.store.points.get(draggedPointId);
    if (!point || point.jointId) return null;
    const run = this.store.runs.get(point.runId);
    if (!run || run.closed) return null;
    if (run.pointIds.length < 3) return null; // SNP-005: мінімум три точки

    const idx = run.pointIds.indexOf(draggedPointId);
    if (idx !== 0 && idx !== run.pointIds.length - 1) return null; // лише вільний кінець

    const oppositeId = idx === 0 ? run.pointIds[run.pointIds.length - 1] : run.pointIds[0];
    if (this._isBlocked(oppositeId, currentGeo)) return null;
    const oppositePoint = this.store.points.get(oppositeId);
    if (!oppositePoint) return null;

    const distPx = window.FP.geo.distanceScreenPx(currentGeo, oppositePoint.geographicPosition);
    if (distPx > this.ATTACH_RADIUS_PX) return null;
    return { kind: 'loop', runId: run.id, pointId: oppositeId, distPx };
  }

  /** Вільний кінець ІНШОГО прогону (endpoint-to-endpoint) */
  _findFreeEndTarget(draggedPointId, currentGeo) {
    const draggedPoint = this.store.points.get(draggedPointId);
    if (!draggedPoint) return null;
    let best = null;
    for (const [pid, point] of this.store.points) {
      if (pid === draggedPointId) continue;
      if (point.runId === draggedPoint.runId) continue; // той самий прогін — окремий тир (loop)
      if (point.jointId) continue;
      if (!this._isFreeEnd(point)) continue;
      if (this._isBlocked(pid, currentGeo)) continue;

      const distPx = window.FP.geo.distanceScreenPx(currentGeo, point.geographicPosition);
      if (distPx <= this.ATTACH_RADIUS_PX && (!best || distPx < best.distPx)) {
        best = { kind: 'endpoint', pointId: pid, runId: point.runId, distPx };
      }
    }
    return best;
  }

  /** Існуючий внутрішній вузол (кут) іншого прогону — без створення нової точки */
  _findExistingNodeTarget(draggedPointId, currentGeo) {
    const draggedPoint = this.store.points.get(draggedPointId);
    if (!draggedPoint) return null;
    let best = null;
    for (const [pid, point] of this.store.points) {
      if (pid === draggedPointId) continue;
      if (point.runId === draggedPoint.runId) continue;
      if (point.jointId) continue;
      if (this._isFreeEnd(point)) continue; // вільні кінці вже враховані в іншому тирі
      if (this._isBlocked(pid, currentGeo)) continue;

      const distPx = window.FP.geo.distanceScreenPx(currentGeo, point.geographicPosition);
      if (distPx <= this.ATTACH_RADIUS_PX && (!best || distPx < best.distPx)) {
        best = { kind: 'node', pointId: pid, runId: point.runId, distPx };
      }
    }
    return best;
  }

  /**
   * SNP-004: точка всередині сегмента іншого прогону -> T-стик.
   * Проекція рахується в екранних пікселях (GEN-008), кінці сегмента
   * виключені невеликим запасом — там уже спрацював би тир endpoint/node.
   */
  _findSegmentSnapTarget(draggedPointId, currentGeo) {
    const draggedPoint = this.store.points.get(draggedPointId);
    if (!draggedPoint) return null;
    let best = null;

    for (const run of this.store.runs.values()) {
      if (run.id === draggedPoint.runId) continue; // SNP-005: тільки інший прогін
      const points = this.store.getRunPoints(run.id);
      const segCount = run.closed ? points.length : points.length - 1;

      for (let i = 0; i < segCount; i += 1) {
        const a = points[i];
        const b = points[(i + 1) % points.length];
        if (!a || !b) continue;
        if (this._isBlocked(a.id, currentGeo) || this._isBlocked(b.id, currentGeo)) continue;

        const proj = this._projectOntoSegmentPx(currentGeo, a.geographicPosition, b.geographicPosition);
        if (!proj) continue;
        if (proj.distPx <= this.ATTACH_RADIUS_PX && (!best || proj.distPx < best.distPx)) {
          best = {
            kind: 'segment',
            runId: run.id,
            pointAId: a.id,
            pointBId: b.id,
            geo: proj.geo,
            distPx: proj.distPx,
          };
        }
      }
    }
    return best;
  }

  /** Проекція точки на відрізок у екранних пікселях; null, якщо проекція поза відрізком */
  _projectOntoSegmentPx(currentGeo, aGeo, bGeo) {
    const aScreen = window.FP.geo.toScreen(aGeo);
    const bScreen = window.FP.geo.toScreen(bGeo);
    const cScreen = window.FP.geo.toScreen(currentGeo);

    const abx = bScreen.x - aScreen.x;
    const aby = bScreen.y - aScreen.y;
    const lenSq = abx * abx + aby * aby;
    if (lenSq < 1e-6) return null;

    let t = ((cScreen.x - aScreen.x) * abx + (cScreen.y - aScreen.y) * aby) / lenSq;
    const EDGE_MARGIN = 0.02; // виключаємо самі кінці сегмента (там пріоритет endpoint/node)
    if (t < EDGE_MARGIN || t > 1 - EDGE_MARGIN) return null;

    const projScreen = { x: aScreen.x + abx * t, y: aScreen.y + aby * t };
    const distPx = Math.hypot(cScreen.x - projScreen.x, cScreen.y - projScreen.y);
    const geo = {
      lat: aGeo.lat + (bGeo.lat - aGeo.lat) * t,
      lng: aGeo.lng + (bGeo.lng - aGeo.lng) * t,
    };
    return { t, distPx, geo };
  }

  /** Вільний кінець = перша або остання точка в pointIds свого прогону, без jointId */
  _isFreeEnd(point) {
    const run = this.store.runs.get(point.runId);
    if (!run || run.closed) return false;
    const idx = run.pointIds.indexOf(point.id);
    return idx === 0 || idx === run.pointIds.length - 1;
  }

  /**
   * Створити реальний зв'язок (SNP-003, на pointerup) з існуючою точкою
   * (вільний кінець або внутрішній вузол іншого прогону).
   * Обидві точки лишаються окремими об'єктами на тій самій координаті,
   * але отримують спільний jointId — це і є "з'єднаний стик".
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
   * SNP-004: приєднання до середини сегмента — додає в цільовий прогін
   * реальну точку в місці проекції (не просто візуальне вирівнювання),
   * і з'єднує її з вільним кінцем-джерелом звичайним joint-ом.
   * @param {string} draggedPointId
   * @param {{runId:string, pointAId:string, geo:object}} target - результат _findSegmentSnapTarget
   */
  createTJoint(draggedPointId, target) {
    const run = this.store.runs.get(target.runId);
    if (!run) return null;
    const idxA = run.pointIds.indexOf(target.pointAId);
    if (idxA === -1) return null;

    const newPoint = new window.FP.model.Point({ ...target.geo }, run.id);
    this.store.points.set(newPoint.id, newPoint);
    run.pointIds.splice(idxA + 1, 0, newPoint.id);

    return this.createJoint(draggedPointId, newPoint.id);
  }

  /** Розділ 11: замкнути прогін (draggedPointId — кінець, що зараз тягнули) */
  closeLoop(draggedPointId, runId) {
    return this.store.closeRun(runId, draggedPointId);
  }

  /**
   * Роз'єднати стик (розділ 9.3 — кнопка замка в контекстній панелі).
   * Координати лишаються, зв'язок знімається.
   */
  unlockJoint(jointId) {
    const joint = this.store.joints.get(jointId);
    if (!joint) return;
    const memberIds = [...joint.memberPointIds];
    for (const pid of memberIds) {
      const p = this.store.points.get(pid);
      if (p) {
        p.jointId = null;
        p.linkedRunId = null;
        p.linkedPointId = null;
      }
    }
    this.store.joints.delete(jointId);
    this.blockAfterSeparation(memberIds); // 9.3: не защіпати назад одразу
  }

  /**
   * 9.3/LOOP-004: після роз'єднання joint-а або відкриття контуру —
   * тимчасово заблокувати перелічені точки як цілі прилипання, поки
   * драговану точку не відведуть помітно далі DETACH_RADIUS_PX, або поки
   * поточна drag-сесія не завершиться (select.js викликає clearBlock()
   * на pointerup).
   */
  blockAfterSeparation(pointIds) {
    for (const pid of pointIds) {
      const p = this.store.points.get(pid);
      if (p) this._blockedOrigins.set(pid, { ...p.geographicPosition });
    }
  }

  /** Викликається select.js в кінці кожної drag-сесії — "або поки drag не завершиться" */
  clearBlock() {
    this._blockedOrigins.clear();
  }

  _isBlocked(targetPointId, draggedCurrentGeo) {
    const originGeo = this._blockedOrigins.get(targetPointId);
    if (!originGeo) return false;
    const distPx = window.FP.geo.distanceScreenPx(draggedCurrentGeo, originGeo);
    if (distPx > this.DETACH_RADIUS_PX) {
      // помітно відведено — знімаємо блок для цієї цілі, можна резнапнутись знову
      this._blockedOrigins.delete(targetPointId);
      return false;
    }
    return true;
  }
};
