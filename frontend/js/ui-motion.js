/**
 * Sentinel AI — UI Motion & Interaction Engine
 * Light/Dark Theme Memory, Count-up, Scroll Reveal, Stepper Animations
 */

// 1. Theme Manager (localStorage with prefers-color-scheme default)
(function initTheme() {
  const storedTheme = localStorage.getItem('sentinel_theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const theme = storedTheme || (prefersDark ? 'dark' : 'light');
  document.documentElement.setAttribute('data-theme', theme);

  window.addEventListener('DOMContentLoaded', () => {
    updateThemeToggleIcon(theme);
  });
})();

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'light';
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('sentinel_theme', next);
  updateThemeToggleIcon(next);
}

function updateThemeToggleIcon(theme) {
  const btns = document.querySelectorAll('.theme-toggle-btn');
  btns.forEach(btn => {
    btn.innerHTML = theme === 'dark' 
      ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`
      : `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`;
    btn.setAttribute('aria-label', `Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`);
  });
}

// 2. Count-Up Helper (Vanilla 600ms count-up for numbers)
function animateValue(element, start, end, duration = 600, prefix = '', suffix = '') {
  if (!element) return;
  const startTime = performance.now();
  function update(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    // Cubic ease-out
    const ease = 1 - Math.pow(1 - progress, 3);
    const current = Math.floor(start + (end - start) * ease);
    element.textContent = `${prefix}${current.toLocaleString()}${suffix}`;
    if (progress < 1) {
      requestAnimationFrame(update);
    } else {
      element.textContent = `${prefix}${end.toLocaleString()}${suffix}`;
    }
  }
  requestAnimationFrame(update);
}

// 3. Scroll Reveal via IntersectionObserver (Single trigger only)
document.addEventListener('DOMContentLoaded', () => {
  const revealElements = document.querySelectorAll('.reveal-on-scroll');
  if ('IntersectionObserver' in window && revealElements.length > 0) {
    const observer = new IntersectionObserver((entries, obs) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-revealed');
          obs.unobserve(entry.target);
        }
      });
    }, { threshold: 0.1 });
    revealElements.forEach(el => observer.observe(el));
  } else {
    revealElements.forEach(el => el.classList.add('is-revealed'));
  }
});

// 4. Modal Helpers with focus trap support
function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (!modal) return;
  modal.classList.add('open');
  modal.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (!modal) return;
  modal.classList.remove('open');
  setTimeout(() => modal.classList.add('hidden'), 250);
  document.body.style.overflow = '';
}

// 5. Toast System with 4s countdown line
function showToast(message, type = 'info') {
  let container = document.getElementById('toastContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toastContainer';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <div>${escapeHtml(message)}</div>
    <div class="toast-progress"></div>
  `;

  container.appendChild(toast);

  // Auto-dismiss after 4 seconds
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(-10px)';
    toast.style.transition = 'all 200ms ease';
    setTimeout(() => toast.remove(), 200);
  }, 4000);
}

window.toggleTheme = toggleTheme;
window.animateValue = animateValue;
window.openModal = openModal;
window.closeModal = closeModal;
window.showToast = showToast;
