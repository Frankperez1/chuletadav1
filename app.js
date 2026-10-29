// Solo dibuja y llama a la API local (api-local.js). Las reglas (estados, totales, candados) están allí.
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const money = (n) => 'S/ ' + Number(n || 0).toFixed(2);
const ls = { get: (k) => { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} } };
let role = ls.get('chu_role'), me = ls.get('chu_me'), tab = 's', filtro = 'todas', wipe = false, timer = null, sure = false;

async function api(path, body) {
  const r = await fetch(path, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error || 'Error');
  return d;
}
const typing = () => document.activeElement && document.activeElement.matches('.row input,td input');
const debounce = (fn, ms = 400) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

async function stats() {
  const s = await api('/api/stats' + (role === 's' ? '?seller=' + encodeURIComponent(me) : ''));
  $('stats').innerHTML = `<div>Tarjetas<b>${s.tarjetas}</b></div><div class="g">Pagadas<b>${s.pagadas}</b></div>` +
    `<div class="r">Entregadas sin pagar<b>${s.entregadas_sin_pagar}</b></div><div class="g">Cobrado<b>${money(s.cobrado)}</b></div>`;
}
const rowCash = (f) => `<div class="row ${f.estado}"><span class="n">#${f.n}</span><span class="i">${f.name ? 'Entregada a ' + esc(f.name) : '<i>Sin entregar</i>'}<small>Vendedor: ${esc(f.seller) || '—'}${f.locked ? ' · 🔒 cerrada' : ''}</small></span>` +
  `<span class="badge ${f.estado}">${f.paid ? 'PAGADO' : 'NO PAGADO'}</span><button class="btn" data-tg="${f.n}" data-paid="${f.paid ? 0 : 1}">${f.paid ? 'Anular' : 'Marcar pagado'}</button>` +
  (role === 'a' ? `<button class="btn" data-lk="${f.n}" data-l="${f.locked ? 0 : 1}">${f.locked ? '🔓 Reabrir' : '🔒 Cerrar'}</button>` : '') + '</div>';

