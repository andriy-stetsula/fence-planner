/**
 * keyboard.js
 * Гарячі клавіші — розділ 20 ТЗ.
 *
 * KEY-001: використовуємо KeyboardEvent.code (фізичний код клавіші),
 * а не .key, щоб D/V/N/P/L працювали і в кириличній розкладці.
 * KEY-002: якщо фокус в input/textarea/select/contenteditable — буквені
 * shortcuts не спрацьовують; Enter/Esc обробляються самим полем.
 */

window.FP = window.FP || {};

window.FP.bindKeyboard = function bindKeyboard({ sm, draw, history, callbacks }) {
  function isTypingTarget(el) {
    if (!el) return false;
    const tag = el.tagName;
    return (
      tag === 'INPUT' ||
      tag === 'TEXTAREA' ||
      tag === 'SELECT' ||
      el.isContentEditable
    );
  }

  window.addEventListener('keydown', (e) => {
    const typing = isTypingTarget(document.activeElement);

    // Enter / Esc можуть знадобитись і під час введення числа (сама модалка
    // це обробляє окремо через свій slot listener) — тут лише глобальна логіка,
    // коли фокус НЕ в полі.
    if (e.code === 'Escape') {
      sm.handleEscape({
        closeNumberField: callbacks.closeNumberField,
        cancelDraft: () => {
          draw.cancelDraft();
          callbacks.onGeometryChanged?.();
        },
      });
      return;
    }

    if (typing) return; // KEY-002

    switch (e.code) {
      case 'KeyV':
        sm.setTool('select');
        callbacks.onToolChanged?.('select');
        break;
      case 'KeyD':
        if (e.metaKey || e.ctrlKey) {
          // Ctrl/Cmd+D — Duplicate selected object, а не перемикання інструмента
          e.preventDefault();
          callbacks.onDuplicate?.();
        } else {
          sm.setTool('draw');
          callbacks.onToolChanged?.('draw');
        }
        break;
      case 'KeyN':
        draw.startNewRun();
        callbacks.onGeometryChanged?.();
        break;
      case 'Enter':
        if (sm.state.mode === 'draw') {
          draw.finishRun();
          callbacks.onGeometryChanged?.();
        }
        break;
      case 'KeyP':
        callbacks.togglePosts?.();
        break;
      case 'KeyL':
        callbacks.toggleJointLock?.();
        break;
      case 'Delete':
      case 'Backspace':
        callbacks.onDelete?.();
        break;
      case 'KeyZ':
        if (e.metaKey || e.ctrlKey) {
          e.preventDefault();
          if (e.shiftKey) {
            history.redo();
          } else {
            history.undo();
          }
          callbacks.onGeometryChanged?.();
        }
        break;
      case 'KeyY':
        if (e.metaKey || e.ctrlKey) {
          e.preventDefault();
          history.redo();
          callbacks.onGeometryChanged?.();
        }
        break;
      default:
        break;
    }
  });
};
