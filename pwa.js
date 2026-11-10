export function createPngGradient(c1, c2, c3) {
  try {
    const cv = document.createElement('canvas');
    cv.width = 320;
    cv.height = 80;
    const ctx = cv.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, cv.width, 0);
    g.addColorStop(0, c1);
    g.addColorStop(0.52, c2);
    g.addColorStop(1, c3);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, cv.width, cv.height);
    return cv.toDataURL('image/png');
  } catch (e) {
    return '';
  }
}

let deferredPwaPrompt = null;
window.addEventListener('beforeinstallprompt', function (e) {
  e.preventDefault();
  deferredPwaPrompt = e;
});

export function setupFaviconAndPWA() {
  const primaryIcon = 'favicon.jpg';
  const secondaryIcon = 'favicon.png';
  const fallbackGitHubIcon = 'file_000000003a8c820abfebb762ae22beff.png';
  const fullAppUrl = new URL('./', window.location.href).href;

  function applyIconLinks(hrefUrl) {
    const resolvedIconUrl = new URL(hrefUrl, window.location.href).href;
    const imgType = hrefUrl.endsWith('.jpg') || hrefUrl.endsWith('.jpeg') ? 'image/jpeg' : 'image/png';

    let iconLink = document.querySelector('link[rel="icon"]');
    if (!iconLink) {
      iconLink = document.createElement('link');
      iconLink.rel = 'icon';
      document.head.appendChild(iconLink);
    }
    iconLink.type = imgType;
    iconLink.href = resolvedIconUrl;

    let appleLink = document.querySelector('link[rel="apple-touch-icon"]');
    if (!appleLink) {
      appleLink = document.createElement('link');
      appleLink.rel = 'apple-touch-icon';
      document.head.appendChild(appleLink);
    }
    appleLink.href = resolvedIconUrl;

    const manifestObj = {
      name: 'GoWalk Pro',
      short_name: 'GoWalk',
      start_url: fullAppUrl,
      scope: fullAppUrl,
      display: 'standalone',
      background_color: '#0f1429',
      theme_color: '#0f1429',
      icons: [
        {
          src: resolvedIconUrl,
          sizes: '512x512',
          type: imgType,
          purpose: 'any maskable'
        }
      ]
    };
    const blob = new Blob([JSON.stringify(manifestObj)], { type: 'application/json' });
    let manLink = document.querySelector('link[rel="manifest"]');
    if (!manLink) {
      manLink = document.createElement('link');
      manLink.rel = 'manifest';
      document.head.appendChild(manLink);
    }
    manLink.href = URL.createObjectURL(blob);
  }

  const testImg = new Image();
  testImg.onload = function () {
    applyIconLinks(primaryIcon);
  };
  testImg.onerror = function () {
    const testPng = new Image();
    testPng.onload = function () {
      applyIconLinks(secondaryIcon);
    };
    testPng.onerror = function () {
      applyIconLinks(fallbackGitHubIcon);
    };
    testPng.src = secondaryIcon;
  };
  testImg.src = primaryIcon;

  const installBtn = document.getElementById('triggerPwaInstallBtn');
  if (installBtn && !installBtn.dataset.pwaBound) {
    installBtn.dataset.pwaBound = '1';

    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true;

    if (isStandalone) {
      installBtn.innerHTML = '<i data-lucide="check-circle"></i><span>Äpp on juba avaekraanil ✓</span>';
    }

    installBtn.addEventListener('click', async function () {
      if (deferredPwaPrompt) {
        deferredPwaPrompt.prompt();
        const choice = await deferredPwaPrompt.userChoice;
        if (choice && choice.outcome === 'accepted') {
          installBtn.innerHTML = '<i data-lucide="check-circle"></i><span>Paigaldatud avaekraanile ✓</span>';
          if (window.lucide) window.lucide.createIcons();
        }
        deferredPwaPrompt = null;
        return;
      }

      const instructionsBox = document.querySelector('#installModal .install-instructions');
      if (instructionsBox) {
        instructionsBox.style.border = '1px solid #ec4899';
        instructionsBox.style.boxShadow = '0 0 18px rgba(236, 72, 153, 0.35)';
        instructionsBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      const spanEl = installBtn.querySelector('span');
      if (spanEl) {
        spanEl.textContent = 'Vali brauseri menüüst "Add to Home screen" ↓';
      }
    });
  }
}
