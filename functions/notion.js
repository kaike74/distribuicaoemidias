// Cloudflare Pages Function - USA NOTION_TOKEN
export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  
  // Headers CORS
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
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
    // ===== BUSCAR TOKEN NOTION_TOKEN =====
    const notionToken = env.NOTION_TOKEN;
    
    console.log('=== DEBUG CLOUDFLARE ===');
    console.log('1. Token existe?', !!notionToken);
    console.log('2. Método:', request.method);
    console.log('========================');
    
    if (!notionToken) {
      return new Response(JSON.stringify({ 
        error: 'Token do Notion não configurado',
        debug: {
          message: 'Variável NOTION_TOKEN não encontrada',
          env_keys: Object.keys(env || {})
        }
      }), {
        status: 500,
        headers
      });
    }

    // MÉTODO GET - BUSCAR DADOS
    if (request.method === 'GET') {
      const id = url.searchParams.get('id');
      
      if (!id) {
        return new Response(JSON.stringify({ 
          error: 'ID do registro é obrigatório' 
        }), {
          status: 400,
          headers
        });
      }

      console.log('🔍 Buscando página:', id);

      // Buscar dados da página no Notion
      const response = await fetch(`https://api.notion.com/v1/pages/${id}`, {
        headers: {
          'Authorization': `Bearer ${notionToken.trim()}`,
          'Notion-Version': '2022-06-28',
          'Content-Type': 'application/json'
        }
      });

      console.log('Status da resposta Notion API:', response.status);

      if (!response.ok) {
        let errorDetails = response.statusText;
        let errorBody = null;
        
        try {
          errorBody = await response.json();
          console.log('Erro JSON da API Notion:', errorBody);
          errorDetails = JSON.stringify(errorBody);
        } catch (e) {
          try {
            errorBody = await response.text();
            console.log('Erro texto da API Notion:', errorBody);
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
            message: response.status === 401 ? 
              'Token sem permissão. Verifique se a integração está conectada ao banco de dados no Notion' :
              response.status === 404 ?
              'Página não encontrada. Verifique se o ID está correto' :
              'Erro desconhecido da API Notion'
          }
        }), {
          status: response.status,
          headers
        });
      }

      const notionData = await response.json();
      console.log('✅ Dados recebidos com sucesso do Notion!');
      console.log('Propriedades disponíveis:', Object.keys(notionData.properties || {}));

      // Mapear propriedades
      const properties = notionData.properties || {};
      
      const extractValue = (prop, defaultValue = '', propName = '') => {
        if (!prop) {
          console.log(`❌ Propriedade "${propName}" não encontrada`);
          return defaultValue;
        }
        
        console.log(`✅ Extraindo "${propName}" tipo: ${prop.type}`);
        
        switch (prop.type) {
          case 'number':
            const numValue = prop.number !== null && prop.number !== undefined ? prop.number : 0;
            console.log(`   Valor numérico: ${numValue}`);
            return numValue;
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
            console.log(`⚠️ Tipo não reconhecido: ${prop.type}`);
            return defaultValue;
        }
      };

      // Buscar PMM com várias tentativas
      console.log('🔍 Buscando propriedade PMM...');
      const pmmVariations = ['PMM', 'pmm', 'Pmm', 'PMM ', ' PMM'];
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
        console.log('Tentando busca case-insensitive...');
        for (const [key, value] of Object.entries(properties)) {
          if (key.toLowerCase().includes('pmm')) {
            pmmProperty = value;
            pmmKey = key;
            console.log(`✅ PMM encontrado: "${key}"`);
            break;
          }
        }
      }

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
        dias: extractValue(properties['Dias da semana'] || properties['Dias'] || properties['dias'], 'Seg.,Ter.,Qua.,Qui.,Sex.', 'Dias da Semana'),
        // 🆕 NOVO CAMPO: Distribuição Customizada
        customDistribution: extractValue(properties['Distribuição Customizada'] || properties['Distribuicao Customizada'], '', 'Distribuição Customizada')
      };

      console.log('📊 PMM final:', mappedData.pmm);

      // Converter datas ISO para DD/MM/YYYY
      if (mappedData.inicio && mappedData.inicio.includes('-')) {
        const startDate = new Date(mappedData.inicio);
        mappedData.inicio = startDate.toLocaleDateString('pt-BR');
      }
      
      if (mappedData.fim && mappedData.fim.includes('-')) {
        const endDate = new Date(mappedData.fim);
        mappedData.fim = endDate.toLocaleDateString('pt-BR');
      }

      // 🆕 PROCESSAR DISTRIBUIÇÃO CUSTOMIZADA
      if (mappedData.customDistribution) {
        try {
          mappedData.customDistributionData = JSON.parse(mappedData.customDistribution);
          console.log('✅ Distribuição customizada encontrada');
        } catch (e) {
          console.log('⚠️ Erro ao parsear distribuição customizada:', e);
          mappedData.customDistributionData = null;
        }
      }

      console.log('✅ Dados mapeados com sucesso!');
      console.log('📋 Dados finais:', mappedData);

      return new Response(JSON.stringify(mappedData), {
        status: 200,
        headers
      });
    }

    // MÉTODO POST/PUT - ATUALIZAR DADOS
    if (request.method === 'POST' || request.method === 'PUT') {
      const id = url.searchParams.get('id');
      
      if (!id) {
        return new Response(JSON.stringify({ 
          error: 'ID do registro é obrigatório' 
        }), {
          status: 400,
          headers
        });
      }

      let requestBody;
      try {
        requestBody = await request.json();
      } catch (e) {
        return new Response(JSON.stringify({ 
          error: 'Body inválido' 
        }), {
          status: 400,
          headers
        });
      }

      console.log('🔄 Atualizando página:', id);
      console.log('📝 Dados recebidos:', requestBody);

      // Preparar propriedades para atualização
      const updateProperties = {};

      // 🆕 ATUALIZAR DISTRIBUIÇÃO CUSTOMIZADA
      if (requestBody.customDistribution !== undefined) {
        updateProperties['Distribuição Customizada'] = {
          rich_text: [
            {
              text: {
                content: typeof requestBody.customDistribution === 'string' 
                  ? requestBody.customDistribution 
                  : JSON.stringify(requestBody.customDistribution)
              }
            }
          ]
        };
        console.log('📊 Atualizando distribuição customizada');
      }

      // 🆕 ATUALIZAR QUANTIDADES DE PRODUTOS
      if (requestBody.spots30 !== undefined) {
        updateProperties['Spots 30ʺ'] = { number: requestBody.spots30 };
      }
      if (requestBody.spots5 !== undefined) {
        updateProperties['Spots 5ʺ'] = { number: requestBody.spots5 };
      }
      if (requestBody.spots15 !== undefined) {
        updateProperties['Spots 15ʺ'] = { number: requestBody.spots15 };
      }
      if (requestBody.spots60 !== undefined) {
        updateProperties['Spots 60ʺ'] = { number: requestBody.spots60 };
      }
      if (requestBody.test60 !== undefined) {
        updateProperties['Test. 60ʺ'] = { number: requestBody.test60 };
      }

      // 🆕 ATUALIZAR PERÍODO E DIAS
      if (requestBody.inicio !== undefined) {
        updateProperties['Data inicio'] = {
          date: {
            start: convertToISO(requestBody.inicio)
          }
        };
      }
      if (requestBody.fim !== undefined) {
        updateProperties['Data fim'] = {
          date: {
            start: convertToISO(requestBody.fim)
          }
        };
      }
      if (requestBody.dias !== undefined) {
        // Converter array de dias para formato do Notion
        const diasArray = Array.isArray(requestBody.dias) ? requestBody.dias : requestBody.dias.split(',');
        updateProperties['Dias da semana'] = {
          multi_select: diasArray.map(dia => ({ name: dia.trim() }))
        };
      }

      // Fazer requisição de atualização
      const updateResponse = await fetch(`https://api.notion.com/v1/pages/${id}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${notionToken.trim()}`,
          'Notion-Version': '2022-06-28',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          properties: updateProperties
        })
      });

      if (!updateResponse.ok) {
        console.error('❌ Erro ao atualizar Notion:', updateResponse.status);
        let errorDetails = updateResponse.statusText;
        try {
          const errorBody = await updateResponse.text();
          errorDetails = errorBody;
        } catch (e) {
          console.log('Não foi possível ler corpo do erro');
        }
        
        return new Response(JSON.stringify({ 
          error: `Erro ao atualizar dados no Notion: ${updateResponse.status}`,
          details: errorDetails
        }), {
          status: updateResponse.status,
          headers
        });
      }

      const updateResult = await updateResponse.json();
      console.log('✅ Página atualizada com sucesso');

      return new Response(JSON.stringify({ 
        success: true, 
        message: 'Dados atualizados com sucesso',
        updated: updateResult
      }), {
        status: 200,
        headers
      });
    }

    // Método não suportado
    return new Response(JSON.stringify({ 
      error: 'Método não permitido' 
    }), {
      status: 405,
      headers
    });

  } catch (error) {
    console.error('💥 Erro na função:', error);
    console.error('Stack completo:', error.stack);
    
    return new Response(JSON.stringify({ 
      error: 'Erro interno do servidor',
      details: error.message,
      stack: error.stack
    }), {
      status: 500,
      headers
    });
  }
}

// Função helper para converter data DD/MM/YYYY para ISO
function convertToISO(dateStr) {
  if (dateStr.includes('-')) {
    return dateStr; // Já está em formato ISO
  }
  
  const [day, month, year] = dateStr.split('/');
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}
