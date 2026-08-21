/**
 * posts.js
 * Стовпи та кріплення — розділ 16 ТЗ.
 *
 * END post і CORNER post (16.1) — це вже існуючі Point (вільний кінець і
 * внутрішній/з'єднаний вузол відповідно); окремої сутності для них не
 * заводимо, вони й так рендеряться і перетягуються як node (SEL-003/SEL-004,
 * AT-17: "END/CORNER залишаються вузлами").
 * Gate posts (16.1) — вже рендеряться в overlay.js як частина Gate.
 *
 * LINE post (PST-001) — автоматична проміжна точка вздовж сегмента.
 * НЕ зберігається в моделі: рахується наживо з довжини сегмента й модуля
 * (config.moduleMeters), щоб гарантовано не стати handle і не "їздити"
 * окремо від лінії. Крок модуля — налаштування проєкту (розділ 24:
 * "Комерційний panel module... значення повинно приходити з конфігурації"),
 * а не хардкод.
 *
 * Additional post (16.1, розділ 5) — окремий об'єкт (model.Post), який
 * користувач ставить вручну на лінію. Прив'язка зберігається як анкер
 * (anchorPointAId/anchorPointBId + t), щоб стовп слідував за прогоном при
 * його переміщенні (MOV-003) — так само, як мали б поводитися конверт/арбор.
 */

window.FP = window.FP || {};

window.FP.PostsController = class PostsController {
  /** @param {InstanceType<typeof window.FP.model.DataStore>} store */
  constructor(store) {
    this.store = store;
    // DRW-003 дух правила: крок — налаштування, а не розкиданий по коду хардкод.
    this.config = {
      moduleMeters: 2.4, // розділ 24: "У макеті 2,4 m", підлягає конфігурації продукту
      edgeMarginMeters: 0.3, // не ставити LINE post впритул до END/CORNER
    };
  }

  /**
   * PST-001: перерахувати позиції автоматичних LINE posts для прогону
   * наживо з поточної геометрії. Нічого не зберігає й не мутує.
   * @param {object} run
   * @param {object[]} points - store.getRunPoints(run.id), впорядковано
   * @returns {{lat:number,lng:number}[]}
   */
  computeLinePosts(run, points) {
    const positions = [];
    const { moduleMeters, edgeMarginMeters } = this.config;
    if (moduleMeters <= 0) return positions;

    for (let i = 0; i < points.length - 1; i += 1) {
      const a = points[i].geographicPosition;
      const b = points[i + 1].geographicPosition;
      const segLen = window.FP.geo.distanceMeters(a, b);
      if (segLen <= edgeMarginMeters * 2) continue;

      const dirXY = window.FP.geo.toLocalXY(a, b);
      const unit = { x: dirXY.x / segLen, y: dirXY.y / segLen };

      for (let d = moduleMeters; d < segLen - edgeMarginMeters; d += moduleMeters) {
        positions.push(window.FP.geo.fromLocalXY(a, { x: unit.x * d, y: unit.y * d }));
      }
    }
    return positions;
  }

  /**
   * Поставити Additional post на існуючий сегмент лінії (16.1/розділ 5).
   * Клік проєктується на сегмент і затискається в межах невеликого відступу
   * від країв, щоб пост не наліз на END/CORNER.
   * @returns {{success:boolean, message?:string, postId?:string}}
   */
  placeOnSegment(runId, pointAId, pointBId, clickGeo) {
    const pointA = this.store.points.get(pointAId);
    const pointB = this.store.points.get(pointBId);
    if (!pointA || !pointB) {
      return { success: false, message: 'Внутрішня помилка: сегмент не знайдено' };
    }

    const segLen = window.FP.geo.distanceMeters(pointA.geographicPosition, pointB.geographicPosition);
    const margin = Math.min(this.config.edgeMarginMeters, segLen / 4);
    if (segLen <= margin * 2) {
      return { success: false, message: 'Сегмент занадто короткий для додаткового стовпа' };
    }

    const dirXY = window.FP.geo.toLocalXY(pointA.geographicPosition, pointB.geographicPosition);
    const clickXY = window.FP.geo.toLocalXY(pointA.geographicPosition, clickGeo);
    const rawT = (clickXY.x * dirXY.x + clickXY.y * dirXY.y) / (dirXY.x * dirXY.x + dirXY.y * dirXY.y);
    const clampedDist = Math.max(margin, Math.min(segLen - margin, rawT * segLen));
    const t = clampedDist / segLen;

    const post = this.store.createPost({
      attachedRunId: runId,
      anchorPointAId: pointAId,
      anchorPointBId: pointBId,
      t,
    });
    return { success: true, postId: post.id };
  }

  /**
   * Поставити Additional post біля стійки воріт (SLD-003: "окремо біля лівої
   * або правої стійки"). Зсув перпендикулярно до осі воріт, щоб пост не
   * зливався з самою стійкою.
   */
  placeNearGatePost(gateId, side) {
    const gate = this.store.gates.get(gateId);
    if (!gate || (side !== 'A' && side !== 'B')) {
      return { success: false, message: 'Внутрішня помилка: ворота не знайдено' };
    }
    const postGeo = side === 'A' ? gate.postAGeo : gate.postBGeo;
    const otherGeo = side === 'A' ? gate.postBGeo : gate.postAGeo;
    const dirXY = window.FP.geo.toLocalXY(postGeo, otherGeo);
    const dist = Math.hypot(dirXY.x, dirXY.y) || 1e-6;
    const perp = { x: -dirXY.y / dist, y: dirXY.x / dist };
    const OFFSET_M = 0.35;
    const offsetGeo = window.FP.geo.fromLocalXY(postGeo, { x: perp.x * OFFSET_M, y: perp.y * OFFSET_M });

    const post = this.store.createPost({ geo: offsetGeo, attachedGateId: gateId, gateSide: side });
    return { success: true, postId: post.id };
  }

  /** Поточна екранно-незалежна geo-позиція поста (делегує в model.js) */
  getGeo(post) {
    return this.store.getPostGeo(post);
  }
};
