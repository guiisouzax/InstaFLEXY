const $ = (id) => document.getElementById(id);

// Mostra só a seção da fase atual (carregando, erro ou pronto)
function mostrar(fase) {
  ["carregando", "erro", "pronto"].forEach((id) => {
    $(id).classList.toggle("oculto", id !== fase);
  });
}

function renderCarregando(estado) {
  mostrar("carregando");

  const nome = estado.etapa === "followers" ? "seus seguidores" : "quem você segue";
  const numero = estado.etapa === "followers" ? 1 : 2;
  const contagem = estado.total
    ? `${estado.atual} de ${estado.total}`
    : `${estado.atual} até agora`;
  $("etapa").textContent = `Etapa ${numero} de 2: lendo ${nome} (${contagem})`;

  // Se sabemos o total, a barra enche; senão, fica animada
  const barra = $("barra");
  if (estado.total) {
    barra.classList.remove("indefinida");
    const pct = Math.min(100, (estado.atual / estado.total) * 100);
    $("barra-interna").style.width = pct + "%";
  } else {
    barra.classList.add("indefinida");
    $("barra-interna").style.width = "";
  }
}

// Círculo cinza com a inicial do usuário (plano C quando a foto não carrega)
function avatarInicial(username) {
  const div = document.createElement("div");
  div.className = "foto foto-letra";
  div.textContent = username[0].toUpperCase();
  return div;
}

// Monta a foto com 3 tentativas:
// 1) carregar direto pelo <img>;
// 2) baixar com fetch (a permissão em host_permissions dispensa o CORS) e usar um blob;
// 3) mostrar a inicial do usuário.
function criarFoto(u) {
  if (!u.foto) return avatarInicial(u.username);

  const img = document.createElement("img");
  img.className = "foto";
  img.loading = "lazy";
  img.referrerPolicy = "no-referrer"; // evita o servidor de imagens recusar por causa do referer

  let tentouBlob = false;
  img.addEventListener("error", async () => {
    if (!tentouBlob) {
      tentouBlob = true;
      try {
        const resposta = await fetch(u.foto);
        if (!resposta.ok) throw new Error("HTTP " + resposta.status);
        const blob = await resposta.blob();
        img.src = URL.createObjectURL(blob); // se falhar de novo, cai no "error" e vai para o plano C
        return;
      } catch (e) {
        console.warn("Foto não carregou para", u.username, e);
      }
    }
    img.replaceWith(avatarInicial(u.username));
  });

  img.src = u.foto;
  return img;
}

function renderPronto(estado) {
  mostrar("pronto");

  $("resumo").textContent =
    `Seguidores: ${estado.totalSeguidores} | ` +
    `Seguindo: ${estado.totalSeguindo} | ` +
    `Não seguem de volta: ${estado.naoSeguem.length}`;

  const lista = $("lista");
  lista.innerHTML = ""; // limpa antes de montar

  estado.naoSeguem.forEach((u) => {
    const li = document.createElement("li");

    const texto = document.createElement("div");

    // O @ agora é um link que abre o perfil em uma nova aba
    const usuario = document.createElement("a");
    usuario.className = "usuario";
    usuario.href = `https://www.instagram.com/${encodeURIComponent(u.username)}/`;
    usuario.target = "_blank";
    usuario.rel = "noopener noreferrer";
    usuario.textContent = "@" + u.username; // textContent evita injetar HTML por acidente

    const nome = document.createElement("div");
    nome.className = "nome";
    nome.textContent = u.nome;

    texto.append(usuario, nome);
    li.append(criarFoto(u), texto);
    lista.appendChild(li);
  });
}

function renderizar(estado) {
  if (!estado) {
    mostrar("erro");
    $("erro").textContent = "Nenhum resultado ainda. Clique no ícone da extensão no instagram.com.";
  } else if (estado.fase === "carregando") {
    renderCarregando(estado);
  } else if (estado.fase === "erro") {
    mostrar("erro");
    $("erro").textContent = estado.mensagem;
  } else if (estado.fase === "pronto") {
    renderPronto(estado);
  }
}

// Ao abrir a aba, lê o estado atual
chrome.storage.local.get("estado", ({ estado }) => renderizar(estado));

// Enquanto a aba está aberta, atualiza sempre que o background salvar um estado novo
chrome.storage.onChanged.addListener((mudancas, area) => {
  if (area === "local" && mudancas.estado) renderizar(mudancas.estado.newValue);
});
