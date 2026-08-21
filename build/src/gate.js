window.FP = window.FP || {};

window.FP.GateController = class GateController {
  constructor(store, gapCtrl) {
    this.store = store;
    this.gapCtrl = gapCtrl;
  }

  placeOnLine(runId, pointAId, pointBId, clickGeo, widthMeters) {
    const splitResult = this.gapCtrl.createGap(
      runId,
      pointAId,
      pointBId,
      clickGeo,
      widthMeters
    );

    if (!splitResult.success) {
      return splitResult;
    }

    const run1 = this.store.runs.get(splitResult.run1Id);
    const run2 = this.store.runs.get(splitResult.run2Id);

    const postAPoint = this.store.points.get(
      run1.pointIds[run1.pointIds.length - 1]
    );

    const postBPoint = this.store.points.get(
      run2.pointIds[0]
    );

    const gate = this.store.createGate({
      type: 'swing',
      postAGeo: { ...postAPoint.geographicPosition },
      postBGeo: { ...postBPoint.geographicPosition },
      widthM: widthMeters,
      attachedRunBeforeId: run1.id,
      attachedRunAfterId: run2.id
    });

    postAPoint.gateId = gate.id;
    postAPoint.gateSide = 'A';

    postBPoint.gateId = gate.id;
    postBPoint.gateSide = 'B';

    return {
      success: true,
      gateId: gate.id
    };
  }

  placeStandalone(centerGeo, angleDeg, widthMeters) {
    const rad = (angleDeg * Math.PI) / 180;
    const half = widthMeters / 2;

    const dx = Math.cos(rad) * half;
    const dy = Math.sin(rad) * half;

    const postAGeo = window.FP.geo.fromLocalXY(
      centerGeo,
      { x: -dx, y: -dy }
    );

    const postBGeo = window.FP.geo.fromLocalXY(
      centerGeo,
      { x: dx, y: dy }
    );

    const gate = this.store.createGate({
      type: 'swing',
      postAGeo,
      postBGeo,
      widthM: widthMeters,
      attachedRunBeforeId: null,
      attachedRunAfterId: null
    });

    return {
      success: true,
      gateId: gate.id
    };
  }

  setHingeSide(gateId, side) {
    const gate = this.store.gates.get(gateId);

    if (
      !gate ||
      gate.type !== 'swing' ||
      (side !== 'A' && side !== 'B')
    ) {
      return false;
    }

    gate.hingeSide = side;
    return true;
  }

  setSwingSide(gateId, side) {
    const gate = this.store.gates.get(gateId);

    if (
      !gate ||
      gate.type !== 'swing' ||
      (side !== 'left' && side !== 'right')
    ) {
      return false;
    }

    gate.swingSide = side;
    return true;
  }
};