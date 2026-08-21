let __idCounter = 0;
function nextId(prefix) {
  __idCounter += 1;
  return `${prefix}_${Date.now().toString(36)}_${__idCounter}`;
}

class Point {
  constructor(geographicPosition, runId) {
    this.id = nextId('pt');
    this.geographicPosition = geographicPosition;
    this.runId = runId;
    this.role = 'end';
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
    this.pointIds = [];
    this.fenceStyle = 'default';
    this.terrainMode = null;
    this.stepDownCount = 0;
    this.rakeDirection = 'forward';
    this.dimensionSide = null;
  }
}

class Joint {
  constructor(memberPointIds) {
    this.jointId = nextId('joint');
    this.memberPointIds = memberPointIds;
    this.state = 'joined';
    this.referenceBranch = null;
    this.movingBranch = null;
  }
}

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
      this.slideDirection = 'right';
    } else {
      this.hingeSide = 'A';
      this.swingSide = 'right';
    }
  }
}

class Post {
  constructor({ geo = null, attachedRunId = null, anchorPointAId = null, anchorPointBId = null, t = null, attachedGateId = null, gateSide = null }) {
    this.id = nextId('post');
    this.geo = geo;
    this.attachedRunId = attachedRunId;
    this.anchorPointAId = anchorPointAId;
    this.anchorPointBId = anchorPointBId;
    this.t = t;
    this.attachedGateId = attachedGateId;
    this.gateSide = gateSide;
  }
}

class Shape {
  constructor({
    type,
    geo = null,
    widthM,
    heightM,
    rotationDeg = 0,
    anchorRunId = null,
    anchorPointAId = null,
    anchorPointBId = null,
    t = null,
  }) {
    this.id = nextId('shape');
    this.type = type;
    this.geo = geo;
    this.widthM = widthM;
    this.heightM = heightM;
    this.rotationDeg = rotationDeg;
    this.anchorRunId = anchorRunId;
    this.anchorPointAId = anchorPointAId;
    this.anchorPointBId = anchorPointBId;
    this.t = t;
  }
}

class EditorState {
  constructor() {
    this.mode = 'select';
    this.activeTool = 'select';

    this.selectedRunId = null;
    this.selectedSegmentId = null;
    this.selectedPointId = null;
    this.selectedObjectId = null;

    this.draftRunId = null;
    this.snapCandidate = null;

    this.dragSession = null;

    this.showAutoPosts = true;
  }
}

class DataStore {
  constructor() {
    this.runs = new Map();
    this.points = new Map();
    this.joints = new Map();
    this.gates = new Map();
    this.posts = new Map();
    this.shapes = new Map();
  }

  createGate(gateProps) {
    const gate = new Gate(gateProps);
    this.gates.set(gate.id, gate);
    return gate;
  }

  removeGate(gateId) {
    this.gates.delete(gateId);
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

  createShape(shapeProps) {
    const shape = new Shape(shapeProps);
    this.shapes.set(shape.id, shape);
    return shape;
  }

  removeShape(shapeId) {
    this.shapes.delete(shapeId);
  }

  getShapeGeo(shape) {
    if (shape.anchorPointAId && shape.anchorPointBId) {
      const a = this.points.get(shape.anchorPointAId);
      const b = this.points.get(shape.anchorPointBId);
      if (a && b) {
        return {
          lat: a.geographicPosition.lat + (b.geographicPosition.lat - a.geographicPosition.lat) * shape.t,
          lng: a.geographicPosition.lng + (b.geographicPosition.lng - a.geographicPosition.lng) * shape.t,
        };
      }
    }
    return shape.geo;
  }

  detachShape(shapeId) {
    const shape = this.shapes.get(shapeId);
    if (!shape) return;
    if (shape.anchorPointAId && shape.anchorPointBId) {
      shape.geo = this.getShapeGeo(shape);
      shape.anchorRunId = null;
      shape.anchorPointAId = null;
      shape.anchorPointBId = null;
      shape.t = null;
    }
  }

  moveShape(shapeId, newGeo) {
    const shape = this.shapes.get(shapeId);
    if (!shape) return;
    this.detachShape(shapeId);
    shape.geo = newGeo;
  }

  resizeShape(shapeId, widthM, heightM) {
    const shape = this.shapes.get(shapeId);
    if (!shape) return;
    if (widthM > 0) shape.widthM = widthM;
    if (heightM > 0) shape.heightM = heightM;
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
    for (const post of this.posts.values()) {
      if (post.attachedRunId === runId) {
        post.geo = this.getPostGeo(post);
        post.attachedRunId = null;
        post.anchorPointAId = null;
        post.anchorPointBId = null;
        post.t = null;
      }
    }
    for (const shape of this.shapes.values()) {
      if (shape.anchorRunId === runId) {
        shape.geo = this.getShapeGeo(shape);
        shape.anchorRunId = null;
        shape.anchorPointAId = null;
        shape.anchorPointBId = null;
        shape.t = null;
      }
    }
    for (const pid of run.pointIds) {
      const point = this.points.get(pid);
      if (point) this._cleanupPointJoint(point);
      this.points.delete(pid);
    }
    this.runs.delete(runId);
  }

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

  movePoint(pointId, newGeoPosition) {
    const point = this.points.get(pointId);
    if (!point) return;
    point.geographicPosition = newGeoPosition;
  }

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
      shapes: new Map(
        Array.from(this.shapes.entries()).map(([k, v]) => [k, { ...v }])
      ),
    };
  }

  restore(snapshot) {
    this.runs = snapshot.runs;
    this.points = snapshot.points;
    this.joints = snapshot.joints;
    this.gates = snapshot.gates || new Map();
    this.posts = snapshot.posts || new Map();
    this.shapes = snapshot.shapes || new Map();
  }
}

window.FP = window.FP || {};
window.FP.model = { Point, Run, Joint, Gate, Post, Shape, EditorState, DataStore, nextId };