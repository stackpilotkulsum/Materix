import { useEffect, useState } from 'react';

const InteractiveBackground = () => {
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(
        window.matchMedia('(max-width: 768px)').matches ||
        ('ontouchstart' in window) ||
        navigator.maxTouchPoints > 0
      );
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);

    const handleMouseMove = (e) => {
      if (!isMobile) {
        setMousePos({ x: e.clientX, y: e.clientY });
        document.documentElement.style.setProperty('--mouse-x', `${e.clientX}px`);
        document.documentElement.style.setProperty('--mouse-y', `${e.clientY}px`);
      }
    };

    const initX = window.innerWidth / 2;
    const initY = window.innerHeight / 2;
    setMousePos({ x: initX, y: initY });
    document.documentElement.style.setProperty('--mouse-x', `${initX}px`);
    document.documentElement.style.setProperty('--mouse-y', `${initY}px`);

    if (!isMobile) {
      window.addEventListener('mousemove', handleMouseMove);
    }

    return () => {
      window.removeEventListener('resize', checkMobile);
      window.removeEventListener('mousemove', handleMouseMove);
    };
  }, [isMobile]);

  return (
    <div className="interactive-bg-wrapper">
      {/* Grid base */}
      <div className="interactive-grid"></div>
      {!isMobile && <div className="interactive-grid-glow"></div>}

      {/* Blurry colour blobs */}
      <div className="bg-blob bg-blob-1"></div>
      <div className="bg-blob bg-blob-2"></div>
      <div className="bg-blob bg-blob-3"></div>

      {/* ─── All rotating / drifting shapes ─── */}
      <div className="floating-svg-wrapper">

        {/* ── CIRCLE 1 – teal dashed double ring, top-left ── */}
        <div className="bg-shape s1">
          <svg viewBox="0 0 100 100" fill="none">
            <defs>
              <linearGradient id="g-teal" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#0f766e"/>
                <stop offset="100%" stopColor="#14b8a6"/>
              </linearGradient>
            </defs>
            <circle cx="50" cy="50" r="46" stroke="url(#g-teal)" strokeWidth="1.2" strokeDasharray="4 5"/>
            <circle cx="50" cy="50" r="34" stroke="url(#g-teal)" strokeWidth="0.8"/>
            <path d="M50 4 L50 12 M50 88 L50 96 M4 50 L12 50 M88 50 L96 50" stroke="#0f766e" strokeWidth="1"/>
          </svg>
        </div>

        {/* ── CIRCLE 2 – orange-pink gradient, right-center ── */}
        <div className="bg-shape s2">
          <svg viewBox="0 0 100 100" fill="none">
            <defs>
              <linearGradient id="g-orange" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#f97316"/>
                <stop offset="100%" stopColor="#ec4899"/>
              </linearGradient>
            </defs>
            <circle cx="50" cy="50" r="47" stroke="url(#g-orange)" strokeWidth="0.9" strokeDasharray="12 6 2 6"/>
            <circle cx="50" cy="50" r="38" stroke="url(#g-orange)" strokeWidth="1.3"/>
            <circle cx="50" cy="50" r="20" stroke="url(#g-orange)" strokeWidth="0.6" strokeDasharray="3 3"/>
          </svg>
        </div>

        {/* ── CIRCLE 3 – blue-cyan, bottom-left ── */}
        <div className="bg-shape s3">
          <svg viewBox="0 0 100 100" fill="none">
            <defs>
              <linearGradient id="g-blue" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#2563eb"/>
                <stop offset="100%" stopColor="#06b6d4"/>
              </linearGradient>
            </defs>
            <circle cx="50" cy="50" r="45" stroke="url(#g-blue)" strokeWidth="1.1" strokeDasharray="8 5 2 5"/>
            <circle cx="50" cy="50" r="32" stroke="url(#g-blue)" strokeWidth="0.7"/>
            <rect x="34" y="34" width="32" height="32" rx="5" stroke="url(#g-blue)" strokeWidth="0.8" strokeDasharray="2 3"/>
          </svg>
        </div>

        {/* ── CIRCLE 4 – purple-pink, top-right ── */}
        <div className="bg-shape s4">
          <svg viewBox="0 0 100 100" fill="none">
            <defs>
              <linearGradient id="g-purple" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#7c3aed"/>
                <stop offset="100%" stopColor="#c084fc"/>
              </linearGradient>
            </defs>
            <circle cx="50" cy="50" r="46" stroke="url(#g-purple)" strokeWidth="1" strokeDasharray="6 6"/>
            <circle cx="50" cy="50" r="29" stroke="url(#g-purple)" strokeWidth="0.8"/>
            <polygon points="50,28 69,61 31,61" stroke="url(#g-purple)" strokeWidth="0.9" strokeDasharray="1 2"/>
          </svg>
        </div>

        {/* ── CIRCLE 5 – emerald crosshair, bottom-right ── */}
        <div className="bg-shape s5">
          <svg viewBox="0 0 100 100" fill="none">
            <defs>
              <linearGradient id="g-emerald" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#059669"/>
                <stop offset="100%" stopColor="#34d399"/>
              </linearGradient>
            </defs>
            <circle cx="50" cy="50" r="44" stroke="url(#g-emerald)" strokeWidth="1" strokeDasharray="15 3 3 3"/>
            <circle cx="50" cy="50" r="28" stroke="url(#g-emerald)" strokeWidth="0.7"/>
            <line x1="14" y1="50" x2="86" y2="50" stroke="url(#g-emerald)" strokeWidth="0.7"/>
            <line x1="50" y1="14" x2="50" y2="86" stroke="url(#g-emerald)" strokeWidth="0.7"/>
          </svg>
        </div>

        {/* ── TRIANGLE 1 – teal, center-left ── */}
        <div className="bg-shape s6">
          <svg viewBox="0 0 100 100" fill="none">
            <defs>
              <linearGradient id="g-tri1" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#0f766e"/>
                <stop offset="100%" stopColor="#2dd4bf"/>
              </linearGradient>
            </defs>
            <polygon points="50,8 92,84 8,84" stroke="url(#g-tri1)" strokeWidth="1.2" strokeDasharray="6 4"/>
            <polygon points="50,28 74,68 26,68" stroke="url(#g-tri1)" strokeWidth="0.8"/>
            <circle cx="50" cy="55" r="10" stroke="url(#g-tri1)" strokeWidth="0.6" strokeDasharray="2 2"/>
          </svg>
        </div>

        {/* ── HEXAGON 1 – indigo, center-top ── */}
        <div className="bg-shape s7">
          <svg viewBox="0 0 100 100" fill="none">
            <defs>
              <linearGradient id="g-indigo" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#4f46e5"/>
                <stop offset="100%" stopColor="#818cf8"/>
              </linearGradient>
            </defs>
            <polygon points="50,6 88,28 88,72 50,94 12,72 12,28" stroke="url(#g-indigo)" strokeWidth="1.2" strokeDasharray="5 4"/>
            <polygon points="50,22 74,36 74,64 50,78 26,64 26,36" stroke="url(#g-indigo)" strokeWidth="0.8"/>
            <circle cx="50" cy="50" r="12" stroke="url(#g-indigo)" strokeWidth="0.7"/>
          </svg>
        </div>

        {/* ── DIAMOND – amber, center-right ── */}
        <div className="bg-shape s8">
          <svg viewBox="0 0 100 100" fill="none">
            <defs>
              <linearGradient id="g-amber" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#d97706"/>
                <stop offset="100%" stopColor="#fbbf24"/>
              </linearGradient>
            </defs>
            <polygon points="50,5 95,50 50,95 5,50" stroke="url(#g-amber)" strokeWidth="1.3" strokeDasharray="8 4"/>
            <polygon points="50,22 78,50 50,78 22,50" stroke="url(#g-amber)" strokeWidth="0.9"/>
            <polygon points="50,38 62,50 50,62 38,50" stroke="url(#g-amber)" strokeWidth="0.7" strokeDasharray="2 2"/>
          </svg>
        </div>

        {/* ── SQUARE – cyan dotted, bottom-center ── */}
        <div className="bg-shape s9">
          <svg viewBox="0 0 100 100" fill="none">
            <defs>
              <linearGradient id="g-cyan" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#0891b2"/>
                <stop offset="100%" stopColor="#22d3ee"/>
              </linearGradient>
            </defs>
            <rect x="8" y="8" width="84" height="84" rx="4" stroke="url(#g-cyan)" strokeWidth="1.2" strokeDasharray="6 4"/>
            <rect x="24" y="24" width="52" height="52" rx="3" stroke="url(#g-cyan)" strokeWidth="0.8"/>
            <rect x="40" y="40" width="20" height="20" rx="2" stroke="url(#g-cyan)" strokeWidth="0.7" strokeDasharray="2 2"/>
          </svg>
        </div>

        {/* ── ROSE CIRCLE triple ring, far top-left ── */}
        <div className="bg-shape s10">
          <svg viewBox="0 0 100 100" fill="none">
            <defs>
              <linearGradient id="g-rose" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#f43f5e"/>
                <stop offset="100%" stopColor="#fb7185"/>
              </linearGradient>
            </defs>
            <circle cx="50" cy="50" r="47" stroke="url(#g-rose)" strokeWidth="0.8" strokeDasharray="1 4"/>
            <circle cx="50" cy="50" r="38" stroke="url(#g-rose)" strokeWidth="1.2"/>
            <circle cx="50" cy="50" r="25" stroke="url(#g-rose)" strokeWidth="0.9" strokeDasharray="6 3"/>
            <circle cx="50" cy="50" r="10" stroke="url(#g-rose)" strokeWidth="0.6"/>
          </svg>
        </div>

        {/* ── HEXAGON 2 – teal-pink, far bottom-right ── */}
        <div className="bg-shape s11">
          <svg viewBox="0 0 100 100" fill="none">
            <defs>
              <linearGradient id="g-hex2" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#db2777"/>
                <stop offset="100%" stopColor="#14b8a6"/>
              </linearGradient>
            </defs>
            <polygon points="50,5 88,27.5 88,72.5 50,95 12,72.5 12,27.5" stroke="url(#g-hex2)" strokeWidth="1.3"/>
            <polygon points="50,18 76,33 76,67 50,82 24,67 24,33" stroke="url(#g-hex2)" strokeWidth="0.8" strokeDasharray="4 3"/>
            <line x1="50" y1="5" x2="50" y2="95" stroke="url(#g-hex2)" strokeWidth="0.5" strokeDasharray="8 6"/>
          </svg>
        </div>

        {/* ── TRIANGLE 2 – blue inverted, far right-top ── */}
        <div className="bg-shape s12">
          <svg viewBox="0 0 100 100" fill="none">
            <defs>
              <linearGradient id="g-tri2" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#2563eb"/>
                <stop offset="100%" stopColor="#7c3aed"/>
              </linearGradient>
            </defs>
            <polygon points="50,92 8,16 92,16" stroke="url(#g-tri2)" strokeWidth="1.2" strokeDasharray="5 5"/>
            <polygon points="50,76 22,28 78,28" stroke="url(#g-tri2)" strokeWidth="0.8"/>
          </svg>
        </div>

        {/* ── STAR/OCTAGON – amber-orange, center-left ── */}
        <div className="bg-shape s13">
          <svg viewBox="0 0 100 100" fill="none">
            <defs>
              <linearGradient id="g-star" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#ea580c"/>
                <stop offset="100%" stopColor="#fbbf24"/>
              </linearGradient>
            </defs>
            <polygon points="50,6 61,35 92,35 68,54 77,84 50,66 23,84 32,54 8,35 39,35" stroke="url(#g-star)" strokeWidth="1" strokeDasharray="3 3"/>
            <circle cx="50" cy="50" r="20" stroke="url(#g-star)" strokeWidth="0.8"/>
          </svg>
        </div>

        {/* ── CROSS / PLUS – indigo dotted, bottom-center ── */}
        <div className="bg-shape s14">
          <svg viewBox="0 0 100 100" fill="none">
            <defs>
              <linearGradient id="g-cross" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#4f46e5"/>
                <stop offset="100%" stopColor="#0891b2"/>
              </linearGradient>
            </defs>
            <rect x="38" y="8" width="24" height="84" rx="4" stroke="url(#g-cross)" strokeWidth="1.1" strokeDasharray="4 4"/>
            <rect x="8" y="38" width="84" height="24" rx="4" stroke="url(#g-cross)" strokeWidth="1.1" strokeDasharray="4 4"/>
            <circle cx="50" cy="50" r="30" stroke="url(#g-cross)" strokeWidth="0.6"/>
          </svg>
        </div>

        {/* ── DIAMOND small – rose, top-center ── */}
        <div className="bg-shape s15">
          <svg viewBox="0 0 100 100" fill="none">
            <defs>
              <linearGradient id="g-d2" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#e11d48"/>
                <stop offset="100%" stopColor="#fda4af"/>
              </linearGradient>
            </defs>
            <polygon points="50,5 95,50 50,95 5,50" stroke="url(#g-d2)" strokeWidth="1.4" strokeDasharray="10 5"/>
            <circle cx="50" cy="50" r="22" stroke="url(#g-d2)" strokeWidth="0.9" strokeDasharray="4 3"/>
          </svg>
        </div>

        {/* ── CIRCLE – green dashed, right-bottom ── */}
        <div className="bg-shape s16">
          <svg viewBox="0 0 100 100" fill="none">
            <defs>
              <linearGradient id="g-green" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#16a34a"/>
                <stop offset="100%" stopColor="#86efac"/>
              </linearGradient>
            </defs>
            <circle cx="50" cy="50" r="46" stroke="url(#g-green)" strokeWidth="1.1" strokeDasharray="20 8 4 8"/>
            <circle cx="50" cy="50" r="34" stroke="url(#g-green)" strokeWidth="0.8"/>
            <circle cx="50" cy="50" r="18" stroke="url(#g-green)" strokeWidth="0.6" strokeDasharray="2 3"/>
            <polygon points="50,36 61,57 39,57" stroke="url(#g-green)" strokeWidth="0.7"/>
          </svg>
        </div>

        {/* ── SQUARE rotated (diamond-look) – pink, left-top ── */}
        <div className="bg-shape s17">
          <svg viewBox="0 0 100 100" fill="none">
            <defs>
              <linearGradient id="g-pink" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#db2777"/>
                <stop offset="100%" stopColor="#f472b6"/>
              </linearGradient>
            </defs>
            <rect x="15" y="15" width="70" height="70" rx="8" stroke="url(#g-pink)" strokeWidth="1.2" strokeDasharray="6 5" transform="rotate(45 50 50)"/>
            <rect x="28" y="28" width="44" height="44" rx="5" stroke="url(#g-pink)" strokeWidth="0.8" transform="rotate(45 50 50)"/>
          </svg>
        </div>

        {/* ── OCTAGON – teal dotted, right-middle ── */}
        <div className="bg-shape s18">
          <svg viewBox="0 0 100 100" fill="none">
            <defs>
              <linearGradient id="g-oct" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#0d9488"/>
                <stop offset="100%" stopColor="#2dd4bf"/>
              </linearGradient>
            </defs>
            <polygon points="32,7 68,7 93,32 93,68 68,93 32,93 7,68 7,32" stroke="url(#g-oct)" strokeWidth="1.2" strokeDasharray="5 4"/>
            <polygon points="38,18 62,18 82,38 82,62 62,82 38,82 18,62 18,38" stroke="url(#g-oct)" strokeWidth="0.8"/>
            <circle cx="50" cy="50" r="15" stroke="url(#g-oct)" strokeWidth="0.6" strokeDasharray="2 2"/>
          </svg>
        </div>

        {/* ── TRIANGLE 3 – cyan-purple, bottom-left-ish ── */}
        <div className="bg-shape s19">
          <svg viewBox="0 0 100 100" fill="none">
            <defs>
              <linearGradient id="g-tri3" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#7c3aed"/>
                <stop offset="100%" stopColor="#22d3ee"/>
              </linearGradient>
            </defs>
            <polygon points="50,8 90,82 10,82" stroke="url(#g-tri3)" strokeWidth="1.3"/>
            <polygon points="50,26 76,68 24,68" stroke="url(#g-tri3)" strokeWidth="0.9" strokeDasharray="4 3"/>
            <polygon points="50,44 62,64 38,64" stroke="url(#g-tri3)" strokeWidth="0.7"/>
          </svg>
        </div>

        {/* ── CIRCLE – thin elegant, top-far-right ── */}
        <div className="bg-shape s20">
          <svg viewBox="0 0 100 100" fill="none">
            <defs>
              <linearGradient id="g-c20" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#f97316"/>
                <stop offset="100%" stopColor="#4f46e5"/>
              </linearGradient>
            </defs>
            <circle cx="50" cy="50" r="47" stroke="url(#g-c20)" strokeWidth="0.7" strokeDasharray="30 10 10 10"/>
            <circle cx="50" cy="50" r="40" stroke="url(#g-c20)" strokeWidth="1.1" strokeDasharray="2 2"/>
            <circle cx="50" cy="50" r="26" stroke="url(#g-c20)" strokeWidth="0.8"/>
            <circle cx="50" cy="50" r="12" stroke="url(#g-c20)" strokeWidth="0.6" strokeDasharray="3 3"/>
          </svg>
        </div>

        {/* ── HEXAGON 3 – orange inner rings, center-bottom ── */}
        <div className="bg-shape s21">
          <svg viewBox="0 0 100 100" fill="none">
            <defs>
              <linearGradient id="g-h3" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#ea580c"/>
                <stop offset="100%" stopColor="#c084fc"/>
              </linearGradient>
            </defs>
            <polygon points="50,5 88,27.5 88,72.5 50,95 12,72.5 12,27.5" stroke="url(#g-h3)" strokeWidth="1.3" strokeDasharray="6 5"/>
            <circle cx="50" cy="50" r="22" stroke="url(#g-h3)" strokeWidth="0.9"/>
            <circle cx="50" cy="50" r="10" stroke="url(#g-h3)" strokeWidth="0.6" strokeDasharray="2 2"/>
          </svg>
        </div>

      </div>

      {/* Mouse spotlight (desktop only) */}
      {!isMobile && (
        <div
          className="mouse-glow"
          style={{ transform: `translate3d(${mousePos.x}px, ${mousePos.y}px, 0) translate(-50%, -50%)` }}
        />
      )}
    </div>
  );
};

export default InteractiveBackground;
