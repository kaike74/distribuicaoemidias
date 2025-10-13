// Cloudflare Pages Function - VERSÃO COM DEBUG
export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  
  // Headers CORS
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  // Responder OPTIONS para CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response('', {
      status: 200,
      headers
    });
  }

  try {
    const id = url.searchParams.get('id');
    
    if (!id) {
      return new Response(JSON.stringify({ 
        error: 'ID do registro é obrigatório' 
      }), {
        status: 400,
        headers
      });
    }

    // ===== DEBUG: VERIFICAR TOKEN =====
    const notionToken = env.DistribuicaoHTML;
    
    console.log('=== DEBUG CLOUDFLARE ===');
    console.log('1. Token existe?', !!notionToken);
    console.log('2. Tipo do token:', typeof notionToken);
    console.log('3. Primeiros 10 caracteres:', notionToken ? notionToken.substring(0, 10) : 'TOKEN_VAZIO');
    console.log('4. Tamanho do token:', notionToken ? notionToken.length : 0);
    console.log('5. Começa com secret_?', notionToken ? notionToken.startsWith('secret_') : false);
    console.log('========================');
    
    if (!notionToken) {
      return new Response(JSON.stringify({ 
        error: 'Token do Notion não configurado no Cloudflare',
        debug: {
          env_keys: Object.keys(env || {}),
          message: 'Verifique se a variável DistribuicaoHTML está configurada em Production'
        }
      }), {
        status: 500,
        headers
      });
    }

    // Verificar se o token tem formato válido
    if (!notionToken.startsWith('secret_')) {
      return new Response(JSON.stringify({ 
        error: 'Token inválido - deve começar com secret_',
        debug: {
          token_start: notionToken.substring(0, 10),
          token_length: notionToken.length
        }
      }), {
        status: 500,
        headers
      });
    }

    console.log('Buscando página:', id);
    console.log('URL completa:', `https://api.notion.com/v1/pages/${id}`);

    // Buscar dados da página no Notion
    const response = await fetch(`https://api.notion.com/v1/pages/${id}`, {
      headers: {
        'Authorization': `Bearer ${notionToken.trim()}`, // .trim() remove espaços
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json'
      }
    });

    console.log('Status da resposta Notion:', response.status);
    console.log('Response OK?', response.ok);

    if (!response.ok) {
      // Tentar obter detalhes do erro
      let errorDetails = response.statusText;
      let errorBody = null;
      
      try {
        errorBody = await response.json();
        console.log('Erro JSON da API:', errorBody);
        errorDetails = JSON.stringify(errorBody);
      } catch (e) {
        try {
          errorBody = await response.text();
          console.log('Erro TEXT da API:', errorBody);
          errorDetails = errorBody;
        } catch (e2) {
          console.log('Não foi possível ler corpo do erro');
        }
      }
      
      return new Response(JSON.stringify({ 
        error: `Erro ao buscar dados do Notion: ${response.status}`,
        status: response.status,
        details: errorDetails,
        debug: {
          token_length: notionToken.length,
          token_format: notionToken.substring(0, 7) + '...',
          api_url: `https://api.notion.com/v1/pages/${id}`,
          message: response.status === 401 ? 
            'Token inválido ou sem permissão. Verifique: 1) Token está correto 2) Token tem acesso ao banco 3) Token não expirou' :
            'Erro desconhecido da API Notion'
        }
      }), {
        status: response.status,
        headers
      });
    }

    const notionData = await response.json();
    console.log('Dados recebidos com sucesso!');

    // Mapear propriedades
    const properties = notionData.properties || {};
    
    const extractValue = (prop, defaultValue = '', propName = '') => {
      if (!prop) return defaultValue;
      
      switch (prop.type) {
        case 'number':
          return prop.number !== null && prop.number !== undefined ? prop.number : 0;
        case 'title':
          return prop.title?.[0]?.text?.content || defaultValue;
        case 'rich_text':
          return prop.rich_text?.[0]?.text?.content || defaultValue;
        case 'date':
          return prop.date?.start || defaultValue;
        case 'multi_select':
          return prop.multi_select?.map(item => item.name).join(',') || defaultValue;
        case 'select':
          return prop.select?.name || defaultValue;
        default:
          return defaultValue;
      }
    };

    // Buscar PMM com várias tentativas
    const pmmVariations = ['PMM', 'pmm', 'Pmm', 'PMM ', ' PMM'];
    let pmmProperty = null;
    
    for (const variation of pmmVariations) {
      if (properties[variation]) {
        pmmProperty = properties[variation];
        break;
      }
    }
    
    if (!pmmProperty) {
      for (const [key, value] of Object.entries(properties)) {
        if (key.toLowerCase().includes('pmm')) {
          pmmProperty = value;
          break;
        }
      }
    }

    const mappedData = {
      spots30: extractValue(properties['Spots 30ʺ'] || properties['Spots 30'] || properties['spots30'], 0),
      spots5: extractValue(properties['Spots 5ʺ'] || properties['Spots 5'] || properties['spots5'], 0),
      spots15: extractValue(properties['Spots 15ʺ'] || properties['Spots 15'] || properties['spots15'], 0),
      spots60: extractValue(properties['Spots 60ʺ'] || properties['Spots 60'] || properties['spots60'], 0),
      test60: extractValue(properties['Test. 60ʺ'] || properties['Test 60'] || properties['test60'], 0),
      pmm: pmmProperty ? extractValue(pmmProperty, 1000) : 1000,
      emissora: extractValue(properties['Emissora'] || properties['emissora'], 'Emissora'),
      inicio: extractValue(properties['Data inicio'] || properties['Data Início'] || properties['inicio'], '01/01/2025'),
      fim: extractValue(properties['Data fim'] || properties['Data Fim'] || properties['fim'], '31/01/2025'),
      dias: extractValue(properties['Dias da semana'] || properties['Dias'] || properties['dias'], 'Seg.,Ter.,Qua.,Qui.,Sex.')
    };

    // Converter datas ISO para DD/MM/YYYY
    if (mappedData.inicio && mappedData.inicio.includes('-')) {
      const startDate = new Date(mappedData.inicio);
      mappedData.inicio = startDate.toLocaleDateString('pt-BR');
    }
    
    if (mappedData.fim && mappedData.fim.includes('-')) {
      const endDate = new Date(mappedData.fim);
      mappedData.fim = endDate.toLocaleDateString('pt-BR');
    }

    console.log('Dados mapeados com sucesso!');

    return new Response(JSON.stringify(mappedData), {
      status: 200,
      headers
    });

  } catch (error) {
    console.error('💥 Erro na função:', error);
    console.error('Stack:', error.stack);
    
    return new Response(JSON.stringify({ 
      error: 'Erro interno do servidor',
      details: error.message,
      stack: error.stack,
      debug: {
        message: 'Erro não esperado na função Cloudflare'
      }
    }), {
      status: 500,
      headers
    });
  }
}
