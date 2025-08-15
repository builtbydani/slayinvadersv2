(function(){
  'use strict';

  if (document.readyState !== 'loading') init();
  else document.addEventListener('DOMContentLoaded', init);

  function init() {
    // ---------- Helpers -----------
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    const rand  = (a, b)      => Math.random() * (b - a) + a;
    const lerp  = (a, b, t)   => a + (b - a) * t;

    //----------- Balance Knobs -----
    const balance = {
      wave: {
        chargePerKill: 0.15,
        cooldown: 3.0,
        maxKillsPerWave: 8,
        lineTolerance: 10
      },

      freeze: {
        duration: 5.0,
        slowMult: 0.4
      },

      glitter: {
        duration: 6.0,
        fireRateMult: 0.85
      }
    };

    //---------- Canvas -----------
    const cvs = document.getElementById('game');
    const ctx = cvs.getContext('2d');
    const W = cvs.width;
    const H = cvs.height;

    function resizeCanvas() {
      const w = Math.min(window.innerWidth, 900);
      const h = window.innerHeight;
      cvs.style.width = w + 'px';
      const aspect = cvs.height / cvs.width;
      cvs.style.height = Math.min(h, w * aspect) + 'px';
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.imageSmoothingEnabled = false;
    }
    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();

    //--------- HUD ---------------
    const $ = (id)=>document.getElementById(id);

    const elScore      = ${'score'};
    const elLives      = ${'lives'};
    const elLevel      = ${'level'};
    const elStatus     = {'status'};
    const elCharge     = ${'charge'};
    const elChargeFill = ${'chargeFill'};
    const waveBtn      = {'waveBtn'};
    const splash       = ${'splash'};
    const playBtn      = ${'playBtn'};
    const fireBtn      = ${'fireBtn'};
    const leftBtn      = #{'leftBtn'};
    const rightBtn     = ${'rightBtn'};
    const muteBtn      = ${'muteBtn'};

    //-------- Global State -------
    const state = {
      running: false,
      paused:  false,
      level:       1,
      score:       0,
      lives:       3,
      t:           0,
      speedScale:  1,
      shakeA:      0,
      shakeT:      0,
      freezeTimer: 0,
      waveCooldown:0,
    };

    const player = {
      x:        W / 2,
      y:       H - 90,
      w:           56,
      h:           20,
      speed:      420,
      cd:           0,
      fireRate:  0.28,
      glitter:  false,
      glitterTimer: 0,
      waveCharge:   0,
    };

    const invaders = {
      list: [],
      dir:     1,
      stepY:  26,
      speed:  38,
      bounds: {
        left: 0, 
        right: 0, 
        lowest: 0
      },
    };

    const shots = []; // player bullets
    const drops = []; // powerups
    const pfx   = []; // particles
    const waves = []; // rainbow waves

    function spawnWave(level = 1) {
      invaders.list.length = 0;

      const cols   = 10;
      const rows   = 5;
      const gapX   = 20;
      const gapY   = 22;
      const startX = 80;
      const startY = 100;

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          invaders.list.push({
            x: startX,
            y: startY,
            w: 36,
            h: 24,
            hp: 1,
            hue:(r * 60 + c * 8) % 360,
            worth: 10 + (rows-r) * 5;
          });
        }
      }
      invaders.dir     = 1;
      invaders.speed   = 38 + (level - 1) * 8;
      state.speedScale = 1;
      calcBounds();
    }

    function calcBounds() {
      if (invaders.list.length === 0) {
        invaders.bounds = {
          left: 0,
          right: 0,
          lowest: 0
        };

        return;
      }

      const xs = invaders.list.map(e => e.x);
      const ys = invaders.list.map(e => e.y);

      invaders.bounds.left   = Math.min(...xs);
      invaders.bounds.right  = Math.max(...xs) + 36;
      invaders.bounds.lowest = Math.max(...ys) + 24;
    }

    //-------- Input ---------

  }
})
