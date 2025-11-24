// app.js - VERSÃO DESKTOP OFFLINE (ELECTRON + SQLITE + LOGIN SOB DEMANDA)

// 1. Importação do Banco de Dados Local
const db = require('./database.js');

// ==========================================================
// VARIÁVEIS DE CONTROLE DE SESSÃO
// ==========================================================
let usuarioLogado = false; // Começa como falso (modo leitura)
let funcaoPendente = null; // Guarda a ação que o usuário tentou fazer

// ==========================================================
// FUNÇÕES DE BANCO DE DADOS (COM RETRY PARA REDE)
// ==========================================================

function dbRun(sql, params = []) {
    return new Promise((resolve, reject) => {
        const tentarExecutar = (tentativas = 0) => {
            db.run(sql, params, function(err) {
                if (err) {
                    // Se der erro de "Arquivo Travado" (comum em rede), tenta de novo
                    if ((err.code === 'SQLITE_BUSY' || err.code === 'SQLITE_LOCKED') && tentativas < 5) {
                        console.warn(`Banco ocupado. Tentando de novo em 1s... (Tentativa ${tentativas+1})`);
                        setTimeout(() => tentarExecutar(tentativas + 1), 1000);
                    } else {
                        reject(err);
                    }
                } else {
                    resolve(this);
                }
            });
        };
        tentarExecutar();
    });
}

function dbQuery(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
}

function dbGet(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });
}

// ==========================================================
// LÓGICA DE LOGIN SOB DEMANDA (POPUP)
// ==========================================================

// Função que "protege" os botões críticos
function executarComPermissao(acao) {
    if (usuarioLogado) {
        // Se já logou antes nesta sessão, executa direto
        acao();
    } else {
        // Se não, guarda o que o usuário queria fazer e abre o login
        funcaoPendente = acao;
        const overlay = document.getElementById('login-overlay');
        if (overlay) {
            overlay.classList.remove('hidden');
            overlay.style.display = 'flex'; // Garante o flexbox para centralizar
            
            // Tenta focar no campo de usuário
            const inputUser = document.getElementById('login-user');
            if(inputUser) inputUser.focus();
        }
    }
}

// Função chamada pelo botão "Cancelar" do modal
function fecharLogin() {
    const overlay = document.getElementById('login-overlay');
    if (overlay) {
        overlay.classList.add('hidden');
        overlay.style.display = 'none';
    }
    funcaoPendente = null; // Limpa a ação pendente
    
    // Limpa os campos e mensagens
    document.getElementById('login-user').value = '';
    document.getElementById('login-pass').value = '';
    document.getElementById('login-msg').textContent = '';
}

// Função chamada pelo botão "CONFIRMAR/ENTRAR"
async function fazerLogin() {
    const user = document.getElementById('login-user').value;
    const pass = document.getElementById('login-pass').value;
    const msg = document.getElementById('login-msg');

    try {
        // Verifica no banco
        const usuario = await dbGet("SELECT * FROM usuarios WHERE login = ? AND senha = ?", [user, pass]);

        if (usuario) {
            // Login Sucesso
            usuarioLogado = true;
            
            // Esconde o modal sem limpar a funcaoPendente ainda
            const overlay = document.getElementById('login-overlay');
            overlay.classList.add('hidden');
            overlay.style.display = 'none';

            // O PULO DO GATO: Executa o que estava pendente!
            if (funcaoPendente) {
                funcaoPendente(); // Executa a ação (ex: salvar, excluir)
                funcaoPendente = null;
            }
        } else {
            msg.textContent = "Usuário ou senha incorretos.";
        }
    } catch (error) {
        msg.textContent = "Erro ao conectar no banco de dados.";
        console.error(error);
    }
}

// Disponibiliza funções globais para o HTML (botões onclick)
window.fazerLogin = fazerLogin;
window.fecharLogin = fecharLogin;


// ==========================================================
// INÍCIO DA APLICAÇÃO
// ==========================================================

