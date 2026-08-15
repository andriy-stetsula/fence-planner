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
    for (const pid of run.pointIds) this.points.delete(pid);
    this.runs.delete(runId);
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
    };
  }

  restore(snapshot) {
    this.runs = snapshot.runs;
    this.points = snapshot.points;
    this.joints = snapshot.joints;
  }
}

// експорт у глобальний неймспейс (проєкт без бандлера для простоти старту)
window.FP = window.FP || {};
window.FP.model = { Point, Run, Joint, EditorState, DataStore, nextId };
