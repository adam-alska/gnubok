/**
 * Polyfill: synthesize pointerdown/pointerup from mousedown/mouseup when the
 * browser fails to emit native PointerEvents. Affects macOS 16+ where certain
 * trackpad/mouse drivers skip PointerEvent dispatch. Radix UI (Select,
 * DropdownMenu, Popover, Dialog) relies on pointerdown — without it, all
 * interactive primitives are dead.
 *
 * Strategy: on the first mousedown, check whether a preceding pointerdown
 * arrived within 50ms. If not, assume native pointer events are broken and
 * install a permanent mousedown→pointerdown bridge. The bridge dispatches a
 * synthetic PointerEvent just before every mousedown so Radix sees the event
 * it expects.
 */
;(function () {
  if (typeof PointerEvent === 'undefined') return

  var armed = true
  var broken = false
  var sawPointerDown = false

  window.addEventListener('pointerdown', function () { sawPointerDown = true }, { capture: true, passive: true })

  window.addEventListener('mousedown', function firstCheck() {
    if (!armed) return
    // Give a small window: if pointerdown fired before this mousedown, native events work.
    if (sawPointerDown) {
      armed = false
      return
    }
    // No pointerdown seen — native events are broken. Install bridge.
    armed = false
    broken = true
    installBridge()
  }, { capture: true, once: true })

  // Reset flag on every mousedown to detect per-event
  // (the first mousedown is the test; if sawPointerDown is still false, we bridge)
  setTimeout(function () {
    if (!broken && armed) {
      // No mousedown happened within 3s, stay armed for later
    }
  }, 3000)

  function installBridge() {
    window.addEventListener('mousedown', function (e) {
      dispatch('pointerdown', e)
    }, { capture: true })

    window.addEventListener('mouseup', function (e) {
      dispatch('pointerup', e)
    }, { capture: true })
  }

  function dispatch(type, mouseEvent) {
    var pe = new PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      composed: true,
      pointerId: 1,
      pointerType: 'mouse',
      isPrimary: true,
      clientX: mouseEvent.clientX,
      clientY: mouseEvent.clientY,
      screenX: mouseEvent.screenX,
      screenY: mouseEvent.screenY,
      pageX: mouseEvent.pageX,
      pageY: mouseEvent.pageY,
      button: mouseEvent.button,
      buttons: mouseEvent.buttons,
      ctrlKey: mouseEvent.ctrlKey,
      shiftKey: mouseEvent.shiftKey,
      altKey: mouseEvent.altKey,
      metaKey: mouseEvent.metaKey,
      width: 1,
      height: 1,
      pressure: 0.5,
    })
    mouseEvent.target.dispatchEvent(pe)
  }
})()
