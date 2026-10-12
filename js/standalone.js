(function(){
  'use strict';
  function ready(fn){ if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',fn); else fn(); }
  ready(function(){
    // ElementsKit mobile off-canvas menu without WordPress/Elementor JS.
    document.addEventListener('click', function(e){
      var toggle=e.target.closest('.elementskit-menu-toggler');
      if(!toggle) return;
      e.preventDefault();
      var wrap=toggle.closest('.ekit-wid-con') || toggle.parentElement;
      if(!wrap) return;
      wrap.querySelectorAll('.elementskit-menu-offcanvas-elements').forEach(function(el){ el.classList.toggle('active'); });
    });
    document.querySelectorAll('.elementskit-navbar-nav a').forEach(function(a){
      a.addEventListener('click', function(){
        var wrap=a.closest('.ekit-wid-con');
        if(!wrap) return;
        wrap.querySelectorAll('.elementskit-menu-offcanvas-elements.active').forEach(function(el){ el.classList.remove('active'); });
      });
    });
    // Keep exported Elementor dropdown toggle usable if it becomes visible at a breakpoint.
    document.querySelectorAll('.elementor-menu-toggle').forEach(function(btn){
      btn.addEventListener('click', function(){
        var widget=btn.closest('.elementor-widget-nav-menu');
        var menu=widget && widget.querySelector('.elementor-nav-menu--dropdown');
        if(!menu) return;
        var open=btn.getAttribute('aria-expanded')==='true';
        btn.setAttribute('aria-expanded', String(!open));
        menu.setAttribute('aria-hidden', String(open));
        menu.style.display=open?'none':'block';
      });
    });
    // Native <details> powers the FAQ accordion; keep aria-expanded synchronized.
    document.querySelectorAll('details.e-n-accordion-item').forEach(function(d){
      var s=d.querySelector('summary');
      if(!s) return;
      var sync=function(){ s.setAttribute('aria-expanded', d.open?'true':'false'); };
      d.addEventListener('toggle',sync); sync();
    });
  });
})();
