const {
  app,
  Tray,
  Menu,
  shell,
  BrowserWindow,
  globalShortcut,
  screen,
  ipcMain,
} = require("electron");
const path = require("path");
const Store = require("electron-store");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { getFormattedNotionContent } = require("./services/notion/notionReader");
const dotenv = require("dotenv");
dotenv.config();

const store = new Store();

function isValidKey(key) {
  return ["shortcutA", "shortcutB", "always-on-top"].includes(key);
}

const getValue = (key) => {
  if (isValidKey(key)) return store.get(key);
  return undefined;
};

const setValue = (key, value) => {
  if (isValidKey(key)) store.set(key, value);
};

let tray;
let mainWindow;
let closeTimeout;
let visible = true;

const exec = (code) =>
  mainWindow.webContents.executeJavaScript(code).catch(console.error);

const toggleVisibility = (action) => {
  visible = action;
  if (action) {
    clearTimeout(closeTimeout);
    mainWindow.show();
  } else {
    closeTimeout = setTimeout(() => mainWindow.hide(), 400);
  }
  mainWindow.webContents.send("toggle-visibility", action);
};

const registerKeybindings = () => {
  globalShortcut.unregisterAll();
  const shortcutA = getValue("shortcutA");
  const shortcutB = getValue("shortcutB");

  if (shortcutA)
    globalShortcut.register(shortcutA, () => toggleVisibility(!visible));
  if (shortcutB)
    globalShortcut.register(shortcutB, () => {
      toggleVisibility(true);
      mainWindow.webContents.send("activate-mic");
    });
};

const createWindow = () => {
  const { width, height } = screen.getPrimaryDisplay().bounds;
  const winWidth = 400;
  const winHeight = 700;

  mainWindow = new BrowserWindow({
    width: winWidth,
    height: winHeight,
    frame: false,
    resizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    transparent: true,
    x: width - winWidth - 10,
    y: height - winHeight - 60,
    icon: path.resolve(__dirname, "icon.png"),
    webPreferences: {
      contextIsolation: true,
      devTools: true,
      nodeIntegration: true,
      webviewTag: true,
      preload: path.join(__dirname, "src/preload.js"),
    },
  });

  mainWindow.loadFile("src/index.html").catch(console.error);

  mainWindow.on("blur", () => {
    if (!getValue("always-on-top")) toggleVisibility(false);
  });

  ipcMain.handle("get-local-storage", (_event, key) => getValue(key));

  ipcMain.on("set-local-storage", (_event, key, value) => {
    setValue(key, value);
    registerKeybindings();
  });

  ipcMain.on("close", (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) win.close();
  });
};

const createTray = () => {
  tray = new Tray(path.resolve(__dirname, "icon.png"));
  const contextMenu = Menu.buildFromTemplate([
    {
      label: "Sobre o criador",
      click: () =>
        shell.openExternal("https://www.instagram.com/mateussantoos._/"),
    },
    { type: "separator" },
    {
      label: "Set Keybindings",
      click: () => {
        const dialog = new BrowserWindow({
          width: 500,
          height: 370,
          frame: false,
          skipTaskbar: true,
          webPreferences: {
            contextIsolation: true,
            preload: path.join(
              __dirname,
              "components/setKeybindingsOverlay/preload.js"
            ),
          },
        });
        dialog.loadFile("components/setKeybindingsOverlay/index.html");
        dialog.show();
      },
    },
    {
      label: "Fixar janela",
      type: "checkbox",
      checked: getValue("always-on-top"),
      click: (menuItem) => setValue("always-on-top", menuItem.checked),
    },
    { type: "separator" },
    {
      label: "Fechar mainWindow",
      click: () => mainWindow.close(),
    },
  ]);

  tray.setContextMenu(contextMenu);
  tray.on("click", () => toggleVisibility(true));
};

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
const chat = model.startChat({ history: [] });

ipcMain.handle("send-message", async (_event, userInput) => {
  try {
    const notionContent = await getFormattedNotionContent(
      "1cff42a37622805ebf14ca8f1346b22e"
    );
    const prompt = `
Você é um assistente da empresa. Use as informações abaixo para ajudar o usuário:

Conteúdo do Notion:
${notionContent}

Pergunta do cliente: ${userInput}
    `;
    const result = await chat.sendMessage(prompt);
    const text =
      result.response.candidates?.[0]?.content?.parts?.[0]?.text ||
      "Sem resposta";
    return text.replace(/\n/g, "<br/>");
  } catch (error) {
    console.error("Erro:", error.message);
    return "Erro ao gerar resposta.";
  }
});

app.whenReady().then(() => {
  createTray();
  createWindow();
  registerKeybindings();
});
