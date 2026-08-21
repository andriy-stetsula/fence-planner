window.FP = window.FP || {};

window.FP.DrawController = class DrawController {
  constructor(store, sm, history) {
    this.store = store;
    this.sm = sm;
    this.history = history;
    this.MIN_NEW_POINT_DISTANCE_M = 0.15;
    this.livePreviewGeo = null;
  }

  isDrafting() {
    return !!this.sm.state.draftRunId;
  }

  onMapClick(geoPoint) {
    if (this.sm.state.activeTool !== 'draw') return;

    if (!this.isDrafting()) {
      this.history.beginAction();

      const run = this.store.createRun();
      this.store.addPointToRun(run.id, geoPoint);

      this.sm.state.draftRunId = run.id;

      this.history.commitAction();
      return;
    }

    const points = this.store.getRunPoints(
      this.sm.state.draftRunId
    );

    const lastPoint = points[points.length - 1];

    const distance = window.FP.geo.distanceMeters(
      lastPoint.geographicPosition,
      geoPoint
    );

    if (distance < this.MIN_NEW_POINT_DISTANCE_M) {
      this._showMessage(
        'Занадто близько до попередньої точки — точку не додано'
      );
      return;
    }

    this.history.beginAction();

    this.store.addPointToRun(
      this.sm.state.draftRunId,
      geoPoint
    );

    this.history.commitAction();
  }

  onPointerMove(geoPoint) {
    if (
      this.sm.state.activeTool !== 'draw' ||
      !this.isDrafting()
    ) {
      this.livePreviewGeo = null;
      return null;
    }

    this.livePreviewGeo = geoPoint;

    const points = this.store.getRunPoints(
      this.sm.state.draftRunId
    );

    const lastPoint = points[points.length - 1];

    const rawMeters = window.FP.geo.distanceMeters(
      lastPoint.geographicPosition,
      geoPoint
    );

    const lengthMeters =
      window.FP.geo.roundLength(rawMeters);

    const run = this.store.runs.get(
      this.sm.state.draftRunId
    );

    if (run.dimensionSide === null) {
      run.dimensionSide =
        this._computePreferredSide(
          lastPoint.geographicPosition,
          geoPoint
        );
    }

    return {
      from: lastPoint.geographicPosition,
      to: geoPoint,
      lengthMeters,
      side: run.dimensionSide
    };
  }

  _computePreferredSide(from, to) {
    const dx = to.lng - from.lng;
    return dx >= 0 ? 'right' : 'left';
  }

  finishRun() {
    if (!this.isDrafting()) return;

    const run = this.store.runs.get(
      this.sm.state.draftRunId
    );

    if (!run) return;

    this.history.beginAction();

    if (run.pointIds.length < 2) {
      this.store.removeRun(run.id);
    } else {
      run.dimensionSide = null;
    }

    this.history.commitAction();

    this.sm.state.draftRunId = null;
    this.livePreviewGeo = null;
  }

  cancelDraft() {
    if (!this.isDrafting()) return;

    const run = this.store.runs.get(
      this.sm.state.draftRunId
    );

    if (run && run.pointIds.length < 2) {
      this.store.removeRun(run.id);
    }

    this.sm.state.draftRunId = null;
    this.livePreviewGeo = null;

    if (run) {
      run.dimensionSide = null;
    }
  }

  startNewRun() {
    this.finishRun();
  }
};