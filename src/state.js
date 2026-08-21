/**
 * state.js
 * State machine редактора — розділ 4 ТЗ.
 *
 * Явний поточний режим запобігає ситуації, коли один клік одночасно
 * вибирає об'єкт, додає точку і рухає карту.
 *
 * Режими (EditorState.mode): 'select' | 'draw' | 'drawSlidingGate' |
 * 'placeObject' | 'dragging' | 'editNumber'
 *
 * PTR-001: клік перетворюється на drag лише після невеликого руху
 * вказівника (поріг 4-7 px).
 * PTR-003: коли не малюємо і не тягнемо — панорамування/zoom Google Maps
 * має працювати штатно (тобто ми НЕ ставимо hit-layer поверх усієї карти
 * в режимі select без вибраного елемента).
 */

window.FP = window.FP || {};

window.FP.StateMachine = class StateMachine {
  /**
   * @param {InstanceType<typeof window.FP.model.EditorState>} editorState
   */
  constructor(editorState) {
    this.state = editorState;
    this.listeners = new Set();
    this.DRAG_THRESHOLD_PX = 5; // PTR-001: рекомендовано 4-7px
  }

  onChange(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  _emit() {
    for (const fn of this.listeners) fn(this.state);
  }

  setTool(tool) {
    // Перемикання інструмента завжди повертає в базовий режим для цього інструмента
    // і скидає незавершені чернетки/вибір, щоб не змішувати стани.
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
      default:
        this.state.mode = 'select';
    }
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
    // GEN-003 / SEL-005: одночасно вибраний лише один елемент.
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
    this._emit();
  }

  exitEditNumber() {
    // повертаємось у режим, що відповідає активному інструменту
    this.state.mode = this.state.activeTool === 'draw' ? 'draw' : 'select';
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

  /**
   * Esc: розділ 22, "Користувач натиснув Esc" —
   * спочатку закрити числове поле/чернетку, потім зняти вибір;
   * не видаляти готову геометрію без Undo/Delete.
   */
  handleEscape({ closeNumberField, cancelDraft }) {
    if (this.state.mode === 'editNumber') {
      closeNumberField();
      this.exitEditNumber();
      return;
    }
    if (this.state.mode === 'draw' && this.state.draftRunId) {
      cancelDraft();
      return;
    }
    if (this.hasSelection()) {
      this.clearSelection();
    }
  }
};
