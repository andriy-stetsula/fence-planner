window.FP = window.FP || {};

window.FP.StateMachine = class StateMachine {
  constructor(editorState) {
    this.state = editorState;
    this.listeners = new Set();
    this.DRAG_THRESHOLD_PX = 5;
  }

  onChange(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  _emit() {
    for (const fn of this.listeners) fn(this.state);
  }

  setTool(tool) {
    this.clearSelection();
    this.state.activeTool = tool;
    switch (tool) {
      case 'select':
        this.state.mode = 'select';
        break;
      case 'draw':
        this.state.mode = 'draw';
        break;
      case 'gap':
        this.state.mode = 'gap';
        break;
      case 'gate':
        this.state.mode = 'gate';
        break;
      case 'slidingGate':
        this.state.mode = 'drawSlidingGate';
        break;
      case 'posts':
        this.state.mode = 'placeObject';
        break;
      case 'shapes':
        this.state.mode = 'placeObject';
        break;
      default:
        this.state.mode = 'select';
    }
    this._emit();
  }

  togglePosts() {
    this.state.showAutoPosts = !this.state.showAutoPosts;
    this._emit();
  }

  clearSelection() {
    this.state.selectedRunId = null;
    this.state.selectedSegmentId = null;
    this.state.selectedPointId = null;
    this.state.selectedObjectId = null;
    this._emit();
  }

  select({ runId = null, segmentId = null, pointId = null, objectId = null }) {
    this.clearSelection();
    this.state.selectedRunId = runId;
    this.state.selectedSegmentId = segmentId;
    this.state.selectedPointId = pointId;
    this.state.selectedObjectId = objectId;
    this._emit();
  }

  hasSelection() {
    const s = this.state;
    return !!(s.selectedRunId || s.selectedSegmentId || s.selectedPointId || s.selectedObjectId);
  }

  enterEditNumber() {
    this.state.mode = 'editNumber';
    document.body.classList.add('mode-editNumber');
    this._emit();
  }

  exitEditNumber() {
    this.state.mode = this.state.activeTool === 'draw' ? 'draw' : 'select';
    document.body.classList.remove('mode-editNumber');
    this._emit();
  }

  startDrag(session) {
    this.state.mode = 'dragging';
    this.state.dragSession = session;
    this._emit();
  }

  endDrag() {
    this.state.dragSession = null;
    this.state.mode = this.state.activeTool === 'draw' ? 'draw' : 'select';
    this._emit();
  }

  handleEscape({ closeNumberField, cancelDraft, isDrafting = false }) {
    if (this.state.mode === 'editNumber') {
      closeNumberField();
      this.exitEditNumber();
      return;
    }
    if (isDrafting) {
      cancelDraft();
      return;
    }
    if (this.hasSelection()) {
      this.clearSelection();
    }
  }
};