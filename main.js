const { app, BrowserWindow } = require('electron');
const path = require('path');

function createWindow() {
  const win = new BrowserWindow({
    width: 1024,
    height: 768,
    webPreferences: {
      // Estas duas linhas permitem que seu HTML "converse" com o banco de dados local
      nodeIntegration: true,
      contextIsolation: false 
    }
  });

  // Carrega seu arquivo HTML principal
  win.loadFile('index.html');
  
  // Opcional: Tira o menu padrão do topo (Arquivo, Editar...)
  // win.setMenu(null); 
}
function createWindow() {
  const win = new BrowserWindow({
    width: 1024,
    height: 768,
    icon: __dirname + '/icon.ico', // <--- ADICIONE ESTA LINHA
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  win.loadFile('index.html');
  win.setMenu(null); // (Opcional) Se quiser remover o menu Arquivo/Editar
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.path !== 'darwin') app.quit();
});