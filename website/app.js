/**
 * Marketing site: scroll-synced bg layers (screenshots live inside diagonal .rs-mock frames in HTML),
 * theme toggle, interactive account preview (no real auth).
 */

const PREVIEW_MSG =
  'This page is a preview — use File → Router Studio account in the desktop app to sign in or register.';

function prefersDark() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function initTheme() {
  const saved = localStorage.getItem('rs-site-theme');
  const html = document.documentElement;
  if (saved === 'light' || saved === 'dark') {
    html.classList.toggle('dark', saved === 'dark');
    html.classList.toggle('light', saved === 'light');
  } else {
    html.classList.toggle('dark', prefersDark());
    html.classList.toggle('light', !prefersDark());
  }
}

function toggleTheme() {
  const html = document.documentElement;
  const nextDark = !html.classList.contains('dark');
  html.classList.toggle('dark', nextDark);
  html.classList.toggle('light', !nextDark);
  localStorage.setItem('rs-site-theme', nextDark ? 'dark' : 'light');
}

function initScrollBackground() {
  const layers = [...document.querySelectorAll('.bg-layer')];
  const sections = [...document.querySelectorAll('[data-bg-section]')];

  const setActive = (layerName) => {
    for (const layer of layers) {
      const isActive = layer.getAttribute('data-layer') === layerName;
      layer.classList.toggle('active', isActive);
      if (isActive) {
        const v = layer.querySelector('video');
        if (v) void v.play().catch(() => {});
      } else {
        const v = layer.querySelector('video');
        if (v) v.pause();
      }
    }
  };

  const pickActiveSection = () => {
    const vh = window.innerHeight || 1;
    const visible = sections.filter((el) => {
      const r = el.getBoundingClientRect();
      return r.bottom > 72 && r.top < vh - 72;
    });
    if (visible.length === 0) {
      const first = sections[0]?.getAttribute('data-bg-section');
      if (first) setActive(first);
      return;
    }
    visible.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
    const id = visible[0].getAttribute('data-bg-section');
    if (id) setActive(id);
  };

  const io = new IntersectionObserver(pickActiveSection, {
    root: null,
    threshold: [0, 0.04, 0.08, 0.15, 0.25, 0.4],
  });

  for (const el of sections) {
    io.observe(el);
  }
  window.addEventListener('scroll', pickActiveSection, { passive: true });
  window.addEventListener('resize', pickActiveSection, { passive: true });
  pickActiveSection();
}

