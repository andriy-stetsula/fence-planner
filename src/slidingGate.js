window.FP = window.FP || {};

window.FP.SlidingGateController = class SlidingGateController {
  constructor(store, sm, history) {
    this.store = store;
    this.sm = sm;
    this.history = history;

    this.draftFirstGeo = null;
    this.livePreviewGeo = null;
  }

  isDrafting() {
    return !!this.draftFirstGeo;
  }

  onMapClick(geoPoint, widthOverride) {
    if (this.sm.state.activeTool !== 'slidingGate') return null;

    if (!this.isDrafting()) {
      this.draftFirstGeo = geoPoint;
      this.livePreviewGeo = geoPoint;
      return null;
    }

    const postAGeo = this.draftFirstGeo;
    let postBGeo;
    let widthM;

    if (widthOverride && widthOverride > 0) {
      widthM = widthOverride;
      postBGeo = window.FP.geo.pointAtDistanceAlongDirection(postAGeo, geoPoint, widthM);
    } else {
      widthM = window.FP.geo.roundLength(window.FP.geo.distanceMeters(postAGeo, geoPoint));
      postBGeo = geoPoint;
    }

    this.history.beginAction();
    const gate = this.store.createGate({
      type: 'sliding',
      postAGeo,
      postBGeo,
      widthM,
    });
    this.history.commitAction();

    this.draftFirstGeo = null;
    this.livePreviewGeo = null;

    return { success: true, gateId: gate.id };
  }

  onPointerMove(geoPoint) {
    if (this.sm.state.activeTool !== 'slidingGate' || !this.isDrafting()) {
      return null;
    }
    this.livePreviewGeo = geoPoint;
    const lengthMeters = window.FP.geo.roundLength(
      window.FP.geo.distanceMeters(this.draftFirstGeo, geoPoint)
    );
    return { from: this.draftFirstGeo, to: geoPoint, lengthMeters };
  }

  cancelDraft() {
    this.draftFirstGeo = null;
    this.livePreviewGeo = null;
  }

  setSlideDirection(gateId, direction) {
    const gate = this.store.gates.get(gateId);
    if (!gate || gate.type !== 'sliding' || (direction !== 'left' && direction !== 'right')) return false;
    gate.slideDirection = direction;
    return true;
  }
};