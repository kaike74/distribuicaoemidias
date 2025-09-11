exports.handler = async (event, context) => {
  // Permitir CORS
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  // Responder OPTIONS para CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: ''
    };
  }

  try {
    const { id } = event.queryStringParameters || {};
    
    if (!id) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'ID do registro é obrigatório' })
      };
    }

    const notionToken = process.env.DistribuicaoHTML;
    if (!notionToken) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'Token do Notion não configurado' })
      };
    }

    console.log('Buscando página:', id);
    console.log('Token (primeiros 10 chars):', notionToken ? notionToken.substring(0, 10) + '...' : 'TOKEN_NAO_ENCONTRADO');
    console.log('URL da requisição:', `https://api.notion.com/v1/pages/${id}`);

    // Buscar dados da página no Notion
    const response = await fetch(`https://api.notion.com/v1/pages/${id}`, {
      headers: {
        'Authorization': `Bearer ${notionToken}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json'
      }
    });

    console.log('Status da resposta:', response.status);
    console.log('Response OK?', response.ok);

    if (!response.ok) {
      console.error('Erro da API Notion:', response.status, response.statusText);
      
      // Tentar pegar mais detalhes do erro
      let errorDetails = response.statusText;
      try {
        const errorBody = await response.text();
        console.log('Corpo do erro:', errorBody);
        errorDetails = errorBody;
      } catch (e) {
        console.log('Não foi possível ler corpo do erro');
      }
      
      return {
        statusCode: response.status,
        headers,
        body: JSON.stringify({ 
          error: `Erro ao buscar dados do Notion: ${response.status}`,
          details: errorDetails
        })
      };
    }

    const notionData = await response.json();
    console.log('Dados recebidos do Notion (estrutura):', {
      id: notionData.id,
      object: notionData.object,
      propertiesKeys: Object.keys(notionData.properties || {})
    });
    console.log('Propriedades completas:', JSON.stringify(notionData.properties, null, 2));

    // Mapear propriedades do Notion para formato esperado
    const properties = notionData.properties || {};
    
    // Função helper para extrair valores de diferentes tipos de propriedade
    const extractValue = (prop, defaultValue = '', propName = '') => {
      if (!prop) {
        console.log(`❌ Propriedade "${propName}" não encontrada`);
        return defaultValue;
      }
      
      console.log(`✅ Extraindo propriedade "${propName}" tipo: ${prop.type}`, prop);
      
      switch (prop.type) {
        case 'number':
          // Se o valor é null/undefined, retornar 0 para números (não o defaultValue)
          const numberValue = prop.number !== null && prop.number !== undefined ? prop.number : 0;
          console.log(`📊 Valor numérico para "${propName}": ${numberValue} (original: ${prop.number})`);
          return numberValue;
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
          console.log(`⚠️ Tipo de propriedade não reconhecido para "${propName}": ${prop.type}`);
          return defaultValue;
      }
    };

    // Debug específico para PMM
    console.log('🔍 DEBUG PMM - Buscando propriedades PMM...');
    console.log('Propriedades disponíveis:', Object.keys(properties));
    
    const pmmVariations = ['PMM', 'pmm', 'Pmm', 'PMM ', ' PMM', 'PMM_', 'pmm_value'];
    let pmmProperty = null;
    let pmmKey = null;
    
    for (const variation of pmmVariations) {
      if (properties[variation]) {
        pmmProperty = properties[variation];
        pmmKey = variation;
        console.log(`✅ PMM encontrado com chave: "${variation}"`);
        break;
      }
    }
    
    if (!pmmProperty) {
      console.log('❌ PMM não encontrado, tentando busca case-insensitive...');
      for (const [key, value] of Object.entries(properties)) {
        if (key.toLowerCase().includes('pmm')) {
          pmmProperty = value;
          pmmKey = key;
          console.log(`✅ PMM encontrado case-insensitive com chave: "${key}"`);
          break;
        }
      }
    }

    // Mapear para o formato esperado
    const mappedData = {
      spots30: extractValue(properties['Spots 30ʺ'] || properties['Spots 30'] || properties['spots30'], 0, 'Spots 30'),
      spots5: extractValue(properties['Spots 5ʺ'] || properties['Spots 5'] || properties['spots5'], 0, 'Spots 5'),
      spots15: extractValue(properties['Spots 15ʺ'] || properties['Spots 15'] || properties['spots15'], 0, 'Spots 15'),
      spots60: extractValue(properties['Spots 60ʺ'] || properties['Spots 60'] || properties['spots60'], 0, 'Spots 60'),
      test60: extractValue(properties['Test. 60ʺ'] || properties['Test 60'] || properties['test60'], 0, 'Test 60'),
      pmm: pmmProperty ? extractValue(pmmProperty, 1000, pmmKey) : 1000,
      emissora: extractValue(properties['Emissora'] || properties['emissora'], 'Emissora', 'Emissora'),
      inicio: extractValue(properties['Data inicio'] || properties['Data Início'] || properties['inicio'], '01/01/2025', 'Data Início'),
      fim: extractValue(properties['Data fim'] || properties['Data Fim'] || properties['fim'], '31/01/2025', 'Data Fim'),
      dias: extractValue(properties['Dias da semana'] || properties['Dias'] || properties['dias'], 'Seg.,Ter.,Qua.,Qui.,Sex.', 'Dias da Semana')
    };

    // Log específico do PMM final
    console.log(`🎯 PMM FINAL: ${mappedData.pmm} (encontrado via chave: "${pmmKey}")`);

    // Converter datas do formato ISO para DD/MM/YYYY se necessário
    if (mappedData.inicio && mappedData.inicio.includes('-')) {
      const startDate = new Date(mappedData.inicio);
      mappedData.inicio = startDate.toLocaleDateString('pt-BR');
    }
    
    if (mappedData.fim && mappedData.fim.includes('-')) {
      const endDate = new Date(mappedData.fim);
      mappedData.fim = endDate.toLocaleDateString('pt-BR');
    }

    console.log('📋 Dados mapeados finais:', mappedData);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(mappedData)
    };

  } catch (error) {
    console.error('💥 Erro na função (catch geral):', error);
    console.error('Stack trace:', error.stack);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: 'Erro interno do servidor',
        details: error.message
      })
    };
  }
};
