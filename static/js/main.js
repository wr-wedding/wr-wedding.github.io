/* ===========================================================================
   Wedding invitation front-end.
   build.py injects every runtime setting as JSON into <script id="site-config">.
   =========================================================================== */
(function () {
  'use strict';

  var cfgEl = document.getElementById('site-config');
  var CFG = cfgEl ? JSON.parse(cfgEl.textContent) : {};

  /* ── Toast ──────────────────────────────────────────────────────────── */
  var toastEl = null, toastTimer = null;
  function toast(msg) {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.className = 'toast';
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    requestAnimationFrame(function () { toastEl.classList.add('is-on'); });
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('is-on'); }, 1800);
  }

  /* ── Copy buttons (accounts, address, link) ─────────────────────────── */
  document.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-copy]');
    if (!btn) return;
    var text = btn.getAttribute('data-copy');
    var done = btn.getAttribute('data-done') || 'Copied';
    copyText(text).then(function () { toast(done); });
  });

  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text);
    }
    // Fallback for environments that block the clipboard API, such as the
    // KakaoTalk in-app browser.
    return new Promise(function (resolve) {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:absolute;left:-9999px;';
      document.body.appendChild(ta);
      ta.select();
      ta.setSelectionRange(0, ta.value.length);
      try { document.execCommand('copy'); } catch (err) {}
      document.body.removeChild(ta);
      resolve();
    });
  }

  /* ── D-day ──────────────────────────────────────────────────────────── */
  (function dday() {
    var el = document.getElementById('dday');
    if (!el || !CFG.wedding) return;
    var target = new Date(CFG.wedding.iso + 'T00:00:00+09:00');
    var today = new Date();
    var days = Math.ceil((target - today) / 86400000);
    var s = CFG.strings.dday;
    if (days > 0) el.textContent = (s.prefix ? s.prefix + ' ' : '') + days + s.suffix;
    else if (days === 0) el.textContent = s.today;
    else el.textContent = '';
  })();

  /* ── Cover title on one line ────────────────────────────────────────── */
  (function coverTitle() {
    var el = document.querySelector('.cover__script');
    if (!el) return;

    /* The line is sized from the viewport, which assumes Petit Formal Script.
       Until that arrives, or if it never does, the fallback script face is
       wider and the phrase runs off the edge. So measure and trim. */
    function fit() {
      el.style.fontSize = '';
      var limit = el.clientWidth;
      if (!limit) return;
      var size = parseFloat(getComputedStyle(el).fontSize);
      // scrollWidth still reports the whole line inside a nowrap box
      while (el.scrollWidth > limit && size > 12) {
        size -= 0.5;
        el.style.fontSize = size + 'px';
      }
    }

    fit();
    window.addEventListener('resize', fit);
    window.addEventListener('orientationchange', fit);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(fit);
  })();

  /* ── Loading third-party scripts on approach ────────────────────────── */
  var loading = {};

  function loadScript(src) {
    if (!loading[src]) {
      loading[src] = new Promise(function (resolve, reject) {
        var el = document.createElement('script');
        el.src = src;
        el.async = true;
        el.onload = function () { resolve(); };
        el.onerror = function () { reject(new Error(src)); };
        document.head.appendChild(el);
      });
    }
    return loading[src];
  }

  /* Kakao's SDKs live below the fold. Fetching them as the reader nears the
     section keeps a slow round trip out of the first paint, and still gets them
     in place before the section is touched. */
  function whenNear(el, fn) {
    if (!el || !('IntersectionObserver' in window)) { fn(); return; }
    var io = new IntersectionObserver(function (entries) {
      for (var i = 0; i < entries.length; i++) {
        if (entries[i].isIntersecting) { io.disconnect(); fn(); return; }
      }
    }, { rootMargin: '600px' });
    io.observe(el);
  }

  /* ── Kakao Map ──────────────────────────────────────────────────────── */
  (function map() {
    var el = document.getElementById('map');
    if (!el) return;
    var v = CFG.venue;

    function fallback() {
      // No key, or the SDK failed to load. Leave the address and a link instead.
      el.innerHTML = '<div style="display:grid;place-items:center;height:100%;' +
        'font-size:13px;color:#8A8177;text-align:center;padding:16px;">' +
        '<span>' + CFG.strings.mapFallback + '<br><a style="color:#C1663F" href="' +
        kakaoWebUrl() + '" target="_blank" rel="noopener">' + v.navName + '</a></span></div>';
    }

    function draw() {
      kakao.maps.load(function () {
        var center = new kakao.maps.LatLng(v.lat, v.lng);
        var map = new kakao.maps.Map(el, { center: center, level: 4 });
        new kakao.maps.Marker({ map: map, position: center });
        map.addControl(new kakao.maps.ZoomControl(), kakao.maps.ControlPosition.RIGHT);
        // Keep page scrolling from zooming the map; a tap re-enables zoom.
        map.setZoomable(false);
        kakao.maps.event.addListener(map, 'click', function () { map.setZoomable(true); });
      });
    }

    if (!CFG.kakaoKey) { fallback(); return; }

    whenNear(el, function () {
      loadScript('https://dapi.kakao.com/v2/maps/sdk.js?appkey=' +
                 encodeURIComponent(CFG.kakaoKey) + '&autoload=false')
        .then(function () {
          if (window.kakao && window.kakao.maps) draw(); else fallback();
        })
        .catch(fallback);
    });
  })();

  /* ── Navigation deep links ──────────────────────────────────────────── */
  function kakaoWebUrl() {
    var v = CFG.venue;
    return 'https://map.kakao.com/link/to/' +
      encodeURIComponent(v.navName) + ',' + v.lat + ',' + v.lng;
  }

  function openApp(scheme, webFallback) {
    var start = Date.now();
    var timer = setTimeout(function () {
      // If the app opened, this page went to the background and the timer is late.
      if (document.hidden || Date.now() - start > 1600) return;
      window.location.href = webFallback;
    }, 1200);
    document.addEventListener('visibilitychange', function once() {
      if (document.hidden) clearTimeout(timer);
      document.removeEventListener('visibilitychange', once);
    });
    window.location.href = scheme;
  }

  (function navButtons() {
    var v = CFG.venue;
    if (!v) return;
    var name = encodeURIComponent(v.navName);
    var host = location.hostname || 'wedding';

    var links = {
      'nav-kakao': {
        scheme: 'kakaonavi://navigate?name=' + name + '&x=' + v.lng + '&y=' + v.lat + '&coord_type=wgs84',
        web: kakaoWebUrl()
      },
      'nav-naver': {
        scheme: 'nmap://route/car?dlat=' + v.lat + '&dlng=' + v.lng + '&dname=' + name + '&appname=' + host,
        web: 'https://map.naver.com/p/search/' + name
      },
      'nav-tmap': {
        scheme: 'tmap://route?goalname=' + name + '&goalx=' + v.lng + '&goaly=' + v.lat,
        web: 'https://tmap.life/route?goalname=' + name + '&goalx=' + v.lng + '&goaly=' + v.lat
      }
    };

    Object.keys(links).forEach(function (id) {
      var a = document.getElementById(id);
      if (!a) return;
      a.setAttribute('href', links[id].web);
      a.addEventListener('click', function (e) {
        e.preventDefault();
        openApp(links[id].scheme, links[id].web);
      });
    });
  })();

  /* ── Gallery slider + lightbox ─────────────────────────────────────── */
  (function gallery() {
    var track = document.getElementById('slides');
    var box = document.getElementById('lightbox');
    var urls = CFG.gallery || [];
    if (!track && !box) return;

    var GAP = 8;   // must match .slider__track gap in the stylesheet

    /* -- slider: native scroll-snap for swiping, buttons drive the same scroll -- */
    var prevBtn = document.getElementById('slide-prev');
    var nextBtn = document.getElementById('slide-next');
    var indexEl = document.getElementById('slide-index');
    var last = track ? track.children.length - 1 : 0;
    var current = 0;

    function step() {
      var slide = track && track.querySelector('.slide');
      return slide ? slide.getBoundingClientRect().width + GAP : 0;
    }

    function sync() {
      var w = step();
      if (!w) return;
      current = Math.max(0, Math.min(Math.round(track.scrollLeft / w), last));
      if (indexEl) indexEl.textContent = current + 1;
      if (prevBtn) prevBtn.disabled = current === 0;
      if (nextBtn) nextBtn.disabled = current === last;
    }

    function goTo(i) {
      if (!track) return;
      track.scrollTo({ left: Math.max(0, Math.min(i, last)) * step(), behavior: 'smooth' });
    }

    if (track) {
      var settle;
      track.addEventListener('scroll', function () {
        clearTimeout(settle);
        settle = setTimeout(sync, 80);
      }, { passive: true });
      // Where supported this fires the moment snapping finishes, so the
      // counter does not lag behind the swipe.
      if ('onscrollend' in window) {
        track.addEventListener('scrollend', sync);
      }

      if (prevBtn) prevBtn.addEventListener('click', function () { goTo(current - 1); });
      if (nextBtn) nextBtn.addEventListener('click', function () { goTo(current + 1); });

      track.addEventListener('keydown', function (e) {
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
        e.preventDefault();
        goTo(current + (e.key === 'ArrowRight' ? 1 : -1));
      });

      track.addEventListener('click', function (e) {
        var img = e.target.closest('.slide img');
        if (img && box) open(parseInt(img.getAttribute('data-index'), 10) || 0);
      });

      window.addEventListener('resize', sync);
      sync();
    }

    /* -- lightbox: same two ways in, plus keyboard -- */
    if (!box) return;

    var lbImg = document.getElementById('lb-img');
    var lbCount = document.getElementById('lb-count');
    var lbPrev = document.getElementById('lb-prev');
    var lbNext = document.getElementById('lb-next');
    var lbIndex = 0;

    function preload(i) {
      if (i < 0 || i >= urls.length) return;
      var im = new Image();
      im.src = urls[i];
    }

    function show(i) {
      lbIndex = Math.max(0, Math.min(i, urls.length - 1));
      lbImg.src = urls[lbIndex];
      if (lbCount) lbCount.textContent = (lbIndex + 1) + ' / ' + urls.length;
      if (lbPrev) lbPrev.disabled = lbIndex === 0;
      if (lbNext) lbNext.disabled = lbIndex === urls.length - 1;
      preload(lbIndex + 1);
      preload(lbIndex - 1);
    }

    function open(i) {
      if (!urls.length) return;
      show(i);
      box.hidden = false;
      document.body.style.overflow = 'hidden';
    }

    function close() {
      box.hidden = true;
      lbImg.src = '';
      document.body.style.overflow = '';
      goTo(lbIndex);   // leave the slider on whatever photo was last viewed
    }

    if (lbPrev) lbPrev.addEventListener('click', function (e) { e.stopPropagation(); show(lbIndex - 1); });
    if (lbNext) lbNext.addEventListener('click', function (e) { e.stopPropagation(); show(lbIndex + 1); });
    var closeBtn = document.getElementById('lb-close');
    if (closeBtn) closeBtn.addEventListener('click', close);

    box.addEventListener('click', function (e) {
      if (e.target === box) close();   // backdrop only
    });

    document.addEventListener('keydown', function (e) {
      if (box.hidden) return;
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowLeft') show(lbIndex - 1);
      else if (e.key === 'ArrowRight') show(lbIndex + 1);
    });

    var sx = 0, sy = 0, swiping = false;
    box.addEventListener('touchstart', function (e) {
      if (e.touches.length !== 1) return;
      sx = e.touches[0].clientX;
      sy = e.touches[0].clientY;
      swiping = true;
    }, { passive: true });

    box.addEventListener('touchend', function (e) {
      if (!swiping) return;
      swiping = false;
      var dx = e.changedTouches[0].clientX - sx;
      var dy = e.changedTouches[0].clientY - sy;
      if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy)) show(lbIndex + (dx < 0 ? 1 : -1));
    }, { passive: true });
  })();

  /* ── RSVP ───────────────────────────────────────────────────────────── */
  (function rsvp() {
    var form = document.getElementById('rsvp-form');
    if (!form) return;
    var status = document.getElementById('rsvp-status');
    var s = CFG.strings.rsvp;
    var endpoint = CFG.rsvpEndpoint;

    form.addEventListener('submit', function (e) {
      e.preventDefault();

      if (!endpoint) {
        status.textContent = 'rsvp.endpoint is empty in data/site.yaml.';
        return;
      }

      var btn = form.querySelector('button[type="submit"]');
      btn.disabled = true;
      status.textContent = s.sending;

      var fd = new FormData(form);
      var payload = {
        type: 'rsvp',
        lang: document.documentElement.lang,
        submittedAt: new Date().toISOString()
      };
      fd.forEach(function (val, key) { payload[key] = val; });

      // Apps Script sends no CORS headers, so post with no-cors + text/plain.
      fetch(endpoint, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload)
      }).then(function () {
        status.textContent = s.done;
        form.querySelectorAll('input, textarea, button').forEach(function (el) { el.disabled = true; });
      }).catch(function () {
        status.textContent = s.error;
        btn.disabled = false;
      });
    });
  })();

  /* ── KakaoTalk share ────────────────────────────────────────────────── */
  (function share() {
    var btn = document.getElementById('share-kakao');
    if (!btn) return;

    /* The SDK is fetched as the section comes into view rather than on the
       click itself: sendDefault opens a window, and a browser only allows that
       while the tap is still in hand, which a pending download would spend. */
    if (CFG.kakaoKey) {
      whenNear(document.getElementById('share'), function () {
        loadScript('https://t1.kakaocdn.net/kakao_js_sdk/2.7.6/kakao.min.js')
          .then(function () {
            try {
              if (!Kakao.isInitialized()) Kakao.init(CFG.kakaoKey);
            } catch (err) { /* fall back to the native sheet on click */ }
          })
          .catch(function () { /* same */ });
      });
    }

    btn.addEventListener('click', function () {
      if (window.Kakao && Kakao.Share && CFG.kakaoKey) {
        try {
          if (!Kakao.isInitialized()) Kakao.init(CFG.kakaoKey);
          Kakao.Share.sendDefault({
            objectType: 'feed',
            content: {
              title: CFG.share.title,
              description: CFG.share.description,
              imageUrl: CFG.share.image,
              link: { mobileWebUrl: CFG.share.url, webUrl: CFG.share.url }
            },
            buttons: [{
              title: CFG.share.buttonLabel,
              link: { mobileWebUrl: CFG.share.url, webUrl: CFG.share.url }
            }]
          });
          return;
        } catch (err) { /* fall through */ }
      }
      // Without the SDK, fall back to the native share sheet.
      if (navigator.share) {
        navigator.share({ title: CFG.share.title, text: CFG.share.description, url: CFG.share.url });
      } else {
        copyText(CFG.share.url).then(function () { toast(CFG.strings.linkCopied); });
      }
    });
  })();

  /* ── Crossword ──────────────────────────────────────────────────────── */
  (function crossword() {
    var cfg = CFG.crossword;
    var board = document.querySelector('.xw__board');
    var comp = document.getElementById('xw-composer');
    if (!cfg || !board || !comp) return;

    var answers = cfg.cells;                    // [row][col] -> syllable or null
    var entries = cfg.entries;
    var s = cfg.strings;
    var status = document.getElementById('xw-status');

    /* Korean is typed one syllable at a time out of two or three keystrokes, so
       a per-cell input would have to steal focus while the IME is still
       assembling and the caret would jump after every jamo. Instead the grid is
       pure display and a single field holds the whole answer: the keyboard sees
       one uninterrupted composition, and each character it settles on is
       painted into the next square. */

    var cells = {};                             // "r,c" -> td
    [].forEach.call(board.querySelectorAll('.xw__cell[data-r]'), function (el) {
      cells[el.dataset.r + ',' + el.dataset.c] = el;
    });

    var filled = answers.map(function (row) {
      return row.map(function (ch) { return ch ? '' : null; });
    });

    var dir = 'across';
    var cur = null;                             // [row, col] the caret sits in
    var seat = null;                            // cells of the entry being typed

    function td(r, c) { return cells[r + ',' + c]; }
    function has(r, c) { return !!td(r, c); }

    /* -- which cells belong to the entry running through (r, c) -- */
    function span(r, c, d) {
      var dr = d === 'down' ? 1 : 0, dc = d === 'down' ? 0 : 1;
      var r0 = r, c0 = c;
      while (has(r0 - dr, c0 - dc)) { r0 -= dr; c0 -= dc; }
      var out = [];
      while (has(r0, c0)) { out.push([r0, c0]); r0 += dr; c0 += dc; }
      return out;
    }

    function hasEntry(r, c, d) { return span(r, c, d).length > 1; }

    function index() {
      var i = comp.selectionStart;
      if (i === null || i === undefined) i = comp.value.length;
      return Math.max(0, Math.min(i, seat.length - 1));
    }

    /* -- draw every square from the model -- */
    function render() {
      for (var r = 0; r < filled.length; r++) {
        for (var c = 0; c < filled[r].length; c++) {
          if (filled[r][c] === null) continue;
          td(r, c).querySelector('.xw__ch').textContent = filled[r][c];
        }
      }
    }

    function paint() {
      [].forEach.call(board.querySelectorAll('.xw__cell'), function (el) {
        el.classList.remove('is-lit', 'is-on');
      });
      [].forEach.call(document.querySelectorAll('.xw__list li'), function (li) {
        li.classList.remove('is-lit');
      });
      if (!seat) return;

      seat.forEach(function (p) { td(p[0], p[1]).classList.add('is-lit'); });
      var here = seat[index()];
      cur = here;
      var box = td(here[0], here[1]);
      box.classList.add('is-on');

      // park the invisible field over the active square
      var a = box.getBoundingClientRect(), b = board.getBoundingClientRect();
      comp.style.left = (a.left - b.left) + 'px';
      comp.style.top = (a.top - b.top) + 'px';
      comp.style.width = a.width + 'px';
      comp.style.height = a.height + 'px';

      var head = seat[0];
      var li = document.querySelector(
        '.xw__list li[data-dir="' + dir + '"][data-r="' + head[0] + '"][data-c="' + head[1] + '"]');
      if (li) li.classList.add('is-lit');
    }

    /* -- model <-> field -- */
    function load(caret) {
      var v = '';
      seat.forEach(function (p) { v += filled[p[0]][p[1]] || ' '; });
      comp.value = v;
      var i = Math.max(0, Math.min(caret, seat.length));
      comp.setSelectionRange(i, i);
    }

    /* An insertion pushes the characters after the caret along, which would
       shove a crossing answer sideways. Drop exactly what spilled past the end
       so typing overwrites the square instead. */
    function fit(v, caret) {
      var n = seat.length;
      if (v.length > n) return v.slice(0, caret) + v.slice(caret + (v.length - n));
      while (v.length < n) v += ' ';
      return v;
    }

    function store(v) {
      seat.forEach(function (p, i) {
        var ch = v.charAt(i);
        filled[p[0]][p[1]] = ch === ' ' ? '' : ch;
        td(p[0], p[1]).classList.remove('is-wrong');
      });
    }

    function sit(r, c, d, caret) {
      dir = d;
      seat = span(r, c, d);
      var i = 0;
      for (var k = 0; k < seat.length; k++) {
        if (seat[k][0] === r && seat[k][1] === c) { i = k; break; }
      }
      load(caret === undefined ? i : caret);
      render();
      paint();
    }

    /* -- picking a square -- */
    board.addEventListener('mousedown', function (e) {
      var box = e.target.closest('.xw__cell[data-r]');
      if (!box) return;
      e.preventDefault();                        // keep the field focused
      var r = +box.dataset.r, c = +box.dataset.c;
      var d = dir;
      if (cur && cur[0] === r && cur[1] === c && hasEntry(r, c, d === 'across' ? 'down' : 'across')) {
        d = d === 'across' ? 'down' : 'across';  // tapping again turns the corner
      } else if (!hasEntry(r, c, d)) {
        d = d === 'across' ? 'down' : 'across';
      }
      sit(r, c, d);
      comp.focus();
    });

    board.addEventListener('touchstart', function (e) {
      if (e.target.closest('.xw__cell[data-r]')) e.preventDefault();
    }, { passive: false });

    /* -- typing -- */
    var composing = false;

    comp.addEventListener('compositionstart', function () { composing = true; });
    comp.addEventListener('compositionend', function () {
      composing = false;
      apply();
    });

    function apply() {
      if (!seat) return;
      var caret = comp.selectionStart;
      var v = fit(comp.value, caret);
      store(v);
      // rewriting the field mid-composition would abort the syllable, so the
      // tidied value is only written back once the IME has let go
      if (!composing && comp.value !== v) {
        comp.value = v;
        var i = Math.max(0, Math.min(caret, seat.length));
        comp.setSelectionRange(i, i);
      }
      render();
      paint();
      mark();
    }

    comp.addEventListener('input', apply);
    comp.addEventListener('click', paint);
    comp.addEventListener('keyup', function (e) {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'Home' || e.key === 'End') paint();
    });

    comp.addEventListener('keydown', function (e) {
      if (!seat) return;
      var here = seat[index()];
      var r = here[0], c = here[1];
      var other = dir === 'across' ? 'down' : 'across';
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        if (dir === 'down') {
          var nr = r + (e.key === 'ArrowDown' ? 1 : -1);
          if (has(nr, c)) sit(nr, c, 'down');
        } else if (hasEntry(r, c, other)) {
          sit(r, c, other);
        }
      } else if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && dir === 'down') {
        e.preventDefault();
        var nc = c + (e.key === 'ArrowRight' ? 1 : -1);
        if (has(r, nc)) sit(r, nc, hasEntry(r, nc, 'across') ? 'across' : 'down');
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        next(e.shiftKey ? -1 : 1);
      }
    });

    /* -- moving between clues -- */
    function order() {
      var out = [];
      ['across', 'down'].forEach(function (d) {
        entries[d].forEach(function (entry) { out.push([d, entry]); });
      });
      return out;
    }

    function next(way) {
      var list = order();
      var pos = 0;
      if (seat) {
        for (var i = 0; i < list.length; i++) {
          if (list[i][0] === dir && list[i][1].row === seat[0][0] && list[i][1].col === seat[0][1]) {
            pos = i;
            break;
          }
        }
      }
      var pick = list[(pos + way + list.length) % list.length];
      sit(pick[1].row, pick[1].col, pick[0], 0);
      comp.focus();
    }

    document.addEventListener('click', function (e) {
      var li = e.target.closest('.xw__list li');
      if (!li) return;
      sit(+li.dataset.r, +li.dataset.c, li.dataset.dir, 0);
      comp.focus();
    });

    /* -- progress: cross out clues whose answer is complete and correct -- */
    function mark() {
      var all = true;
      ['across', 'down'].forEach(function (d) {
        entries[d].forEach(function (entry) {
          var done = true;
          for (var i = 0; i < entry.len; i++) {
            var r = entry.row + (d === 'down' ? i : 0);
            var c = entry.col + (d === 'down' ? 0 : i);
            if (filled[r][c] !== answers[r][c]) { done = false; break; }
          }
          if (!done) all = false;
          var li = document.querySelector(
            '.xw__list li[data-dir="' + d + '"][data-r="' + entry.row + '"][data-c="' + entry.col + '"]');
          if (li) li.classList.toggle('is-done', done);
        });
      });
      if (all) status.textContent = s.solved;
      return all;
    }

    function eachCell(fn) {
      for (var r = 0; r < answers.length; r++) {
        for (var c = 0; c < answers[r].length; c++) {
          if (answers[r][c]) fn(r, c, answers[r][c]);
        }
      }
    }

    document.getElementById('xw-check').addEventListener('click', function () {
      var wrong = 0;
      eachCell(function (r, c, ch) {
        var bad = !!filled[r][c] && filled[r][c] !== ch;
        td(r, c).classList.toggle('is-wrong', bad);
        if (bad) wrong++;
      });
      status.textContent = mark() ? s.solved : (wrong ? s.wrong : '');
    });

    document.getElementById('xw-reveal').addEventListener('click', function () {
      eachCell(function (r, c, ch) {
        filled[r][c] = ch;
        td(r, c).classList.remove('is-wrong');
      });
      if (seat) load(comp.selectionStart);
      render();
      mark();
    });

    document.getElementById('xw-clear').addEventListener('click', function () {
      eachCell(function (r, c) {
        filled[r][c] = '';
        td(r, c).classList.remove('is-wrong');
      });
      if (seat) load(0);
      render();
      status.textContent = '';
      mark();
    });

    // start on the first clue so the highlight explains itself
    var opening = order()[0];
    if (opening) sit(opening[1].row, opening[1].col, opening[0], 0);
  })();

  /* ── Scroll reveal ──────────────────────────────────────────────────── */
  (function reveal() {
    var items = document.querySelectorAll('.reveal');
    if (!('IntersectionObserver' in window)) {
      items.forEach(function (el) { el.classList.add('is-in'); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-in');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12 });
    items.forEach(function (el) { io.observe(el); });
  })();

})();
