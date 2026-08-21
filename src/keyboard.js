window.FP = window.FP || {};

window.FP.bindKeyboard = function bindKeyboard({ sm, draw, history, slidingGate = null, callbacks }) {
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
    if (e.code === 'Escape') {
      const isDrafting =
        (sm.state.activeTool === 'draw' && draw.isDrafting()) ||
        (sm.state.activeTool === 'slidingGate' && !!slidingGate && slidingGate.isDrafting());
      sm.handleEscape({
        closeNumberField: callbacks.closeNumberField,
        isDrafting,
        cancelDraft: () => {
          if (sm.state.activeTool === 'draw') {
            draw.cancelDraft();
          } else if (sm.state.activeTool === 'slidingGate' && slidingGate) {
            slidingGate.cancelDraft();
          }
          callbacks.onGeometryChanged?.();
        },
      });
      return;
    }

    if (typing) return; 

    switch (e.code) {
      case 'KeyV':
        sm.setTool('select');
        callbacks.onToolChanged?.('select');
        break;
      case 'KeyD':
        if (e.metaKey || e.ctrlKey) {
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
      case 'KeyG':
        sm.setTool('gap');
        callbacks.onToolChanged?.('gap');
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
          callbacks.onHistoryChanged?.();
          callbacks.onGeometryChanged?.();
        }
        break;
      case 'KeyY':
        if (e.metaKey || e.ctrlKey) {
          e.preventDefault();
          history.redo();
          callbacks.onHistoryChanged?.();
          callbacks.onGeometryChanged?.();
        }
        break;
      default:
        break;
    }
  });
};