async function rSeller() {
  const d = await api(`/api/cards?seller=${encodeURIComponent(me)}&limit=500&q=${encodeURIComponent($('sq').value)}`);
  $('sl').innerHTML = d.cards.map((f) => `<div class="row ${f.estado}"><span class="n">#${f.n}</span>` +
    `<input type="text" data-nm="${f.n}" value="${esc(f.name)}" placeholder="Entregada a…" ${f.locked ? 'disabled' : ''}>` +
    `<button class="btn ${f.paid ? 'ok' : ''}" data-tg="${f.n}" data-paid="${f.paid ? 0 : 1}" ${f.locked ? 'disabled' : ''}>${f.locked ? '🔒 ' : ''}${f.paid ? '✔ Pagó' : 'No pagó'}</button></div>`).join('') || '<p class="muted">Sin resultados.</p>';
}
async function rCash() {
  if (tab === 's') {
    $('chips').innerHTML = [['todas', 'Todas'], ['pagadas', 'Pagadas'], ['no_pagadas', 'No pagadas'], ['entregadas_sin_pagar', 'Entregadas sin pagar'], ['sin_entregar', 'Sin entregar']]
      .map(([k, l]) => `<button class="btn ${filtro === k ? 'on' : ''}" data-f="${k}">${l}</button>`).join('');
    const d = await api(`/api/cards?q=${encodeURIComponent($('q').value)}&filtro=${filtro}`);
    $('res').innerHTML = d.cards.map(rowCash).join('') + (d.total > 50 ? `<p class="muted">Mostrando 50 de ${d.total}. Escribe más para afinar.</p>` : '') || '<p class="muted">Sin resultados.</p>';
  }
  if (tab === 'v' && !typing()) {
    const d = await api('/api/resumen');
    const ro = role === 'a' ? '' : 'disabled';
    $('vt').innerHTML = '<tr><th>Vendedor</th><th>Desde</th><th>Hasta</th><th>Pagó</th><th>Sin pagar</th><th>Reporte</th><th></th></tr>' + d.filas.map((s, i) =>
      `<tr data-i="${i}"><td><input type="text" data-k="name" ${ro} value="${esc(s.name)}"></td><td><input class="sm" type="number" data-k="from_n" ${ro} value="${s.from_n || ''}"></td>` +
      `<td><input class="sm" type="number" data-k="to_n" ${ro} value="${s.to_n || ''}"></td><td style="color:var(--ok)"><b>${s.pagadas}</b></td><td style="color:var(--no)"><b>${s.sin_pagar}</b></td><td>${s.reporte ? '✔' : '<span class="muted">sin datos</span>'}</td><td>${role !== 'a' || s.from_n || s.to_n ? '' : `<button class="btn" data-del="${i}" title="Quitar">✖</button>`}</td></tr>`).join('');
  }
  if (tab === 'i' && !typing()) $('pr').value = (await api('/api/sellers')).price;
}
async function render() {
  $('login').classList.toggle('hide', !!role);
  $('app').classList.toggle('hide', !role);
  $('swap').classList.toggle('hide', !role);
  clearInterval(timer);
  if (!role) return;
  $('v-seller').classList.toggle('hide', role !== 's');
  $('v-cash').classList.toggle('hide', role === 's');
  document.querySelectorAll('.solo-admin').forEach((e) => e.classList.toggle('hide', role !== 'a'));
  if (role === 's') $('sdl').href = '/api/export?seller=' + encodeURIComponent(me);
  const go = async () => { try { await stats(); if (role === 's') { if (!typing()) await rSeller(); } else await rCash(); } catch (e) { $('foot').textContent = 'Error: ' + e.message; } };
  await go();
  timer = setInterval(() => { if (!typing() && document.visibilityState === 'visible') go(); }, 5000); // se refresca solo
}
async function setPaid(n, paid) { try { await api('/api/card', { n, paid: !!paid }); } catch (e) { $('foot').textContent = e.message; } render(); }
async function lockCard(n, l) { try { await api('/api/card', { n, lock: !!l }); } catch (e) { $('foot').textContent = e.message; } render(); }

