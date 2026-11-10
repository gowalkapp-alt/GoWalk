import { map } from '../map.js';

// ==========================================================================
// VAIKNE TÄPPIS-GPS MOOTOR (VARIANT A: VAIKNE AVAMINE + TÄPP KAPSLIS)
// ==========================================================================

export function setupPrecisionGpsLocator() {
  if (!navigator.geolocation) return;

  const origGetCurrentPosition = navigator.geolocation.getCurrentPosition.bind(navigator.geolocation);
  const origWatchPosition = navigator.geolocation.watchPosition.bind(navigator.geolocation);
  const origClearWatch = navigator.geolocation.clearWatch.bind(navigator.geolocation);

  let activeRefineWatchId = null;
  let activeRefineTimer = null;
  let toastHideTimer = null;
  let dotResetTimer = null;
  let lastManualGpsClickMs = 0;

  function setBrandDotGpsState(mode) {
    const dot = document.querySelector('.brand-dot');
    if (!dot) return;
    if (dotResetTimer) clearTimeout(dotResetTimer);
    dot.classList.remove('gps-searching', 'gps-locked');

    if (mode === 'searching') {
      dot.classList.add('gps-searching');
    } else if (mode === 'locked') {
      dot.classList.add('gps-locked');
      dotResetTimer = setTimeout(function () {
        dot.classList.remove('gps-locked');
      }, 4000);
    }
  }

  function getGpsToast() {
    let t = document.getElementById('gwGpsStatusToast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'gwGpsStatusToast';
      t.className = 'gw-gps-toast';
      t.innerHTML = '<span class="gw-gps-dot"></span><span id="gwGpsToastText">GPS...</span>';
      document.body.appendChild(t);
    }
    return t;
  }

  function showGpsToast(msg, isLocked) {
    const t = getGpsToast();
    const txt = document.getElementById('gwGpsToastText');
    if (txt) txt.textContent = msg;
    t.classList.toggle('locked', Boolean(isLocked));
    t.classList.add('visible');
    if (toastHideTimer) clearTimeout(toastHideTimer);
    if (isLocked) {
      toastHideTimer = setTimeout(function () {
        t.classList.remove('visible');
      }, 1500);
    }
  }

  function hideGpsToastImmediately() {
    const t = document.getElementById('gwGpsStatusToast');
    if (t) t.classList.remove('visible');
  }

  function findLocateButton() {
    const byId =
      document.getElementById('locateBtn') ||
      document.getElementById('locateMeBtn') ||
      document.getElementById('gpsBtn') ||
      document.getElementById('centerMapBtn');
    if (byId) return byId;

    const iconEl = document.querySelector(
      '[data-lucide="crosshair"], [data-lucide="locate"], [data-lucide="locate-fixed"], svg.lucide-crosshair, svg.lucide-locate, svg.lucide-locate-fixed'
    );
    if (iconEl) return iconEl.closest('button');
    return null;
  }

  function setGpsButtonAnimating(active) {
    const btn = findLocateButton();
    if (!btn) return;
    btn.classList.toggle('gw-gps-searching', Boolean(active));
  }

  function movePinAMarkerOnMap(lat, lng) {
    if (!window.L || !map || !map._layers) return;
    const latlng = L.latLng(lat, lng);
    const layerIds = Object.keys(map._layers);

    for (let i = 0; i < layerIds.length; i++) {
      const lyr = map._layers[layerIds[i]];
      if (lyr && typeof lyr.setLatLng === 'function' && lyr.options && lyr.options.icon) {
        const htmlStr = String((lyr.options.icon.options && lyr.options.icon.options.html) || '');
        const isDraggable = Boolean(lyr.options.draggable || (lyr.dragging && lyr.dragging._enabled));
        if (isDraggable || htmlStr.indexOf('>A<') !== -1 || htmlStr.indexOf('pin-a') !== -1) {
          lyr.setLatLng(latlng);
          if (typeof lyr.fire === 'function') {
            lyr.fire('dragend');
          }
          break;
        }
      }
    }
  }

  function saveLastPreciseFix(pos) {
    try {
      localStorage.setItem(
        'gowalk_last_precise_gps',
        JSON.stringify({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          acc: pos.coords.accuracy,
          ts: Date.now()
        })
      );
    } catch (e) {}
  }

  function stopActiveRefinement(isLocked = false) {
    if (activeRefineWatchId !== null) {
      origClearWatch(activeRefineWatchId);
      activeRefineWatchId = null;
    }
    if (activeRefineTimer) {
      clearTimeout(activeRefineTimer);
      activeRefineTimer = null;
    }
    setGpsButtonAnimating(false);
    setBrandDotGpsState(isLocked ? 'locked' : 'idle');
  }

  function runHighPrecisionLocationLock(successCallback, errorCallback, showVisualFeedback = false) {
    stopActiveRefinement(false);
    setBrandDotGpsState('searching');

    if (showVisualFeedback) {
      setGpsButtonAnimating(true);
      showGpsToast('GPS otsing...', false);
    } else {
      hideGpsToastImmediately();
    }

    let bestPos = null;
    let bestAccuracy = Infinity;

    activeRefineWatchId = origWatchPosition(
      function (pos) {
        const acc = typeof pos.coords.accuracy === 'number' ? pos.coords.accuracy : 999;

        if (!bestPos) {
          if (typeof successCallback === 'function') successCallback(pos);
          movePinAMarkerOnMap(pos.coords.latitude, pos.coords.longitude);
          if (map) {
            map.setView([pos.coords.latitude, pos.coords.longitude], Math.max(map.getZoom(), 15), {
              animate: true
            });
          }
        }

        if (acc < bestAccuracy) {
          bestAccuracy = acc;
          bestPos = pos;

          if (typeof successCallback === 'function') {
            successCallback(pos);
          }
          movePinAMarkerOnMap(pos.coords.latitude, pos.coords.longitude);
          if (map) {
            map.setView([pos.coords.latitude, pos.coords.longitude], Math.max(map.getZoom(), 16), {
              animate: true
            });
          }

          if (acc <= 65) {
            saveLastPreciseFix(pos);
          }

          if (acc <= 18) {
            stopActiveRefinement(true);
            if (showVisualFeedback) {
              showGpsToast('GPS ±' + Math.round(acc) + ' m ✓', true);
            }
          } else if (showVisualFeedback) {
            showGpsToast('GPS ±' + Math.round(acc) + ' m', false);
          }
        }
      },
      function (err) {
        if (!bestPos && typeof errorCallback === 'function') {
          errorCallback(err);
        }
      },
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 10000
      }
    );

    activeRefineTimer = setTimeout(function () {
      if (bestPos) {
        if (typeof successCallback === 'function') {
          successCallback(bestPos);
        }
        movePinAMarkerOnMap(bestPos.coords.latitude, bestPos.coords.longitude);
        if (map) {
          map.setView([bestPos.coords.latitude, bestPos.coords.longitude], Math.max(map.getZoom(), 16), {
            animate: true
          });
        }
        stopActiveRefinement(true);
        if (showVisualFeedback) {
          showGpsToast('GPS ±' + Math.round(bestAccuracy) + ' m ✓', true);
        }
      } else {
        origGetCurrentPosition(
          function (fallbackPos) {
            if (typeof successCallback === 'function') successCallback(fallbackPos);
            movePinAMarkerOnMap(fallbackPos.coords.latitude, fallbackPos.coords.longitude);
            stopActiveRefinement(true);
            if (showVisualFeedback) {
              showGpsToast('GPS lukustatud ✓', true);
            }
          },
          function (err) {
            stopActiveRefinement(false);
            if (showVisualFeedback) {
              showGpsToast('GPS pole saadaval', true);
            }
            if (typeof errorCallback === 'function') errorCallback(err);
          },
          { enableHighAccuracy: true, maximumAge: 0, timeout: 8000 }
        );
      }
    }, 6000);
  }

  navigator.geolocation.getCurrentPosition = function (success, error) {
    const isManualClick = Date.now() - lastManualGpsClickMs < 1200;
    runHighPrecisionLocationLock(success, error, isManualClick);
  };

  document.addEventListener(
    'click',
    function (e) {
      const locateBtn = findLocateButton();
      if (locateBtn && locateBtn.contains(e.target)) {
        lastManualGpsClickMs = Date.now();
      }
    },
    true
  );
}
