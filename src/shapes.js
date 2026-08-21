window.FP = window.FP || {};

window.FP.ShapesController = class ShapesController {
  constructor(store) {
    this.store = store;
    this.types = {
      house: { label: 'Будинок', widthM: 8, heightM: 6, resizable: true, anchorable: false },
      pool: { label: 'Басейн', widthM: 6, heightM: 3, resizable: true, anchorable: false },
      arbor: { label: 'Арбор', widthM: 2.5, heightM: 2.5, resizable: false, anchorable: false },
      tree: { label: 'Дерево', widthM: 3, heightM: 3, resizable: false, anchorable: false },
      mailbox: { label: 'Поштова скринька', widthM: 0.4, heightM: 0.4, resizable: false, anchorable: true },
      parcelPillar: { label: 'Стовп ділянки', widthM: 0.3, heightM: 0.3, resizable: false, anchorable: false },
    };
    this.ANCHOR_ATTACH_RADIUS_PX = 20;
  }

  isKnownType(type) {
    return !!this.types[type];
  }

  getTypeConfig(type) {
    return this.types[type] || null;
  }

  placeAt(type, clickGeo) {
    const cfg = this.types[type];
    if (!cfg) return { success: false, message: "Невідомий тип об'єкта" };

    const anchor = cfg.anchorable ? this._findNearestSegment(clickGeo) : null;

    const shape = this.store.createShape({
      type,
      geo: anchor ? null : { ...clickGeo },
      widthM: cfg.widthM,
      heightM: cfg.heightM,
      anchorRunId: anchor ? anchor.runId : null,
      anchorPointAId: anchor ? anchor.pointAId : null,
      anchorPointBId: anchor ? anchor.pointBId : null,
      t: anchor ? anchor.t : null,
    });
    return { success: true, shapeId: shape.id };
  }

  _findNearestSegment(clickGeo) {
    let best = null;
    for (const run of this.store.runs.values()) {
      const points = this.store.getRunPoints(run.id);
      const segCount = run.closed ? points.length : points.length - 1;
      for (let i = 0; i < segCount; i += 1) {
        const a = points[i];
        const b = points[(i + 1) % points.length];
        if (!a || !b) continue;
        const proj = this._projectOntoSegmentPx(clickGeo, a.geographicPosition, b.geographicPosition);
        if (!proj) continue;
        if (proj.distPx <= this.ANCHOR_ATTACH_RADIUS_PX && (!best || proj.distPx < best.distPx)) {
          best = { runId: run.id, pointAId: a.id, pointBId: b.id, t: proj.t, distPx: proj.distPx };
        }
      }
    }
    return best;
  }

  _projectOntoSegmentPx(clickGeo, aGeo, bGeo) {
    const aScreen = window.FP.geo.toScreen(aGeo);
    const bScreen = window.FP.geo.toScreen(bGeo);
    const cScreen = window.FP.geo.toScreen(clickGeo);
    const abx = bScreen.x - aScreen.x;
    const aby = bScreen.y - aScreen.y;
    const lenSq = abx * abx + aby * aby;
    if (lenSq < 1e-6) return null;
    let t = ((cScreen.x - aScreen.x) * abx + (cScreen.y - aScreen.y) * aby) / lenSq;
    t = Math.max(0, Math.min(1, t));
    const projScreen = { x: aScreen.x + abx * t, y: aScreen.y + aby * t };
    const distPx = Math.hypot(cScreen.x - projScreen.x, cScreen.y - projScreen.y);
    return { t, distPx };
  }

  getGeo(shape) {
    return this.store.getShapeGeo(shape);
  }

  moveTo(shapeId, newGeo) {
    this.store.moveShape(shapeId, newGeo);
  }

  resize(shapeId, widthM, heightM) {
    this.store.resizeShape(shapeId, widthM, heightM);
  }

  remove(shapeId) {
    this.store.removeShape(shapeId);
  }
};