(async () => {
  const d = await api('/api/sellers');
  $('lsel').innerHTML = d.sellers.map((s) => `<option value="${esc(s.name)}">${esc(s.name)}${s.from_n && s.to_n ? ` (${s.from_n}–${s.to_n})` : ''}</option>`).join('');
  render();
})();
$('lseller').onclick = () => { role = 's'; me = $('lsel').value; ls.set('chu_role', role); ls.set('chu_me', me); render(); };
$('lcash').onclick = () => { role = 'c'; ls.set('chu_role', role); render(); };
$('ladmin').onclick = () => { role = 'a'; ls.set('chu_role', role); render(); };
$('swap').onclick = () => { role = ''; ls.set('chu_role', ''); render(); };
document.querySelector('.tabs').onclick = (e) => {
  const t = e.target.dataset.t; if (!t) return; tab = t;
  document.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('on', b.dataset.t === t));
  ['s', 'v', 'i'].forEach((x) => $('c-' + x).classList.toggle('hide', x !== t)); render();
};
document.body.onclick = (e) => {
  const d = e.target.dataset;
  if (d.tg) setPaid(+d.tg, +d.paid);
  if (d.lk) lockCard(+d.lk, +d.l);
  if (d.del !== undefined) delSeller(+d.del);
  if (d.f) { filtro = d.f; render(); }
};
const saveName = debounce(async (n, name) => { try { await api('/api/card', { n, name }); stats(); } catch (e) { $('foot').textContent = e.message; } });
const saveSellers = debounce(async () => {
  const rows = [...document.querySelectorAll('#vt tr[data-i]')].map((tr) => ({ name: tr.querySelector('[data-k=name]').value, from_n: +tr.querySelector('[data-k=from_n]').value, to_n: +tr.querySelector('[data-k=to_n]').value }));
  try { await api('/api/sellers', { sellers: rows }); } catch (e) { $('foot').textContent = e.message; }
});
document.body.oninput = (e) => {
  const t = e.target;
  if (t.dataset.nm) saveName(+t.dataset.nm, t.value);
  if (t.id === 'sq') rSeller(); if (t.id === 'q') rCash();
  if (t.closest('#vt')) saveSellers();
  if (t.id === 'pr') api('/api/price', { price: +t.value || 0 }).catch((er) => { $('foot').textContent = er.message; });
};
const sellersLista = async () => (await api('/api/sellers')).sellers.map((s) => ({ name: s.name, from_n: s.from_n, to_n: s.to_n }));
// Añadir vendedor: solo el nombre, sin tarjetas (el rango Desde/Hasta se puede llenar después en la tabla).
$('badd').onclick = async () => {
  const name = $('newname').value.trim().slice(0, 40);
  if (!name) { $('addmsg').textContent = 'Escribe el nombre.'; return; }
  try {
    const rows = await sellersLista();
    if (rows.some((s) => s.name.toLowerCase() === name.toLowerCase())) { $('addmsg').textContent = 'Ese nombre ya existe.'; return; }
    rows.push({ name, from_n: 0, to_n: 0 });
    await api('/api/sellers', { sellers: rows });
    $('newname').value = ''; $('addmsg').textContent = '✔ Añadido: ' + name;
    $('lsel').innerHTML = (await api('/api/sellers')).sellers.map((s) => `<option value="${esc(s.name)}">${esc(s.name)}${s.from_n && s.to_n ? ` (${s.from_n}–${s.to_n})` : ''}</option>`).join('');
  } catch (e) { $('addmsg').textContent = e.message; }
  render();
};
// Solo se pueden quitar vendedores que no tienen tarjetas asignadas.
async function delSeller(i) {
  try {
    const rows = await sellersLista();
    if (rows[i] && !rows[i].from_n && !rows[i].to_n) { rows.splice(i, 1); await api('/api/sellers', { sellers: rows }); }
  } catch (e) { $('foot').textContent = e.message; }
  render();
}
$('slock').onclick = async () => {
  if (!sure) { sure = true; $('slock').textContent = '¿Seguro? Ya no podrás cambiar nada. Pulsa otra vez'; return; }
  try { await api('/api/lock', { seller: me }); $('slmsg').textContent = '✔ Guardado y cerrado. Solo el administrador puede cambiarlo ahora.'; }
  catch (e) { $('slmsg').textContent = e.message; }
  sure = false; $('slock').textContent = '💾 Guardar y cerrar mis tarjetas'; render();
};
$('scopy').onclick = async () => {
  const txt = await (await fetch('/api/export?texto=1&seller=' + encodeURIComponent(me))).text();
  $('sta').value = txt; $('sta').classList.remove('hide'); $('sta').select();
  let ok = false; try { await navigator.clipboard.writeText(txt); ok = true; } catch (e) { try { ok = document.execCommand('copy'); } catch (e2) {} }
  $('smsg').textContent = ok ? 'Copiado ✔ Pégalo en WhatsApp.' : 'Selecciona el texto y cópialo.';
};
$('bimp').onclick = async () => {
  let text = $('ita').value;
  for (const f of $('ifile').files) text += '\n' + await f.text();
  try { const r = await api('/api/import', { text }); $('imsg').textContent = r.respaldos ? `✔ ${r.respaldos} respaldo(s): ` + r.detalle.map((x) => `${x.de} (${x.actualizadas})`).join(', ') + (r.no_validos ? ` · ${r.no_validos} no válido(s)` : '') : 'No se encontró ningún respaldo válido.'; $('ita').value = ''; $('ifile').value = ''; render(); }
  catch (e) { $('imsg').textContent = e.message; }
};
$('bwipe').onclick = async () => {
  if (!wipe) { wipe = true; $('bwipe').textContent = '¿Seguro? Pulsa otra vez'; return; }
  try { await api('/api/reset', {}); } catch (e) { $('foot').textContent = e.message; }
  wipe = false; $('bwipe').textContent = 'Borrar todo lo registrado'; render();
};
