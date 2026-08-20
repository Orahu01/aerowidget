// AeroWidget — site behaviour
// 表紙の見本は実時間で動かす。アプリと同じものが出ているという説得力のため。

(function () {
  'use strict';

  var WD = ['日', '月', '火', '水', '木', '金', '土'];

  function tick() {
    var clock = document.querySelector('.screen .clock');
    if (!clock) return;
    var now = new Date();
    var pad = function (n) { return n < 10 ? '0' + n : '' + n; };

    clock.textContent = pad(now.getHours()) + ':' + pad(now.getMinutes());

    var date = document.querySelector('.screen .date');
    if (date) {
      date.textContent = now.getFullYear() + '年' + (now.getMonth() + 1) + '月' +
        now.getDate() + '日 ' + WD[now.getDay()] + '曜日';
    }
    var today = document.querySelector('.screen .cal u');
    if (today) today.textContent = now.getDate();
  }

  tick();
  setInterval(tick, 10000);

  // 狭い画面のメニュー
  var btn = document.querySelector('.menu-btn');
  var nav = document.querySelector('nav.site');
  if (btn && nav) {
    btn.addEventListener('click', function () {
      var open = nav.classList.toggle('open');
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  }
})();
