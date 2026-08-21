window.FP = window.FP || {};

window.FP.PostsController = class PostsController {
  constructor(store) {
    this.store = store;
    this.config = {
      moduleMeters: 2.4,
      edgeMarginMeters: 0.3,
    };
  }

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

  getGeo(post) {
    return this.store.getPostGeo(post);
  }
};