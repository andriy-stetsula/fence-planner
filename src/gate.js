/**
 * gate.js
 * Розпашні ворота і хвіртки — розділ 13 ТЗ.
 *
 * 13.1: розміщення на лінії — перевикористовуємо GapController, щоб розрізати
 * прогін і отримати справжній проєм (GAT-002), а потім ставимо Gate у сам
 * проєм. Розміщення standalone — дві стійки в довільному місці без прогону.
 *
 * GAT-001: точна ширина в метрах, зберігається на Gate.widthM.
 * GAT-002: проєм у лінії — досягається розрізанням прогону (як gap.js),
 * лінії між стійками просто немає.
 * GAT-004: без замка — стан видно за вирівнюванням з лінією, окремого
 * lock-стану на Gate немає (на відміну від Joint).
 *
 * 13.3: стрілки керування — setHingeSide / setSwingSide міняють лише
 * властивість об'єкта, overlay.js перемальовує стулку і дугу.
 */

window.FP = window.FP || {};

window.FP.GateController = class GateController {
  /**
   * @param {InstanceType<typeof window.FP.model.DataStore>} store
   * @param {InstanceType<typeof window.FP.GapController>} gapCtrl
   */
  constructor(store, gapCtrl) {
    this.store = store;
    this.gapCtrl = gapCtrl;
  }

  /**
   * Поставити ворота на існуючу лінію (13.1, перший варіант).
   * @param {string} runId
   * @param {string} pointAId - початок сегмента
   * @param {string} pointBId - кінець сегмента
   * @param {{lat:number,lng:number}} clickGeo
   * @param {number} widthMeters
   * @returns {{success: boolean, message?: string, gateId?: string}}
   */
  placeOnLine(runId, pointAId, pointBId, clickGeo, widthMeters) {
    const splitResult = this.gapCtrl.createGap(runId, pointAId, pointBId, clickGeo, widthMeters);
    if (!splitResult.success) {
      // GAP-001 дух правила: та сама перевірка ширини діє й для воріт.
      return splitResult;
    }

    const run1 = this.store.runs.get(splitResult.run1Id);
    const run2 = this.store.runs.get(splitResult.run2Id);
    const postAPoint = this.store.points.get(run1.pointIds[run1.pointIds.length - 1]);
    const postBPoint = this.store.points.get(run2.pointIds[0]);

    const gate = this.store.createGate({
      type: 'swing',
      postAGeo: { ...postAPoint.geographicPosition },
      postBGeo: { ...postBPoint.geographicPosition },
      widthM: widthMeters,
      attachedRunBeforeId: run1.id,
      attachedRunAfterId: run2.id,
    });

    postAPoint.gateId = gate.id;
    postAPoint.gateSide = 'A';
    postBPoint.gateId = gate.id;
    postBPoint.gateSide = 'B';

    return { success: true, gateId: gate.id };
  }

  /**
   * Поставити окремо стоячі ворота (13.1, другий варіант) — дві структурні
   * стійки у довільному місці, без прив'язки до прогону.
   * @param {{lat:number,lng:number}} centerGeo - точка кліку, центр воріт
   * @param {number} angleDeg - орієнтація лінії воріт (0 = вздовж довготи)
   * @param {number} widthMeters
   */
  placeStandalone(centerGeo, angleDeg, widthMeters) {
    const rad = (angleDeg * Math.PI) / 180;
    const half = widthMeters / 2;
    const dx = Math.cos(rad) * half;
    const dy = Math.sin(rad) * half;
    const postAGeo = window.FP.geo.fromLocalXY(centerGeo, { x: -dx, y: -dy });
    const postBGeo = window.FP.geo.fromLocalXY(centerGeo, { x: dx, y: dy });

    const gate = this.store.createGate({
      type: 'swing',
      postAGeo,
      postBGeo,
      widthM: widthMeters,
      attachedRunBeforeId: null,
      attachedRunAfterId: null,
    });
    return { success: true, gateId: gate.id };
  }

  /** 13.3: дві стрілки вздовж лінії — яка стійка має петлі */
  setHingeSide(gateId, side) {
    const gate = this.store.gates.get(gateId);
    if (!gate || gate.type !== 'swing' || (side !== 'A' && side !== 'B')) return false;
    gate.hingeSide = side;
    return true;
  }

  /** 13.3: дві стрілки поперек лінії — у який бік відкривається стулка */
  setSwingSide(gateId, side) {
    const gate = this.store.gates.get(gateId);
    if (!gate || gate.type !== 'swing' || (side !== 'left' && side !== 'right')) return false;
    gate.swingSide = side;
    return true;
  }
};