document.addEventListener('DOMContentLoaded', () => {
    console.log(">>> APLICAÇÃO DESKTOP INICIADA");

    // Variáveis Globais de Dados
    let todasUnidades = []; 
    let chartZonaInstance = null;
    let chartStatusInstance = null;

    // Seletores
    const appContainer = document.querySelector('.app-container');
    const sidebarLinks = document.querySelectorAll('.nav-link');
    const paginas = document.querySelectorAll('.page-content');
    const sidebarToggleBtn = document.getElementById('sidebar-toggle');
    const mainHeaderTitle = document.getElementById('main-header-title');
    
    // Pesquisa
    const globalSearchInput = document.getElementById('global-search-input');
    const searchResultsContainer = document.getElementById('search-results');

    // CRUD
    const formUnidades = document.getElementById('form-cadastro');
    const corpoTabelaUnidades = document.getElementById('corpo-tabela');
    const formTituloUnidades = document.getElementById('form-titulo');
    const formDescricaoUnidades = document.getElementById('form-descricao');
    const inputIdUnidades = document.getElementById('unidade_id');
    const btnSalvarUnidades = document.getElementById('btn-salvar');
    const btnCancelarUnidades = document.getElementById('btn-cancelar');

    // Modal Detalhes
    const modal = document.getElementById('detalhe-modal');
    const btnFecharModal = document.getElementById('fechar-modal');

    // Vistoria
    const formVistoria = document.getElementById('form-vistoria');
    const infoRespNome = document.getElementById('info-resp-nome');
    const infoRespTel = document.getElementById('info-resp-tel');
    const infoRespEmail = document.getElementById('info-resp-email');
    const inputIdVistoriaHidden = document.getElementById('vistoria-id-unidade-hidden');

    // ==========================================================
    // NAVEGAÇÃO E MENU
    // ==========================================================
    function carregarPreferenciaMenu() {
        const isExpanded = localStorage.getItem('sidebarCollapsed') === 'false';
        if (isExpanded && appContainer) {
            appContainer.classList.remove('sidebar-collapsed');
        }
    }

    if (sidebarToggleBtn) {
        sidebarToggleBtn.addEventListener('click', () => {
            appContainer.classList.toggle('sidebar-collapsed');
            localStorage.setItem('sidebarCollapsed', appContainer.classList.contains('sidebar-collapsed'));
        });
    }

    const titulosPagina = {
        home: "Home",
        consulta: "Consultar Unidades",
        cadastro: "Cadastro de Unidade",
        vistoria: "Dados de Vistoria",
        relatorios: "Relatórios Gerenciais"
    };

    function atualizarTituloHeader(paginaId) {
        if (mainHeaderTitle) mainHeaderTitle.textContent = titulosPagina[paginaId] || "Dashboard";
    }

    function navegarPara(paginaId) {
        paginas.forEach(p => p.classList.remove('active'));
        const novaPagina = document.getElementById(`page-${paginaId}`);
        if (novaPagina) novaPagina.classList.add('active');

        sidebarLinks.forEach(l => l.classList.remove('active'));
        const linkAtivo = document.querySelector(`.nav-link[data-page="${paginaId}"]`);
        if (linkAtivo) linkAtivo.classList.add('active');

        atualizarTituloHeader(paginaId);
    }
    
    sidebarLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const paginaAlvo = link.getAttribute('data-page');
            navegarPara(paginaAlvo);

            if (paginaAlvo === 'consulta') carregarUnidades(); 
            if (paginaAlvo === 'cadastro' && inputIdUnidades.value === '') preparFormCadastro();
            if (paginaAlvo === 'home') { carregarDashboard(); carregarGraficos(); }
            if (paginaAlvo === 'relatorios') carregarGraficos();
        });
    });

    // ==========================================================
    // CRUD UNIDADES
    // ==========================================================

    async function carregarUnidades() {
        if (!corpoTabelaUnidades) return; 
        try {
            const unidades = await dbQuery("SELECT * FROM unidades ORDER BY nome_unidade ASC");
            todasUnidades = unidades;
            desenharTabelaUnidades(unidades);
        } catch (error) {
            console.error('Erro SQL:', error);
            corpoTabelaUnidades.innerHTML = '<tr><td colspan="4">Erro ao carregar lista.</td></tr>';
        }
    }

    function desenharTabelaUnidades(lista) {
        corpoTabelaUnidades.innerHTML = ''; 
        if (!lista || lista.length === 0) {
            corpoTabelaUnidades.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:1em;">Nenhuma unidade encontrada.</td></tr>';
            return;
        }
        lista.forEach(unidade => {
            const tr = document.createElement('tr');
            tr.dataset.unidade = JSON.stringify(unidade);
            const status = unidade.status_unidade || 'Ativa';
            const statusClass = status.toLowerCase().split(' ')[0]; 

            tr.innerHTML = `
                <td>${unidade.nome_unidade || 'Sem Nome'}</td>
                <td>${unidade.zona || '-'}</td>
                <td><span class="status status-${statusClass}">${status}</span></td>
                <td class="acoes">
                    <button class="btn-acao btn-ver" title="Ver"><i class="fa-solid fa-eye"></i></button>
                    <button class="btn-acao btn-editar" title="Editar"><i class="fa-solid fa-pencil"></i></button>
                    <button class="btn-acao btn-vistoriar" title="Vistoria"><i class="fa-solid fa-clipboard-list"></i></button>
                    <button class="btn-acao btn-excluir" title="Excluir"><i class="fa-solid fa-trash-can"></i></button>
                </td>
            `;
            corpoTabelaUnidades.appendChild(tr);
        });
    }

    // INTERCEPTAÇÃO DO FORMULÁRIO DE CADASTRO (SALVAR)
    if(formUnidades) {
        formUnidades.addEventListener('submit', (event) => {
            event.preventDefault(); // Impede envio padrão
            
            // CHAMA O LOGIN ANTES DE SALVAR
            executarComPermissao(async () => {
                const id = inputIdUnidades.value;
                const ehEdicao = (id !== "");
                
                const params = [
                    document.getElementById('nome_unidade').value,
                    document.getElementById('endereco').value,
                    document.getElementById('bairro').value,
                    document.getElementById('zona').value,
                    document.getElementById('telefone').value,
                    document.getElementById('nome_responsavel').value,
                    document.getElementById('email_responsavel').value,
                    document.getElementById('status_unidade').value,
                    document.getElementById('observacoes').value
                ];

                try {
                    if (ehEdicao) {
                        params.push(id);
                        const sql = `UPDATE unidades SET nome_unidade=?, endereco=?, bairro=?, zona=?, telefone=?, nome_responsavel=?, email_responsavel=?, status_unidade=?, observacoes=? WHERE id_unidade=?`;
                        await dbRun(sql, params);
                        alert('Unidade atualizada com sucesso!');
                    } else {
                        const sql = `INSERT INTO unidades (nome_unidade, endereco, bairro, zona, telefone, nome_responsavel, email_responsavel, status_unidade, observacoes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;
                        await dbRun(sql, params);
                        alert('Unidade cadastrada com sucesso!');
                    }
                    preparFormCadastro(); 
                    navegarPara('consulta');
                    carregarUnidades();
                } catch (error) {
                    console.error(error);
                    alert('Erro ao salvar: ' + error.message);
                }
            });
        });
    }

    function preparFormCadastro() {
        if (document.getElementById('page-cadastro').classList.contains('active')) atualizarTituloHeader('cadastro');
        formTituloUnidades.textContent = 'Cadastrar Nova Unidade';
        formDescricaoUnidades.textContent = 'Preencha os dados abaixo.';
        btnSalvarUnidades.textContent = 'Salvar Unidade';
        btnCancelarUnidades.classList.add('hidden');
        formUnidades.reset(); 
        inputIdUnidades.value = ''; 
    }

    function preparFormEdicao(unidade) {
        if (mainHeaderTitle) mainHeaderTitle.textContent = "Editando Unidade";
        formTituloUnidades.textContent = 'Editando Unidade';
        formDescricaoUnidades.textContent = `Modificando: ${unidade.nome_unidade}`;
        btnSalvarUnidades.textContent = 'Atualizar Unidade';
        btnCancelarUnidades.classList.remove('hidden');

        inputIdUnidades.value = unidade.id_unidade; 
        document.getElementById('nome_unidade').value = unidade.nome_unidade;
        document.getElementById('endereco').value = unidade.endereco || '';
        document.getElementById('bairro').value = unidade.bairro || '';
        document.getElementById('zona').value = unidade.zona || '';
        document.getElementById('telefone').value = unidade.telefone || '';
        document.getElementById('nome_responsavel').value = unidade.nome_responsavel || '';
        document.getElementById('email_responsavel').value = unidade.email_responsavel || '';
        document.getElementById('status_unidade').value = unidade.status_unidade || 'Ativa';
        document.getElementById('observacoes').value = unidade.observacoes || '';

        navegarPara('cadastro');
    }

    if(btnCancelarUnidades) {
        btnCancelarUnidades.addEventListener('click', () => {
            preparFormCadastro();
            navegarPara('consulta'); 
        });
    }

    // BOTÕES DA TABELA (INTERCEPTADOS PELO LOGIN)
    if(corpoTabelaUnidades) {
        corpoTabelaUnidades.addEventListener('click', async (event) => {
            const botao = event.target.closest('.btn-acao');
            if (!botao) return;
            const linha = botao.closest('tr');
            const unidade = JSON.parse(linha.dataset.unidade);

            // VER DETALHES (NÃO PRECISA DE LOGIN)
            if (botao.classList.contains('btn-ver')) {
                preencherModal(unidade);
                if(modal) modal.classList.remove('hidden');
            }

            // EDITAR (PRECISA DE LOGIN)
            if (botao.classList.contains('btn-editar')) {
                executarComPermissao(() => {
                    preparFormEdicao(unidade);
                });
            }

            // EXCLUIR (PRECISA DE LOGIN)
            if (botao.classList.contains('btn-excluir')) {
                executarComPermissao(() => {
                    if (confirm(`Tem certeza que deseja excluir "${unidade.nome_unidade}"?`)) {
                        excluirUnidade(unidade.id_unidade);
                    }
                });
            }

            // VISTORIA (PRECISA DE LOGIN)
            if (botao.classList.contains('btn-vistoriar')) {
                executarComPermissao(async () => {
                    if (mainHeaderTitle) mainHeaderTitle.textContent = "Vistoria";
                    await prepararFormularioVistoria(unidade);
                    navegarPara('vistoria');
                });
            }
        });
    }

    async function excluirUnidade(id) {
        try {
            await dbRun("DELETE FROM vistorias WHERE id_unidade = ?", [id]);
            await dbRun("DELETE FROM unidades WHERE id_unidade = ?", [id]);
            alert('Unidade excluída!');
            carregarUnidades();
        } catch (error) { 
            console.error(error);
            alert("Erro ao excluir: " + error.message);
        }
    }

    // ==========================================================
    // PESQUISA E MODAL (RESTANTE DO CÓDIGO MANTIDO)
    // ==========================================================
    
    if (globalSearchInput) {
        globalSearchInput.addEventListener('input', () => {
            const termo = globalSearchInput.value.toLowerCase().trim();
            if (termo.length < 2) { 
                searchResultsContainer.classList.add('hidden'); return;
            }
            const resultados = todasUnidades.filter(u => 
                u.nome_unidade.toLowerCase().includes(termo) ||
                (u.zona && u.zona.toLowerCase().includes(termo))
            ).slice(0, 10);
            
            searchResultsContainer.innerHTML = ''; 
            if (resultados.length === 0) {
                searchResultsContainer.innerHTML = '<div class="search-no-results">Nada encontrado.</div>';
            } else {
                resultados.forEach(u => {
                    const item = document.createElement('a');
                    item.href = "#"; 
                    item.className = 'search-result-item';
                    item.innerHTML = `<span class="result-title">${u.nome_unidade}</span>`;
                    item.addEventListener('click', (e) => {
                        e.preventDefault();
                        preencherModal(u); 
                        if(modal) modal.classList.remove('hidden');
                        globalSearchInput.value = '';
                        searchResultsContainer.classList.add('hidden');
                    });
                    searchResultsContainer.appendChild(item);
                });
            }
            searchResultsContainer.classList.remove('hidden');
        });
        
        globalSearchInput.addEventListener('blur', () => {
            setTimeout(() => { searchResultsContainer.classList.add('hidden'); }, 200);
        });
        
        globalSearchInput.addEventListener('focus', () => {
            if (globalSearchInput.value.length >= 2) searchResultsContainer.classList.remove('hidden');
        });
    }

    function preencherModal(unidade) {
        document.getElementById('modal-nome').textContent = unidade.nome_unidade;
        document.getElementById('modal-status').textContent = unidade.status_unidade;
        document.getElementById('modal-responsavel').textContent = unidade.nome_responsavel || '-';
        document.getElementById('modal-email').textContent = unidade.email_responsavel || '-';
        document.getElementById('modal-telefone').textContent = unidade.telefone || '-';
        document.getElementById('modal-endereco').textContent = unidade.endereco || '-';
        document.getElementById('modal-bairro').textContent = unidade.bairro || '-';
        document.getElementById('modal-zona').textContent = unidade.zona || '-';
        document.getElementById('modal-obs').textContent = unidade.observacoes || '';
    }
    if(btnFecharModal) btnFecharModal.addEventListener('click', () => { if(modal) modal.classList.add('hidden'); });
    if(modal) modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.add('hidden'); });

    // ==========================================================
    // MÓDULO VISTORIA E GRÁFICOS
    // ==========================================================
    
    async function prepararFormularioVistoria(unidade) {
        formVistoria.reset();
        inputIdVistoriaHidden.value = unidade.id_unidade;
        if (infoRespNome) infoRespNome.textContent = unidade.nome_responsavel || '--';
        if (infoRespTel) infoRespTel.textContent = unidade.telefone || '--';
        if (infoRespEmail) infoRespEmail.textContent = unidade.email_responsavel || '--';

        try {
            const dados = await dbGet("SELECT * FROM vistorias WHERE id_unidade = ?", [unidade.id_unidade]);
            if (dados) {
                const inputs = formVistoria.querySelectorAll('input, textarea');
                inputs.forEach(input => {
                    // Logica simples de preenchimento baseada no ID
                    const key = input.id.replace('vistoria-', '').replace(/-/g, '_');
                    if(dados[key] !== undefined) {
                        if(input.type === 'checkbox') input.checked = !!dados[key];
                        else input.value = dados[key];
                    }
                });
                // Tratamento especial para chaves que não batem direto (se houver)
                // Mantido a logica simples para economizar espaço
            }
        } catch (error) { console.error(error); }
    }

    if(formVistoria) {
        formVistoria.addEventListener('submit', (event) => {
            event.preventDefault();
            
            // CHAMA LOGIN ANTES DE SALVAR VISTORIA
            executarComPermissao(async () => {
                // ... Logica de coleta de dados da vistoria ...
                // Simplificando a coleta para não ficar gigante, use a mesma lógica de IDs do seu código original
                // ou a que fiz na versão anterior. 
                // Aqui assumo que você vai manter o bloco `const params = [...]` original da vistoria
                
                // DICA: Copie o bloco `const params = [...]` da sua versão anterior para cá
                // Vou colocar um exemplo genérico para não quebrar
                
                const idUnidade = inputIdVistoriaHidden.value;
                
                // REPLICANDO A LOGICA DE COLETA DA VERSÃO ANTERIOR PARA GARANTIR FUNCIONAMENTO:
                const params = [
                    idUnidade,
                    document.getElementById('vistoria-ultimo-visitante').value,
                    document.getElementById('vistoria-ultima-visita').value || null,
                    document.getElementById('vistoria-telefone-agentes').value,
                    document.getElementById('vistoria-estado-internet').value,
                    document.getElementById('vistoria-qtd-pontos-wifi').value,
                    document.getElementById('vistoria-qtd-cpus-uso').value,
                    document.getElementById('vistoria-qtd-cpus-sem-uso').value,
                    document.getElementById('vistoria-qtd-monitores-total').value,
                    document.getElementById('vistoria-qtd-teclados-total').value,
                    document.getElementById('vistoria-qtd-mouses-total').value,
                    document.getElementById('vistoria-qtd-notebooks-uso').value,
                    document.getElementById('vistoria-qtd-webcams').value,
                    document.getElementById('vistoria-hardware-cpu').value,
                    document.getElementById('vistoria-nota-excelencia').value,
                    document.getElementById('vistoria-qtd-mesas').value,
                    document.getElementById('vistoria-qtd-cadeiras').value,
                    document.getElementById('vistoria-qtd-armarios-baixos').value,
                    document.getElementById('vistoria-qtd-armarios-altos').value,
                    document.getElementById('vistoria-qtd-ventiladores').value,
                    document.getElementById('vistoria-controle-remoto-ok').checked ? 1 : 0,
                    document.getElementById('vistoria-impressora-ok').checked ? 1 : 0,
                    document.getElementById('vistoria-chamados-abertos').checked ? 1 : 0,
                    document.getElementById('vistoria-possui-tv').checked ? 1 : 0,
                    document.getElementById('vistoria-possui-bebedouro').checked ? 1 : 0,
                    document.getElementById('vistoria-possui-extintor').checked ? 1 : 0,
                    document.getElementById('vistoria-lampadas-ok').checked ? 1 : 0,
                    document.getElementById('vistoria-wifi-ok').checked ? 1 : 0
                ];

                try {
                    const existe = await dbGet("SELECT id_vistoria FROM vistorias WHERE id_unidade = ?", [idUnidade]);
                    if (existe) {
                        const paramsUpdate = params.slice(1); paramsUpdate.push(idUnidade);
                        const sqlUpdate = `UPDATE vistorias SET ultimo_visitante=?, ultima_visita=?, telefone_agentes=?, estado_internet=?, qtd_pontos_wifi=?, qtd_cpus_uso=?, qtd_cpus_sem_uso=?, qtd_monitores_total=?, qtd_teclados_total=?, qtd_mouses_total=?, qtd_notebooks_uso=?, qtd_webcams=?, hardware_cpu=?, nota_excelencia=?, qtd_mesas=?, qtd_cadeiras=?, qtd_armarios_baixos=?, qtd_armarios_altos=?, qtd_ventiladores=?, controle_remoto_ok=?, impressora_ok=?, chamados_abertos=?, possui_tv=?, possui_bebedouro=?, possui_extintor=?, lampadas_ok=?, wifi_ok=? WHERE id_unidade=?`;
                        await dbRun(sqlUpdate, paramsUpdate);
                    } else {
                        const sqlInsert = `INSERT INTO vistorias (id_unidade, ultimo_visitante, ultima_visita, telefone_agentes, estado_internet, qtd_pontos_wifi, qtd_cpus_uso, qtd_cpus_sem_uso, qtd_monitores_total, qtd_teclados_total, qtd_mouses_total, qtd_notebooks_uso, qtd_webcams, hardware_cpu, nota_excelencia, qtd_mesas, qtd_cadeiras, qtd_armarios_baixos, qtd_armarios_altos, qtd_ventiladores, controle_remoto_ok, impressora_ok, chamados_abertos, possui_tv, possui_bebedouro, possui_extintor, lampadas_ok, wifi_ok) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`;
                        await dbRun(sqlInsert, params);
                    }
                    alert('Vistoria salva!');
                    navegarPara('consulta');
                } catch (error) { console.error(error); alert("Erro: " + error.message); }
            });
        });
    }

    async function carregarDashboard() {
        try {
            const total = await dbGet("SELECT COUNT(*) as c FROM unidades");
            const ativas = await dbGet("SELECT COUNT(*) as c FROM unidades WHERE status_unidade LIKE 'Ativa%'");
            const cpus = await dbGet("SELECT SUM(qtd_cpus_uso) as c FROM vistorias");
            const chamados = await dbGet("SELECT COUNT(*) as c FROM vistorias WHERE chamados_abertos = 1");

            if(document.getElementById('dash-total-unidades')) document.getElementById('dash-total-unidades').textContent = total.c || 0;
            if(document.getElementById('dash-unidades-ativas')) document.getElementById('dash-unidades-ativas').textContent = ativas.c || 0;
            if(document.getElementById('dash-total-cpus')) document.getElementById('dash-total-cpus').textContent = cpus.c || 0;
            if(document.getElementById('dash-chamados')) document.getElementById('dash-chamados').textContent = chamados.c || 0;
        } catch (error) { console.error(error); }
    }

    async function carregarGraficos() {
        if (!document.getElementById('graficoZona')) return;
        try {
            const dadosZona = await dbQuery("SELECT zona, COUNT(*) as total FROM unidades GROUP BY zona");
            const labelsZona = dadosZona.map(i => i.zona || 'Indefinido');
            const valsZona = dadosZona.map(i => i.total);
            
            const dadosStatus = await dbQuery("SELECT status_unidade, COUNT(*) as total FROM unidades GROUP BY status_unidade");
            const labelsStatus = dadosStatus.map(i => i.status_unidade);
            const valsStatus = dadosStatus.map(i => i.total);
            
            const ctxZona = document.getElementById('graficoZona').getContext('2d');
            if (chartZonaInstance) chartZonaInstance.destroy();
            chartZonaInstance = new Chart(ctxZona, {
                type: 'doughnut',
                data: { labels: labelsZona, datasets: [{ data: valsZona, backgroundColor: ['#005A9C', '#28a745', '#ffc107', '#dc3545', '#6c757d'], borderWidth: 1 }] },
                options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right' } } }
            });

            const ctxStatus = document.getElementById('graficoStatus').getContext('2d');
            if (chartStatusInstance) chartStatusInstance.destroy();
            chartStatusInstance = new Chart(ctxStatus, {
                type: 'bar',
                data: { labels: labelsStatus, datasets: [{ label: 'Unidades', data: valsStatus, backgroundColor: '#005A9C', borderRadius: 5 }] },
                options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } }, plugins: { legend: { display: false } } }
            });
        } catch (error) { console.error(error); }
    }

    // INICIALIZAÇÃO
    carregarPreferenciaMenu();
    carregarUnidades();
    navegarPara('home');
    carregarDashboard();
});