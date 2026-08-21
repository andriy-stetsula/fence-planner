window.FP = window.FP || {};

window.FP.History = class History {
  constructor(store) {
    this.store = store;
    this.undoStack = [];
    this.redoStack = [];
    this.pendingSnapshot = null;
  }

  beginAction() {
    this.pendingSnapshot = this.store.snapshot();
  }

  commitAction() {
    if (!this.pendingSnapshot) return;

    this.undoStack.push(this.pendingSnapshot);
    this.redoStack = [];
    this.pendingSnapshot = null;
  }

  cancelAction() {
    this.pendingSnapshot = null;
  }

  undo() {
    if (this.undoStack.length === 0) return;

    const current = this.store.snapshot();
    const prev = this.undoStack.pop();

    this.redoStack.push(current);
    this.store.restore(prev);
  }

  redo() {
    if (this.redoStack.length === 0) return;

    const current = this.store.snapshot();
    const next = this.redoStack.pop();

    this.undoStack.push(current);
    this.store.restore(next);
  }
};