function jsString(value) {
  return JSON.stringify(value ?? '')
}

function buildTriggerCode(trigger) {
  if (!trigger.ativo) return ''
  const metaEvent = jsString(trigger.meta_event)
  const config = trigger.config || {}
  const triggerId = jsString(trigger.id)

  if (trigger.tipo === 'click_link') {
    const filtro = jsString(config.filtro || '')
    const repeticao = jsString(config.repeticao || 'once_per_page')
    return `
  (function(){
    var fired = false;
    document.addEventListener('click', function(e){
      var a = e.target.closest('a[href]');
      if (!a) return;
      if (${filtro} && a.href.indexOf(${filtro}) === -1) return;
      if (${repeticao} === 'once_per_page' && fired) return;
      if (${repeticao} === 'once_per_session' && getCookie('_ht_fired_' + ${triggerId})) return;
      fired = true;
      if (${repeticao} === 'once_per_session') document.cookie = '_ht_fired_' + ${triggerId} + '=1;path=/;max-age=86400';
      send(${metaEvent});
    }, true);
  })();`
  }

  if (trigger.tipo === 'click_element') {
    const seletor = jsString(config.filtro || '')
    return `
  (function(){
    if (!${seletor}) return;
    var fired = false;
    document.addEventListener('click', function(e){
      var el = e.target.closest(${seletor});
      if (!el || fired) return;
      fired = true;
      send(${metaEvent});
    }, true);
  })();`
  }

  if (trigger.tipo === 'scroll') {
    const pct = Number(config.porcentagem) || 50
    return `
  (function(){
    var fired = false;
    window.addEventListener('scroll', function(){
      if (fired) return;
      var scrolled = (window.scrollY + window.innerHeight) / document.body.scrollHeight * 100;
      if (scrolled >= ${pct}) { fired = true; send(${metaEvent}); }
    }, { passive: true });
  })();`
  }

  if (trigger.tipo === 'time_on_page') {
    const seconds = Number(config.segundos) || 30
    return `
  setTimeout(function(){ send(${metaEvent}); }, ${seconds * 1000});`
  }

  if (trigger.tipo === 'url_visited') {
    const contem = jsString(config.contem || '')
    return `
  (function(){
    if (${contem} && location.href.indexOf(${contem}) !== -1) send(${metaEvent});
  })();`
  }

  if (trigger.tipo === 'form_submit') {
    return `
  document.addEventListener('submit', function(e){
    var form = e.target;
    if (!(form instanceof HTMLFormElement)) return;
    var email = null, phone = null, nome = null;
    Array.prototype.forEach.call(form.elements, function(field){
      var name = (field.name || '').toLowerCase().replace(/[-_]/g, '');
      if (!name) return;
      if (name === 'email') email = field.value;
      else if (['tel', 'telefone', 'phone', 'celular', 'whatsapp'].indexOf(name) !== -1) phone = field.value;
      else if (name === 'name' || name === 'nome') nome = field.value;
    });
    send(${metaEvent}, { email: email, phone: phone, nome: nome });
  }, true);`
  }

  if (trigger.tipo === 'video_progress') {
    // Funciona com tags <video> nativas (HTML5/auto). Players customizados (ex:
    // VTURB) que não usam <video> não são suportados nesta versão.
    const thresholds = String(config.percentuais || '25,50,75,100')
      .split(',').map(s => Number(s.trim())).filter(n => n > 0 && n <= 100)
    return `
  (function(){
    var fired = {};
    var thresholds = ${JSON.stringify(thresholds)};
    document.querySelectorAll('video').forEach(function(video){
      video.addEventListener('timeupdate', function(){
        if (!video.duration) return;
        var pct = (video.currentTime / video.duration) * 100;
        thresholds.forEach(function(t){
          if (pct >= t && !fired[t]) { fired[t] = true; send(${metaEvent}, { percentual: t }); }
        });
      });
    });
  })();`
  }

  return ''
}

export function buildSnippet({ sessionTtlDays, triggers }) {
  const sessionTtlSeconds = Math.max(1, Number(sessionTtlDays) || 7) * 86400
  const triggerCode = (triggers || []).map(buildTriggerCode).join('\n')

  return `(function(){
  var COLLECT_URL = '/collect';
  var SESSION_TTL_SECONDS = ${sessionTtlSeconds};
  function getCookie(name){
    var m = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]+)'));
    return m ? decodeURIComponent(m[1]) : null;
  }
  function getOrCreateSid(){
    var existing = getCookie('_ht_sid');
    if (existing) return existing;
    var id = (crypto.randomUUID ? crypto.randomUUID() : (String(Date.now()) + Math.random().toString(16).slice(2)));
    document.cookie = '_ht_sid=' + id + ';path=/;max-age=' + SESSION_TTL_SECONDS + ';SameSite=Lax';
    return id;
  }
  function getFbc(){
    var fromCookie = getCookie('_fbc');
    if (fromCookie) return fromCookie;
    var params = new URLSearchParams(location.search);
    var fbclid = params.get('fbclid');
    return fbclid ? ('fb.1.' + Date.now() + '.' + fbclid) : null;
  }
  var sid = getOrCreateSid();
  function send(eventName, extra){
    var payload = {
      event_name: eventName,
      session_id: sid,
      fbp: getCookie('_fbp'),
      fbc: getFbc(),
      url: location.href,
      params: extra || {}
    };
    var body = JSON.stringify(payload);
    if (navigator.sendBeacon) {
      navigator.sendBeacon(COLLECT_URL, new Blob([body], { type: 'application/json' }));
    } else {
      fetch(COLLECT_URL, { method: 'POST', body: body, keepalive: true, headers: { 'Content-Type': 'application/json' } });
    }
  }
  window.HotTrack = { track: send };
  send('PageView');
${triggerCode}
})();`
}
