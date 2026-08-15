/**
 * overlay.js
 * Google Maps OverlayView, що тримає SVG-шар синхронізованим з картою,
 * і відповідає за фактичний рендер (розділ 19: порядок шарів).
 *
 * Шар 3 (паркан) рендериться нижче за шар 5 (вузли) і шар 6 (preview),
 * реалізовано через порядок <g> груп у SVG.
 */

window.FP = window.FP || {};

window.FP.EditorOverlay = class EditorOverlay extends google.maps.OverlayView {
  /**
   * @param {google.maps.Map} map
   * @param {SVGSVGElement} svgEl
   * @param {InstanceType<typeof window.FP.model.DataStore>} store
   * @param {InstanceType<typeof window.FP.StateMachine>} sm
   * @param {InstanceType<typeof window.FP.DrawController>} draw
   */
  constructor(map, svgEl, store, sm, draw) {
    super();
    this.map = map;
    this.svg = svgEl;
    this.store = store;
    this.sm = sm;
    this.draw = draw;
    this.setMap(map);

    //層 groups, у порядку відображення (розділ 19.1: 3 паркан, 4 розміри, 5 вузли, 6 preview)
    this.gFence = this._makeGroup('layer-fence');
    this.gDimensions = this._makeGroup('layer-dimensions');
    this.gNodes = this._makeGroup('layer-nodes hit-layer');
    this.gPreview = this._makeGroup('layer-preview');
  }

  _makeGroup(className) {
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('class', className);
    this.svg.appendChild(g);
    return g;
  }

  onAdd() {
    // OverlayView lifecycle hook — projection тепер доступна
    window.FP.geo.bindOverlay(this);
  }

  /** OverlayView вимагає метод draw() — викликається при кожному русі/зумі карти */
  draw() {
    this.render();
  }

  onRemove() {}

  /** Повний перерендер SVG-шару з поточних даних стору + live-preview */
  render() {
    this._clear(this.gFence);
    this._clear(this.gDimensions);
    this._clear(this.gNodes);
    this._clear(this.gPreview);

    for (const run of this.store.runs.values()) {
      this._renderRun(run);
    }

    if (this.draw.isDrafting() && this.draw.livePreviewGeo) {
      this._renderLivePreview();
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
      this._line(this.gFence, a, b, isSelected ? 'fence-line selected' : 'fence-line');

      const lengthMeters = window.FP.geo.roundLength(
        window.FP.geo.distanceMeters(points[i].geographicPosition, points[i + 1].geographicPosition)
      );
      this._dimensionLabel(a, b, lengthMeters);
    }

    for (const p of points) {
      const screen = window.FP.geo.toScreen(p.geographicPosition);
      const isJoint = !!p.jointId;
      this._node(screen, isJoint ? 'node joint' : 'node free-end');
    }
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

  /** DIM-005: метри з одним десятковим знаком. DIM-004: текст ніколи не догори ногами. */
  _dimensionLabel(a, b, lengthMeters, isPreview = false) {
    const midX = (a.x + b.x) / 2;
    const midY = (a.y + b.y) / 2;
    let angleDeg = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
    // DIM-004: розвернути на 180°, якщо інакше текст був би догори ногами
    if (angleDeg > 90 || angleDeg < -90) angleDeg += 180;

    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', midX);
    text.setAttribute('y', midY - 8);
    text.setAttribute('transform', `rotate(${angleDeg} ${midX} ${midY - 8})`);
    text.setAttribute('class', isPreview ? 'dimension-label preview' : 'dimension-label');
    text.textContent = `${lengthMeters.toFixed(1)} m`;
    (isPreview ? this.gPreview : this.gDimensions).appendChild(text);
  }
};
