/* ═══════════════════════════════════════════════════════════════════════════
   DEMO — archivo aparte (demo.js).
   Se carga desde ping-pong.html con <script src="demo.js"></script>.
   Súbelo también a la carpeta public/ junto a ping-pong.html.
   · 5 partidas.
   · Empieza SIEMPRE con el tutorial obligatorio, que NO cuenta como partida.
   · Usa el tutorial del juego (startTutorial) con: mandatory, note y onFinish.
   · No da monedas, gemas, estadísticas ni misiones (window.noProgress).
   ═══════════════════════════════════════════════════════════════════════════ */
(function(){
  const DEMO_TXT = {
 "es": {
  "demo_tut_note": "El tutorial no cuenta como partida. La demo tiene 5 partidas.",
  "demo_btn": "🎮 Demo",
  "demo_badge": "5 partidas",
  "demo_left_one": "DEMO — {n} partida restante",
  "demo_left_many": "DEMO — {n} partidas restantes",
  "demo_exit": "✖ Salir de la Demo",
  "demo_done_t": "¡Demo completada!",
  "demo_done_d": "Has jugado las 5 partidas de prueba. ¡Sigue jugando para conseguir CoinClothes y Exclusives!",
  "demo_keep": "Seguir jugando",
  "demo_menu": "Ir al menú",
  "demo_create": "Crear cuenta"
 },
 "en": {
  "demo_tut_note": "The tutorial doesn't count as a match. The demo has 5 matches.",
  "demo_btn": "🎮 Demo",
  "demo_badge": "5 matches",
  "demo_left_one": "DEMO — {n} match left",
  "demo_left_many": "DEMO — {n} matches left",
  "demo_exit": "✖ Exit Demo",
  "demo_done_t": "Demo complete!",
  "demo_done_d": "You have played the 5 trial matches. Keep playing to earn CoinClothes and Exclusives!",
  "demo_keep": "Keep playing",
  "demo_menu": "Go to menu",
  "demo_create": "Create account"
 },
 "pt": {
  "demo_tut_note": "O tutorial não conta como partida. A demo tem 5 partidas.",
  "demo_btn": "🎮 Demo",
  "demo_badge": "5 partidas",
  "demo_left_one": "DEMO — {n} partida restante",
  "demo_left_many": "DEMO — {n} partidas restantes",
  "demo_exit": "✖ Sair da Demo",
  "demo_done_t": "Demo concluída!",
  "demo_done_d": "Você jogou as 5 partidas de teste. Continue jogando para ganhar CoinClothes e Exclusives!",
  "demo_keep": "Continuar jogando",
  "demo_menu": "Ir ao menu",
  "demo_create": "Criar conta"
 },
 "de": {
  "demo_tut_note": "Das Tutorial zählt nicht als Spiel. Die Demo hat 5 Spiele.",
  "demo_btn": "🎮 Demo",
  "demo_badge": "5 Spiele",
  "demo_left_one": "DEMO — noch {n} Spiel",
  "demo_left_many": "DEMO — noch {n} Spiele",
  "demo_exit": "✖ Demo beenden",
  "demo_done_t": "Demo abgeschlossen!",
  "demo_done_d": "Du hast die 5 Testspiele gespielt. Spiele weiter, um CoinClothes und Exclusives zu sammeln!",
  "demo_keep": "Weiterspielen",
  "demo_menu": "Zum Menü",
  "demo_create": "Konto erstellen"
 },
 "fr": {
  "demo_tut_note": "Le tutoriel ne compte pas comme match. La démo a 5 matchs.",
  "demo_btn": "🎮 Démo",
  "demo_badge": "5 matchs",
  "demo_left_one": "DÉMO — {n} match restant",
  "demo_left_many": "DÉMO — {n} matchs restants",
  "demo_exit": "✖ Quitter la Démo",
  "demo_done_t": "Démo terminée !",
  "demo_done_d": "Vous avez joué les 5 matchs d'essai. Continuez à jouer pour gagner des CoinClothes et des Exclusives !",
  "demo_keep": "Continuer à jouer",
  "demo_menu": "Aller au menu",
  "demo_create": "Créer un compte"
 },
 "ja": {
  "demo_tut_note": "チュートリアルは試合に数えません。デモは5試合です。",
  "demo_btn": "🎮 デモ",
  "demo_badge": "5試合",
  "demo_left_one": "デモ — 残り{n}試合",
  "demo_left_many": "デモ — 残り{n}試合",
  "demo_exit": "✖ デモを終了",
  "demo_done_t": "デモ完了！",
  "demo_done_d": "5試合のお試しプレイが終わりました。遊び続けて CoinClothes と Exclusives を集めよう！",
  "demo_keep": "プレイを続ける",
  "demo_menu": "メニューへ",
  "demo_create": "アカウント作成"
 },
 "zh": {
  "demo_tut_note": "教程不计入对局。试玩共5场。",
  "demo_btn": "🎮 试玩",
  "demo_badge": "5场比赛",
  "demo_left_one": "试玩 — 还剩 {n} 场",
  "demo_left_many": "试玩 — 还剩 {n} 场",
  "demo_exit": "✖ 退出试玩",
  "demo_done_t": "试玩结束！",
  "demo_done_d": "你已完成5场试玩比赛。继续游戏来赚取 CoinClothes 和 Exclusives 吧！",
  "demo_keep": "继续游戏",
  "demo_menu": "返回菜单",
  "demo_create": "创建账号"
 }
};
  Object.keys(DEMO_TXT).forEach(l=>{ if(LANGS[l]) Object.assign(LANGS[l], DEMO_TXT[l]); });

  let demoActive=false, demoMatchesLeft=0;

  function setFlags(){ window.noProgress = demoActive; }

  function injectCSS(){
    const st=document.createElement('style');
    st.textContent='.demo-badge{background:#ff224422;border:1.5px solid #ff2244;color:#ff2244;font-family:\'Orbitron\',monospace;font-size:.5rem;letter-spacing:.12em;padding:3px 8px;border-radius:8px;display:inline-block;}';
    document.head.appendChild(st);
  }

  function demoLeftText(){ return tf(demoMatchesLeft===1?'demo_left_one':'demo_left_many',{n:demoMatchesLeft}); }

  function showBanner(){
    let el=document.getElementById('demoBanner');
    if(!el){
      el=document.createElement('div');
      el.id='demoBanner';
      el.style.cssText='position:fixed;bottom:56px;left:50%;transform:translateX(-50%);z-index:500;display:flex;align-items:center;gap:10px;font-family:Orbitron,monospace;font-size:.55rem;letter-spacing:.1em;background:rgba(20,0,5,.88);border:1px solid #ff2244;color:#ff2244;padding:5px 6px 5px 14px;border-radius:14px;';
      const span=document.createElement('span'); span.id='demoBannerTxt';
      const btn=document.createElement('button'); btn.id='demoExitBtn';
      btn.style.cssText='background:#ff2244;border:none;color:#fff;font-family:inherit;font-size:.5rem;letter-spacing:.08em;padding:6px 10px;border-radius:9px;cursor:pointer;';
      btn.onclick=exitDemo;
      el.appendChild(span); el.appendChild(btn);
      document.body.appendChild(el);
    }
    document.getElementById('demoBannerTxt').textContent=demoLeftText();
    document.getElementById('demoExitBtn').textContent=t('demo_exit');
    el.style.display='flex';
  }
  function hideBanner(){ const el=document.getElementById('demoBanner'); if(el) el.style.display='none'; }

  // Tras el tutorial empieza la primera partida de la demo
  function firstMatch(){ goTo('s1P'); go1P(); showBanner(); }

  function startDemo(){
    demoActive=true; demoMatchesLeft=5; setFlags(); hideBanner();
    startTutorial({mandatory:true, note:t('demo_tut_note'), onFinish:firstMatch});
  }

  function exitDemo(){
    demoActive=false; demoMatchesLeft=0; setFlags();
    hideBanner(); tutStop();
    if(gameRunning) backToMenu(); else goTo('sMenu');
  }

  function showEnd(){
    const btns=[{label:t('demo_keep')},{label:t('demo_menu'), onClick:()=>{ if(gameRunning) backToMenu(); else goTo('sMenu'); }}];
    if(window.ACCOUNTS_ENABLED) btns.push({label:t('demo_create'), onClick:()=>{ if(gameRunning) backToMenu(); goTo('sAccount'); }});
    uiModal('<div style="color:#ffe44d;font-weight:700;font-size:.85rem">'+t('demo_done_t')+'</div>'+
            '<div style="color:#aaa;font-size:.68rem;margin-top:10px;line-height:1.6">'+t('demo_done_d')+'</div>', btns);
  }

  function matchPlayed(){
    if(!demoActive) return;
    demoMatchesLeft--;
    if(demoMatchesLeft<=0){
      demoActive=false; setFlags(); hideBanner();
      setTimeout(showEnd,1200);
    } else showBanner();
  }

  function injectUI(){
    const tutBtn=document.querySelector('#sMode button[onclick="startTutorial()"]');
    if(!tutBtn) return;
    const tutRow=tutBtn.closest('.row'); if(!tutRow) return;
    const row=document.createElement('div'); row.className='row'; row.style.marginTop='4px';
    const b=document.createElement('button'); b.className='btn sm'; b.id='demoStartBtn';
    b.style.cssText='border-color:#ff2244;color:#ff2244';
    b.setAttribute('data-i18n','demo_btn'); b.textContent=t('demo_btn'); b.onclick=startDemo;
    const badge=document.createElement('span'); badge.className='demo-badge';
    badge.setAttribute('data-i18n','demo_badge'); badge.textContent=t('demo_badge');
    row.appendChild(b); row.appendChild(badge);
    tutRow.parentNode.insertBefore(row, tutRow);
  }

  // Ganchos que el juego llama al terminar una partida y al cambiar de idioma
  window.onMatchFinished=function(){ matchPlayed(); };
  window.onLangChange=function(){ if(demoActive) showBanner(); };

  injectCSS(); injectUI();
  window.startDemo=startDemo;
})();
