/**
 * history.js
 * Undo/Redo — розділ 21.
 * HIS-001: одна завершена дія (один drag від pointerdown до pointerup,
 * одне з'єднання, одне введення довжини...) = один крок історії.
 * HIS-002: знімок робиться перед підтвердженою зміною, не на кожен pointermove.
 */

window.FP = window.FP || {};

window.FP.History = class History {
  /** @param {InstanceType<typeof window.FP.model.DataStore>} store */
  constructor(store) {
    this.store = store;
    this.undoStack = [];
    this.redoStack = [];
    this.pendingSnapshot = null; // знімок "до" початку поточної дії
  }

  /** Викликати перед початком дії, яку користувач ще може довести до кінця або скасувати */
  beginAction() {
    this.pendingSnapshot = this.store.snapshot();
  }

  /** Викликати, коли дія підтверджена (pointerup, Enter, тощо) */
  commitAction() {
    if (!this.pendingSnapshot) return;
    this.undoStack.push(this.pendingSnapshot);
    this.redoStack = []; // нова дія обнуляє redo
    this.pendingSnapshot = null;
  }

  /** Викликати, якщо дію скасовано (Esc) до завершення — знімок просто відкидається */
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
