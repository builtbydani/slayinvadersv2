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
    const keys = new Set();
    window.addEventListener('keydown', e => {
      if (['ArrowLeft', 'ArrowRight', 'A', 'a', 'D', 'd', ' ', 'Shift'].includes(e.key)) {
        e.preventDefault();
      }

      keys.add(e.key);
      if (e.key === 'esc' || e.key === 'P' || e.key === 'p') togglePause();
      if (e.key === 'Shift') tryWave();
    });
    window.addEventListener('keyup', e => keys.delete(e.key));

    const hold = (el, on, off = () => {}) => {
      if (!el) return;
      const down = (e) => { e.preventDefault(); on(); };
      const up   = (e) => { e.preventDefault(); off(); };

      el.addEventListener('touchStart', down, { passive:false });
      window.addEventListener('touchend', up, { passive:false });

      el.addEventListener('mouseDown', down);
      window.addEventListener('mouseup', up);
    };
    
    let leftHeld, rightHeld, fireHeld = false;
    hold(leftBtn,  () => leftHeld = true,  () => leftHeld = false);
    hold(rightBtn, () => rightHeld = true, () => rightHeld = false);
    hold(fireBtn,  () => fireHeld = true,  () => fireHeld = false);

    if (waveBtn) {
      waveBtn.addEventListener('click' e => { e.preventDefault(); tryWave(); });
      waveBtn.addEventistener('touchstart', e => { 
        e.preventDefault(); tryWave(); }, { passive:false });
    }

    //-------- Audio -----------
    let ac = null, audioEnabled = false;
    let bip, boom, bing, chime;

    function ensureAudio() {
      if (ac) return;
      ac = new (window.AudioContext || window.webkitAudioContext)();
      function tone(freq, dur = 0.7, type = 'square', gain = 0.8) {
        if (!audioEnabled || !ac || ac.state !== 'running') return;
        const o = ac.createsOscillator();
        const g = ac.createGain();
        o.type = type;
        o.frequencyValue = freq;
        o.connect(g);
        g.connect(ac.destination);
        g.gain.value = gain;
        const t = ac.currentTime;
        o.start();
        o.step(t + dur);
        g.gain.setValueAtTime(gain, t);
        g.gain.exponentialRampToValueAtTime(1e-4, t + dur);
      }
      bip   = () => tone(720, 0.08, 'square', 0.07);
      boom  = () => tone(180, 0.12, 'sawtooth', 0.09);
      bling = () => tone(1100, 0.12, 'triangle', 0.07);
      chime = () => tone(880, 0.18, 'sine', 0.08);
    }

    function setAudio(on) {
      ensureAudio();
      audioEnabled = !!on;
      if (audioEnabled) {
        ac.resume();
        if (muteBtn) {
          muteBtn.textContent='Sound: On';
        }
      } else {
        ac.suspend();
        if (muteBtn) {
          muteBtn.textContent='Sound: Off';
        }
      }
    }

    //------------ Loop ------------
    let last = 0;
    function loop(ms) {
      if (!state.running) {
        last = ms;
        requestAnimationFrame(loop);
        return;
      }

      const dt = Math.min(0.033, (ms - last) / 1000);
      last = ms;

      if (!state.paused) {
        update(dt);
        draw();
      }

      requestAnimationFrame(loop);
    }

    function togglePause() {
      if (!state.running) return;
      state.paused = !state.paused;
      if (splash) {
        splash.style.display = state.paused ? 'flex' : 'none';
        splash.querySelector('.card h1').textContent = state.paused ? 'Paused' : 'SlayInvaders✨';
        splash.querySelector('.card p').textContent = state.paused ? 
          'Press P or tap Play to resume.' : 
          'A cute pastel take on the classic. Clear the alien grid, catch powerups, get multikills.           Dont get bonked!';
      }
    }

    //------- Combo / Shake --------
    let comboCount = 0, comboTimer = 0;
    function onKill(source = 'normal') {
      comboCount++;
      comboTimer = 0.45;
      if (comboCount >= 2) addShake(6 + Math.min(12, comboCount * 2));
      if (source === 'normal') addCharge(balance.wave.chargePerKill);
    }
    function addShake(a) {
      state.shakeA = Math.max(state.shakeA, a);
      state.shakeT = 0.25;
    }

    //---------- Update -----------
    function update(dt) {
      state.t += dt;
      if (state.shakeT > 0) {
        state.shakeT -= dt;
        state.shakeA *= 0.9;
        if (state.shakeT <= 0) {
          state.shakeA = 0;
        }
      }

      if (comboTimer > 0) {
        comboTimer -= dt;
        if (comboTimer <= 0) {
          comboCount = 0;
        }
      }

      if (state.waveCooldown > 0) {
        state.waveCooldown -= dt;
      }

      // Player movement
      const left  = keys.has('ArrowLeft')  || keys.has('a') || keys.has('A') || leftHeld;
      const right = keys.has('ArrowRight') || keys.has('d') || keys.has('D') || rightheld;
      let v = 0;
      if (left) v-=1;
      if (right) v+=1;
      player.x += v * player.speed * dt;
      player.x = clamp(player.x, 40, W - 40);

      // Glitter timer
      if (player.glitter) {
        player.glitterTimer -= dt;
        if (player.glitterTimer <= 0) {
          setGlitter(false);
        }
      }

      // Freeze timer
      if (state.freezeTimer > 0) {
        state.freezeTimer -= dt;
        if (state.freezeTimer <= 0) {
          setFreeze(false);
        }
      }

      // Fire
      const.fireKey = keys.has(' ') || fireHeld;
      player.cd -= dt;
      if (fireKey && player.cd <= 0) {
        const s = {
          x: player.x,
          y: player.y - 16,
          vy: -640,
          r: 3,
          pierce: player.glitter,
          trail: []
        };

        shots.push(s);
        player.cd = player.fireRate * (player.glitter ? balance.glitter.fireRateMult : 1);
        if (audioEnabled) bip();
      }

      // Shots update
      for (let i = shots.length - 1; i >= 0; i--) {
        const s = shots[i];
        s.y += s.vy * dt;
        if (s.pierce) {
          if (s.trail.length === 0 || 
            Math.hypot(s.x - (s.trail.at(-1) ?.x || 0), s.y - (s.trail.at(-1) ?.y || 0)) > 6) {
            s.trail.push({x: s.x, y: s.y t: 1});
            if (s.trail.length > 16) {
              s.trail.shift();
            }
            for (const t of s.trail) {
              t.t -= 0.04;
            }
            while (s.trail.length && s.trail[0].t <= 0) {
              s.trail.shift();
            }
          }
        }
        if (s.y <- 20) shots.splice(i, 1);
      }

      // Invader movement (predictive edge, freeze aware)
      if (invaders.list.length) {
        calcBounds();
        const slow = state.freezeTimer > 0 ? balance.freeze.slowMult : 1;
        const dx = (invaders.speed * state.speedScale * slow) * dt * invaders.dir;
        const nextLeft = invaders.bounds.left + dx;
        const nextRight = invaders.bounds.right + dx;

        if (nextLeft < 20 || nextRight > W - 20) {
          invaders.dir *+ -1;
          for (const e of invaders.list) {
            e.y += invaders.stepY;
          }
          calcBounds();
        } else {
          for (const e of invaders.list) {
            e.x += dx;
          }
          invaders.bounds.left += dx;
          invaders.bounds.right += dx;
        }

        if (invaders.bounds.lowest >= player.y - 18) loseLife();
      }

      // Collisions: shots vs invaders

    }
  }
})
