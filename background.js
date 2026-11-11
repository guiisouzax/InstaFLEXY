// Esta função é injetada DENTRO da página do Instagram (usa a sua sessão logada).
// Precisa ser autossuficiente: não pode usar nada de fora dela.
async function coletar() {
  const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
  const cabecalhos = { "x-ig-app-id": "936619743392459" };

  // ID da sua conta, guardado no cookie da sessão
  const meuId = document.cookie.match(/ds_user_id=(\d+)/)?.[1];
  if (!meuId) return { erro: "Faça login no instagram.com primeiro." };

  // Pega os totais só para a barra de progresso (se falhar, a barra fica "indefinida")
  let totais = {};
  try {
    const r = await fetch(`https://www.instagram.com/api/v1/users/${meuId}/info/`, {
      headers: cabecalhos,
      credentials: "include",
    });
    if (r.ok) {
      const d = await r.json();
      totais = { followers: d.user.follower_count, following: d.user.following_count };
    }
  } catch (e) {}

  // tipo = "followers" ou "following"
  async function listar(tipo) {
    const usuarios = [];
    let maxId = "";

    do {
      const url =
        `https://www.instagram.com/api/v1/friendships/${meuId}/${tipo}/?count=50` +
        (maxId ? `&max_id=${maxId}` : "");

      const res = await fetch(url, { headers: cabecalhos, credentials: "include" });
      if (!res.ok) return { erro: `Erro ${res.status} ao listar ${tipo}. Tente de novo mais tarde.` };

      const dados = await res.json();
      usuarios.push(
        ...dados.users.map((u) => ({
          username: u.username.toLowerCase(),
          nome: u.full_name || "",
          foto: u.profile_pic_url || "",
        }))
      );
      maxId = dados.next_max_id || "";

      // avisa o background do andamento
      chrome.runtime.sendMessage({
        tipo: "progresso",
        etapa: tipo,
        atual: usuarios.length,
        total: totais[tipo] || 0,
      });

      // pausa aleatória entre as páginas
      await esperar(1500 + Math.random() * 1500);
    } while (maxId);

    return { usuarios };
  }

  const seguidores = await listar("followers");
  if (seguidores.erro) return { erro: seguidores.erro };

  const seguindo = await listar("following");
  if (seguindo.erro) return { erro: seguindo.erro };

  const setSeguidores = new Set(seguidores.usuarios.map((u) => u.username));
  const naoSeguem = seguindo.usuarios
    .filter((u) => !setSeguidores.has(u.username))
    .sort((a, b) => a.username.localeCompare(b.username));

  return {
    totalSeguidores: seguidores.usuarios.length,
    totalSeguindo: seguindo.usuarios.length,
    naoSeguem,
  };
}

// Guarda o estado atual; a página de resultado escuta essa mudança e se atualiza
const salvarEstado = (estado) => chrome.storage.local.set({ estado });

// Recebe o progresso enviado pela página do Instagram
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.tipo === "progresso") {
    salvarEstado({ fase: "carregando", etapa: msg.etapa, atual: msg.atual, total: msg.total });
  }
});

const abrirResultado = () => chrome.tabs.create({ url: chrome.runtime.getURL("resultado.html") });

// Clique no ícone da extensão
chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.url || !tab.url.startsWith("https://www.instagram.com/")) {
    await salvarEstado({
      fase: "erro",
      mensagem: "Abra o instagram.com (já logado) e clique no ícone da extensão por lá.",
    });
    abrirResultado();
    return;
  }

  // Abre a tela de carregamento imediatamente, antes de começar a buscar
  await salvarEstado({ fase: "carregando", etapa: "followers", atual: 0, total: 0 });
  abrirResultado();

  try {
    // Roda "coletar" dentro da aba do Instagram e espera o resultado
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: coletar,
    });

    if (result.erro) {
      await salvarEstado({ fase: "erro", mensagem: result.erro });
    } else {
      await salvarEstado({ fase: "pronto", ...result });
    }
  } catch (e) {
    await salvarEstado({ fase: "erro", mensagem: "Algo deu errado: " + e.message });
  }
});
