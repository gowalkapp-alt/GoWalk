import { state, saveState } from '../state.js';
import { switchMapLayer } from '../map.js';

export function setupCustomMapStylePicker() {
  const selectEl = document.getElementById('settingMapStyle');
  if (!selectEl) return;

  const styleMeta = {
    dark: { title: 'Tume (Pro Dark)', sub: 'Sügav tume kaart neoon-trajektooriga', icon: 'moon' },
    light: { title: 'Hele (Tavaline)', sub: 'Klassikaline hele tänavakaart', icon: 'sun' },
    hybrid: { title: 'Hübriid (Satelliit)', sub: 'Aerofoto koos tänavanimedega', icon: 'layers' },
    terrain: { title: 'Maastik (Reljeef)', sub: 'Kõrgusjooned ja loodusrajad', icon: 'mountain' }
  };

  function getMetaForVal(val) {
    if (styleMeta[val]) return styleMeta[val];
    const v = String(val || '').toLowerCase();
    if (v.indexOf('light') !== -1 || v.indexOf('hele') !== -1) return styleMeta.light;
    if (v.indexOf('hyb') !== -1 || v.indexOf('sat') !== -1) return styleMeta.hybrid;
    if (v.indexOf('terr') !== -1 || v.indexOf('rel') !== -1 || v.indexOf('maas') !== -1) return styleMeta.terrain;
    return styleMeta.dark;
  }

  let trigBtn = document.getElementById('gwCustomMapSelectBtn');
  if (!trigBtn) {
    trigBtn = document.createElement('button');
    trigBtn.type = 'button';
    trigBtn.id = 'gwCustomMapSelectBtn';
    trigBtn.className = 'gw-map-select-trigger';
    selectEl.parentNode.insertBefore(trigBtn, selectEl.nextSibling);
  }

  function updateTriggerLabel() {
    const curVal = selectEl.value || state.settings.mapLayer || 'dark';
    const m = getMetaForVal(curVal);
    trigBtn.innerHTML =
      '<i data-lucide="' + m.icon + '"></i>' +
      '<span>' + m.title + '</span>' +
      '<i data-lucide="chevron-down" style="width:15px;height:15px;color:#94a3b8;margin-left:2px;"></i>';
    if (window.lucide) window.lucide.createIcons();
  }

  updateTriggerLabel();

  if (!document.getElementById('gwMapStyleOverlay')) {
    const ov = document.createElement('div');
    ov.id = 'gwMapStyleOverlay';
    ov.className = 'gw-calc-overlay';

    let optsHtml = '';
    const opts =
      selectEl.options && selectEl.options.length > 0
        ? Array.from(selectEl.options).map(function (o) {
            return o.value;
          })
        : ['dark', 'light', 'hybrid', 'terrain'];

    for (let i = 0; i < opts.length; i++) {
      const val = opts[i];
      const m = getMetaForVal(val);
      optsHtml +=
        '<button type="button" class="gw-mstyle-opt" data-mval="' + val + '">' +
        '<div class="gw-mstyle-ico"><i data-lucide="' + m.icon + '"></i></div>' +
        '<div class="gw-mstyle-text">' +
        '<div class="gw-mstyle-title">' + m.title + '</div>' +
        '<div class="gw-mstyle-sub">' + m.sub + '</div>' +
        '</div>' +
        '<div class="gw-mstyle-radio"></div>' +
        '</button>';
    }

    ov.innerHTML = [
      '<div class="gw-calc-card">',
        '<div class="gw-calc-head">',
          '<span class="gw-calc-title"><i data-lucide="map" style="color:#ec4899;"></i> Vaikimisi kaardistiil</span>',
          '<button type="button" class="gw-calc-close" id="gwMapStyleCloseBtn"><i data-lucide="x"></i></button>',
        '</div>',
        '<div class="gw-mstyle-list" id="gwMapStyleOptionList">' + optsHtml + '</div>',
      '</div>'
    ].join('');
    document.body.appendChild(ov);

    ov.addEventListener('click', function (e) {
      if (e.target === ov || e.target.closest('#gwMapStyleCloseBtn')) {
        ov.classList.remove('open');
        return;
      }
      const optBtn = e.target.closest('.gw-mstyle-opt');
      if (optBtn) {
        const chosen = optBtn.getAttribute('data-mval') || 'dark';
        selectEl.value = chosen;
        state.settings.mapLayer = chosen;
        saveState();
        switchMapLayer(chosen);
        updateTriggerLabel();
        ov.classList.remove('open');
      }
    });
  }

  trigBtn.onclick = function () {
    const ov = document.getElementById('gwMapStyleOverlay');
    if (!ov) return;
    const curVal = selectEl.value || state.settings.mapLayer || 'dark';
    const allOpts = ov.querySelectorAll('.gw-mstyle-opt');
    for (let i = 0; i < allOpts.length; i++) {
      allOpts[i].classList.toggle('active', allOpts[i].getAttribute('data-mval') === curVal);
    }
    ov.classList.add('open');
    if (window.lucide) window.lucide.createIcons();
  };
}
