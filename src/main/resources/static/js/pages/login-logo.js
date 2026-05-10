// Use mp4 on mobile (better iOS compatibility)
(function() {
    const v = document.getElementById('logoVideo');
    if (!v) return;

    const isMobile = window.matchMedia && window.matchMedia('(max-width: 768px)').matches;
    if (!isMobile) return;

    v.innerHTML = '';
    const s = document.createElement('source');
    s.src = 'images/animated-logo.mp4';
    s.type = 'video/mp4';
    v.appendChild(s);

    v.addEventListener('error', () => {
        v.style.display = 'none';
        const img = document.querySelector('.logo-fallback');
        if (img) img.style.display = 'block';
    }, { once: true });

    try { v.load(); } catch (e) {}
})();
