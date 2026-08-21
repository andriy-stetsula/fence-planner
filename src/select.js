

window.FP = window.FP || {};

window.FP.SelectionController = class SelectionController {
  /**
   * @param {InstanceType<typeof window.FP.model.DataStore>} store
   * @param {InstanceType<typeof window.FP.StateMachine>} sm
   * @param {InstanceType<typeof window.FP.History>} history
   * @param {L.Map} map
   * @param {() => void} rerender
   * @param {InstanceType<typeof window.FP.SnapController>} [snap]
   * @param {InstanceType<typeof window.FP.ShapesController>} [shapesCtrl] - розділ 17
   */
  constructor(store, sm, history, map, rerender, snap = null, onSegmentClick = null, onGapClick = null, onGateLineClick = null, onPostLineClick = null, shapesCtrl = null) {
    this.store = store;
    this.sm = sm;
    this.history = history;
    this.map = map;
    this.rerender = rerender;
    this.snap = snap;
    this.onSegmentClick = onSegmentClick;
    this.onGapClick = onGapClick;
    this.onGateLineClick = onGateLineClick;
    this.onPostLineClick = onPostLineClick;
    this.shapesCtrl = shapesCtrl;

    this.DRAG_THRESHOLD_PX = 5; 

    
    this.session = null;

   
    this.activeSnapCandidate = null;

    this._onWindowPointerMove = this._onWindowPointerMove.bind(this);
    this._onWindowPointerUp = this._onWindowPointerUp.bind(this);
  }

  isActive() {
    return this.sm.state.activeTool === 'select';
  }

  isLineInteractive() {
    const tool = this.sm.state.activeTool;
    return tool === 'select' || tool === 'gap' || tool === 'gate' || tool === 'posts';
  }

  attachObjectHandlers(el, objectId) {
    if (!this.isActive()) return;
    el.style.pointerEvents = 'all';
    el.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      this.sm.select({ objectId });
      this.rerender();
    });
  }

  attachLineHandlers(lineEl, runId, pointAId, pointBId) {
    if (!this.isLineInteractive()) return;
    lineEl.style.pointerEvents = 'stroke';
    lineEl.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      const latLng = this.map.mouseEventToLatLng(e);
      const clickGeo = { lat: latLng.lat, lng: latLng.lng };
      this._startSession('run', runId, e, null, { pointAId, pointBId, clickGeo });
    });
  }

  attachShapeHandlers(el, shapeId) {
    if (!this.isActive()) return;
    el.style.pointerEvents = 'all';
    el.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      this._startSession('shape', shapeId, e);
    });
  }
  attachNodeHandlers(nodeEl, pointId, runId) {
    if (!this.isActive()) return;
    nodeEl.style.pointerEvents = 'all';
    nodeEl.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      this._startSession('point', pointId, e, runId);
    });
  }

  handleEmptyMapClick() {
    if (!this.isActive()) return;
    this.sm.clearSelection();
    this.rerender();
  }

  _startSession(type, id, pointerEvent, extraRunId = null, segmentInfo = null) {
    this.map.dragging.disable(); 
    this.session = {
      type,
      id,
      runId: extraRunId,
      segmentInfo,
      startScreen: { x: pointerEvent.clientX, y: pointerEvent.clientY },
      moved: false,
    };
    window.addEventListener('pointermove', this._onWindowPointerMove);
    window.addEventListener('pointerup', this._onWindowPointerUp);
  }

  _onWindowPointerMove(e) {
    if (!this.session) return;
    const dx = e.clientX - this.session.startScreen.x;
    const dy = e.clientY - this.session.startScreen.y;
    const dist = Math.hypot(dx, dy);

    if (!this.session.moved && dist < this.DRAG_THRESHOLD_PX) {
      return; 
    }

    const isClickOnlyTool =
      this.sm.state.activeTool === 'gap' || this.sm.state.activeTool === 'gate' || this.sm.state.activeTool === 'posts';

    if (!this.session.moved) {
      if (!isClickOnlyTool) {
        this.history.beginAction();
        this.sm.startDrag({ targetType: this.session.type, targetId: this.session.id });
      }
    }
    this.session.moved = true;

    if (isClickOnlyTool) {
      return; 
    }

    const mapContainerPoint = this.map.mouseEventToContainerPoint(e);
    const newGeo = window.FP.geo.toGeo({ x: mapContainerPoint.x, y: mapContainerPoint.y });

    if (this.session.type === 'point') {
      this._dragPoint(this.session.id, newGeo);
    } else if (this.session.type === 'shape') {
      this._dragShape(this.session.id, newGeo);
    } else {
      this._dragRun(this.session.id, newGeo);
    }

    this.rerender();
  }
  _dragShape(shapeId, newGeo) {
    if (this.shapesCtrl) this.shapesCtrl.moveTo(shapeId, newGeo);
  }

  _dragPoint(pointId, newGeo) {
    if (!this.session.lastGeo) {
      const point = this.store.points.get(pointId);
      this.session.lastGeo = point.geographicPosition;
    }
    this.store.movePoint(pointId, newGeo);
    if (this.snap) {
      const point = this.store.points.get(pointId);
      if (!point.jointId) {
        this.activeSnapCandidate = this.snap.findSnapTarget(pointId, newGeo);
      }
    }
  }

  _dragRun(runId, newGeo) {
    if (!this.session.lastGeo) this.session.lastGeo = newGeo;
    const deltaLat = newGeo.lat - this.session.lastGeo.lat;
    const deltaLng = newGeo.lng - this.session.lastGeo.lng;
    this.store.moveRun(runId, deltaLat, deltaLng);
    this.session.lastGeo = newGeo;
  }

  _onWindowPointerUp() {
    window.removeEventListener('pointermove', this._onWindowPointerMove);
    window.removeEventListener('pointerup', this._onWindowPointerUp);
    this.map.dragging.enable();

    if (!this.session) return;

    const isClickOnlyTool =
      this.sm.state.activeTool === 'gap' || this.sm.state.activeTool === 'gate' || this.sm.state.activeTool === 'posts';

    if (this.session.moved) {
      if (!isClickOnlyTool) {
        if (this.session.type === 'point' && this.activeSnapCandidate && this.snap) {
          const candidate = this.activeSnapCandidate;
          if (candidate.kind === 'loop') {
            this.snap.closeLoop(this.session.id, candidate.runId); 
          } else if (candidate.kind === 'segment') {
            this.snap.createTJoint(this.session.id, candidate); 
          } else if (candidate.kind === 'object') {
            this.store.movePoint(this.session.id, candidate.geo);
          } else {
            this.snap.createJoint(this.session.id, candidate.pointId); 
          }
        }
        this.activeSnapCandidate = null;
        if (this.snap) this.snap.clearBlock(); 
        this.history.commitAction();
        this.sm.endDrag();
      }
    } else if (this.sm.state.activeTool === 'gap') {
      if (this.session.segmentInfo && this.onGapClick) {
        this.onGapClick(
          this.session.runId,
          this.session.segmentInfo.pointAId,
          this.session.segmentInfo.pointBId,
          this.session.segmentInfo.clickGeo
        );
      }
    } else if (this.sm.state.activeTool === 'gate') {
      if (this.session.segmentInfo && this.onGateLineClick) {
        this.onGateLineClick(
          this.session.runId,
          this.session.segmentInfo.pointAId,
          this.session.segmentInfo.pointBId,
          this.session.segmentInfo.clickGeo
        );
      }
    } else if (this.sm.state.activeTool === 'posts') {
      if (this.session.segmentInfo && this.onPostLineClick) {
        this.onPostLineClick(
          this.session.runId,
          this.session.segmentInfo.pointAId,
          this.session.segmentInfo.pointBId,
          this.session.segmentInfo.clickGeo
        );
      }
    } else {
      if (this.session.type === 'point') {
        this.sm.select({ pointId: this.session.id, runId: this.session.runId });
      } else if (this.session.type === 'shape') {
        this.sm.select({ objectId: this.session.id }); 
      } else {
        this.sm.select({ runId: this.session.id });
        if (this.session.segmentInfo && this.onSegmentClick) {
          this.onSegmentClick(this.session.segmentInfo.pointAId, this.session.segmentInfo.pointBId);
        }
      }
    }

    this.session = null;
    this.rerender();
  }
  deleteSelected() {
    const s = this.sm.state;
    if (!s.selectedPointId && !s.selectedRunId && !s.selectedObjectId) return;

    this.history.beginAction();
    if (s.selectedPointId) {
      this.store.removePoint(s.selectedPointId);
    } else if (s.selectedObjectId) {
      if (this.store.gates.has(s.selectedObjectId)) {
        this.store.removeGate(s.selectedObjectId);
      } else if (this.store.posts.has(s.selectedObjectId)) {
        this.store.removePost(s.selectedObjectId);
      } else if (this.store.shapes.has(s.selectedObjectId)) {
        this.store.removeShape(s.selectedObjectId); 
      }
    } else if (s.selectedRunId) {
      this.store.removeRun(s.selectedRunId);
    }
    this.history.commitAction();

    this.sm.clearSelection();
    this.rerender();
  }
};
