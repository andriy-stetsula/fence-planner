window.FP = window.FP || {};

window.FP.JointController = class JointController {
  constructor(store) {
    this.store = store;
  }

  getSimpleCorner(pointId) {
    const point = this.store.points.get(pointId);
    if (!point) return null;
    if (point.jointId) return null;

    const run = this.store.runs.get(point.runId);
    if (!run) return null;

    const idx = run.pointIds.indexOf(pointId);
    if (idx === -1) return null;

    if (run.closed) {
      const n = run.pointIds.length;
      if (n < 3) return null;

      const prevPoint = this.store.points.get(
        run.pointIds[(idx - 1 + n) % n]
      );
      const nextPoint = this.store.points.get(
        run.pointIds[(idx + 1) % n]
      );

      return {
        run,
        index: idx,
        prevPoint,
        nextPoint,
        point
      };
    }

    if (idx <= 0 || idx >= run.pointIds.length - 1) return null;

    const prevPoint = this.store.points.get(run.pointIds[idx - 1]);
    const nextPoint = this.store.points.get(run.pointIds[idx + 1]);

    return {
      run,
      index: idx,
      prevPoint,
      nextPoint,
      point
    };
  }

  getAngleDeg(pointId) {
    const corner = this.getSimpleCorner(pointId);
    if (!corner) return null;

    return this._angleBetween(
      corner.point,
      corner.prevPoint,
      corner.nextPoint
    );
  }

  _angleBetween(vertexPoint, aPoint, bPoint) {
    const origin = vertexPoint.geographicPosition;
    const a = window.FP.geo.toLocalXY(
      origin,
      aPoint.geographicPosition
    );
    const b = window.FP.geo.toLocalXY(
      origin,
      bPoint.geographicPosition
    );

    const angA = Math.atan2(a.y, a.x);
    const angB = Math.atan2(b.y, b.x);

    let diff = Math.abs(angA - angB) * (180 / Math.PI);

    if (diff > 180) {
      diff = 360 - diff;
    }

    return diff;
  }

  setAngleDeg(pointId, desiredDeg) {
    const corner = this.getSimpleCorner(pointId);
    if (!corner) return false;

    const clamped = Math.max(1, Math.min(179, desiredDeg));

    const origin = corner.point.geographicPosition;

    const refXY = window.FP.geo.toLocalXY(
      origin,
      corner.prevPoint.geographicPosition
    );

    const movXY = window.FP.geo.toLocalXY(
      origin,
      corner.nextPoint.geographicPosition
    );

    const refAngle = Math.atan2(refXY.y, refXY.x);
    const movingDist = Math.hypot(movXY.x, movXY.y);

    const currentDiff =
      Math.atan2(movXY.y, movXY.x) - refAngle;

    const sign = Math.sin(currentDiff) >= 0 ? 1 : -1;

    const newAngleRad =
      refAngle + sign * (clamped * Math.PI) / 180;

    const newXY = {
      x: Math.cos(newAngleRad) * movingDist,
      y: Math.sin(newAngleRad) * movingDist
    };

    const newGeo = window.FP.geo.fromLocalXY(
      origin,
      newXY
    );

    this.store.movePoint(corner.nextPoint.id, newGeo);

    return true;
  }

  setRightAngle(pointId) {
    return this.setAngleDeg(pointId, 90);
  }
};