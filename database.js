const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const os = require('os');
const fs = require('fs');

// Função para descobrir onde o programa está rodando (seja dev ou .exe)
function getAppPath() {
    return path.dirname(process.execPath);
}

// 1. Define o caminho padrão (Pasta do Usuário Local)
// Ex: C:\Users\Nome\sistema_telecentro.db
let dbPath = path.join(os.homedir(), 'sistema_telecentro.db');

// 2. Tenta ler o arquivo de configuração externo 'config.json' (Para Rede)
const configPath = path.join(getAppPath(), 'config.json');

try {
    if (fs.existsSync(configPath)) {
        const configFile = fs.readFileSync(configPath, 'utf8');
        const config = JSON.parse(configFile);
        
        if (config.caminho_banco) {
            dbPath = config.caminho_banco;
            console.log("Usando banco de dados da rede:", dbPath);
        }
    }
} catch (error) {
    console.error("Erro ao ler config.json, usando banco local padrão.", error);
}

// Verifica se a pasta do banco existe (para evitar erro se a rede cair ou diretório não existir)
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
    try { fs.mkdirSync(dbDir, { recursive: true }); } catch(e) {}
}

// Conecta ao Banco
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error("ERRO CRÍTICO: Não foi possível conectar ao banco de dados.", err.message);
    } else {
        console.log("Conectado ao banco:", dbPath);
    }
});

// Criação das Tabelas
db.serialize(() => {
    
    // --- 1. TABELA DE USUÁRIOS ---
    db.run(`
        CREATE TABLE IF NOT EXISTS usuarios (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nome TEXT,
            login TEXT UNIQUE,
            senha TEXT,
            nivel TEXT  -- 'admin' ou 'leitor'
        )
    `);

    // Inserir ADMIN padrão (se não existir)
    db.run(`INSERT OR IGNORE INTO usuarios (nome, login, senha, nivel) VALUES ('Administrador', 'admin', '1234', 'admin')`);
    
    // --- 2. TABELA DE UNIDADES ---
    db.run(`
        CREATE TABLE IF NOT EXISTS unidades (
            id_unidade INTEGER PRIMARY KEY AUTOINCREMENT,
            nome_unidade TEXT,
            endereco TEXT,
            bairro TEXT,
            zona TEXT,
            telefone TEXT,
            nome_responsavel TEXT,
            email_responsavel TEXT,
            status_unidade TEXT,
            observacoes TEXT
        )
    `);

    // --- 3. TABELA DE VISTORIAS ---
    db.run(`
        CREATE TABLE IF NOT EXISTS vistorias (
            id_vistoria INTEGER PRIMARY KEY AUTOINCREMENT,
            id_unidade INTEGER,
            ultimo_visitante TEXT,
            ultima_visita DATE,
            telefone_agentes TEXT,
            estado_internet TEXT,
            qtd_pontos_wifi INTEGER,
            qtd_cpus_uso INTEGER,
            qtd_cpus_sem_uso INTEGER,
            qtd_monitores_total INTEGER,
            qtd_teclados_total INTEGER,
            qtd_mouses_total INTEGER,
            qtd_notebooks_uso INTEGER,
            qtd_webcams INTEGER,
            hardware_cpu TEXT,
            nota_excelencia TEXT,
            qtd_mesas INTEGER,
            qtd_cadeiras INTEGER,
            qtd_armarios_baixos INTEGER,
            qtd_armarios_altos INTEGER,
            qtd_ventiladores INTEGER,
            controle_remoto_ok BOOLEAN,
            impressora_ok BOOLEAN,
            chamados_abertos BOOLEAN,
            possui_tv BOOLEAN,
            possui_bebedouro BOOLEAN,
            possui_extintor BOOLEAN,
            lampadas_ok BOOLEAN,
            wifi_ok BOOLEAN,
            FOREIGN KEY(id_unidade) REFERENCES unidades(id_unidade)
        )
    `);
});

module.exports = db;