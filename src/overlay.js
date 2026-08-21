/**
 * overlay.js (Leaflet версія)
 * Тримає SVG-шар синхронізованим з картою Leaflet і відповідає
 * за фактичний рендер (розділ 19 ТЗ: порядок шарів).
 *
 * У Google Maps позицію overlay перераховує сам API через draw().
 * У Leaflet те саме робимо вручну на подіях карти: 'move' (під час
 * панорамування/зуму) і 'moveend'/'zoomend' (після завершення).
 */

window.FP = window.FP || {};

window.FP.EditorOverlay = class EditorOverlay {
  /**
   * @param {L.Map} map
   * @param {SVGSVGElement} svgEl
   * @param {InstanceType<typeof window.FP.model.DataStore>} store
   * @param {InstanceType<typeof window.FP.StateMachine>} sm
   * @param {InstanceType<typeof window.FP.DrawController>} draw
   * @param {InstanceType<typeof window.FP.SelectionController>} [selection]
   */
  constructor(map, svgEl, store, sm, draw, selection = null) {
    this.map = map;
    this.svg = svgEl;
    this.store = store;
    this.sm = sm;
    this.draw = draw;
    this.selection = selection;

    // Шари, у порядку відображення (розділ 19.1: 3 паркан+ворота, 4 розміри, 5 вузли, 6 preview)
    this.gFence = this._makeGroup('layer-fence');
    this.gGates = this._makeGroup('layer-gates hit-layer');
    this.gDimensions = this._makeGroup('layer-dimensions');
    this.gNodes = this._makeGroup('layer-nodes hit-layer');
    this.gPreview = this._makeGroup('layer-preview');

    // Перерендер при будь-якому русі/зумі карти — аналог draw() у Google OverlayView
    map.on('move zoom', () => this.render());
    map.on('moveend zoomend', () => this.render());
  }

  _makeGroup(className) {
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('class', className);
    this.svg.appendChild(g);
    return g;
  }

  /** Повний перерендер SVG-шару з поточних даних стору + live-preview */
  render() {
    this._clear(this.gFence);
    this._clear(this.gGates);
    this._clear(this.gDimensions);
    this._clear(this.gNodes);
    this._clear(this.gPreview);

    for (const run of this.store.runs.values()) {
      this._renderRun(run);
    }

    for (const gate of this.store.gates.values()) {
      this._renderGate(gate);
    }

    if (this.draw.isDrafting() && this.draw.livePreviewGeo) {
      this._renderLivePreview();
    }

    // SNP-001: під час перетягування вільного кінця — жовтий ореол на найближчій цілі
    if (this.selection && this.selection.session && this.selection.activeSnapCandidate) {
      const target = this.store.points.get(this.selection.activeSnapCandidate.pointId);
      if (target) this._renderSnapHalo(target.geographicPosition);
    }
  }

  _clear(g) {
    while (g.firstChild) g.removeChild(g.firstChild);
  }

  _renderRun(run) {
    const points = this.store.getRunPoints(run.id);
    const isSelected = this.sm.state.selectedRunId === run.id;

    for (let i = 0; i < points.length - 1; i += 1) {
      const a = window.FP.geo.toScreen(points[i].geographicPosition);
      const b = window.FP.geo.toScreen(points[i + 1].geographicPosition);
      const lineEl = this._line(this.gFence, a, b, isSelected ? 'fence-line selected' : 'fence-line');
      if (this.selection) this.selection.attachLineHandlers(lineEl, run.id, points[i].id, points[i + 1].id);

      const lengthMeters = window.FP.geo.roundLength(
        window.FP.geo.distanceMeters(points[i].geographicPosition, points[i + 1].geographicPosition)
      );
      this._dimensionLabel(a, b, lengthMeters);
    }

    for (const p of points) {
      const screen = window.FP.geo.toScreen(p.geographicPosition);
      const isJoint = !!p.jointId;
      const isSelectedPoint = this.sm.state.selectedPointId === p.id;
      let className = isJoint ? 'node joint' : 'node free-end';
      if (isSelectedPoint) className += ' selected';
      const nodeEl = this._node(screen, className);
      if (this.selection) this.selection.attachNodeHandlers(nodeEl, p.id, run.id);
    }
  }

  /**
   * Розпашні ворота — розділ 13.2 ТЗ.
   * дві стійки по краях проєму; одна стулка; тонка дуга відкривання;
   * окрема розмірна лінія ширини (GAT-001/DIM-006); підпис не перевертається
   * (DIM-004 діє й тут).
   */
  _renderGate(gate) {
    const a = window.FP.geo.toScreen(gate.postAGeo);
    const b = window.FP.geo.toScreen(gate.postBGeo);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dist = Math.hypot(dx, dy) || 1e-6;
    const ux = dx / dist;
    const uy = dy / dist;
    // перпендикуляр: 'right' — за годинниковою від напрямку A->B
    const px = -uy;
    const py = ux;

    const isSelected = this.sm.state.selectedObjectId === gate.id;
    const hingePost = gate.hingeSide === 'A' ? a : b;
    const otherPost = gate.hingeSide === 'A' ? b : a;
    const swingSign = gate.swingSide === 'right' ? 1 : -1;

    const leafEnd = {
      x: hingePost.x + px * swingSign * dist,
      y: hingePost.y + py * swingSign * dist,
    };
    const closedEnd = otherPost; // напрямок "закрито" — вздовж лінії, до іншої стійки

    const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    group.setAttribute('class', isSelected ? 'gate selected' : 'gate');

    // дуга відкривання (тонка, від закритого положення до відкритого)
    const arcPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    const sweepFlag = swingSign > 0 ? 1 : 0;
    arcPath.setAttribute(
      'd',
      `M ${closedEnd.x} ${closedEnd.y} A ${dist} ${dist} 0 0 ${sweepFlag} ${leafEnd.x} ${leafEnd.y}`
    );
    arcPath.setAttribute('class', 'gate-arc');
    group.appendChild(arcPath);

    // стулка — від стійки петель до відкритого положення
    const leaf = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    leaf.setAttribute('x1', hingePost.x);
    leaf.setAttribute('y1', hingePost.y);
    leaf.setAttribute('x2', leafEnd.x);
    leaf.setAttribute('y2', leafEnd.y);
    leaf.setAttribute('class', 'gate-leaf');
    group.appendChild(leaf);

    // дві стійки (GAT-001)
    for (const post of [a, b]) {
      const postEl = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      postEl.setAttribute('x', post.x - 4);
      postEl.setAttribute('y', post.y - 4);
      postEl.setAttribute('width', 8);
      postEl.setAttribute('height', 8);
      postEl.setAttribute('class', 'gate-post');
      group.appendChild(postEl);
    }

    this.gGates.appendChild(group);
    if (this.selection) this.selection.attachObjectHandlers(group, gate.id);

    // GAT-002/DIM-006: окремий розмір ширини між стійками, не замінює розмір прольоту
    this._dimensionLabel(a, b, gate.widthM, false, 'gate-dimension');
  }

  _renderLivePreview() {
    const preview = this.draw.onPointerMove(this.draw.livePreviewGeo);
    if (!preview) return;
    const a = window.FP.geo.toScreen(preview.from);
    const b = window.FP.geo.toScreen(preview.to);
    this._line(this.gPreview, a, b, 'fence-line preview');
    this._dimensionLabel(a, b, preview.lengthMeters, true);
  }

  _line(group, a, b, className) {
    const el = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    el.setAttribute('x1', a.x);
    el.setAttribute('y1', a.y);
    el.setAttribute('x2', b.x);
    el.setAttribute('y2', b.y);
    el.setAttribute('class', className);
    group.appendChild(el);
    return el;
  }

  _node(screen, className) {
    const el = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    el.setAttribute('cx', screen.x);
    el.setAttribute('cy', screen.y);
    el.setAttribute('r', className.includes('joint') ? 6 : 5);
    el.setAttribute('class', className);
    this.gNodes.appendChild(el);
    return el;
  }

  /** SNP-001: жовтий ореол навколо найближчої цілі прилипання під час drag */
  _renderSnapHalo(geoPosition) {
    const screen = window.FP.geo.toScreen(geoPosition);
    const el = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    el.setAttribute('cx', screen.x);
    el.setAttribute('cy', screen.y);
    el.setAttribute('r', 12);
    el.setAttribute('class', 'snap-halo');
    this.gPreview.appendChild(el);
  }

  /** DIM-005: метри з одним десятковим знаком. DIM-004: текст ніколи не догори ногами. */
  _dimensionLabel(a, b, lengthMeters, isPreview = false, extraClass = '') {
    const midX = (a.x + b.x) / 2;
    const midY = (a.y + b.y) / 2;
    let angleDeg = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
    if (angleDeg > 90 || angleDeg < -90) angleDeg += 180;

    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', midX);
    text.setAttribute('y', midY - 8);
    text.setAttribute('transform', `rotate(${angleDeg} ${midX} ${midY - 8})`);
    text.setAttribute('class', `${isPreview ? 'dimension-label preview' : 'dimension-label'} ${extraClass}`.trim());
    text.textContent = `${lengthMeters.toFixed(1)} m`;
    (isPreview ? this.gPreview : this.gDimensions).appendChild(text);
  }
};