function initAuthUi() {
  const inlineRoot = document.querySelector('#account .auth-inline');
  if (inlineRoot) {
    const tabs = inlineRoot.querySelectorAll('[data-auth-tab]');
    const paneLogin = inlineRoot.querySelector('#inline-pane-login');
    const paneRegForm = inlineRoot.querySelector('#inline-pane-reg-form');
    const paneRegCode = inlineRoot.querySelector('#inline-pane-reg-code');
    const msg = inlineRoot.querySelector('#auth-msg');

    const showInline = (which) => {
      paneLogin?.toggleAttribute('hidden', which !== 'login');
      paneRegForm?.toggleAttribute('hidden', which !== 'reg-form');
      paneRegCode?.toggleAttribute('hidden', which !== 'reg-code');
      tabs.forEach((b) => {
        const tab = b.getAttribute('data-auth-tab');
        const active =
          (tab === 'login' && which === 'login') ||
          (tab === 'register' && (which === 'reg-form' || which === 'reg-code'));
        b.classList.toggle('active', active);
        b.setAttribute('aria-selected', active ? 'true' : 'false');
      });
    };

    tabs.forEach((b) => {
      b.addEventListener('click', () => {
        if (b.getAttribute('data-auth-tab') === 'login') showInline('login');
        else showInline('reg-form');
      });
    });

    inlineRoot.querySelector('#inline-submit')?.addEventListener('click', () => {
      if (msg) msg.textContent = PREVIEW_MSG;
    });
    inlineRoot.querySelector('#inline-send-code')?.addEventListener('click', () => {
      const email = inlineRoot.querySelector('#inline-email-reg')?.value?.trim() || '';
      showInline('reg-code');
      const exp = inlineRoot.querySelector('#inline-verify-explainer');
      if (exp) {
        exp.textContent = email
          ? `Enter the code sent to ${email}. (Preview — no email is sent from the browser.)`
          : 'Enter your verification code. (Preview — no email is sent from the browser.)';
      }
      if (msg) msg.textContent = '';
    });
    inlineRoot.querySelector('#inline-verify-create')?.addEventListener('click', () => {
      if (msg) msg.textContent = PREVIEW_MSG;
    });
    inlineRoot.querySelector('#inline-back-reg')?.addEventListener('click', () => {
      showInline('reg-form');
    });
    showInline('login');
  }

  const modal = document.getElementById('auth-modal');
  if (!modal) return;

  const modalTabs = modal.querySelectorAll('[data-modal-tab]');
  const mLogin = modal.querySelector('#modal-pane-login');
  const mRegForm = modal.querySelector('#modal-pane-reg-form');
  const mRegCode = modal.querySelector('#modal-pane-reg-code');
  const mMsg = modal.querySelector('#modal-auth-msg');

  const showModal = (which) => {
    mLogin?.toggleAttribute('hidden', which !== 'login');
    mRegForm?.toggleAttribute('hidden', which !== 'reg-form');
    mRegCode?.toggleAttribute('hidden', which !== 'reg-code');
    modalTabs.forEach((b) => {
      const tab = b.getAttribute('data-modal-tab');
      const active =
        (tab === 'login' && which === 'login') ||
        (tab === 'register' && (which === 'reg-form' || which === 'reg-code'));
      b.classList.toggle('active', active);
    });
  };

  modalTabs.forEach((b) => {
    b.addEventListener('click', () => {
      if (b.getAttribute('data-modal-tab') === 'login') showModal('login');
      else showModal('reg-form');
    });
  });

  const openModal = () => {
    modal.removeAttribute('hidden');
    requestAnimationFrame(() => modal.classList.add('open'));
    modal.querySelector('#modal-email')?.focus();
  };
  const closeModal = () => {
    modal.classList.remove('open');
    window.setTimeout(() => modal.setAttribute('hidden', ''), 200);
  };

  document.getElementById('open-auth-nav')?.addEventListener('click', openModal);
  document.getElementById('open-auth-hero')?.addEventListener('click', openModal);
  document.getElementById('close-auth-modal')?.addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal.classList.contains('open')) closeModal();
  });

  modal.querySelector('#modal-submit-login')?.addEventListener('click', () => {
    if (mMsg) mMsg.textContent = PREVIEW_MSG;
  });
  modal.querySelector('#modal-send-code')?.addEventListener('click', () => {
    const email = modal.querySelector('#modal-email-reg')?.value?.trim() || '';
    showModal('reg-code');
    const exp = modal.querySelector('#modal-verify-explainer');
    if (exp) {
      exp.textContent = email
        ? `Enter the code sent to ${email}. (Preview — no email is sent from the browser.)`
        : 'Enter your verification code. (Preview — no email is sent from the browser.)';
    }
    if (mMsg) mMsg.textContent = '';
  });
  modal.querySelector('#modal-verify-create')?.addEventListener('click', () => {
    if (mMsg) mMsg.textContent = PREVIEW_MSG;
  });
  modal.querySelector('#modal-back-reg')?.addEventListener('click', () => {
    showModal('reg-form');
  });

  showModal('login');
}

document.getElementById('theme-toggle')?.addEventListener('click', toggleTheme);

initTheme();
initScrollBackground();
initAuthUi();

window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if (!localStorage.getItem('rs-site-theme')) initTheme();
});
