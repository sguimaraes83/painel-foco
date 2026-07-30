(function(){
  // ---------- Supabase client ----------
  if(!window.supabase || SUPABASE_URL.includes('COLE_AQUI')){
    document.body.innerHTML = `
      <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;
        font-family:sans-serif;color:#E7ECF5;background:#0B1220;padding:20px;text-align:center;">
        <div>
          <h2>Configuração pendente</h2>
          <p style="color:#8CA0C3;max-width:420px;">
            Abra <code>config.js</code> e cole a URL e a chave "anon" do seu projeto Supabase
            antes de usar o painel. Veja o passo a passo em README.md.
          </p>
        </div>
      </div>`;
    return;
  }

  const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  // Fuso horário fixo do sistema: Brasília, independente do fuso do navegador
  const BR_TZ = 'America/Sao_Paulo';

  function dateToStrBR(dateObj){
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: BR_TZ, year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(dateObj);
    const y = parts.find(p => p.type === 'year').value;
    const m = parts.find(p => p.type === 'month').value;
    const d = parts.find(p => p.type === 'day').value;
    return `${y}-${m}-${d}`;
  }
  function addDaysStr(dateStr, delta){
    const dt = new Date(dateStr + 'T12:00:00-03:00');
    dt.setDate(dt.getDate() + delta);
    return dateToStrBR(dt);
  }
  const todayStr = () => dateToStrBR(new Date());
  const fmtDatePT = (d) => new Date(d + 'T12:00:00-03:00').toLocaleDateString('pt-BR', { weekday:'long', day:'2-digit', month:'long', timeZone: BR_TZ });
  const fmtDateShort = (d) => new Date(d + 'T12:00:00-03:00').toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit', year:'numeric', timeZone: BR_TZ });
  const minutesToHM = (m) => { const h = Math.floor(m/60), mm = m % 60; return h > 0 ? `${h}h${mm.toString().padStart(2,'0')}` : `${mm}min`; };

  function getWeekdayMon0(dateStr){
    // Calcula o dia da semana (Segunda=0 ... Domingo=6) puramente pelo calendário,
    // sem depender do fuso do navegador.
    const [y, m, d] = dateStr.split('-').map(Number);
    const jsDay = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0=Dom,1=Seg,...6=Sáb
    return (jsDay + 6) % 7;
  }
  function getMondayOfWeek(dateStr){
    return addDaysStr(dateStr, -getWeekdayMon0(dateStr));
  }

  // Categorias padrão — usadas apenas para semear a conta na primeira vez
  // e para migrar automaticamente atividades antigas (criadas antes do CRUD de categorias).
  const DEFAULT_CATEGORIES = [
    { code:'dev',      label:'Desenvolvimento Novo',        color:'#2DD4BF', is_meeting:false, sort_order:1 },
    { code:'bug',      label:'Correção de Bugs',             color:'#F87171', is_meeting:false, sort_order:2 },
    { code:'arqbuild', label:'Construção de Arquitetura',    color:'#A78BFA', is_meeting:false, sort_order:3 },
    { code:'refine',   label:'Refinamento de Requisitos',    color:'#38BDF8', is_meeting:false, sort_order:4 },
    { code:'arqsol',   label:'Solução de Arquitetura',       color:'#E879F9', is_meeting:false, sort_order:5 },
    { code:'scrum',    label:'Reunião Ágil (SCRUM)',         color:'#F5A623', is_meeting:true,  sort_order:6 },
  ];
  const NO_CAT = { id:null, label:'Sem categoria', color:'#5B6E92', is_meeting:false };
  const DAY_BUDGET = 480; // 8h

  let currentUser = null;
  let categories = [];   // {id, label, color, is_meeting, code, sort_order}
  let activities = [];   // {id, date, category_id, project, description, duration, status, value, created_at}
  let currentTab = 'hoje';
  let projectFilter = '';
  let viewDate = null;
  let editingId = null;
  let editingCatId = null;
  let lastReport = null;

  const catById = id => categories.find(c => c.id === id) || NO_CAT;

  // ============================================================
  // AUTH
  // ============================================================
  function showAuthMsg(id, text, type){
    const el = document.getElementById(id);
    el.textContent = text;
    el.className = 'auth-msg show' + (type ? ' ' + type : '');
  }

  document.querySelectorAll('.auth-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(tab.dataset.form + '-form').classList.add('active');
    });
  });

  document.getElementById('forgot-link').addEventListener('click', () => {
    document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
    document.getElementById('forgot-form').classList.add('active');
  });
  document.getElementById('back-to-login-link').addEventListener('click', () => {
    document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
    document.querySelector('.auth-tab[data-form="login"]').classList.add('active');
    document.getElementById('login-form').classList.add('active');
  });

  document.getElementById('signup-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('signup-email').value.trim();
    const pass = document.getElementById('signup-password').value;
    const pass2 = document.getElementById('signup-password2').value;
    const btn = document.getElementById('signup-btn');
    if(pass !== pass2){ showAuthMsg('signup-msg', 'As senhas não conferem.', 'error'); return; }

    btn.disabled = true; btn.textContent = 'Criando...';
    const { error } = await sb.auth.signUp({
      email, password: pass,
      options: { emailRedirectTo: window.location.origin + window.location.pathname }
    });
    btn.disabled = false; btn.textContent = 'Criar conta';

    if(error){ showAuthMsg('signup-msg', traduzErro(error), 'error'); return; }
    showAuthMsg('signup-msg', 'Conta criada! Verifique seu email e clique no link de confirmação antes de entrar.', 'ok');
    e.target.reset();
  });

  document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value.trim();
    const pass = document.getElementById('login-password').value;
    const btn = document.getElementById('login-btn');

    btn.disabled = true; btn.textContent = 'Entrando...';
    const { error } = await sb.auth.signInWithPassword({ email, password: pass });
    btn.disabled = false; btn.textContent = 'Entrar';

    if(error){ showAuthMsg('login-msg', traduzErro(error), 'error'); return; }
  });

  document.getElementById('forgot-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('forgot-email').value.trim();
    const btn = document.getElementById('forgot-btn');

    btn.disabled = true; btn.textContent = 'Enviando...';
    const { error } = await sb.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + window.location.pathname
    });
    btn.disabled = false; btn.textContent = 'Enviar link de redefinição';

    if(error){ showAuthMsg('forgot-msg', traduzErro(error), 'error'); return; }
    showAuthMsg('forgot-msg', 'Se o email existir, um link de redefinição foi enviado.', 'ok');
  });

  document.getElementById('logout-btn').addEventListener('click', async () => { await sb.auth.signOut(); });

  function traduzErro(error){
    const msg = (error && error.message) || '';
    if(msg.includes('Invalid login credentials')) return 'Email ou senha incorretos.';
    if(msg.includes('Email not confirmed')) return 'Confirme seu email antes de entrar (verifique sua caixa de entrada).';
    if(msg.includes('User already registered')) return 'Já existe uma conta com este email. Tente entrar.';
    if(msg.includes('Password should be')) return 'A senha precisa ter pelo menos 6 caracteres.';
    return msg || 'Ocorreu um erro. Tente novamente.';
  }

  sb.auth.onAuthStateChange((event, session) => {
    if(session && session.user){
      currentUser = session.user;
      if(!viewDate) viewDate = todayStr();
      document.getElementById('auth-screen').style.display = 'none';
      document.getElementById('app-screen').style.display = 'block';
      document.getElementById('user-email').textContent = currentUser.email;
      bootstrap();
    } else {
      currentUser = null;
      activities = [];
      categories = [];
      document.getElementById('app-screen').style.display = 'none';
      document.getElementById('auth-screen').style.display = 'flex';
    }
  });

  async function bootstrap(){
    await initCategories();
    await migrateLegacyCategories();
    await loadActivities();
  }

  // ============================================================
  // CATEGORIAS — dados
  // ============================================================
  async function initCategories(){
    const { data, error } = await sb.from('categories').select('*').order('sort_order').order('created_at');
    if(error){ console.error('Erro ao carregar categorias:', error); categories = []; return; }

    if(!data || data.length === 0){
      const seed = DEFAULT_CATEGORIES.map(c => ({ ...c, user_id: currentUser.id }));
      const { error: seedError } = await sb.from('categories').insert(seed);
      if(seedError){ console.error('Erro ao criar categorias padrão:', seedError); }
      const retry = await sb.from('categories').select('*').order('sort_order').order('created_at');
      categories = retry.data || [];
    } else {
      categories = data;
    }
    buildCatChips();
  }

  async function migrateLegacyCategories(){
    // Atividades antigas (de antes do CRUD de categorias) guardam um código de texto
    // em "cat_id" e ainda não têm "category_id" preenchido. Vincula automaticamente.
    const { data, error } = await sb.from('activities').select('id, cat_id').is('category_id', null).not('cat_id', 'is', null);
    if(error || !data || data.length === 0) return;

    const codes = [...new Set(data.map(r => r.cat_id).filter(Boolean))];
    for(const code of codes){
      const cat = categories.find(c => c.code === code);
      if(!cat) continue;
      await sb.from('activities').update({ category_id: cat.id }).eq('cat_id', code).is('category_id', null);
    }
  }

  async function loadActivities(){
    const { data, error } = await sb.from('activities').select('*').order('created_at', { ascending: false });
    activities = error ? [] : (data || []);
    if(error) console.error('Erro ao carregar atividades:', error);
    render();
  }

  // ============================================================
  // CATEGORIAS — CRUD (modal)
  // ============================================================
  document.getElementById('manage-cats-btn').addEventListener('click', openCatsModal);
  document.getElementById('cats-modal-close').addEventListener('click', closeCatsModal);
  document.getElementById('cats-modal').addEventListener('click', (e) => {
    if(e.target.id === 'cats-modal') closeCatsModal();
  });

  function openCatsModal(){
    renderCatsList();
    document.getElementById('cats-modal').classList.add('open');
  }
  function closeCatsModal(){
    document.getElementById('cats-modal').classList.remove('open');
    exitCatEditMode();
    clearCatForm();
  }

  function renderCatsList(){
    const box = document.getElementById('cats-list');
    if(categories.length === 0){
      box.innerHTML = '<div class="empty-note">Nenhuma categoria cadastrada ainda.</div>';
      return;
    }
    box.innerHTML = categories.map(c => `
      <div class="cat-row">
        <div class="cat-swatch" style="background:${c.color}"></div>
        <div class="name">${c.label}${c.is_meeting ? ' <span class="meeting-tag">reunião</span>' : ''}</div>
        <button class="edit-btn" data-id="${c.id}" title="Editar">✎</button>
        <button class="del-btn" data-id="${c.id}" title="Remover">✕</button>
      </div>
    `).join('');
    box.querySelectorAll('.edit-btn').forEach(b => b.addEventListener('click', () => startCatEdit(b.dataset.id)));
    box.querySelectorAll('.del-btn').forEach(b => b.addEventListener('click', () => handleDeleteCategory(b.dataset.id)));
  }

  function clearCatForm(){
    document.getElementById('cat-f-label').value = '';
    document.getElementById('cat-f-color').value = '#38BDF8';
    document.getElementById('cat-f-meeting').checked = false;
  }

  function startCatEdit(id){
    const c = categories.find(x => x.id === id);
    if(!c) return;
    editingCatId = id;
    document.getElementById('cat-f-label').value = c.label;
    document.getElementById('cat-f-color').value = c.color;
    document.getElementById('cat-f-meeting').checked = !!c.is_meeting;
    document.getElementById('cat-form-title').textContent = 'Editar categoria';
    document.getElementById('cat-save-btn').textContent = 'Salvar alterações';
    document.getElementById('cat-cancel-btn').style.display = 'block';
  }
  function exitCatEditMode(){
    editingCatId = null;
    document.getElementById('cat-form-title').textContent = 'Nova categoria';
    document.getElementById('cat-save-btn').textContent = 'Adicionar categoria';
    document.getElementById('cat-cancel-btn').style.display = 'none';
  }

  document.getElementById('cat-cancel-btn').addEventListener('click', () => { exitCatEditMode(); clearCatForm(); });

  document.getElementById('cat-save-btn').addEventListener('click', async () => {
    const label = document.getElementById('cat-f-label').value.trim();
    const color = document.getElementById('cat-f-color').value;
    const is_meeting = document.getElementById('cat-f-meeting').checked;
    if(!label){ alert('Dê um nome para a categoria.'); return; }

    const btn = document.getElementById('cat-save-btn');
    btn.disabled = true;

    if(editingCatId){
      const { error } = await sb.from('categories').update({ label, color, is_meeting }).eq('id', editingCatId);
      if(error) alert('Erro ao atualizar categoria: ' + error.message);
      exitCatEditMode();
    } else {
      const sort_order = categories.length > 0 ? Math.max(...categories.map(c => c.sort_order || 0)) + 1 : 1;
      const { error } = await sb.from('categories').insert({ user_id: currentUser.id, label, color, is_meeting, sort_order });
      if(error) alert('Erro ao criar categoria: ' + error.message);
    }

    btn.disabled = false;
    clearCatForm();
    await initCategories();
    renderCatsList();
    render();
  });

  async function handleDeleteCategory(id){
    const inUse = activities.filter(a => a.category_id === id).length;
    const msg = inUse > 0
      ? `${inUse} atividade(s) usam esta categoria e ficarão sem categoria. Remover mesmo assim?`
      : 'Remover esta categoria?';
    if(!confirm(msg)) return;

    const { error } = await sb.from('categories').delete().eq('id', id);
    if(error){ alert('Erro ao remover categoria: ' + error.message); return; }

    if(editingCatId === id){ exitCatEditMode(); clearCatForm(); }
    await initCategories();
    await loadActivities();
    renderCatsList();
  }

  // ============================================================
  // FORM DE ATIVIDADE / CHIPS DE CATEGORIA
  // ============================================================
  function buildCatChips(){
    const box = document.getElementById('cat-select');
    const previouslySelected = getSelectedCat();
    box.innerHTML = '';
    categories.forEach((c) => {
      const chip = document.createElement('div');
      chip.className = 'chip';
      chip.textContent = c.label;
      chip.dataset.id = c.id;
      chip.addEventListener('click', () => setSelectedCat(c.id));
      box.appendChild(chip);
    });
    const toSelect = categories.find(c => c.id === previouslySelected) ? previouslySelected : (categories[0] && categories[0].id);
    if(toSelect) setSelectedCat(toSelect);
  }

  function getSelectedCat(){
    const active = document.querySelector('#cat-select .chip.active');
    return active ? active.dataset.id : null;
  }
  function setSelectedCat(catId){
    const box = document.getElementById('cat-select');
    [...box.children].forEach(ch => {
      const c = catById(ch.dataset.id);
      if(ch.dataset.id === catId){
        ch.classList.add('active'); ch.style.background = c.color; ch.style.color = '#0B1220';
      } else {
        ch.classList.remove('active'); ch.style.background = ''; ch.style.color = '';
      }
    });
  }

  function clearForm(){
    document.getElementById('f-date').value = viewDate || todayStr();
    document.getElementById('f-project').value = '';
    document.getElementById('f-duration').value = '';
    document.getElementById('f-desc').value = '';
    document.getElementById('f-status').value = 'Concluída';
    document.getElementById('f-value').value = 'Alto';
    if(categories[0]) setSelectedCat(categories[0].id);
  }

  async function submitActivity(){
    const date = document.getElementById('f-date').value || todayStr();
    const project = document.getElementById('f-project').value.trim() || 'Sem projeto';
    const duration = parseInt(document.getElementById('f-duration').value, 10);
    const description = document.getElementById('f-desc').value.trim();
    const status = document.getElementById('f-status').value;
    const value = document.getElementById('f-value').value;
    const category_id = getSelectedCat();

    if(!duration || duration <= 0){ alert('Informe a duração da atividade em minutos.'); return; }
    if(!category_id){ alert('Cadastre ao menos uma categoria antes de registrar atividades.'); return; }

    const btn = document.getElementById('add-btn');
    btn.disabled = true;

    if(editingId){
      const { error } = await sb.from('activities').update({ date, category_id, project, description, duration, status, value }).eq('id', editingId);
      if(error) alert('Erro ao atualizar atividade: ' + error.message);
      exitEditMode();
    } else {
      const { error } = await sb.from('activities').insert({ user_id: currentUser.id, date, category_id, project, description, duration, status, value });
      if(error) alert('Erro ao salvar atividade: ' + error.message);
      viewDate = date;
    }

    btn.disabled = false;
    clearForm();
    await loadActivities();
  }

  function startEdit(id){
    const a = activities.find(x => x.id === id);
    if(!a) return;
    editingId = id;

    setSelectedCat(a.category_id);
    document.getElementById('f-date').value = a.date;
    document.getElementById('f-project').value = a.project === 'Sem projeto' ? '' : a.project;
    document.getElementById('f-duration').value = a.duration;
    document.getElementById('f-desc').value = a.description || '';
    document.getElementById('f-status').value = a.status;
    document.getElementById('f-value').value = a.value;

    document.getElementById('form-title').innerHTML = 'Editar atividade <span class="tag" style="background:var(--sky)">Editando</span>';
    document.getElementById('add-btn').textContent = 'Salvar alterações';
    document.getElementById('cancel-btn').style.display = 'block';

    document.querySelector('.panel').scrollIntoView({ behavior:'smooth', block:'start' });
    render();
  }

  function exitEditMode(){
    editingId = null;
    document.getElementById('form-title').innerHTML = 'Registrar atividade <span class="tag">Novo</span>';
    document.getElementById('add-btn').textContent = '+ Adicionar ao dia';
    document.getElementById('cancel-btn').style.display = 'none';
  }

  async function handleDelete(id){
    if(!confirm('Remover esta atividade?')) return;
    if(editingId === id){ exitEditMode(); clearForm(); }
    const { error } = await sb.from('activities').delete().eq('id', id);
    if(error){ alert('Erro ao remover atividade: ' + error.message); return; }
    await loadActivities();
  }

  // ============================================================
  // RENDER — painel do dia
  // ============================================================
  function computeStats(list){
    const total = list.reduce((s,a) => s + a.duration, 0);
    const meetingMin = list.filter(a => catById(a.category_id).is_meeting).reduce((s,a)=>s+a.duration,0);
    const blockedMin = list.filter(a => a.status === 'Bloqueada').reduce((s,a)=>s+a.duration,0);
    const reworkMin = list.filter(a => a.status === 'Retrabalho').reduce((s,a)=>s+a.duration,0);
    const highValueMin = list.filter(a => a.value === 'Alto').reduce((s,a)=>s+a.duration,0);
    return { total, meetingMin, blockedMin, reworkMin, highValueMin };
  }

  function renderDial(stats, todays){
    const svg = document.getElementById('dial-svg');
    const cx=70, cy=70, r=58, stroke=13;
    const circumference = 2 * Math.PI * r;
    let segs = '', offset = 0;

    const byCat = {};
    todays.forEach(a => { byCat[a.category_id] = (byCat[a.category_id]||0) + a.duration; });

    categories.forEach(c => {
      const min = byCat[c.id] || 0;
      if(min <= 0) return;
      const frac = Math.min(min, DAY_BUDGET) / DAY_BUDGET;
      const len = frac * circumference;
      segs += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${c.color}"
        stroke-width="${stroke}" stroke-dasharray="${len} ${circumference}"
        stroke-dashoffset="${-offset}" stroke-linecap="butt" transform="rotate(-90 ${cx} ${cy})" />`;
      offset += len;
    });

    svg.innerHTML = `
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#1E2A44" stroke-width="${stroke}" />
      ${segs}
      <text x="${cx}" y="${cy-4}" text-anchor="middle" font-family="JetBrains Mono" font-size="18" fill="#E7ECF5" font-weight="600">${Math.round((stats.total/DAY_BUDGET)*100)}%</text>
      <text x="${cx}" y="${cy+14}" text-anchor="middle" font-family="Inter" font-size="9" fill="#8CA0C3">da jornada</text>
    `;

    document.getElementById('dial-total').innerHTML = `${stats.total}<span>/${DAY_BUDGET} min</span>`;
    document.getElementById('stat-highvalue').textContent = stats.total ? Math.round((stats.highValueMin/stats.total)*100)+'%' : '0%';
    document.getElementById('stat-meetings').textContent = stats.total ? Math.round((stats.meetingMin/stats.total)*100)+'%' : '0%';
    document.getElementById('stat-blocked').textContent = minutesToHM(stats.blockedMin);
    document.getElementById('stat-rework').textContent = minutesToHM(stats.reworkMin);
  }

  function renderAlerts(stats, todays){
    const box = document.getElementById('alerts-box');
    const items = [];

    if(todays.length === 0){
      box.innerHTML = '<div class="empty-note">Registre a primeira atividade deste dia para ver os alertas de foco.</div>';
      return;
    }

    const meetingPct = stats.total ? stats.meetingMin/stats.total : 0;
    const highValuePct = stats.total ? stats.highValueMin/stats.total : 0;

    if(meetingPct > 0.30){
      items.push({ type:'bad', html: `<b>${Math.round(meetingPct*100)}% do tempo</b> foi consumido em reuniões neste dia. Considere blindar blocos de foco sem SCRUM.` });
    } else if(meetingPct > 0.20){
      items.push({ type:'warn', html: `Reuniões já somam <b>${Math.round(meetingPct*100)}%</b> do dia. Fique de olho para não passar de 25-30%.` });
    }
    if(stats.blockedMin > 0){
      const blockedItems = todays.filter(a => a.status === 'Bloqueada');
      items.push({ type:'bad', html: `<b>${minutesToHM(stats.blockedMin)}</b> em atividades bloqueadas (${blockedItems.length}). Escalar impedimentos antes que travem mais entregas.` });
    }
    if(stats.reworkMin > 0){
      items.push({ type:'warn', html: `<b>${minutesToHM(stats.reworkMin)}</b> classificados como retrabalho. Vale investigar a causa raiz.` });
    }
    if(stats.total > 0){
      if(highValuePct < 0.4){
        items.push({ type:'bad', html: `Apenas <b>${Math.round(highValuePct*100)}%</b> do tempo foi em atividades de alto valor. Reavalie prioridades.` });
      } else if(highValuePct >= 0.6){
        items.push({ type:'ok', html: `<b>${Math.round(highValuePct*100)}%</b> do dia em atividades de alto valor — foco saudável.` });
      }
    }
    if(stats.total > DAY_BUDGET){
      items.push({ type:'warn', html: `Total registrado (<b>${minutesToHM(stats.total)}</b>) já ultrapassa a jornada de 8h.` });
    }
    if(items.length === 0){
      items.push({ type:'ok', html: 'Sem sinais de bloqueio, retrabalho ou excesso de reuniões até agora. Continue assim.' });
    }
    box.innerHTML = items.map(i => `<div class="alert ${i.type}">${i.html}</div>`).join('');
  }

  function renderEntries(){
    const list = document.getElementById('entries-list');
    const empty = document.getElementById('entries-empty');
    let dayActs = activities.filter(a => a.date === viewDate);
    if(projectFilter) dayActs = dayActs.filter(a => a.project === projectFilter);
    dayActs = dayActs.slice().sort((a,b) => b.created_at.localeCompare(a.created_at));

    if(dayActs.length === 0){ list.innerHTML = ''; empty.style.display = 'block'; return; }
    empty.style.display = 'none';

    const statusClassMap = { 'Concluída':'concluida', 'Em andamento':'andamento', 'Bloqueada':'blocked', 'Retrabalho':'retrabalho' };

    list.innerHTML = dayActs.map(a => {
      const c = catById(a.category_id);
      const badges = [`<span class="badge ${statusClassMap[a.status] || 'andamento'}">${a.status}</span>`];
      const valClass = a.value === 'Alto' ? 'alto' : a.value === 'Médio' ? 'medio' : 'baixo';
      badges.push(`<span class="badge ${valClass}">${a.value}</span>`);

      return `
        <div class="entry${a.id === editingId ? ' editing' : ''}">
          <div class="entry-bar" style="background:${c.color}"></div>
          <div class="entry-time">${minutesToHM(a.duration)}</div>
          <div class="entry-main">
            <div class="cat" style="color:${c.color}">${c.label}</div>
            <div class="desc">${a.description ? a.description : '<span style="color:#5B6E92">Sem descrição</span>'}</div>
            <div class="proj">${a.project}</div>
          </div>
          <div style="display:flex; align-items:center; gap:8px;">
            <div class="badges">${badges.join('')}</div>
            <button class="edit-btn" data-id="${a.id}" title="Editar">✎</button>
            <button class="del-btn" data-id="${a.id}" title="Remover">✕</button>
          </div>
        </div>`;
    }).join('');

    list.querySelectorAll('.del-btn').forEach(btn => btn.addEventListener('click', () => handleDelete(btn.dataset.id)));
    list.querySelectorAll('.edit-btn').forEach(btn => btn.addEventListener('click', () => startEdit(btn.dataset.id)));
  }

  function getAllProjects(){ return [...new Set(activities.map(a => a.project))].sort(); }

  function renderProjectOptions(){
    const projects = getAllProjects();
    document.getElementById('project-list').innerHTML = projects.map(p => `<option value="${p}"></option>`).join('');

    const filterSel = document.getElementById('filter-project');
    const current = filterSel.value;
    filterSel.innerHTML = '<option value="">Todos os projetos</option>' + projects.map(p => `<option value="${p}">${p}</option>`).join('');
    filterSel.value = projects.includes(current) ? current : '';

    const reportSel = document.getElementById('report-project');
    const currentReport = reportSel.value;
    reportSel.innerHTML = '<option value="">Todos os projetos</option>' + projects.map(p => `<option value="${p}">${p}</option>`).join('');
    reportSel.value = projects.includes(currentReport) ? currentReport : '';
  }

  function renderWeek(){
    const chart = document.getElementById('week-chart');
    const monday = getMondayOfWeek(todayStr());
    const days = [];
    for(let i = 0; i <= 6; i++){ days.push(addDaysStr(monday, i)); }
    document.getElementById('week-period').textContent = `${fmtDateShort(days[0])} (Seg) — ${fmtDateShort(days[6])} (Dom)`;
    const maxTotal = Math.max(DAY_BUDGET, ...days.map(d => activities.filter(a => a.date === d).reduce((s,a)=>s+a.duration,0)));

    chart.innerHTML = days.map(d => {
      const dayActs = activities.filter(a => a.date === d);
      const total = dayActs.reduce((s,a)=>s+a.duration,0);
      const byCat = {};
      dayActs.forEach(a => { byCat[a.category_id] = (byCat[a.category_id]||0) + a.duration; });

      const segs = categories.map(c => {
        const min = byCat[c.id] || 0;
        if(min <= 0) return '';
        const pct = (min / maxTotal) * 100;
        return `<div class="week-seg" style="height:${pct}%; background:${c.color}"></div>`;
      }).join('');

      const label = new Date(d + 'T12:00:00-03:00').toLocaleDateString('pt-BR', { weekday:'short', timeZone: BR_TZ }).replace('.','');
      const isToday = d === todayStr();

      return `
        <div class="week-col">
          <div class="week-total">${total > 0 ? minutesToHM(total) : ''}</div>
          <div class="week-stack" style="opacity:${total>0?1:0.35}">${segs}</div>
          <div class="week-label" style="${isToday ? 'color:#F5A623' : ''}">${label}</div>
        </div>`;
    }).join('');

    document.getElementById('legend').innerHTML = categories.map(c => `
      <div class="legend-item"><div class="legend-dot" style="background:${c.color}"></div>${c.label}</div>
    `).join('');
  }

  function render(){
    document.getElementById('today-badge').textContent = fmtDatePT(todayStr());

    const dateInput = document.getElementById('filter-date');
    if(dateInput.value !== viewDate) dateInput.value = viewDate;

    const isToday = viewDate === todayStr();
    document.getElementById('capacity-title').textContent = isToday ? 'Capacidade do dia' : `Capacidade — ${fmtDatePT(viewDate)}`;

    const dayActs = activities.filter(a => a.date === viewDate);
    const stats = computeStats(dayActs);

    renderDial(stats, dayActs);
    renderAlerts(stats, dayActs);
    renderEntries();
    renderProjectOptions();
    renderWeek();
  }

  // ============================================================
  // RELATÓRIO POR PERÍODO
  // ============================================================
  function computeReport(from, to, project){
    const inRange = activities.filter(a => a.date >= from && a.date <= to && (!project || a.project === project));
    const stats = computeStats(inRange);

    const statusOrder = ['Concluída','Em andamento','Bloqueada','Retrabalho'];
    const byStatus = statusOrder.map(status => {
      const rows = inRange.filter(a => a.status === status);
      const minutes = rows.reduce((s,a)=>s+a.duration,0);
      return { status, count: rows.length, minutes, pct: stats.total ? minutes/stats.total : 0 };
    });

    const catIds = [...new Set(inRange.map(a => a.category_id))];
    const byCategory = catIds.map(cid => {
      const c = catById(cid);
      const rows = inRange.filter(a => a.category_id === cid);
      const minutes = rows.reduce((s,a)=>s+a.duration,0);
      const blocked = rows.filter(a=>a.status==='Bloqueada').reduce((s,a)=>s+a.duration,0);
      const rework = rows.filter(a=>a.status==='Retrabalho').reduce((s,a)=>s+a.duration,0);
      return { label: c.label, color: c.color, count: rows.length, minutes, pct: stats.total ? minutes/stats.total : 0, blocked, rework };
    }).sort((a,b) => b.minutes - a.minutes);

    return { from, to, project, stats, byStatus, byCategory, total: inRange.length };
  }

  function renderReport(report){
    const meetingPct = report.stats.total ? Math.round((report.stats.meetingMin/report.stats.total)*100) : 0;
    const highValuePct = report.stats.total ? Math.round((report.stats.highValueMin/report.stats.total)*100) : 0;

    document.getElementById('report-summary').innerHTML = `
      <div class="report-stat"><div class="label">Total no período</div><div class="value">${minutesToHM(report.stats.total)}</div></div>
      <div class="report-stat"><div class="label">Atividades</div><div class="value">${report.total}</div></div>
      <div class="report-stat"><div class="label">Alto valor</div><div class="value">${highValuePct}%</div></div>
      <div class="report-stat"><div class="label">Reuniões</div><div class="value">${meetingPct}%</div></div>
      <div class="report-stat"><div class="label">Bloqueado</div><div class="value">${minutesToHM(report.stats.blockedMin)}</div></div>
      <div class="report-stat"><div class="label">Retrabalho</div><div class="value">${minutesToHM(report.stats.reworkMin)}</div></div>
    `;

    document.getElementById('report-status-table').innerHTML = `
      <thead><tr><th>Status</th><th class="num">Qtd</th><th class="num">Tempo</th><th class="num">% do período</th></tr></thead>
      <tbody>${report.byStatus.map(s => `
        <tr><td>${s.status}</td><td class="num">${s.count}</td><td class="num">${minutesToHM(s.minutes)}</td><td class="num">${Math.round(s.pct*100)}%</td></tr>
      `).join('')}</tbody>`;

    document.getElementById('report-category-table').innerHTML = `
      <thead><tr><th>Categoria</th><th class="num">Qtd</th><th class="num">Tempo</th><th class="num">% do período</th><th class="num">Bloqueado</th><th class="num">Retrabalho</th></tr></thead>
      <tbody>${report.byCategory.length ? report.byCategory.map(c => `
        <tr><td>${c.label}</td><td class="num">${c.count}</td><td class="num">${minutesToHM(c.minutes)}</td><td class="num">${Math.round(c.pct*100)}%</td><td class="num">${c.blocked ? minutesToHM(c.blocked) : '—'}</td><td class="num">${c.rework ? minutesToHM(c.rework) : '—'}</td></tr>
      `).join('') : '<tr><td colspan="6" style="color:#5B6E92;">Nenhuma atividade no período.</td></tr>'}</tbody>`;

    document.getElementById('report-empty').style.display = 'none';
    document.getElementById('report-result').style.display = 'block';
  }

  document.getElementById('report-generate').addEventListener('click', () => {
    const from = document.getElementById('report-from').value;
    const to = document.getElementById('report-to').value;
    const project = document.getElementById('report-project').value;
    if(!from || !to){ alert('Escolha a data inicial e final do período.'); return; }
    if(from > to){ alert('A data inicial não pode ser depois da data final.'); return; }
    lastReport = computeReport(from, to, project);
    renderReport(lastReport);
  });

  document.getElementById('export-html-btn').addEventListener('click', () => {
    if(!lastReport) return;
    const html = buildReportHtml(lastReport);
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `relatorio-${lastReport.from}_a_${lastReport.to}.html`;
    a.click();
    URL.revokeObjectURL(url);
  });

  document.getElementById('export-pdf-btn').addEventListener('click', () => {
    if(!lastReport) return;
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const r = lastReport;

    doc.setFont('helvetica','bold'); doc.setFontSize(16);
    doc.text('Painel de Foco — Relatório de Status por Período', 14, 18);
    doc.setFont('helvetica','normal'); doc.setFontSize(10); doc.setTextColor(90);
    doc.text(`Período: ${fmtDateShort(r.from)} a ${fmtDateShort(r.to)}${r.project ? ' · Projeto: ' + r.project : ''}`, 14, 25);
    doc.text(`Total: ${minutesToHM(r.stats.total)} em ${r.total} atividade(s)  ·  Alto valor: ${r.stats.total ? Math.round(r.stats.highValueMin/r.stats.total*100) : 0}%  ·  Reuniões: ${r.stats.total ? Math.round(r.stats.meetingMin/r.stats.total*100) : 0}%  ·  Bloqueado: ${minutesToHM(r.stats.blockedMin)}  ·  Retrabalho: ${minutesToHM(r.stats.reworkMin)}`, 14, 31, { maxWidth: 182 });

    doc.autoTable({
      startY: 42,
      head: [['Status', 'Qtd', 'Tempo', '% do período']],
      body: r.byStatus.map(s => [s.status, s.count, minutesToHM(s.minutes), Math.round(s.pct*100)+'%']),
      styles: { fontSize: 9 }, headStyles: { fillColor: [20,28,48] }
    });

    doc.autoTable({
      startY: doc.lastAutoTable.finalY + 10,
      head: [['Categoria', 'Qtd', 'Tempo', '% do período', 'Bloqueado', 'Retrabalho']],
      body: r.byCategory.map(c => [c.label, c.count, minutesToHM(c.minutes), Math.round(c.pct*100)+'%', c.blocked ? minutesToHM(c.blocked) : '—', c.rework ? minutesToHM(c.rework) : '—']),
      styles: { fontSize: 9 }, headStyles: { fillColor: [20,28,48] }
    });

    doc.save(`relatorio-${r.from}_a_${r.to}.pdf`);
  });

  function buildReportHtml(r){
    const meetingPct = r.stats.total ? Math.round((r.stats.meetingMin/r.stats.total)*100) : 0;
    const highValuePct = r.stats.total ? Math.round((r.stats.highValueMin/r.stats.total)*100) : 0;
    const statusRows = r.byStatus.map(s => `<tr><td>${s.status}</td><td>${s.count}</td><td>${minutesToHM(s.minutes)}</td><td>${Math.round(s.pct*100)}%</td></tr>`).join('');
    const catRows = r.byCategory.map(c => `<tr><td>${c.label}</td><td>${c.count}</td><td>${minutesToHM(c.minutes)}</td><td>${Math.round(c.pct*100)}%</td><td>${c.blocked?minutesToHM(c.blocked):'—'}</td><td>${c.rework?minutesToHM(c.rework):'—'}</td></tr>`).join('');
    return `<!doctype html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Relatório — ${r.from} a ${r.to}</title>
<style>
body{font-family: Arial, sans-serif; color:#1a1a1a; padding:32px; max-width:760px; margin:0 auto;}
h1{font-size:20px; margin-bottom:4px;} .sub{color:#666; font-size:13px; margin-bottom:24px;}
.stats{display:flex; flex-wrap:wrap; gap:14px; margin-bottom:28px;}
.stat{border:1px solid #ddd; border-radius:8px; padding:10px 14px; min-width:110px;}
.stat .l{font-size:10px; text-transform:uppercase; color:#777;} .stat .v{font-size:18px; font-weight:700;}
table{width:100%; border-collapse:collapse; margin-bottom:28px; font-size:13px;}
th,td{text-align:left; padding:7px 10px; border-bottom:1px solid #e2e2e2;}
th{background:#f4f5f7; font-size:11px; text-transform:uppercase; color:#666;}
h2{font-size:14px; margin:0 0 8px;}
</style></head><body>
<h1>Painel de Foco — Relatório de Status por Período</h1>
<div class="sub">Período: ${fmtDateShort(r.from)} a ${fmtDateShort(r.to)}${r.project ? ' · Projeto: ' + r.project : ''}</div>
<div class="stats">
  <div class="stat"><div class="l">Total</div><div class="v">${minutesToHM(r.stats.total)}</div></div>
  <div class="stat"><div class="l">Atividades</div><div class="v">${r.total}</div></div>
  <div class="stat"><div class="l">Alto valor</div><div class="v">${highValuePct}%</div></div>
  <div class="stat"><div class="l">Reuniões</div><div class="v">${meetingPct}%</div></div>
  <div class="stat"><div class="l">Bloqueado</div><div class="v">${minutesToHM(r.stats.blockedMin)}</div></div>
  <div class="stat"><div class="l">Retrabalho</div><div class="v">${minutesToHM(r.stats.reworkMin)}</div></div>
</div>
<h2>Por status</h2>
<table><thead><tr><th>Status</th><th>Qtd</th><th>Tempo</th><th>% do período</th></tr></thead><tbody>${statusRows}</tbody></table>
<h2>Por categoria</h2>
<table><thead><tr><th>Categoria</th><th>Qtd</th><th>Tempo</th><th>% do período</th><th>Bloqueado</th><th>Retrabalho</th></tr></thead><tbody>${catRows}</tbody></table>
</body></html>`;
  }

  // ============================================================
  // WIRING GERAL
  // ============================================================
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentTab = btn.dataset.tab;
      document.getElementById('tab-hoje').style.display = currentTab === 'hoje' ? 'block' : 'none';
      document.getElementById('tab-semana').style.display = currentTab === 'semana' ? 'block' : 'none';
      document.getElementById('tab-relatorio').style.display = currentTab === 'relatorio' ? 'block' : 'none';

      if(currentTab === 'relatorio'){
        const fromEl = document.getElementById('report-from');
        const toEl = document.getElementById('report-to');
        if(!toEl.value) toEl.value = todayStr();
        if(!fromEl.value) fromEl.value = addDaysStr(todayStr(), -6);
      }
    });
  });

  document.getElementById('filter-project').addEventListener('change', (e) => { projectFilter = e.target.value; renderEntries(); });
  document.getElementById('filter-date').addEventListener('change', (e) => { if(e.target.value){ viewDate = e.target.value; render(); } });
  document.getElementById('date-prev').addEventListener('click', () => { viewDate = addDaysStr(viewDate, -1); render(); });
  document.getElementById('date-next').addEventListener('click', () => { viewDate = addDaysStr(viewDate, 1); render(); });
  document.getElementById('date-today').addEventListener('click', () => { viewDate = todayStr(); render(); });

  document.getElementById('add-btn').addEventListener('click', submitActivity);
  document.getElementById('cancel-btn').addEventListener('click', () => { exitEditMode(); clearForm(); });
})();
