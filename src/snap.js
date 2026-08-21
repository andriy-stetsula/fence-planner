window.FP = window.FP || {};

window.FP.SnapController = class SnapController {
  constructor(store) {
    this.store = store;
    this.ATTACH_RADIUS_PX = 14;
    this.DETACH_RADIUS_PX = 34;

    this._blockedOrigins = new Map();
    this.shapesCtrl = null;
  }

  setShapesController(shapesCtrl) {
    this.shapesCtrl = shapesCtrl;
  }

  findSnapTarget(draggedPointId, currentGeo) {
    const loop = this._findLoopCloseTarget(draggedPointId, currentGeo);
    const endpoint = this._findFreeEndTarget(draggedPointId, currentGeo);

    let best = null;
    if (loop) best = loop;
    if (endpoint && (!best || endpoint.distPx < best.distPx)) best = endpoint;
    if (best) return best;

    const node = this._findExistingNodeTarget(draggedPointId, currentGeo);
    if (node) return node;

    const segment = this._findSegmentSnapTarget(draggedPointId, currentGeo);
    if (segment) return segment;

    return this._findObjectAnchorTarget(draggedPointId, currentGeo);
  }

  _findObjectAnchorTarget(draggedPointId, currentGeo) {
    if (!this.shapesCtrl) return null;
    let best = null;
    for (const shape of this.store.shapes.values()) {
      const geo = this.shapesCtrl.getGeo(shape);
      if (!geo) continue;
      if (this._isBlocked(shape.id, currentGeo)) continue;
      const distPx = window.FP.geo.distanceScreenPx(currentGeo, geo);
      if (distPx <= this.ATTACH_RADIUS_PX && (!best || distPx < best.distPx)) {
        best = { kind: 'object', shapeId: shape.id, geo, distPx };
      }
    }
    return best;
  }

  _findLoopCloseTarget(draggedPointId, currentGeo) {
    const point = this.store.points.get(draggedPointId);
    if (!point || point.jointId) return null;
    const run = this.store.runs.get(point.runId);
    if (!run || run.closed) return null;
    if (run.pointIds.length < 3) return null;

    const idx = run.pointIds.indexOf(draggedPointId);
    if (idx !== 0 && idx !== run.pointIds.length - 1) return null;

    const oppositeId = idx === 0 ? run.pointIds[run.pointIds.length - 1] : run.pointIds[0];
    if (this._isBlocked(oppositeId, currentGeo)) return null;
    const oppositePoint = this.store.points.get(oppositeId);
    if (!oppositePoint) return null;

    const distPx = window.FP.geo.distanceScreenPx(currentGeo, oppositePoint.geographicPosition);
    if (distPx > this.ATTACH_RADIUS_PX) return null;
    return { kind: 'loop', runId: run.id, pointId: oppositeId, distPx };
  }

  _findFreeEndTarget(draggedPointId, currentGeo) {
    const draggedPoint = this.store.points.get(draggedPointId);
    if (!draggedPoint) return null;
    let best = null;
    for (const [pid, point] of this.store.points) {
      if (pid === draggedPointId) continue;
      if (point.runId === draggedPoint.runId) continue;
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

  _findExistingNodeTarget(draggedPointId, currentGeo) {
    const draggedPoint = this.store.points.get(draggedPointId);
    if (!draggedPoint) return null;
    let best = null;
    for (const [pid, point] of this.store.points) {
      if (pid === draggedPointId) continue;
      if (point.runId === draggedPoint.runId) continue;
      if (point.jointId) continue;
      if (this._isFreeEnd(point)) continue;
      if (this._isBlocked(pid, currentGeo)) continue;

      const distPx = window.FP.geo.distanceScreenPx(currentGeo, point.geographicPosition);
      if (distPx <= this.ATTACH_RADIUS_PX && (!best || distPx < best.distPx)) {
        best = { kind: 'node', pointId: pid, runId: point.runId, distPx };
      }
    }
    return best;
  }

  _findSegmentSnapTarget(draggedPointId, currentGeo) {
    const draggedPoint = this.store.points.get(draggedPointId);
    if (!draggedPoint) return null;
    let best = null;

    for (const run of this.store.runs.values()) {
      if (run.id === draggedPoint.runId) continue;
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

  _projectOntoSegmentPx(currentGeo, aGeo, bGeo) {
    const aScreen = window.FP.geo.toScreen(aGeo);
    const bScreen = window.FP.geo.toScreen(bGeo);
    const cScreen = window.FP.geo.toScreen(currentGeo);

    const abx = bScreen.x - aScreen.x;
    const aby = bScreen.y - aScreen.y;
    const lenSq = abx * abx + aby * aby;
    if (lenSq < 1e-6) return null;

    let t = ((cScreen.x - aScreen.x) * abx + (cScreen.y - aScreen.y) * aby) / lenSq;
    const EDGE_MARGIN = 0.02;
    if (t < EDGE_MARGIN || t > 1 - EDGE_MARGIN) return null;

    const projScreen = { x: aScreen.x + abx * t, y: aScreen.y + aby * t };
    const distPx = Math.hypot(cScreen.x - projScreen.x, cScreen.y - projScreen.y);
    const geo = {
      lat: aGeo.lat + (bGeo.lat - aGeo.lat) * t,
      lng: aGeo.lng + (bGeo.lng - aGeo.lng) * t,
    };
    return { t, distPx, geo };
  }

  _isFreeEnd(point) {
    const run = this.store.runs.get(point.runId);
    if (!run || run.closed) return false;
    const idx = run.pointIds.indexOf(point.id);
    return idx === 0 || idx === run.pointIds.length - 1;
  }

  createJoint(pointIdA, pointIdB) {
    const pointA = this.store.points.get(pointIdA);
    const pointB = this.store.points.get(pointIdB);
    if (!pointA || !pointB) return null;

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

  closeLoop(draggedPointId, runId) {
    return this.store.closeRun(runId, draggedPointId);
  }

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
    this.blockAfterSeparation(memberIds);
  }

  blockAfterSeparation(pointIds) {
    for (const pid of pointIds) {
      const p = this.store.points.get(pid);
      if (p) this._blockedOrigins.set(pid, { ...p.geographicPosition });
    }
  }

  clearBlock() {
    this._blockedOrigins.clear();
  }

  _isBlocked(targetPointId, draggedCurrentGeo) {
    const originGeo = this._blockedOrigins.get(targetPointId);
    if (!originGeo) return false;
    const distPx = window.FP.geo.distanceScreenPx(draggedCurrentGeo, originGeo);
    if (distPx > this.DETACH_RADIUS_PX) {
      this._blockedOrigins.delete(targetPointId);
      return false;
    }
    return true;
  }
};