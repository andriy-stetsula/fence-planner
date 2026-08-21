/**
 * model.js
 * Мінімальна модель даних — Додаток A ТЗ.
 * Стабільні ID (HIS-004): ідентифікатори видаються один раз і ніколи
 * не залежать від позиції елемента в масиві.
 */

let __idCounter = 0;
function nextId(prefix) {
  __idCounter += 1;
  return `${prefix}_${Date.now().toString(36)}_${__idCounter}`;
}

/** @typedef {{ lat: number, lng: number }} GeoPoint */

class Point {
  /**
   * @param {GeoPoint} geographicPosition
   * @param {string} runId
   */
  constructor(geographicPosition, runId) {
    this.id = nextId('pt');
    this.geographicPosition = geographicPosition;
    this.runId = runId;
    /** 'end' | 'corner' */
    this.role = 'end';
    /** id стику, якщо точка з'єднана з іншим прогоном */
    this.jointId = null;
    this.linkedRunId = null;
    this.linkedPointId = null;
    this.gateId = null;
    this.gateSide = null;
    this.objectId = null;
    this.objectAnchor = null;
  }
}

class Run {
  constructor() {
    this.id = nextId('run');
    this.closed = false;
    /** @type {string[]} впорядкований список Point.id */
    this.pointIds = [];
    this.fenceStyle = 'default';
    this.terrainMode = null; // 'raked' | 'stepdown' | null
    this.stepDownCount = 0;
    this.rakeDirection = 'forward';
    /** сторона, на якій зафіксовано активний живий розмір (DIM-001) */
    this.dimensionSide = null;
  }
}

class Joint {
  constructor(memberPointIds) {
    this.jointId = nextId('joint');
    this.memberPointIds = memberPointIds; // [pointId, pointId, ...]
    this.state = 'joined';
    // для простого стику з двох гілок:
    this.referenceBranch = null; // pointId сторони, що лишається опорною
    this.movingBranch = null;
  }
}

/**
 * Gate — ворота/хвіртка, розділи 13 і 14 ТЗ.
 * postAGeo/postBGeo — дві структурні стійки (GAT-001/SLD-003: точна ширина).
 * type: 'swing' | 'sliding'.
 *
 * Для 'swing' (розділ 13):
 * hingeSide: 'A' | 'B' — на якій стійці петлі (стрілки ←/→, 13.3).
 * swingSide: 'left' | 'right' — у який бік від лінії відкривається стулка
 * (стрілки ↑/↓, 13.3). 'right' — за напрямком A->B, стулка повертає праворуч.
 *
 * Для 'sliding' (розділ 14):
 * slideDirection: 'left' | 'right' — у який бік уздовж осі воріт (за межі
 * стійки A чи стійки B) іде полотно у відкритому положенні (SLD-002).
 *
 * attachedRunBeforeId/attachedRunAfterId — прогони по обидва боки проєму,
 * якщо ворота стоять на лінії (13.1); null для standalone-об'єкта.
 * GAT-004: замка немає — стан видно за вирівнюванням з лінією.
 */
class Gate {
  constructor({ type = 'swing', postAGeo, postBGeo, widthM, attachedRunBeforeId = null, attachedRunAfterId = null }) {
    this.id = nextId('gate');
    this.type = type;
    this.postAGeo = postAGeo;
    this.postBGeo = postBGeo;
    this.widthM = widthM;
    this.attachedRunBeforeId = attachedRunBeforeId;
    this.attachedRunAfterId = attachedRunAfterId;
    if (type === 'sliding') {
      this.slideDirection = 'right'; // SLD-002
    } else {
      this.hingeSide = 'A';
      this.swingSide = 'right';
    }
  }
}

/**
 * Post — "Additional post" (розділ 16 ТЗ), стовп, який користувач ставить
 * вручну на лінію або біля стійки воріт. НЕ використовується для END/CORNER
 * (це вже існуючі Point з role 'end'/внутрішній вузол) і НЕ для LINE posts
 * (ті рахуються на льоту з довжини/модуля, PST-001, і в моделі не зберігаються).
 *
 * Прив'язка до лінії зберігається як анкер (anchorPointAId/anchorPointBId + t,
 * параметр 0..1 вздовж сегмента), а не застигла geo-координата — так стовп
 * автоматично слідує за прогоном при його переміщенні (MOV-003).
 * Прив'язка до стійки воріт — attachedGateId/gateSide, статична offset-точка
 * (ворота самі поки не рухаються після створення, як і решта коду).
 */
