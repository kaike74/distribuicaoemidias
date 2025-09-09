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

    const notionToken = process.env.NOTION_TOKEN;
    if (!notionToken) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'Token do Notion não configurado' })
      };
    }

    console.log('Buscando página:', id);

    // Buscar dados da página no Notion
    const response = await fetch(`https://api.notion.com/v1/pages/${id}`, {
      headers: {
        'Authorization': `Bearer ${notionToken}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      console.error('Erro da API Notion:', response.status, response.statusText);
      return {
        statusCode: response.status,
        headers,
        body: JSON.stringify({ 
          error: `Erro ao buscar dados do Notion: ${response.status}`,
          details: response.statusText
        })
      };
    }

    const notionData = await response.json();
    console.log('Dados recebidos do Notion:', JSON.stringify(notionData.properties, null, 2));

    // Mapear propriedades do Notion para formato esperado
    const properties = notionData.properties || {};
    
    // Função helper para extrair valores de diferentes tipos de propriedade
    const extractValue = (prop, defaultValue = '') => {
      if (!prop) return defaultValue;
      
      switch (prop.type) {
        case 'number':
          return prop.number || 0;
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

    // Mapear para o formato esperado (ajuste os nomes das propriedades conforme seu Notion)
    const mappedData = {
      spots30: extractValue(properties['Spots 30"'] || properties['Spots 30'] || properties['spots30'], 0),
      spots5: extractValue(properties['Spots 5"'] || properties['Spots 5'] || properties['spots5'], 0),
      spots15: extractValue(properties['Spots 15"'] || properties['Spots 15'] || properties['spots15'], 0),
      spots60: extractValue(properties['Spots 60"'] || properties['Spots 60'] || properties['spots60'], 0),
      test60: extractValue(properties['Test. 60"'] || properties['Test 60'] || properties['test60'], 0),
      emissora: extractValue(properties['Emissora'] || properties['emissora'], 'Emissora'),
      inicio: extractValue(properties['Data inicio'] || properties['Data Início'] || properties['inicio'], '01/01/2025'),
      fim: extractValue(properties['Data fim'] || properties['Data Fim'] || properties['fim'], '31/01/2025'),
      dias: extractValue(properties['Dias da semana'] || properties['Dias'] || properties['dias'], 'Seg.,Ter.,Qua.,Qui.,Sex.')
    };

    // Converter datas do formato ISO para DD/MM/YYYY se necessário
    if (mappedData.inicio && mappedData.inicio.includes('-')) {
      const startDate = new Date(mappedData.inicio);
      mappedData.inicio = startDate.toLocaleDateString('pt-BR');
    }
    
    if (mappedData.fim && mappedData.fim.includes('-')) {
      const endDate = new Date(mappedData.fim);
      mappedData.fim = endDate.toLocaleDateString('pt-BR');
    }

    console.log('Dados mapeados:', mappedData);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(mappedData)
    };

  } catch (error) {
    console.error('Erro na função:', error);
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
