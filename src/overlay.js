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
   * @param {InstanceType<typeof window.FP.SlidingGateController>} [slidingGate]
   * @param {InstanceType<typeof window.FP.PostsController>} [posts]
   * @param {InstanceType<typeof window.FP.ShapesController>} [shapesCtrl] - розділ 17
   */
  constructor(map, svgEl, store, sm, draw, selection = null, slidingGate = null, posts = null, shapesCtrl = null) {
    this.map = map;
    this.svg = svgEl;
    this.store = store;
    this.sm = sm;
    this.draw = draw;
    this.selection = selection;
    this.slidingGate = slidingGate;
    this.posts = posts;
    this.shapesCtrl = shapesCtrl;

    // Шари, у порядку відображення (розділ 19.1: 2 об'єкти ділянки — нижче
    // паркану; 3 паркан+ворота+стовпи, 4 розміри, 5 вузли, 6 preview)
    this.gShapes = this._makeGroup('layer-shapes hit-layer');
    this.gFence = this._makeGroup('layer-fence');
    this.gPosts = this._makeGroup('layer-posts');
    this.gGates = this._makeGroup('layer-gates hit-layer');
    this.gDimensions = this._makeGroup('layer-dimensions');
    this.gNodes = this._makeGroup('layer-nodes hit-layer');
    this.gPreview = this._makeGroup('layer-preview');

    this._initShapeRenderers();

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
    this._clear(this.gShapes);
    this._clear(this.gFence);
    this._clear(this.gPosts);
    this._clear(this.gGates);
    this._clear(this.gDimensions);
    this._clear(this.gNodes);
    this._clear(this.gPreview);

    if (this.shapesCtrl) {
      for (const shape of this.store.shapes.values()) {
        this._renderShape(shape);
      }
    }

    for (const run of this.store.runs.values()) {
      this._renderRun(run);
      if (this.posts) this._renderLinePosts(run);
    }

    if (this.posts) {
      for (const post of this.store.posts.values()) {
        this._renderAdditionalPost(post);
      }
    }

    for (const gate of this.store.gates.values()) {
      if (gate.type === 'sliding') this._renderSlidingGate(gate);
      else this._renderSwingGate(gate);
    }

    if (this.draw.isDrafting() && this.draw.livePreviewGeo) {
      this._renderLivePreview();
    }

    if (this.slidingGate && this.slidingGate.isDrafting() && this.slidingGate.livePreviewGeo) {
      this._renderSlidingGateDraftPreview();
    }

    // SNP-001: під час перетягування вільного кінця — жовтий ореол на найближчій цілі.
    // Для T-стику (segment) ціль — це точка проекції на сегмент, а не існуючий Point.
    if (this.selection && this.selection.session && this.selection.activeSnapCandidate) {
      const candidate = this.selection.activeSnapCandidate;
      if (candidate.kind === 'segment' || candidate.kind === 'object') {
        this._renderSnapHalo(candidate.geo);
      } else {
        const target = this.store.points.get(candidate.pointId);
        if (target) this._renderSnapHalo(target.geographicPosition);
      }
    }
  }

  _clear(g) {
    while (g.firstChild) g.removeChild(g.firstChild);
  }

  _renderRun(run) {
    const points = this.store.getRunPoints(run.id);
    const isSelected = this.sm.state.selectedRunId === run.id;
    // LOOP-001/002: замкнений контур — додатковий сегмент від останньої точки до першої
    const segCount = run.closed ? points.length : points.length - 1;

    for (let i = 0; i < segCount; i += 1) {
      const nextIdx = (i + 1) % points.length;
      const a = window.FP.geo.toScreen(points[i].geographicPosition);
      const b = window.FP.geo.toScreen(points[nextIdx].geographicPosition);
      const lineEl = this._line(this.gFence, a, b, isSelected ? 'fence-line selected' : 'fence-line');
      if (this.selection) this.selection.attachLineHandlers(lineEl, run.id, points[i].id, points[nextIdx].id);

      const lengthMeters = window.FP.geo.roundLength(
        window.FP.geo.distanceMeters(points[i].geographicPosition, points[nextIdx].geographicPosition)
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
   * LINE posts — розділ 16.1/PST-001. Дрібні непретягувані крапки,
   * перераховані наживо з довжини сегмента й модуля. PST-003: приховуються
   * перемикачем Show/Hide posts, не впливаючи на самі вузли лінії.
   */
  _renderLinePosts(run) {
    if (!this.sm.state.showAutoPosts) return;
    const points = this.store.getRunPoints(run.id);
    const positions = this.posts.computeLinePosts(run, points);
    for (const geo of positions) {
      const screen = window.FP.geo.toScreen(geo);
      const el = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      el.setAttribute('x', screen.x - 2.5);
      el.setAttribute('y', screen.y - 2.5);
      el.setAttribute('width', 5);
      el.setAttribute('height', 5);
      el.setAttribute('class', 'post post-line');
      // PST-001: не handle — свідомо без pointer-events і без selection-обробників.
      this.gPosts.appendChild(el);
    }
  }

  /**
   * Additional post — розділ 16.1/розділ 5. Той самий розмір, що й END/CORNER
   * (16.1 таблиця), вибирається і видаляється як звичайний об'єкт (8.1),
   * але не є handle сегмента лінії.
   */
  _renderAdditionalPost(post) {
    const geo = this.posts.getGeo(post);
    if (!geo) return;
    const screen = window.FP.geo.toScreen(geo);
    const isSelected = this.sm.state.selectedObjectId === post.id;
    const el = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    el.setAttribute('x', screen.x - 4);
    el.setAttribute('y', screen.y - 4);
    el.setAttribute('width', 8);
    el.setAttribute('height', 8);
    el.setAttribute('class', isSelected ? 'post post-additional selected' : 'post post-additional');
    this.gPosts.appendChild(el);
    if (this.selection) this.selection.attachObjectHandlers(el, post.id);
  }

  /**
   * Розпашні ворота — розділ 13.2 ТЗ.
   * дві стійки по краях проєму; одна стулка; тонка дуга відкривання;
   * окрема розмірна лінія ширини (GAT-001/DIM-006); підпис не перевертається
   * (DIM-004 діє й тут).
   */
  _renderSwingGate(gate) {
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

  /**
   * Розсувні ворота — розділ 14 ТЗ.
   * SLD-003: дві основні стійки видно завжди. Полотно показане в закритому
   * положенні (лінія між стійками), і пунктирна pocket-zone зі стрілкою —
   * куди воно йде у відкритому положенні (14.1 крок 5, SLD-002).
   */
  _renderSlidingGate(gate) {
    const a = window.FP.geo.toScreen(gate.postAGeo);
    const b = window.FP.geo.toScreen(gate.postBGeo);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dist = Math.hypot(dx, dy) || 1e-6;
    const ux = dx / dist;
    const uy = dy / dist;

    const isSelected = this.sm.state.selectedObjectId === gate.id;
    const pocketStart = gate.slideDirection === 'right' ? b : a;
    const dirSign = gate.slideDirection === 'right' ? 1 : -1;
    const pocketEnd = {
      x: pocketStart.x + ux * dirSign * dist,
      y: pocketStart.y + uy * dirSign * dist,
    };

    const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    group.setAttribute('class', isSelected ? 'gate sliding-gate selected' : 'gate sliding-gate');

    // полотно в закритому положенні — лінія між двома стійками
    const panel = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    panel.setAttribute('x1', a.x);
    panel.setAttribute('y1', a.y);
    panel.setAttribute('x2', b.x);
    panel.setAttribute('y2', b.y);
    panel.setAttribute('class', 'sliding-gate-panel');
    group.appendChild(panel);

    // pocket-zone — пунктирна ділянка, куди йде полотно (SLD-002)
    const pocket = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    pocket.setAttribute('x1', pocketStart.x);
    pocket.setAttribute('y1', pocketStart.y);
    pocket.setAttribute('x2', pocketEnd.x);
    pocket.setAttribute('y2', pocketEnd.y);
    pocket.setAttribute('class', 'sliding-gate-pocket');
    group.appendChild(pocket);

    // стрілка напрямку в кінці pocket-zone
    this._appendArrowhead(group, pocketEnd, ux * dirSign, uy * dirSign);

    // дві стійки (SLD-003)
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

    // SLD-001: одне точне значення, без діапазонів
    this._dimensionLabel(a, b, gate.widthM, false, 'gate-dimension');
  }

  /** Невелика трикутна стрілка в кінці pocket-zone, вздовж напрямку (dirX, dirY) */
  _appendArrowhead(group, tip, dirX, dirY) {
    const size = 7;
    const backX = tip.x - dirX * size;
    const backY = tip.y - dirY * size;
    const perpX = -dirY * (size / 2);
    const perpY = dirX * (size / 2);
    const p1 = `${tip.x},${tip.y}`;
    const p2 = `${backX + perpX},${backY + perpY}`;
    const p3 = `${backX - perpX},${backY - perpY}`;
    const arrow = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    arrow.setAttribute('points', `${p1} ${p2} ${p3}`);
    arrow.setAttribute('class', 'sliding-gate-arrow');
    group.appendChild(arrow);
  }

  /** Живий preview малювання розсувних воріт по двох точках (14.1) */
  _renderSlidingGateDraftPreview() {
    const preview = this.slidingGate.onPointerMove(this.slidingGate.livePreviewGeo);
    if (!preview) return;
    const a = window.FP.geo.toScreen(preview.from);
    const b = window.FP.geo.toScreen(preview.to);
    this._line(this.gPreview, a, b, 'fence-line preview sliding-gate-draft');
    this._dimensionLabel(a, b, preview.lengthMeters, true);
  }

  _renderLivePreview() {
    const preview = this.draw.onPointerMove(this.draw.livePreviewGeo);
    if (!preview) return;
    const a = window.FP.geo.toScreen(preview.from);
    const b = window.FP.geo.toScreen(preview.to);
    this._line(this.gPreview, a, b, 'fence-line preview');
    this._dimensionLabel(a, b, preview.lengthMeters, true);
  }

  /**
   * Розділ 17: об'єкти ділянки — top-view символи, нижче лінії паркану.
   * Реєстр рендерерів по типу, ініціалізується один раз у конструкторі.
   */
  _initShapeRenderers() {
    this._shapeRenderers = {
      house: (group, shape, geo) => {
        const corners = this._shapeRectCorners(geo, shape.widthM, shape.heightM, shape.rotationDeg);
        this._appendPolygon(group, corners, 'shape-body shape-house-body');
        this._appendLine(group, corners[0], corners[2], 'shape-roof-line');
        this._appendLine(group, corners[1], corners[3], 'shape-roof-line');
      },
      pool: (group, shape, geo) => {
        const corners = this._shapeRectCorners(geo, shape.widthM, shape.heightM, shape.rotationDeg);
        this._appendPolygon(group, corners, 'shape-body shape-pool-body');
      },
      arbor: (group, shape, geo) => {
        const corners = this._shapeRectCorners(geo, shape.widthM, shape.heightM, shape.rotationDeg);
        this._appendPolygon(group, corners, 'shape-body shape-arbor-body');
        // хрестова решітка — top-view ознака перголи/арбору
        this._appendLine(group, corners[0], corners[2], 'shape-arbor-lattice');
        this._appendLine(group, corners[1], corners[3], 'shape-arbor-lattice');
      },
      tree: (group, shape, geo, center) => {
        const edgeGeo = window.FP.geo.fromLocalXY(geo, { x: shape.widthM / 2, y: 0 });
        const radiusPx = Math.max(6, window.FP.geo.distanceScreenPx(geo, edgeGeo));
        const canopy = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        canopy.setAttribute('cx', center.x);
        canopy.setAttribute('cy', center.y);
        canopy.setAttribute('r', radiusPx);
        canopy.setAttribute('class', 'shape-body shape-tree-canopy');
        group.appendChild(canopy);
        const trunk = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        trunk.setAttribute('cx', center.x);
        trunk.setAttribute('cy', center.y);
        trunk.setAttribute('r', 2.5);
        trunk.setAttribute('class', 'shape-tree-trunk');
        group.appendChild(trunk);
      },
      mailbox: (group, shape, geo, center) => {
        const el = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        el.setAttribute('x', center.x - 5);
        el.setAttribute('y', center.y - 5);
        el.setAttribute('width', 10);
        el.setAttribute('height', 10);
        el.setAttribute('class', 'shape-body shape-mailbox-body');
        group.appendChild(el);
        // маленький "прапорець" конверта — top-view ознака поштової скриньки
        const flag = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
        flag.setAttribute(
          'points',
          `${center.x - 5},${center.y - 5} ${center.x},${center.y - 10} ${center.x + 5},${center.y - 5}`
        );
        flag.setAttribute('class', 'shape-mailbox-flag');
        group.appendChild(flag);
      },
      parcelPillar: (group, shape, geo, center) => {
        const el = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        el.setAttribute('x', center.x - 4);
        el.setAttribute('y', center.y - 4);
        el.setAttribute('width', 8);
        el.setAttribute('height', 8);
        el.setAttribute('class', 'shape-body shape-parcel-pillar-body');
        group.appendChild(el);
      },
    };
  }

  /** 4 екранні кути прямокутника widthM x heightM з центром у geo, обернені на rotationDeg */
  _shapeRectCorners(geo, widthM, heightM, rotationDeg) {
    const hw = widthM / 2;
    const hh = heightM / 2;
    const localCorners = [
      { x: -hw, y: -hh },
      { x: hw, y: -hh },
      { x: hw, y: hh },
      { x: -hw, y: hh },
    ];
    return localCorners.map((c) => {
      const rotated = window.FP.geo.rotateXY(c, rotationDeg || 0);
      const cornerGeo = window.FP.geo.fromLocalXY(geo, rotated);
      return window.FP.geo.toScreen(cornerGeo);
    });
  }

  _appendPolygon(group, screenCorners, className) {
    const el = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    el.setAttribute('points', screenCorners.map((c) => `${c.x},${c.y}`).join(' '));
    el.setAttribute('class', className);
    group.appendChild(el);
    return el;
  }

  _appendLine(group, a, b, className) {
    const el = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    el.setAttribute('x1', a.x);
    el.setAttribute('y1', a.y);
    el.setAttribute('x2', b.x);
    el.setAttribute('y2', b.y);
    el.setAttribute('class', className);
    group.appendChild(el);
    return el;
  }

  /** Один об'єкт ділянки (розділ 17) — вибирає рендерер за типом, OBJ-002/OBJ-003 */
  _renderShape(shape) {
    const geo = this.shapesCtrl.getGeo(shape);
    if (!geo) return;
    const isSelected = this.sm.state.selectedObjectId === shape.id;
    const center = window.FP.geo.toScreen(geo);

    const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    group.setAttribute('class', `shape shape-${shape.type}${isSelected ? ' selected' : ''}`);

    const renderer = this._shapeRenderers[shape.type];
    if (renderer) renderer(group, shape, geo, center);

    this.gShapes.appendChild(group);
    if (this.selection) this.selection.attachShapeHandlers(group, shape.id);
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
