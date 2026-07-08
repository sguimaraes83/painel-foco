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
  const CATS = [
    { id:'dev',        label:'Desenvolvimento Novo',        color:'#2DD4BF', meeting:false },
    { id:'bug',         label:'Correção de Bugs',             color:'#F87171', meeting:false },
    { id:'arqbuild',    label:'Construção de Arquitetura',    color:'#A78BFA', meeting:false },
    { id:'refine',      label:'Refinamento de Requisitos',    color:'#38BDF8', meeting:false },
    { id:'arqsol',      label:'Solução de Arquitetura',       color:'#E879F9', meeting:false },
    { id:'scrum',       label:'Reunião Ágil (SCRUM)',         color:'#F5A623', meeting:true  },
  ];
  const catById = id => CATS.find(c => c.id === id) || CATS[0];
  const DAY_BUDGET = 480; // 8h

  let currentUser = null;
  let activities = []; // linhas do banco: {id, date, cat_id, project, description, duration, status, value, created_at}
  let currentTab = 'hoje';
  let projectFilter = '';
  let editingId = null;

  const todayStr = () => dateToStrBR(new Date());
  const fmtDatePT = (d) => new Date(d + 'T12:00:00-03:00').toLocaleDateString('pt-BR', { weekday:'long', day:'2-digit', month:'long', timeZone: BR_TZ });
  const minutesToHM = (m) => { const h = Math.floor(m/60), mm = m % 60; return h > 0 ? `${h}h${mm.toString().padStart(2,'0')}` : `${mm}min`; };

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

    if(pass !== pass2){
      showAuthMsg('signup-msg', 'As senhas não conferem.', 'error');
      return;
    }

    btn.disabled = true; btn.textContent = 'Criando...';
    const { data, error } = await sb.auth.signUp({
      email, password: pass,
      options: { emailRedirectTo: window.location.origin + window.location.pathname }
    });
    btn.disabled = false; btn.textContent = 'Criar conta';

    if(error){
      showAuthMsg('signup-msg', traduzErro(error), 'error');
      return;
    }
    showAuthMsg('signup-msg', 'Conta criada! Verifique seu email e clique no link de confirmação antes de entrar.', 'ok');
    e.target.reset();
  });

  document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value.trim();
    const pass = document.getElementById('login-password').value;
    const btn = document.getElementById('login-btn');

    btn.disabled = true; btn.textContent = 'Entrando...';
    const { data, error } = await sb.auth.signInWithPassword({ email, password: pass });
    btn.disabled = false; btn.textContent = 'Entrar';

    if(error){
      showAuthMsg('login-msg', traduzErro(error), 'error');
      return;
    }
    // onAuthStateChange cuida da transição de tela
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

    if(error){
      showAuthMsg('forgot-msg', traduzErro(error), 'error');
      return;
    }
    showAuthMsg('forgot-msg', 'Se o email existir, um link de redefinição foi enviado.', 'ok');
  });

  document.getElementById('logout-btn').addEventListener('click', async () => {
    await sb.auth.signOut();
  });

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
      document.getElementById('auth-screen').style.display = 'none';
      document.getElementById('app-screen').style.display = 'block';
      document.getElementById('user-email').textContent = currentUser.email;
      loadData();
    } else {
      currentUser = null;
      activities = [];
      document.getElementById('app-screen').style.display = 'none';
      document.getElementById('auth-screen').style.display = 'flex';
    }
  });

  // ============================================================
  // DATA (Supabase)
  // ============================================================
  async function loadData(){
    const { data, error } = await sb
      .from('activities')
      .select('*')
      .order('created_at', { ascending: false });

    if(error){
      console.error('Erro ao carregar atividades:', error);
      activities = [];
    } else {
      activities = data || [];
    }
    render();
  }

  async function insertActivity(row){
    const { error } = await sb.from('activities').insert({ ...row, user_id: currentUser.id });
    if(error){ alert('Erro ao salvar atividade: ' + error.message); return false; }
    return true;
  }

  async function updateActivityRow(id, row){
    const { error } = await sb.from('activities').update(row).eq('id', id);
    if(error){ alert('Erro ao atualizar atividade: ' + error.message); return false; }
    return true;
  }

  async function deleteActivityRow(id){
    const { error } = await sb.from('activities').delete().eq('id', id);
    if(error){ alert('Erro ao remover atividade: ' + error.message); return false; }
    return true;
  }

  // ============================================================
  // FORM / CATEGORY CHIPS
  // ============================================================
  function buildCatChips(){
    const box = document.getElementById('cat-select');
    box.innerHTML = '';
    CATS.forEach((c, i) => {
      const chip = document.createElement('div');
      chip.className = 'chip' + (i === 0 ? ' active' : '');
      chip.textContent = c.label;
      chip.dataset.id = c.id;
      if(i === 0){ chip.style.background = c.color; chip.style.color = '#0B1220'; }
      chip.addEventListener('click', () => setSelectedCat(c.id));
      box.appendChild(chip);
    });
  }

  function getSelectedCat(){
    const active = document.querySelector('#cat-select .chip.active');
    return active ? active.dataset.id : CATS[0].id;
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
    document.getElementById('f-project').value = '';
    document.getElementById('f-duration').value = '';
    document.getElementById('f-desc').value = '';
    document.getElementById('f-status').value = 'Concluída';
    document.getElementById('f-value').value = 'Alto';
    setSelectedCat(CATS[0].id);
  }

  async function submitActivity(){
    const project = document.getElementById('f-project').value.trim() || 'Sem projeto';
    const duration = parseInt(document.getElementById('f-duration').value, 10);
    const description = document.getElementById('f-desc').value.trim();
    const status = document.getElementById('f-status').value;
    const value = document.getElementById('f-value').value;
    const cat_id = getSelectedCat();

    if(!duration || duration <= 0){
      alert('Informe a duração da atividade em minutos.');
      return;
    }

    const btn = document.getElementById('add-btn');
    btn.disabled = true;

    if(editingId){
      const ok = await updateActivityRow(editingId, { cat_id, project, description, duration, status, value });
      if(ok) exitEditMode();
    } else {
      await insertActivity({ date: todayStr(), cat_id, project, description, duration, status, value });
    }

    btn.disabled = false;
    clearForm();
    await loadData();
  }

  function startEdit(id){
    const a = activities.find(x => x.id === id);
    if(!a) return;
    editingId = id;

    setSelectedCat(a.cat_id);
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
    const ok = await deleteActivityRow(id);
    if(ok) await loadData();
  }

  // ============================================================
  // RENDER
  // ============================================================
  function computeStats(list){
    const total = list.reduce((s,a) => s + a.duration, 0);
    const meetingMin = list.filter(a => catById(a.cat_id).meeting).reduce((s,a)=>s+a.duration,0);
    const blockedMin = list.filter(a => a.status === 'Bloqueada').reduce((s,a)=>s+a.duration,0);
    const reworkMin = list.filter(a => a.status === 'Retrabalho').reduce((s,a)=>s+a.duration,0);
    const highValueMin = list.filter(a => a.value === 'Alto').reduce((s,a)=>s+a.duration,0);
    return { total, meetingMin, blockedMin, reworkMin, highValueMin };
  }

  function renderDial(stats){
    const svg = document.getElementById('dial-svg');
    const cx=70, cy=70, r=58, stroke=13;
    const circumference = 2 * Math.PI * r;
    let segs = '', offset = 0;

    const todays = activities.filter(a => a.date === todayStr());
    const byCat = {};
    todays.forEach(a => { byCat[a.cat_id] = (byCat[a.cat_id]||0) + a.duration; });

    CATS.forEach(c => {
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
      box.innerHTML = '<div class="empty-note">Registre a primeira atividade do dia para ver os alertas de foco.</div>';
      return;
    }

    const meetingPct = stats.total ? stats.meetingMin/stats.total : 0;
    const highValuePct = stats.total ? stats.highValueMin/stats.total : 0;

    if(meetingPct > 0.30){
      items.push({ type:'bad', html: `<b>${Math.round(meetingPct*100)}% do tempo</b> foi consumido em reuniões hoje. Considere blindar blocos de foco sem SCRUM.` });
    } else if(meetingPct > 0.20){
      items.push({ type:'warn', html: `Reuniões já somam <b>${Math.round(meetingPct*100)}%</b> do dia. Fique de olho para não passar de 25-30%.` });
    }

    if(stats.blockedMin > 0){
      const blockedItems = todays.filter(a => a.status === 'Bloqueada');
      items.push({ type:'bad', html: `<b>${minutesToHM(stats.blockedMin)}</b> em atividades bloqueadas (${blockedItems.length}). Escalar impedimentos antes que travem mais entregas.` });
    }

    if(stats.reworkMin > 0){
      items.push({ type:'warn', html: `<b>${minutesToHM(stats.reworkMin)}</b> classificados como retrabalho. Vale investigar a causa raiz (requisito mal refinado? arquitetura instável?).` });
    }

    if(stats.total > 0){
      if(highValuePct < 0.4){
        items.push({ type:'bad', html: `Apenas <b>${Math.round(highValuePct*100)}%</b> do tempo foi em atividades de alto valor. Reavalie prioridades para amanhã.` });
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
    let todays = activities.filter(a => a.date === todayStr());
    if(projectFilter) todays = todays.filter(a => a.project === projectFilter);
    todays = todays.slice().sort((a,b) => b.created_at.localeCompare(a.created_at));

    if(todays.length === 0){
      list.innerHTML = '';
      empty.style.display = 'block';
      return;
    }
    empty.style.display = 'none';

    list.innerHTML = todays.map(a => {
      const c = catById(a.cat_id);
      const badges = [];
      if(a.status === 'Bloqueada') badges.push('<span class="badge blocked">Bloqueada</span>');
      if(a.status === 'Retrabalho') badges.push('<span class="badge retrabalho">Retrabalho</span>');
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

  function renderProjectOptions(){
    const projects = [...new Set(activities.map(a => a.project))].sort();
    document.getElementById('project-list').innerHTML = projects.map(p => `<option value="${p}"></option>`).join('');

    const filterSel = document.getElementById('filter-project');
    const current = filterSel.value;
    filterSel.innerHTML = '<option value="">Todos os projetos</option>' + projects.map(p => `<option value="${p}">${p}</option>`).join('');
    filterSel.value = projects.includes(current) ? current : '';
  }

  function renderWeek(){
    const chart = document.getElementById('week-chart');
    const days = [];
    for(let i = 6; i >= 0; i--){
      days.push(addDaysStr(todayStr(), -i));
    }
    const maxTotal = Math.max(DAY_BUDGET, ...days.map(d => activities.filter(a => a.date === d).reduce((s,a)=>s+a.duration,0)));

    chart.innerHTML = days.map(d => {
      const dayActs = activities.filter(a => a.date === d);
      const total = dayActs.reduce((s,a)=>s+a.duration,0);
      const byCat = {};
      dayActs.forEach(a => { byCat[a.cat_id] = (byCat[a.cat_id]||0) + a.duration; });

      const segs = CATS.map(c => {
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

    document.getElementById('legend').innerHTML = CATS.map(c => `
      <div class="legend-item"><div class="legend-dot" style="background:${c.color}"></div>${c.label}</div>
    `).join('');
  }

  function render(){
    document.getElementById('today-badge').textContent = fmtDatePT(todayStr());
    const todays = activities.filter(a => a.date === todayStr());
    const stats = computeStats(todays);

    renderDial(stats);
    renderAlerts(stats, todays);
    renderEntries();
    renderProjectOptions();
    renderWeek();
  }

  // ============================================================
  // WIRING
  // ============================================================
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentTab = btn.dataset.tab;
      document.getElementById('tab-hoje').style.display = currentTab === 'hoje' ? 'block' : 'none';
      document.getElementById('tab-semana').style.display = currentTab === 'semana' ? 'block' : 'none';
    });
  });

  document.getElementById('filter-project').addEventListener('change', (e) => {
    projectFilter = e.target.value;
    renderEntries();
  });

  document.getElementById('add-btn').addEventListener('click', submitActivity);
  document.getElementById('cancel-btn').addEventListener('click', () => { exitEditMode(); clearForm(); });

  buildCatChips();
})();
