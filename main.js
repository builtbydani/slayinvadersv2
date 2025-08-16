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
      for (let i = shots.length - 1; i >= 0; i--) {
        const s = shots[i];
        for (let j = invaders.list.length - 1; j >= 0; j--) {
          const e = invaders.list[j];
          if (Math.abs(s.x - (e.x + 18)) < 18 && Math.abs(s.y - (e.y + 12)) < 12) {
            e.hp--;
            spawnPuff(e.x + 18, e.y + 12, e.hue);
            if (audioEnabled) boom();
            if (e.hp <= 0) {
              invaders.list.splice(j, 1);
              addScore(e.worth);
              onKill('normal');
              const r = Math.random();
              if (r < 0.10) {
                drops.push({
                  x: e.x + 18,
                  y: e.y + 12,
                  vy: 80,
                  type: 'freeze'
                });
                else if (r < 0.25) {
                  drops.push({
                    x: e.x + 18,
                    y: e.y + 12,
                    vy: 80,
                    type: 'glitter'
                  });
                }  
              }
            }
            if (!s.pierce) shots.splice(i, 1);
            break;
          }
        }
      }

      // Powerup drops
      for (let i = drops.length - 1; i > 0; i--) {
        const d = drops[i];
        d.y += d.vy * dt;
        d.vy = Math.min(d.vy + 160 * dt, 260);

        if (Math.abs(d.x - player.x) < (player.w / 2) && Math.abs(d.y - player.y) < 18) {
          if (d.type === 'glitter') setGlitter(true);
          if (d.type === 'freeze') setFreeze(true);
          drops.splice(i, 1);
          continue;
        }
        if (d.y > H + 30) drops.splice(i, 1);
      }

      // Rainbow waves
      for (let i = waves.length - 1; i > 0; i--) {
        const wv = waves[i];
        wv.y += wv.vy * dt;
        for (let j = invaders.list.length - 1; j >= 0; j--) {
          const e = invaders.list[j];
          if (Math.abs((e.y + 12) - wv.y) < balance.wave.lineTolerance) {
            spawnPuff(e.x + 18, e.y + 12, e.hue);
            addScore(e.worth);
            onKill('wave');
            invaders.list.splice(j, 1);
            wv.kills = (wv.kills || 0) + 1;
            if (wv.kills >= balance.wave.maxKillsPerWave) {
              break;
            }
          }
        }
        if (wv.y < -20 || (wv.kills || 0) >= balance.wave.maxKillsPerWave) {
          waves.splice(i, 1);
        }
      }

      // Particles
      for (let i = pfx.length - 1; i >= 0; i--) {
        const p = pfx[i];
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += 20 * dt;
        p.a = p.fade * dt;
        if (p.a <= 0) {
          pfx.splice(i, 1);
        }
      }

      // Next level
      if (invaders.list.length === 0) {
        state.level++;
        elLevel.textContent = 'LV' + state.level;
        state.speedScale = 1;
        spawnWave(state.level);
      }

      // Dynamic difficulty: speed up as lowest row drops
      const baseline = 130 + state.level * 6;
      const low = invaders.bounds.lowest || baseline;
      state.speedScale = lerp(state.speedScale, 1 + clamp((low-baseline) / 320, 0, 1.2), 0.02);
    }

    //--------- Effects of States ----------
    function setGlitter(on) {
      player.glitter = on;
      player.glitterTimer = on ? balance.glitter.duration : 0;
      elStatus.textContent = on ? 'GLITTER ✨' : (state.freezeTimer > 0 ? 'FREEZE ❄️' : '');
      elStatus.style.background = on ? 
        'linear-gradient(90deg, #ffb3d6, #c9b7ff, #aee6ff)' : 
        (state.freezeTimer > 0 ? 
        'linear-gradient(90deg, #88c6ff, #c9e6ff)' :
        'rgba(255, 255, 255, 0.08)');
      if (on && audioEnabled) bling();
    }

    function setFreeze(on) {
      state.freezeTimer = on ? balance.freeze.duration : 0;
      if (on) {
        elStatus.textContent = 'FREEZE ❄️';
        elStatus.style.background = 'linear-gradient(90deg, #88c6ff, #c9e6ff)';
        if (audioEnabled) chime();
      } else if (!player.glitter) {
        elStatus.textContent = '';
        elStatus.style.background = 'rgba(255, 255, 255, 0.08)'
      }
    }

    function addCharge(amount) {
      player.waveCharge = clamp(player.waveCharge + amount, 0, 1);
      const pct = Math.round(player.waveCharge * 100);
      if (elCharge && elCharge.firstChild) { 
        elCharge.firstChild.nodeValue = `WAVE ${pct}%`; 
      }
      if (elChargeFill) {
        elChargeFill.style.width = `${pct}%`;
      } 
    }

    function tryWave() {
      if (player.waveCharge < 1 || state.waveCooldown > 0) return;
      waves.push({ 
        y: player.y - 22,
        vy: -900,
        kills: 0,
      });
      addShake(10);
      if (audioEnabled) bling();
      player.waveCharge = 0;
      addCharge(0);
      state.waveCooldown = balance.waveCooldown;
    }

    function addScore(n) {
      state.score += n;
      elScore.textContent = 'SCORE' + String(state.score).padStart(6, '0');
    }

    function loseLife() {
      state.lives--;
      renderLives();
      if (state.lives <= 0) {
        gameOver();
        return;
      }

      player.x = W / 2;
      player.cd = 0;
      invaders.dir = 1;
      invaders.stepY = 26;
      setGlitter(false);
      setFreeze(false);
      plaer.waveCharge = 0;
      addCharge(0);
    }

    function renderLives() {
      elLives.textContent = '❤'.repeat(state.lives);
    }

    function gameOver() {
      state.running = false;
      if (splash) {
        spalsh.style.display = 'flex';
        splash.querySelector('h1').textContent = 'Game Over';
        splash.querySelector('p').textContent = `Final score: ${state.score}. Press Play to retry`
      }
    }

    function spawnPuff(x, y, hue) {
      for (let i = 0; i < 8; i++) {
        pfx.push({
          x, y, vx: rand(-60, 60),
          vy: rand(-120, -10), 
          a: 1,
          fade: rand(1.2, 1.8),
          h: hue
        });
      }
    }

    //--------- Draw ----------
    function draw() {
      let ox = 0, oy = 0;
      if (state.shakeA > 0) {
        ox = (Math.random() * 2 - 1) * state.shakeA;
        oy = (Math.random() * 2 - 1) * state.shakeA;
      }

      ctx.save();
      ctx.translate(ox, oy);
      ctx.clearRect(-ox, -oy, W, H);
      drawBackdrop();
      drawShip(player.x, player.y);

      // bullets
      for (const s of shots) {
        if (s.pierce && s.trail?.length) {
          for (let i = 0; i < s.trail.length; i++) {
            const t = s.trail[i];
            const a = Math.max(0, t.t);
            ctx.fillStyle = `hsla(${(state.t * 180 + i * 20) % 360} 90% 70% / ${a*0.6})`;
            ctx.beginPath();
            ctx.arc(t.x, t.y, 2 + i * 0.08, 0, Math.PI * 2);
            ctx.fill();
          }tx.
        }
        ctx.fillStyle= '#fff';
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
      }

      // invaders
      for (const e of invaders.list) drawAlien(e);

      // drops
      for (const d of drops) drawDrops(d);

      // waves
      for (const wv of waves) drawWave(wv);

      // particles
      for (const p of pfx) {
        ctx.fillStyle = `hsla(${p.h} 90% 70% / ${p.a})`;
        ctx.fillRect(p.x, p.y, 3, 3);
      }

      if (state.freezeTimer > 0) {
        ctx.fillStyle = 'rgba(120, 180, 255, 0.15)';
        ctx.fillRect(-ox, -oy, W, H);
      }

      ctx.restore();
    }

    function drawBackdrop() {
      const g = ctx.createRadialGradient(W / 2, H * 0.2, 60, W / 2, H * 0.2, H * 0.9);
      g.addColorStop(0, 'rgba(255, 255, 255, 0.03)');
      g.addColorStop(1, 'rgba(0, 0, 0, 0.0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 0.35;
      for (let i = 0; i < 60; i++) {
        ctx.fillStyle = i % 2 ? 'rgba(255, 255, 255, 0.5)' : 'rgba(200, 200, 255, 0.5)';
        ctx.fillRect((i * 97 + (state.t * 40 * i) % W) % W, (i * 53) % H, 2, 2);
      }
      ctx.globalAlpha = 1;
    }

    function drawShip(x, y) {
      ctx.save();
      ctx.translate(x, y);
      ctx.fillStyle = '#ffffff';
      roundRect(-28, -10, 56, 20, 8);
      ctx.fill();
      ctx.fillStyle = '#c9b7ff';
      ctx.fillRect(-8, -14, 16, 8);
      ctx.restore();
    }

    function drawAlien(e) {
      const t = state.t * 4;
      const bob = Math.sin((e.x + e.y) * 0.02 + t) * 1.5;
      ctx.save();
      ctx.translate(e.x + 18, e.y + 12 + bob);
      ctx.fillStyle = `hsl(${e.hue} 90% 70%)`;
      roundRect(-18, -12, 36, 24, 6);
      ctx.fill();
      ctx.fillStyle = '#1b1830';
      ctx.fillRect(-8, -2, 6, 6);
      ctx.fillRect(2, -2, 6, 6);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
      ctx.fillRect(6, -6, 4, 4);
      ctx.restore();
    }

    function drawDrop(d) {
      ctx.save();
      ctx.translate(d.x, d.y);
      if (d.type === 'glitter') {
        ctx.fillStyle = '#ffffff';
        roundRect(-10, -8, 20, 16, 6);
        ctx.fill();
        ctx.fillStyle = '#c9b7ff';
        ctx.fillRect(-4, -12, 8, 6);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.fillRect(5, -10, 3, 3);
      } else if (d.type === 'freeze') {
        ctx.fillStyle = '#e8f3ff';
        roundRect(-10, -8, 20, 16, 6);
        ctx.fill();
        ctx.fillStyle = '#88c6ff';
        ctx.fillRect(-4, -12, 8, 6);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.fillRect(5, -10, 3, 3);
      }
      ctx.restore();
    }

    function drawWave(wv) {
      const y = wv.y;
      const grad = ctx.createLinearGradient(0, y, W, y);
      grad.addColorStop(0, 'hsla(320, 90%, 70%, 0.0)');
      grad.addColorStop(0.25, 'hsla(300, 90%, 70%, 0.0)');
      grad.addColorStop(0.5, 'hsla(260, 90%, 70%, 0.0)');
      grad.addColorStop(0.75, 'hsla(200, 90%, 70%, 0.0)');
      grad.addColorStop(1, 'hsla(180, 90%, 70%, 0.0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, y-3, W, 6);
    }

    function roundRect(x, y, w, h, r) {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
    }

    //------ Bootstrap ---------
    if (playBtn) playBtn.addEventListener('click', start);
    if (muteBtn) muteBtn.addEventListener('click', () => setAudio(!audioEnabled));

    function start() {
      state.running = true;
      state.paused = false;
      state.score = 0;
      state.lives = 3;
      state.level = 1;
      renderLives();
      elScore.textContent = 'SCORE 000000';
      elLevel.textContent = 'LV 1';
      elStatue.textContent = '';
      player.waveCooldown = 0;
      spawnWave(1);
      if (splash) splash.style.display = 'none';
      requestAnimationFrame(loop);
    }

    // expose helpers for debug
    window.SlayInvaders = {
      setAudio, setFreeze, setGlitter,
      addCharge:(x)=>addCharge(x), tryWave,
      state, player
    };
  }
})();