class Post {
  constructor({ geo = null, attachedRunId = null, anchorPointAId = null, anchorPointBId = null, t = null, attachedGateId = null, gateSide = null }) {
    this.id = nextId('post');
    this.geo = geo; // використовується лише коли пост не прив'язаний до лінії/воріт
    this.attachedRunId = attachedRunId;
    this.anchorPointAId = anchorPointAId;
    this.anchorPointBId = anchorPointBId;
    this.t = t;
    this.attachedGateId = attachedGateId;
    this.gateSide = gateSide;
  }
}

/**
 * Editor state — єдине джерело правди про поточний стан UI.
 * Розділ 4 ТЗ: явний стан, щоб один клік не робив кілька речей одразу.
 */
class EditorState {
  constructor() {
    /** 'select' | 'draw' | 'drawSlidingGate' | 'placeObject' | 'dragging' | 'editNumber' */
    this.mode = 'select';
    this.activeTool = 'select';

    this.selectedRunId = null;
    this.selectedSegmentId = null; // `${pointId}-${nextPointId}`
    this.selectedPointId = null;
    this.selectedObjectId = null;

    this.draftRunId = null; // прогін, що зараз малюється
    this.snapCandidate = null;

    this.dragSession = null; // { targetType, targetId, startScreen, moved }

    /** PST-003: перемикач видимості лише автоматичних LINE posts. */
    this.showAutoPosts = true;
  }
}

/** Глобальне сховище геометрії. У реальному проєкті — окремий store/reducer. */
class DataStore {
  constructor() {
    /** @type {Map<string, Run>} */
    this.runs = new Map();
    /** @type {Map<string, Point>} */
    this.points = new Map();
    /** @type {Map<string, Joint>} */
    this.joints = new Map();
    /** @type {Map<string, Gate>} */
    this.gates = new Map();
    /** @type {Map<string, Post>} розділ 16: Additional posts */
    this.posts = new Map();
  }

  createGate(gateProps) {
    const gate = new Gate(gateProps);
    this.gates.set(gate.id, gate);
    return gate;
  }

  removeGate(gateId) {
    this.gates.delete(gateId);
    // 8.1: пов'язані об'єкти не повинні залишатися з посиланням на неіснуючі ворота
    for (const post of this.posts.values()) {
      if (post.attachedGateId === gateId) {
        post.geo = this.getPostGeo(post);
        post.attachedGateId = null;
        post.gateSide = null;
      }
    }
  }

  createPost(postProps) {
    const post = new Post(postProps);
    this.posts.set(post.id, post);
    return post;
  }

  removePost(postId) {
    this.posts.delete(postId);
  }

  /**
   * Поточна geo-позиція Additional post. Якщо прив'язаний до сегмента —
   * рахується наживо з поточних координат anchor-точок (MOV-003: слідує
   * за прогоном при переміщенні). Інакше — застигла geo.
   */
  getPostGeo(post) {
    if (post.anchorPointAId && post.anchorPointBId) {
      const a = this.points.get(post.anchorPointAId);
      const b = this.points.get(post.anchorPointBId);
      if (a && b) {
        return {
          lat: a.geographicPosition.lat + (b.geographicPosition.lat - a.geographicPosition.lat) * post.t,
          lng: a.geographicPosition.lng + (b.geographicPosition.lng - a.geographicPosition.lng) * post.t,
        };
      }
    }
    return post.geo;
  }

  createRun() {
    const run = new Run();
    this.runs.set(run.id, run);
    return run;
  }

  addPointToRun(runId, geographicPosition) {
    const run = this.runs.get(runId);
    if (!run) throw new Error(`Run ${runId} not found`);
    const point = new Point(geographicPosition, runId);
    this.points.set(point.id, point);
    run.pointIds.push(point.id);
    return point;
  }

  getRunPoints(runId) {
    const run = this.runs.get(runId);
    if (!run) return [];
    return run.pointIds.map((id) => this.points.get(id));
  }

  removeRun(runId) {
    const run = this.runs.get(runId);
    if (!run) return;
    // 8.1: додаткові стовпи, прив'язані до цього прогону, не повинні лишитися
    // з битим runId/anchorPointId — застигаємо їхню останню позицію.
    for (const post of this.posts.values()) {
      if (post.attachedRunId === runId) {
        post.geo = this.getPostGeo(post);
        post.attachedRunId = null;
        post.anchorPointAId = null;
        post.anchorPointBId = null;
        post.t = null;
      }
    }
    for (const pid of run.pointIds) {
      const point = this.points.get(pid);
      if (point) this._cleanupPointJoint(point);
      this.points.delete(pid);
    }
    this.runs.delete(runId);
  }

