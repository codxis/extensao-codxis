(function (root) {
  "use strict";

  /**
   * Este é o único arquivo que normalmente precisa mudar quando o Codxis muda.
   * Aceita seletores em ordem de preferência. Deixe arrays vazios enquanto o
   * seletor real ainda não for conhecido.
   */
  root.AVANTE_CONFIG = Object.freeze({
    app: {
      // Preencha com o domínio real para impedir execução em outros sites.
      // Ex.: ["web.codxis.com.br"]. Vazio usa a detecção por nome da página.
      allowedHosts: [],
      titleHints: ["codxis", "demo web codxis", "avante web"],
      currency: "BRL",
      locale: "pt-BR",
      refreshMs: 15000,
      diagnostics: false
    },

    mount: {
      // O primeiro elemento encontrado recebe o dashboard antes da grade.
      homeContainers: [
        "[data-avante-dashboard-host]",
        "main .row",
        "main",
        ".content-wrapper .content",
        ".main-content",
        ".page-content"
      ],
      // A home pode variar por franquia/permissão. Basta que todos os textos de
      // um dos grupos sejam encontrados.
      homeTextEvidenceGroups: [
        [
          "Total de produtos vendidos no mês",
          "Últimas transações hoje"
        ],
        [
          "Total de produtos vendidos no mês",
          "A receber hoje",
          "A pagar hoje"
        ],
        [
          "Total de produtos vendidos no mês",
          "Resumo de documentos fiscais"
        ]
      ],
      // Quando o HTML for inspecionado, adicione seletores exclusivos dos cards.
      // A existência de qualquer um deles será uma evidência forte da home.
      homeExclusiveSelectors: [
        "#form\\:totalProdutosVendidos",
        "#form\\:qtdeProdutosVendidos",
        "#form\\:qtdeCliente",
        "#form\\:qtdeProduto",
        "#form\\:contasDoDiaReceber",
        "#form\\:contasDoDiaPagar"
      ],
      breadcrumbSelectors: [
        "[aria-label='breadcrumb']",
        ".breadcrumb",
        "nav.breadcrumb"
      ],
      homeBreadcrumbWords: ["home", "inicio", "início", "painel"],
      titleSelectors: ["main h1", "main h2", ".page-title", ".content-header h1"],
      homeTitleWords: ["home", "inicio", "início", "visão geral", "dashboard"],
      routeHints: ["/home", "/inicio", "/dashboard"]
    },

    dom: {
      // Cole aqui os seletores fornecidos pelo DevTools.
      salesTotal: ["#form\\:totalProdutosVendidos"],
      profitTotal: [],
      periodLabel: [],
      updatedAt: [],

      // Opcional: linhas de vendas, útil quando a tela não exibe um total.
      transactionRows: [],
      row: {
        amount: [],
        profit: [],
        date: []
      }
    },

    semantic: {
      // Fallback para cards com rótulo legível quando o seletor ainda não é
      // conhecido. Expressões são comparadas após remover acentos.
      salesLabels: [
        "total de produtos vendidos",
        "total vendido",
        "valor total vendido",
        "total de vendas",
        "vendas no periodo",
        "faturamento"
      ],
      profitLabels: [
        "lucro real",
        "lucro liquido",
        "total de lucro",
        "resultado liquido"
      ],
      periodWords: {
        daily: ["hoje", "dia", "diario"],
        weekly: ["semana", "semanal"],
        monthly: ["mes", "mensal"]
      },
      maxAncestorLevels: 4,
      maxContainerTextLength: 600
    },

    structured: {
      // Scripts JSON ou elementos cujo textContent seja um JSON válido.
      jsonContainers: [],
      salesPaths: ["totalVendas", "valorTotal", "data.totalVendas"],
      profitPaths: ["lucroReal", "totalLucro", "data.lucroReal"],
      datePaths: ["updatedAt", "dataAtualizacao", "data.updatedAt"]
    },

    api: {
      // Só respostas de URLs que casarem com estes padrões serão inspecionadas.
      // Strings são comparadas sem diferenciar maiúsculas/minúsculas.
      urlIncludes: [
        "/venda",
        "/vendas",
        "/fechamento",
        "/caixa",
        "/nfce"
      ],
      // Caminhos possíveis dentro do JSON, separados por ponto.
      salesPaths: [
        "totalVendas",
        "valorTotal",
        "data.totalVendas",
        "data.valorTotal",
        "resumo.totalVendas"
      ],
      profitPaths: [
        "lucroReal",
        "totalLucro",
        "data.lucroReal",
        "data.totalLucro",
        "resumo.lucroReal"
      ],
      datePaths: ["dataAtualizacao", "updatedAt", "data.updatedAt"]
    },

    capture: {
      sourcePriority: { CACHE: 0, DOM: 1, STRUCTURED: 2, API: 3 },
      staleAfterMs: 30 * 60 * 1000
    }
  });
})(globalThis);
