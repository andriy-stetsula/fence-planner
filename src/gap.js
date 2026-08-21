window.FP = window.FP || {};

window.FP.GapController = class GapController {
  constructor(store) {
    this.store = store;
    this.MIN_MARGIN_M = 0.2;
  }

  createGap(runId, pointAId, pointBId, clickGeo, widthMeters) {
    const run = this.store.runs.get(runId);
    const pointA = this.store.points.get(pointAId);
    const pointB = this.store.points.get(pointBId);

    if (!run || !pointA || !pointB) {
      return {
        success: false,
        message: 'Внутрішня помилка: сегмент не знайдено'
      };
    }

    const idxA = run.pointIds.indexOf(pointAId);
    const idxB = run.pointIds.indexOf(pointBId);

    if (idxB !== idxA + 1) {
      return {
        success: false,
        message: 'Невірний сегмент'
      };
    }

    const origin = pointA.geographicPosition;
    const dirXY = window.FP.geo.toLocalXY(
      origin,
      pointB.geographicPosition
    );

    const segLength = Math.hypot(dirXY.x, dirXY.y);

    if (segLength < 1e-6) {
      return {
        success: false,
        message: 'Сегмент занадто короткий'
      };
    }

    const unit = {
      x: dirXY.x / segLength,
      y: dirXY.y / segLength
    };

    const clickXY = window.FP.geo.toLocalXY(
      origin,
      clickGeo
    );

    const t =
      clickXY.x * unit.x +
      clickXY.y * unit.y;

    const gapStart = t - widthMeters / 2;
    const gapEnd = t + widthMeters / 2;

    if (
      gapStart < this.MIN_MARGIN_M ||
      gapEnd > segLength - this.MIN_MARGIN_M
    ) {
      return {
        success: false,
        message: `Розрив ${widthMeters.toFixed(1)} m не вміщується в цей сегмент (${segLength.toFixed(1)} m). Потрібні відступи з країв.`
      };
    }

    const gapStartGeo = window.FP.geo.fromLocalXY(
      origin,
      {
        x: unit.x * gapStart,
        y: unit.y * gapStart
      }
    );

    const gapEndGeo = window.FP.geo.fromLocalXY(
      origin,
      {
        x: unit.x * gapEnd,
        y: unit.y * gapEnd
      }
    );

    const { Point } = window.FP.model;

    const newEndPoint = new Point(
      gapStartGeo,
      run.id
    );

    this.store.points.set(
      newEndPoint.id,
      newEndPoint
    );

    const run1PointIds = [
      ...run.pointIds.slice(0, idxA + 1),
      newEndPoint.id
    ];

    const run2 = this.store.createRun();

    const newStartPoint = new Point(
      gapEndGeo,
      run2.id
    );

    this.store.points.set(
      newStartPoint.id,
      newStartPoint
    );

    const tailPointIds = run.pointIds.slice(idxB);

    for (const pid of tailPointIds) {
      const p = this.store.points.get(pid);

      if (p) {
        p.runId = run2.id;
      }
    }

    run2.pointIds = [
      newStartPoint.id,
      ...tailPointIds
    ];

    run2.closed = false;

    run.pointIds = run1PointIds;
    run.closed = false;

    return {
      success: true,
      run1Id: run.id,
      run2Id: run2.id
    };
  }
};