  /**
   * LOOP-001/002 (розділ 11): замкнути прогін — протилежний вільний кінець
   * "зливається" з тим, який зараз тягнули (draggedPointId), без дублюючої
   * точки. pointIds лишається як цикл: рендер/логіка з'єднують останню
   * точку з першою, коли run.closed === true.
   */
  closeRun(runId, draggedPointId) {
    const run = this.runs.get(runId);
    if (!run) return false;
    if (run.pointIds.length < 3) return false;
    const idx = run.pointIds.indexOf(draggedPointId);
    if (idx !== 0 && idx !== run.pointIds.length - 1) return false;
    run.pointIds.splice(idx, 1);
    this.points.delete(draggedPointId);
    run.closed = true;
    return true;
  }

  /**
   * LOOP-003/004: відкрити замкнений контур у вибраному куті. Вузол
   * роздвоюється на дві незалежні точки в тій самій geo-позиції — нові
   * перший і останній вільні кінці відкритого прогону.
   * @returns {{firstId: string, lastId: string} | null}
   */
  openRunAt(runId, pointId) {
    const run = this.runs.get(runId);
    if (!run || !run.closed) return null;
    const idx = run.pointIds.indexOf(pointId);
    if (idx === -1) return null;

    const rotated = run.pointIds.slice(idx).concat(run.pointIds.slice(0, idx));
    const original = this.points.get(pointId);
    if (!original) return null;

    const duplicate = new Point({ ...original.geographicPosition }, runId);
    this.points.set(duplicate.id, duplicate);

    run.pointIds = rotated.concat([duplicate.id]);
    run.closed = false;
    return { firstId: rotated[0], lastId: duplicate.id };
  }

  /**
   * Видалити один вузол з прогону (SEL-001/8.1 "вибрано вільний вузол").
   * Сусідні сегменти автоматично з'єднуються (просто видаляється точка
   * зі списку, лінія стає прямою між сусідами).
   * Якщо в прогоні залишається < 2 точок — прогін видаляється цілком.
   */
  removePoint(pointId) {
    const point = this.points.get(pointId);
    if (!point) return;
    this._cleanupPointJoint(point);
    const run = this.runs.get(point.runId);
    if (!run) return;
    run.pointIds = run.pointIds.filter((id) => id !== pointId);
    this.points.delete(pointId);
    if (run.pointIds.length < 2 && !run.closed) {
      this.removeRun(run.id);
    }
  }

  /**
   * Розділ 22 "Видалено ціль зв'язку": знімає посилання на видалену точку
   * з іншої сторони Joint-у (endpoint-to-endpoint або T-стик, SNP-004) —
   * партнер лишається вільним кінцем у своїй останній коректній позиції.
   */
  _cleanupPointJoint(point) {
    if (!point.jointId) return;
    const joint = this.joints.get(point.jointId);
    if (joint) {
      for (const pid of joint.memberPointIds) {
        if (pid === point.id) continue;
        const other = this.points.get(pid);
        if (other) {
          other.jointId = null;
          other.linkedRunId = null;
          other.linkedPointId = null;
        }
      }
    }
    this.joints.delete(point.jointId);
  }

  /** Зсунути всі точки прогону на geo-дельту (розділ 12, MOV-001) */
  moveRun(runId, deltaLat, deltaLng) {
    const run = this.runs.get(runId);
    if (!run) return;
    for (const pid of run.pointIds) {
      const p = this.points.get(pid);
      p.geographicPosition = {
        lat: p.geographicPosition.lat + deltaLat,
        lng: p.geographicPosition.lng + deltaLng,
      };
    }
  }

  /** Перемістити один вузол у нову geo-позицію (розділ 8, SEL-003/SEL-004) */
  movePoint(pointId, newGeoPosition) {
    const point = this.points.get(pointId);
    if (!point) return;
    point.geographicPosition = newGeoPosition;
  }

  /** Знімок для Undo/Redo (спрощений — повне клонування, розділ 21) */
  snapshot() {
    return {
      runs: new Map(
        Array.from(this.runs.entries()).map(([k, v]) => [k, { ...v, pointIds: [...v.pointIds] }])
      ),
      points: new Map(
        Array.from(this.points.entries()).map(([k, v]) => [k, { ...v }])
      ),
      joints: new Map(
        Array.from(this.joints.entries()).map(([k, v]) => [k, { ...v, memberPointIds: [...v.memberPointIds] }])
      ),
      gates: new Map(
        Array.from(this.gates.entries()).map(([k, v]) => [k, { ...v }])
      ),
      posts: new Map(
        Array.from(this.posts.entries()).map(([k, v]) => [k, { ...v }])
      ),
    };
  }

  restore(snapshot) {
    this.runs = snapshot.runs;
    this.points = snapshot.points;
    this.joints = snapshot.joints;
    this.gates = snapshot.gates || new Map();
    this.posts = snapshot.posts || new Map();
  }
}

// експорт у глобальний неймспейс (проєкт без бандлера для простоти старту)
window.FP = window.FP || {};
window.FP.model = { Point, Run, Joint, Gate, Post, EditorState, DataStore, nextId };
